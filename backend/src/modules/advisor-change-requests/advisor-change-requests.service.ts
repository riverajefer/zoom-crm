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
  CreateAdvisorChangeRequestDto,
  ApproveAdvisorChangeRequestDto,
  RejectAdvisorChangeRequestDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
} from '../../generated/prisma';
import { queueLocationFilter } from '../../common/utils/location-context';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
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

@Injectable()
export class AdvisorChangeRequestsService
  implements OnModuleInit, ApprovalRequestHandler
{
  private readonly logger = new Logger(AdvisorChangeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('ADVISOR_CHANGE', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(
    requestId: string,
  ): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.advisorChangeRequest.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `cambio de asesor de la Orden ${request.order.orderNumber}`,
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
    const request = await this.prisma.advisorChangeRequest.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }

  // ─── Domain methods ───

  /**
   * Crear solicitud de cambio de asesor de una OP.
   */
  async create(userId: string, dto: CreateAdvisorChangeRequestDto) {
    // 1. Validar que la orden existe
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, orderNumber: true, createdById: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${dto.orderId} not found`);
    }

    // 2. Validar que el nuevo asesor existe y está activo
    const newAdvisor = await this.prisma.user.findUnique({
      where: { id: dto.requestedAdvisorId },
      select: { ...userSelect, isActive: true },
    });

    if (!newAdvisor) {
      throw new NotFoundException(
        `User with id ${dto.requestedAdvisorId} not found`,
      );
    }

    if (!newAdvisor.isActive) {
      throw new BadRequestException(
        'No se puede asignar como asesor a un usuario inactivo',
      );
    }

    // 3. Validar que el nuevo asesor es distinto del actual
    if (order.createdById === dto.requestedAdvisorId) {
      throw new BadRequestException(
        'El asesor seleccionado ya es el asesor actual de la orden',
      );
    }

    // 4. Validar que el solicitante NO es admin (admins reasignan aprobando)
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (requester?.role?.name === 'admin') {
      throw new BadRequestException(
        'Los administradores pueden reasignar el asesor aprobando la solicitud directamente',
      );
    }

    // 5. Validar que no hay solicitud PENDING para la misma orden
    const existingRequest = await this.prisma.advisorChangeRequest.findFirst({
      where: {
        orderId: dto.orderId,
        status: EditRequestStatus.PENDING,
      },
    });

    if (existingRequest) {
      throw new BadRequestException(
        'Ya existe una solicitud de cambio de asesor pendiente para esta orden',
      );
    }

    // 6. Crear solicitud
    //
    // El índice parcial `advisor_change_requests_pending_unique` cierra la
    // carrera del doble clic; la petición perdedora devuelve la gemela sin
    // notificar de nuevo.
    const include = {
      requestedBy: { select: userSelect },
      currentAdvisor: { select: userSelect },
      requestedAdvisor: { select: userSelect },
      order: { select: { id: true, orderNumber: true } },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'advisor_change_requests_pending_unique',
      create: () =>
        this.prisma.advisorChangeRequest.create({
          data: {
            orderId: dto.orderId,
            requestedById: userId,
            currentAdvisorId: order.createdById,
            requestedAdvisorId: dto.requestedAdvisorId,
            reason: dto.reason,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.advisorChangeRequest.findFirst({
          where: { orderId: dto.orderId, status: EditRequestStatus.PENDING },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de cambio de asesor duplicada para la orden ${dto.orderId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    // 7. Notificar a todos los administradores (in-app)
    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.ADVISOR_CHANGE_REQUEST_PENDING,
      title: 'Nueva solicitud de cambio de asesor',
      message: `${userName(request.requestedBy)} solicita cambiar el asesor de la orden ${request.order.orderNumber} de ${userName(request.currentAdvisor)} a ${userName(request.requestedAdvisor)}`,
      relatedId: request.id,
      relatedType: 'AdvisorChangeRequest',
    });

    // 8. Notificar administradores por WhatsApp (fire & forget)
    this.notifyAdminsByWhatsApp(
      request.id,
      userName(request.requestedBy),
      requester?.role?.name || 'usuario',
      `cambiar el asesor de la Orden ${request.order.orderNumber} de ${userName(request.currentAdvisor)} a ${userName(request.requestedAdvisor)}`,
      dto.reason || 'Sin motivo especificado',
    );

    return request;
  }

  /**
   * Atajo de administrador: reasigna el asesor de la OP inmediatamente,
   * sin pasar por el flujo de solicitud/aprobación. Deja traza registrando
   * la operación como una solicitud ya APROBADA (auto-aprobada).
   */
  async changeAdvisorDirectly(
    adminId: string,
    dto: CreateAdvisorChangeRequestDto,
  ) {
    await this.assertAdmin(adminId);

    // Sin solicitud de por medio, el motivo es lo único que explica el cambio
    // (docs/PLAN_SEDES.md §6.3).
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Indica el motivo del cambio de asesor');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, orderNumber: true, createdById: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${dto.orderId} not found`);
    }

    const newAdvisor = await this.prisma.user.findUnique({
      where: { id: dto.requestedAdvisorId },
      select: { ...userSelect, isActive: true },
    });

    if (!newAdvisor) {
      throw new NotFoundException(
        `User with id ${dto.requestedAdvisorId} not found`,
      );
    }

    if (!newAdvisor.isActive) {
      throw new BadRequestException(
        'No se puede asignar como asesor a un usuario inactivo',
      );
    }

    if (order.createdById === dto.requestedAdvisorId) {
      throw new BadRequestException(
        'El asesor seleccionado ya es el asesor actual de la orden',
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { createdBy: { connect: { id: dto.requestedAdvisorId } } },
      });

      return tx.advisorChangeRequest.create({
        data: {
          orderId: order.id,
          requestedById: adminId,
          currentAdvisorId: order.createdById,
          requestedAdvisorId: dto.requestedAdvisorId,
          reason,
          status: EditRequestStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: now,
          reviewNotes: 'Cambio directo realizado por un administrador',
          isDirect: true,
        },
        include: {
          requestedBy: { select: userSelect },
          reviewedBy: { select: userSelect },
          currentAdvisor: { select: userSelect },
          requestedAdvisor: { select: userSelect },
          order: { select: { id: true, orderNumber: true } },
        },
      });
    });
  }

  /**
   * Aprobar solicitud (panel). Reasigna el asesor (createdById) de la OP.
   */
  async approve(
    requestId: string,
    adminId: string,
    dto: ApproveAdvisorChangeRequestDto,
  ) {
    await this.assertAdmin(adminId);
    return this.applyApproval(requestId, adminId, dto.reviewNotes);
  }

  /**
   * Rechazar solicitud (panel).
   */
  async reject(
    requestId: string,
    adminId: string,
    dto: RejectAdvisorChangeRequestDto,
  ) {
    await this.assertAdmin(adminId);
    return this.applyRejection(requestId, adminId, dto.reviewNotes);
  }

  /**
   * Lógica compartida de aprobación: marca APPROVED y reasigna el asesor
   * de la OP dentro de una transacción.
   */
  private async applyApproval(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.advisorChangeRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        order: { select: { id: true, orderNumber: true, createdById: true } },
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Advisor change request not found or already processed',
      );
    }

    // Validar que el nuevo asesor sigue activo
    const newAdvisor = await this.prisma.user.findUnique({
      where: { id: request.requestedAdvisorId },
      select: { isActive: true },
    });

    if (!newAdvisor?.isActive) {
      throw new BadRequestException(
        'El asesor destino ya no está activo. La solicitud no puede aprobarse.',
      );
    }

    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      // Reasignar el asesor (creador/dueño) de la OP
      await tx.order.update({
        where: { id: request.orderId },
        data: { createdBy: { connect: { id: request.requestedAdvisorId } } },
      });

      return tx.advisorChangeRequest.update({
        where: { id: requestId },
        data: {
          status: EditRequestStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
        },
        include: {
          requestedBy: { select: userSelect },
          reviewedBy: { select: userSelect },
          currentAdvisor: { select: userSelect },
          requestedAdvisor: { select: userSelect },
          order: { select: { id: true, orderNumber: true } },
        },
      });
    });

    // Notificar al solicitante
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.ADVISOR_CHANGE_REQUEST_APPROVED,
      title: 'Solicitud de cambio de asesor aprobada',
      message: `Tu solicitud para cambiar el asesor de la orden ${request.order.orderNumber} a ${userName(request.requestedAdvisor)} ha sido aprobada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    return updatedRequest;
  }

  private async applyRejection(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.advisorChangeRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        order: { select: { orderNumber: true } },
        requestedAdvisor: { select: userSelect },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Advisor change request not found or already processed',
      );
    }

    const updatedRequest = await this.prisma.advisorChangeRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes,
      },
      include: {
        requestedBy: { select: userSelect },
        reviewedBy: { select: userSelect },
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    const rejectReason = reviewNotes ? ` Motivo: ${reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.ADVISOR_CHANGE_REQUEST_REJECTED,
      title: 'Solicitud de cambio de asesor rechazada',
      message: `Tu solicitud para cambiar el asesor de la orden ${request.order.orderNumber} a ${userName(request.requestedAdvisor)} ha sido rechazada.${rejectReason}`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    return updatedRequest;
  }

  private async assertAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can review advisor change requests',
      );
    }
  }

  /**
   * Obtener todas las solicitudes pendientes.
   */
  async findPendingRequests(orderId?: string) {
    return this.prisma.advisorChangeRequest.findMany({
      where: {
        order: queueLocationFilter(),
        ...(orderId ? { orderId } : {}),
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: { select: userSelect },
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener todas las solicitudes.
   */
  async findAllRequests(orderId?: string) {
    return this.prisma.advisorChangeRequest.findMany({
      where: {
        order: queueLocationFilter(),
        ...(orderId ? { orderId } : {}),
      },
      include: {
        requestedBy: { select: userSelect },
        reviewedBy: { select: userSelect },
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener la solicitud pendiente de una orden (para el frontend).
   */
  async findPendingByOrder(orderId: string) {
    return this.prisma.advisorChangeRequest.findFirst({
      where: { orderId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: userSelect },
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitudes de un usuario.
   */
  async findByUser(userId: string) {
    return this.prisma.advisorChangeRequest.findMany({
      where: { requestedById: userId },
      include: {
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
        reviewedBy: { select: userSelect },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitud por ID.
   */
  async findOne(requestId: string) {
    const request = await this.prisma.advisorChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        requestedBy: { select: userSelect },
        reviewedBy: { select: userSelect },
        currentAdvisor: { select: userSelect },
        requestedAdvisor: { select: userSelect },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Advisor change request not found');
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
            requestType: ApprovalRequestType.ADVISOR_CHANGE,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for advisor change request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }
}
