import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createOrReturnTwin } from '../../common/utils/unique-violation.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import {
  CreateQuoteRestoreRequestDto,
  ApproveQuoteRestoreRequestDto,
  RejectQuoteRestoreRequestDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
  Prisma,
  QuoteStatus,
} from '../../generated/prisma';
import { queueLocationFilter } from '../../common/utils/location-context';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
};

const quoteSelect = {
  id: true,
  quoteNumber: true,
  status: true,
  client: { select: { id: true, name: true } },
};

const requestInclude = {
  requestedBy: { select: userSelect },
  reviewedBy: { select: userSelect },
  quote: { select: quoteSelect },
} satisfies Prisma.QuoteRestoreRequestInclude;

const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  FOLLOW_UP_1: 'Seguimiento 1',
  FOLLOW_UP_2: 'Seguimiento 2',
  FOLLOW_UP_3: 'Seguimiento 3',
  ACCEPTED: 'Aceptada',
  NO_RESPONSE: 'Sin respuesta',
  REJECTED: 'Rechazada',
  CONVERTED: 'Convertida',
};

function userName(user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null): string {
  if (!user) return 'Usuario';
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'Usuario'
  );
}

/**
 * Estado al que vuelve una cotización rechazada. Las rechazadas antes de
 * existir `rejectedFromStatus` y sin historial en audit_logs vuelven a Enviada:
 * es el único estado desde el que se podía rechazar en ese entonces.
 */
function restoreTarget(quote: {
  rejectedFromStatus: QuoteStatus | null;
}): QuoteStatus {
  return quote.rejectedFromStatus ?? QuoteStatus.SENT;
}

/**
 * Solicitudes para deshacer el rechazo de una cotización.
 *
 * «Rechazada» es terminal en la máquina de estados de cotizaciones, así que un
 * rechazo por error solo se podía corregir en la base de datos. Este flujo lo
 * permite con autorización de un administrador (panel o WhatsApp). Igual que el
 * cambio de asesor, aprobar ejecuta la restauración de inmediato.
 */
