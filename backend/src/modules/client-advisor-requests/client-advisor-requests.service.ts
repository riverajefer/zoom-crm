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
  CreateClientAdvisorRequestDto,
  ApproveClientAdvisorRequestDto,
  RejectClientAdvisorRequestDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
} from '../../generated/prisma';
import { assertNotSelfReview } from '../../common/utils/self-review.util';

const APPROVE_PERMISSION = 'approve_client_advisor';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

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

@Injectable()
export class ClientAdvisorRequestsService
  implements OnModuleInit, ApprovalRequestHandler
{
  private readonly logger = new Logger(ClientAdvisorRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('CLIENT_ADVISOR_ASSIGNMENT', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(
    requestId: string,
  ): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.clientAdvisorRequest.findUnique({
      where: { id: requestId },
      include: { client: { select: { name: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `asignación de asesor al cliente ${request.client.name}`,
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
    const request = await this.prisma.clientAdvisorRequest.findUnique({
      where: { id: requestId },
      select: { clientId: true },
    });
    return request?.clientId ?? null;
  }

  // ─── Domain methods ───

  /**
   * Crear solicitud de asignación de asesor a un cliente.
   */
  async create(userId: string, dto: CreateClientAdvisorRequestDto) {
    // 1. Validar que el cliente existe
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      select: { id: true, name: true },
    });

    if (!client) {
      throw new NotFoundException(
        `Cliente con id ${dto.clientId} no encontrado`,
      );
    }

    // 2. Validar que el asesor existe y está activo
    const advisor = await this.prisma.user.findUnique({
      where: { id: dto.requestedAdvisorId },
      select: { ...USER_SELECT, isActive: true },
    });

    if (!advisor) {
      throw new NotFoundException(
        `Usuario con id ${dto.requestedAdvisorId} no encontrado`,
      );
    }

    if (!advisor.isActive) {
      throw new BadRequestException(
        'No se puede asignar como asesor a un usuario inactivo',
      );
    }

    // 3. Validar que el asesor no esté ya asignado al cliente
    const existingAssignment = await this.prisma.clientAdvisor.findUnique({
      where: {
        clientId_advisorId: {
          clientId: dto.clientId,
          advisorId: dto.requestedAdvisorId,
        },
      },
    });

    if (existingAssignment) {
      throw new BadRequestException(
        'El asesor seleccionado ya está asignado a este cliente',
      );
    }

    // 4. Validar que no exista una solicitud PENDING para el mismo cliente + asesor
    const existingRequest = await this.prisma.clientAdvisorRequest.findFirst({
      where: {
        clientId: dto.clientId,
        requestedAdvisorId: dto.requestedAdvisorId,
        status: EditRequestStatus.PENDING,
      },
    });

    if (existingRequest) {
      throw new BadRequestException(
        'Ya existe una solicitud pendiente para asignar este asesor a este cliente',
      );
    }

    // 5. Crear la solicitud
    //
    // El índice parcial `client_advisor_requests_pending_unique` cierra la
    // carrera del doble clic; la petición perdedora devuelve la gemela sin
    // notificar de nuevo.
    const include = {
      requestedBy: { select: USER_SELECT },
      requestedAdvisor: { select: USER_SELECT },
      client: { select: { id: true, name: true } },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'client_advisor_requests_pending_unique',
      create: () =>
        this.prisma.clientAdvisorRequest.create({
          data: {
            clientId: dto.clientId,
            requestedById: userId,
            requestedAdvisorId: dto.requestedAdvisorId,
            reason: dto.reason,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.clientAdvisorRequest.findFirst({
          where: {
            clientId: dto.clientId,
            requestedAdvisorId: dto.requestedAdvisorId,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de asignación de asesor duplicada para el cliente ${dto.clientId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    // 6. Notificar a usuarios con permiso de aprobación (in-app)
    await this.notificationsService.notifyUsersWithPermission(
      APPROVE_PERMISSION,
      {
        type: NotificationType.CLIENT_ADVISOR_REQUEST_PENDING,
        title: 'Nueva solicitud de asignación de asesor',
        message: `${userName(request.requestedBy)} solicita asignar a ${userName(request.requestedAdvisor)} como asesor del cliente ${request.client.name}`,
        relatedId: request.id,
        relatedType: 'ClientAdvisorRequest',
      },
    );

    // 7. Notificar por WhatsApp a usuarios con permiso (fire & forget)
    this.notifyReviewersByWhatsApp(
      request.id,
      userName(request.requestedBy),
      `asignar a ${userName(request.requestedAdvisor)} como asesor del cliente ${request.client.name}`,
      dto.reason || 'Sin motivo especificado',
    );

    return request;
  }

  /**
   * Aprobar solicitud (panel). Crea la fila ClientAdvisor (co-propiedad).
   */
  async approve(
    requestId: string,
    reviewerId: string,
    dto: ApproveClientAdvisorRequestDto,
  ) {
    await this.validateReviewerPermission(reviewerId);
    return this.applyApproval(requestId, reviewerId, dto.reviewNotes);
  }

  /**
   * Rechazar solicitud (panel).
   */
  async reject(
    requestId: string,
    reviewerId: string,
    dto: RejectClientAdvisorRequestDto,
  ) {
    await this.validateReviewerPermission(reviewerId);
    return this.applyRejection(requestId, reviewerId, dto.reviewNotes);
  }

  /**
   * Lógica compartida de aprobación: marca APPROVED y crea la fila ClientAdvisor
   * dentro de una transacción (ignora duplicado si ya estaba asignado).
   */
  private async applyApproval(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.clientAdvisorRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        client: { select: { id: true, name: true } },
        requestedAdvisor: { select: USER_SELECT },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }
    await assertNotSelfReview(this.prisma, {
      requestedById: request.requestedById,
      reviewerId,
    });

    // Validar que el asesor destino sigue activo
    const advisor = await this.prisma.user.findUnique({
      where: { id: request.requestedAdvisorId },
      select: { isActive: true },
    });

    if (!advisor?.isActive) {
      throw new BadRequestException(
        'El asesor destino ya no está activo. La solicitud no puede aprobarse.',
      );
    }

    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      // Crear la co-propiedad (ignora si ya existe por el unique)
      await tx.clientAdvisor.createMany({
        data: [
          {
            clientId: request.clientId,
            advisorId: request.requestedAdvisorId,
          },
        ],
        skipDuplicates: true,
      });

      return tx.clientAdvisorRequest.update({
        where: { id: requestId },
        data: {
          status: EditRequestStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
        },
        include: {
          requestedBy: { select: USER_SELECT },
          reviewedBy: { select: USER_SELECT },
          requestedAdvisor: { select: USER_SELECT },
          client: { select: { id: true, name: true } },
        },
      });
    });

    // Notificar al solicitante
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CLIENT_ADVISOR_REQUEST_APPROVED,
      title: 'Solicitud de asignación de asesor aprobada',
      message: `Tu solicitud para asignar a ${userName(request.requestedAdvisor)} como asesor del cliente ${request.client.name} ha sido aprobada.`,
      relatedId: request.clientId,
      relatedType: 'Client',
    });

    return updatedRequest;
  }

  private async applyRejection(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.clientAdvisorRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        client: { select: { id: true, name: true } },
        requestedAdvisor: { select: USER_SELECT },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }
    await assertNotSelfReview(this.prisma, {
      requestedById: request.requestedById,
      reviewerId,
    });

    const updatedRequest = await this.prisma.clientAdvisorRequest.update({
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
        requestedAdvisor: { select: USER_SELECT },
        client: { select: { id: true, name: true } },
      },
    });

    const rejectReason = reviewNotes ? ` Motivo: ${reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CLIENT_ADVISOR_REQUEST_REJECTED,
      title: 'Solicitud de asignación de asesor rechazada',
      message: `Tu solicitud para asignar a ${userName(request.requestedAdvisor)} como asesor del cliente ${request.client.name} ha sido rechazada.${rejectReason}`,
      relatedId: request.clientId,
      relatedType: 'Client',
    });

    return updatedRequest;
  }

  /**
   * Obtener todas las solicitudes pendientes (panel del admin).
   */
  async findPendingRequests() {
    return this.prisma.clientAdvisorRequest.findMany({
      where: { status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        requestedAdvisor: { select: USER_SELECT },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener todas las solicitudes (auditoría).
   */
  async findAllRequests() {
    return this.prisma.clientAdvisorRequest.findMany({
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        requestedAdvisor: { select: USER_SELECT },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener las solicitudes de un cliente (para el frontend).
   */
  async findByClient(clientId: string) {
    return this.prisma.clientAdvisorRequest.findMany({
      where: { clientId },
      include: {
        requestedBy: { select: USER_SELECT },
        requestedAdvisor: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitudes de un usuario.
   */
  async findByUser(userId: string) {
    return this.prisma.clientAdvisorRequest.findMany({
      where: { requestedById: userId },
      include: {
        requestedAdvisor: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async validateReviewerPermission(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    const hasPermission = user?.role?.permissions?.some(
      (rp) => rp.permission.name === APPROVE_PERMISSION,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Solo usuarios con permiso pueden aprobar o rechazar solicitudes de asignación de asesor.',
      );
    }
  }

  private async notifyReviewersByWhatsApp(
    requestId: string,
    requesterName: string,
    actionDescription: string,
    reason: string,
  ): Promise<void> {
    try {
      const reviewerPhones =
        await this.whatsappService.getPhonesByPermission(APPROVE_PERMISSION);

      if (reviewerPhones.length === 0) {
        this.logger.warn(
          `No active users with ${APPROVE_PERMISSION} permission and phone found for WhatsApp notification`,
        );
        return;
      }

      const results = await Promise.allSettled(
        reviewerPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole: 'usuario',
            actionDescription,
            reason,
            requestId,
            requestType: ApprovalRequestType.CLIENT_ADVISOR_ASSIGNMENT,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for client advisor request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }
}
