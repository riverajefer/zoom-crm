import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import {
  ApprovalRequestType,
  EditRequestStatus,
  ExpenseOrderStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma';
import { createOrReturnTwin } from '../../common/utils/unique-violation.util';
import { CreateExpenseOrderEditRequestDto, ReviewExpenseOrderEditRequestDto } from './dto';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

/** Nombre del índice parcial que garantiza una sola solicitud PENDING por OG y usuario. */
const PENDING_UNIQUE_INDEX = 'expense_order_edit_requests_pending_unique';

/**
 * Horas que tiene el solicitante para usar la edición aprobada. Con la OP son 5
 * minutos desde que entra a la orden, pero la OG se corrige en un formulario de
 * varios pasos y a veces hace falta conseguir antes la factura del proveedor.
 */
export const EDIT_APPROVAL_VALIDITY_HOURS = 24;

/** Solo una OG pagada pasa por este flujo: antes de pagarse se edita directo. */
const EDITABLE_WITH_APPROVAL: ExpenseOrderStatus[] = [ExpenseOrderStatus.PAID];

type TxClient = Prisma.TransactionClient;

@Injectable()
export class ExpenseOrderEditRequestsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(ExpenseOrderEditRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register(ApprovalRequestType.EXPENSE_ORDER_EDIT, this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.expenseOrderEditRequest.findUnique({
      where: { id: requestId },
      include: { expenseOrder: { select: { ogNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `edición de la OG pagada ${request.expenseOrder.ogNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    await this.markApproved(requestId, reviewerId, 'Aprobado vía WhatsApp');
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    await this.markRejected(requestId, reviewerId, 'Rechazado vía WhatsApp');
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.expenseOrderEditRequest.findUnique({
      where: { id: requestId },
      select: { expenseOrderId: true },
    });
    return request?.expenseOrderId ?? null;
  }

  // ─── Domain methods ───

  async create(userId: string, dto: CreateExpenseOrderEditRequestDto) {
    const expenseOrder = await this.prisma.expenseOrder.findUnique({
      where: { id: dto.expenseOrderId },
      select: { id: true, ogNumber: true, status: true },
    });

    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${dto.expenseOrderId} no encontrada`);
    }

    if (!EDITABLE_WITH_APPROVAL.includes(expenseOrder.status)) {
      throw new BadRequestException(
        `Solo se solicita autorización para editar una OG pagada. La OG ${expenseOrder.ogNumber} se puede editar directamente o todavía no se ha pagado.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (user?.role?.name === 'admin') {
      throw new BadRequestException(
        'Los administradores pueden editar la OG directamente sin crear una solicitud',
      );
    }

    const active = await this.findActiveApproval(dto.expenseOrderId, userId);
    if (active) {
      throw new BadRequestException(
        'Ya tienes una edición aprobada para esta OG. Úsala antes de pedir otra.',
      );
    }

    const existing = await this.prisma.expenseOrderEditRequest.findFirst({
      where: {
        expenseOrderId: dto.expenseOrderId,
        requestedById: userId,
        status: EditRequestStatus.PENDING,
      },
    });

    if (existing) {
      throw new BadRequestException('Ya tienes una solicitud de edición pendiente para esta OG');
    }

    const requestInclude = {
      requestedBy: { select: USER_SELECT },
      expenseOrder: { select: { id: true, ogNumber: true } },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: PENDING_UNIQUE_INDEX,
      create: () =>
        this.prisma.expenseOrderEditRequest.create({
          data: {
            expenseOrderId: dto.expenseOrderId,
            requestedById: userId,
            reason: dto.reason.trim(),
            status: EditRequestStatus.PENDING,
          },
          include: requestInclude,
        }),
      findTwin: () =>
        this.prisma.expenseOrderEditRequest.findFirst({
          where: {
            expenseOrderId: dto.expenseOrderId,
            requestedById: userId,
            status: EditRequestStatus.PENDING,
          },
          include: requestInclude,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de edición de OG duplicada para ${dto.expenseOrderId} por el usuario ${userId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      request.requestedBy.email ||
      'Usuario';

    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.EXPENSE_ORDER_EDIT_REQUEST_PENDING,
      title: 'Nueva solicitud de edición de OG pagada',
      message: `${requesterName} solicita editar la OG pagada ${request.expenseOrder.ogNumber}. Motivo: ${request.reason}`,
      relatedId: request.id,
      relatedType: 'ExpenseOrderEditRequest',
    });

    this.notifyAdminsByWhatsApp(
      request.id,
      requesterName,
      user?.role?.name || 'usuario',
      `editar la OG pagada ${request.expenseOrder.ogNumber}`,
      request.reason,
    );

    return request;
  }

  async approve(requestId: string, adminId: string, dto: ReviewExpenseOrderEditRequestDto) {
    await this.assertAdmin(adminId, 'aprobar');
    return this.markApproved(requestId, adminId, dto.reviewNotes);
  }

  async reject(requestId: string, adminId: string, dto: ReviewExpenseOrderEditRequestDto) {
    await this.assertAdmin(adminId, 'rechazar');
    return this.markRejected(requestId, adminId, dto.reviewNotes);
  }

  /**
   * Edición aprobada que el usuario todavía puede usar: aprobada, sin consumir y
   * sin vencer. Es lo que habilita `ExpenseOrdersService.update` sobre una OG
   * pagada.
   */
  async findActiveApproval(expenseOrderId: string, userId: string, db: TxClient | PrismaService = this.prisma) {
    return db.expenseOrderEditRequest.findFirst({
      where: {
        expenseOrderId,
        requestedById: userId,
        status: EditRequestStatus.APPROVED,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { reviewedAt: 'desc' },
    });
  }

  /**
   * Marca la edición como usada. Condicionada a `consumedAt: null` para que dos
   * guardados simultáneos no salgan los dos con la misma aprobación.
   */
  async consumeApproval(requestId: string, db: TxClient | PrismaService = this.prisma): Promise<boolean> {
    const { count } = await db.expenseOrderEditRequest.updateMany({
      where: { id: requestId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Pendientes que el admin tiene que responder. Si la OG ya no está pagada
   * (no debería pasar: una OG pagada no cambia de estado), la solicitud no
   * tiene sentido y no se muestra.
   */
  async findPendingRequests() {
    return this.prisma.expenseOrderEditRequest.findMany({
      where: {
        status: EditRequestStatus.PENDING,
        expenseOrder: { status: { in: EDITABLE_WITH_APPROVAL } },
      },
      include: {
        requestedBy: { select: USER_SELECT },
        expenseOrder: { select: { id: true, ogNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.expenseOrderEditRequest.findMany({
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        expenseOrder: { select: { id: true, ogNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByExpenseOrder(expenseOrderId: string) {
    return this.prisma.expenseOrderEditRequest.findMany({
      where: { expenseOrderId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lo que el detalle de la OG necesita para decidir qué botón mostrar: si el
   * usuario ya pidió la edición y espera respuesta, o si ya la tiene aprobada.
   */
  async findMyStatus(expenseOrderId: string, userId: string) {
    const [pending, activeApproval] = await Promise.all([
      this.prisma.expenseOrderEditRequest.findFirst({
        where: { expenseOrderId, requestedById: userId, status: EditRequestStatus.PENDING },
        select: { id: true, reason: true, createdAt: true },
      }),
      this.findActiveApproval(expenseOrderId, userId),
    ]);

    return {
      pending,
      activeApproval: activeApproval
        ? { id: activeApproval.id, expiresAt: activeApproval.expiresAt }
        : null,
    };
  }

  // ─── Internos ───

  private async assertAdmin(userId: string, action: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException(`Solo los administradores pueden ${action} solicitudes`);
    }
  }

  private async markApproved(requestId: string, reviewerId: string, reviewNotes?: string) {
    const request = await this.prisma.expenseOrderEditRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: { expenseOrder: { select: { ogNumber: true } } },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    const now = new Date();
    const updated = await this.prisma.expenseOrderEditRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: now,
        reviewNotes,
        expiresAt: new Date(now.getTime() + EDIT_APPROVAL_VALIDITY_HOURS * 60 * 60 * 1000),
      },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EXPENSE_ORDER_EDIT_REQUEST_APPROVED,
      title: 'Edición de OG aprobada',
      message: `Ya puedes editar la OG ${request.expenseOrder.ogNumber}. La aprobación sirve para una edición y vence en ${EDIT_APPROVAL_VALIDITY_HOURS} horas.`,
      relatedId: request.expenseOrderId,
      relatedType: 'ExpenseOrder',
    });

    return updated;
  }

  private async markRejected(requestId: string, reviewerId: string, reviewNotes?: string) {
    const request = await this.prisma.expenseOrderEditRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: { expenseOrder: { select: { ogNumber: true } } },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    const updated = await this.prisma.expenseOrderEditRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
    });

    const rejectReason = reviewNotes ? ` Motivo: ${reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EXPENSE_ORDER_EDIT_REQUEST_REJECTED,
      title: 'Edición de OG rechazada',
      message: `Tu solicitud para editar la OG ${request.expenseOrder.ogNumber} fue rechazada.${rejectReason}`,
      relatedId: request.expenseOrderId,
      relatedType: 'ExpenseOrder',
    });

    return updated;
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
            requestType: ApprovalRequestType.EXPENSE_ORDER_EDIT,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for expense order edit request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(`Error sending WhatsApp notifications: ${(error as Error).message}`);
    }
  }
}