@Injectable()
export class QuoteRestoreRequestsService
  implements OnModuleInit, ApprovalRequestHandler
{
  private readonly logger = new Logger(QuoteRestoreRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register(ApprovalRequestType.QUOTE_RESTORE, this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(
    requestId: string,
  ): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.quoteRestoreRequest.findUnique({
      where: { id: requestId },
      include: { quote: { select: { quoteNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `restauración de la Cotización ${request.quote.quoteNumber}`,
    };
  }

  async approveViaWhatsApp(
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    await this.applyApproval(requestId, reviewerId, 'Aprobado vía WhatsApp');
  }

  async rejectViaWhatsApp(
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    await this.applyRejection(requestId, reviewerId, 'Rechazado vía WhatsApp');
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.quoteRestoreRequest.findUnique({
      where: { id: requestId },
      select: { quoteId: true },
    });
    return request?.quoteId ?? null;
  }

  // ─── Domain methods ───

  /**
   * Crear solicitud de restauración de una cotización rechazada.
   */
  async create(userId: string, dto: CreateQuoteRestoreRequestDto) {
    const quote = await this.findRejectedQuote(dto.quoteId);

    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            name: true,
            permissions: {
              select: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    // Los admins restauran directamente con `restoreDirectly`
    if (requester?.role?.name === 'admin') {
      throw new BadRequestException(
        'Los administradores pueden restaurar la cotización directamente',
      );
    }

    // Mismo alcance que el listado: sin `read_all_quotes` solo las propias
    const canSeeAll =
      requester?.role?.permissions?.some(
        (rp) => rp.permission.name === 'read_all_quotes',
      ) ?? false;
    if (!canSeeAll && quote.createdById !== userId) {
      throw new ForbiddenException(
        'Solo puedes solicitar la restauración de tus propias cotizaciones',
      );
    }

    const existingRequest = await this.prisma.quoteRestoreRequest.findFirst({
      where: { quoteId: dto.quoteId, status: EditRequestStatus.PENDING },
    });

    if (existingRequest) {
      throw new BadRequestException(
        'Ya existe una solicitud de restauración pendiente para esta cotización',
      );
    }

    const restoreToStatus = restoreTarget(quote);

    // El índice parcial `quote_restore_requests_pending_unique` cierra la
    // carrera del doble clic; la petición perdedora devuelve la gemela sin
    // notificar de nuevo.
    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'quote_restore_requests_pending_unique',
      create: () =>
        this.prisma.quoteRestoreRequest.create({
          data: {
            quoteId: quote.id,
            requestedById: userId,
            restoreToStatus,
            previousRejectionReason: quote.rejectionReason,
            previousRejectedAt: quote.rejectedAt,
            reason: dto.reason,
            status: EditRequestStatus.PENDING,
          },
          include: requestInclude,
        }),
      findTwin: () =>
        this.prisma.quoteRestoreRequest.findFirst({
          where: { quoteId: quote.id, status: EditRequestStatus.PENDING },
          include: requestInclude,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de restauración duplicada para la cotización ${quote.id}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    const action = `restaurar la Cotización ${quote.quoteNumber} (rechazada) al estado ${STATUS_LABELS[restoreToStatus]}`;

    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.QUOTE_RESTORE_REQUEST_PENDING,
      title: 'Nueva solicitud de restauración de cotización',
      message: `${userName(request.requestedBy)} solicita ${action}`,
      relatedId: quote.id,
      relatedType: 'Quote',
    });

    // Fire & forget
    this.notifyAdminsByWhatsApp(
      request.id,
      userName(request.requestedBy),
      requester?.role?.name || 'usuario',
      action,
      dto.reason,
    );

    return request;
  }

  /**
   * Atajo de administrador: restaura la cotización al instante y deja traza
   * como una solicitud ya APROBADA.
   */
  async restoreDirectly(adminId: string, dto: CreateQuoteRestoreRequestDto) {
    await this.assertAdmin(adminId);
    const quote = await this.findRejectedQuote(dto.quoteId);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await this.restoreQuote(tx, quote.id, restoreTarget(quote));

      // Una solicitud pendiente de otro usuario ya no tiene nada que autorizar:
      // se cierra como aprobada, porque lo que pidió sí ocurrió.
      await tx.quoteRestoreRequest.updateMany({
        where: { quoteId: quote.id, status: EditRequestStatus.PENDING },
        data: {
          status: EditRequestStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: now,
          reviewNotes: 'Restaurada directamente por un administrador',
        },
      });

      return tx.quoteRestoreRequest.create({
        data: {
          quoteId: quote.id,
          requestedById: adminId,
          restoreToStatus: restoreTarget(quote),
          previousRejectionReason: quote.rejectionReason,
          previousRejectedAt: quote.rejectedAt,
          reason: dto.reason,
          status: EditRequestStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: now,
          reviewNotes: 'Restauración directa realizada por un administrador',
          isDirect: true,
        },
        include: requestInclude,
      });
    });
  }

  async approve(
    requestId: string,
    adminId: string,
    dto: ApproveQuoteRestoreRequestDto,
  ) {
    await this.assertAdmin(adminId);
    return this.applyApproval(requestId, adminId, dto.reviewNotes);
  }

  async reject(
    requestId: string,
    adminId: string,
    dto: RejectQuoteRestoreRequestDto,
  ) {
    await this.assertAdmin(adminId);
    return this.applyRejection(requestId, adminId, dto.reviewNotes);
  }

  /**
   * Marca la solicitud APPROVED y restaura la cotización en la misma
   * transacción. El `updateMany` condicionado a PENDING bloquea la fila, así
   * que dos aprobaciones simultáneas (panel + WhatsApp) no restauran dos veces.
   */
  private async applyApproval(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quoteRestoreRequest.updateMany({
        where: { id: requestId, status: EditRequestStatus.PENDING },
        data: {
          status: EditRequestStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });

      if (claimed.count === 0) {
        throw new NotFoundException(
          'Solicitud de restauración no encontrada o ya procesada',
        );
      }

      const request = await tx.quoteRestoreRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { quoteId: true, restoreToStatus: true },
      });

      const quote = await tx.quote.findUnique({
        where: { id: request.quoteId },
        select: { status: true },
      });

      if (quote?.status !== QuoteStatus.REJECTED) {
        throw new BadRequestException(
          'La cotización ya no está rechazada; la solicitud no puede aprobarse',
        );
      }

      await this.restoreQuote(tx, request.quoteId, request.restoreToStatus);

      return tx.quoteRestoreRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: requestInclude,
      });
    });

    await this.notificationsService.create({
      userId: updatedRequest.requestedById,
      type: NotificationType.QUOTE_RESTORE_REQUEST_APPROVED,
      title: 'Restauración de cotización aprobada',
      message: `Tu solicitud para restaurar la cotización ${updatedRequest.quote.quoteNumber} fue aprobada. Quedó en estado ${STATUS_LABELS[updatedRequest.restoreToStatus]}.`,
      relatedId: updatedRequest.quoteId,
      relatedType: 'Quote',
    });

    return updatedRequest;
  }

  private async applyRejection(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.quoteRestoreRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: { quote: { select: { quoteNumber: true } } },
    });

    if (!request) {
      throw new NotFoundException(
        'Solicitud de restauración no encontrada o ya procesada',
      );
    }

    const updatedRequest = await this.prisma.quoteRestoreRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes,
      },
      include: requestInclude,
    });

    const rejectReason = reviewNotes ? ` Motivo: ${reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.QUOTE_RESTORE_REQUEST_REJECTED,
      title: 'Restauración de cotización rechazada',
      message: `Tu solicitud para restaurar la cotización ${request.quote.quoteNumber} fue rechazada.${rejectReason}`,
      relatedId: request.quoteId,
      relatedType: 'Quote',
    });

    return updatedRequest;
  }

  /** Devuelve la cotización a su estado previo y borra la marca de rechazo. */
  private async restoreQuote(
    tx: Prisma.TransactionClient,
    quoteId: string,
    restoreToStatus: QuoteStatus,
  ) {
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: restoreToStatus,
        rejectionReason: null,
        rejectedAt: null,
        rejectedFromStatus: null,
      },
    });
  }

  private async findRejectedQuote(quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        createdById: true,
        rejectionReason: true,
        rejectedAt: true,
        rejectedFromStatus: true,
      },
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${quoteId} not found`);
    }

    if (quote.status !== QuoteStatus.REJECTED) {
      throw new BadRequestException(
        'Solo se pueden restaurar cotizaciones rechazadas',
      );
    }

    return quote;
  }

  private async assertAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can review quote restore requests',
      );
    }
  }

  /**
   * Solicitudes pendientes. Solo cuenta las de cotizaciones que siguen
   * rechazadas: si la cotización se restauró o cambió por otra vía, ya no hay
   * nada que autorizar.
   */
  async findPendingRequests(quoteId?: string) {
    return this.prisma.quoteRestoreRequest.findMany({
      where: {
        ...(quoteId ? { quoteId } : {}),
        status: EditRequestStatus.PENDING,
        quote: { status: QuoteStatus.REJECTED, ...queueLocationFilter() },
      },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllRequests(quoteId?: string) {
    return this.prisma.quoteRestoreRequest.findMany({
      where: { ...(quoteId ? { quoteId } : {}), quote: queueLocationFilter() },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Solicitud pendiente de una cotización (para el detalle). */
  async findPendingByQuote(quoteId: string) {
    return this.prisma.quoteRestoreRequest.findFirst({
      where: { quoteId, status: EditRequestStatus.PENDING },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.quoteRestoreRequest.findMany({
      where: { requestedById: userId },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(requestId: string) {
    const request = await this.prisma.quoteRestoreRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });

    if (!request) {
      throw new NotFoundException('Quote restore request not found');
    }

    return request;
  }

  private async notifyAdminsByWhatsApp(
    requestId: string,
    requesterName: string,
    requesterRole: string,
    actionDescription: string,
    reason: string,
  ): Promise<void> {
    try {
      const adminPhones = await this.whatsappService.getAdminPhones();

      if (adminPhones.length === 0) {
        this.logger.warn(
          'No active administrators with phone number found for WhatsApp notification',
        );
        return;
      }

      const results = await Promise.allSettled(
        adminPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole,
            actionDescription,
            reason,
            requestId,
            requestType: ApprovalRequestType.QUOTE_RESTORE,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for quote restore request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }
}
