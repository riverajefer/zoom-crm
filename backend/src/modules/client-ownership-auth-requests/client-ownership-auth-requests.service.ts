import {
  Injectable,
  Logger,
  NotFoundException,
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
  ApproveClientOwnershipAuthRequestDto,
  RejectClientOwnershipAuthRequestDto,
} from './dto';
import { ApprovalRequestType, EditRequestStatus, NotificationType } from '../../generated/prisma';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class ClientOwnershipAuthRequestsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(ClientOwnershipAuthRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('CLIENT_OWNERSHIP_AUTH', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.clientOwnershipAuthRequest.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `autorización de cliente - Orden ${request.order.orderNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.clientOwnershipAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
      },
      include: { order: { select: { id: true, orderNumber: true } } },
    });

    await this.prisma.order.update({
      where: { id: request.orderId },
      data: { clientOwnershipAuthStatus: EditRequestStatus.APPROVED },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CLIENT_OWNERSHIP_AUTH_APPROVED,
      title: 'Autorización aprobada',
      message: `La autorización para la orden ${request.order.orderNumber} fue aprobada. La orden puede proceder normalmente.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.clientOwnershipAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
      include: { order: { select: { id: true, orderNumber: true } } },
    });

    await this.prisma.order.update({
      where: { id: request.orderId },
      data: { clientOwnershipAuthStatus: EditRequestStatus.REJECTED },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CLIENT_OWNERSHIP_AUTH_REJECTED,
      title: 'Autorización rechazada',
      message: `La solicitud de autorización para la orden ${request.order.orderNumber} fue rechazada. La orden quedará bloqueada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });
  }

  /**
   * Busca reviewer por teléfono validando permiso approve_client_ownership_auth
   * (en vez de solo rol admin).
   */
  async findReviewerByPhone(phone: string): Promise<{ id: string } | null> {
    const clean = phone.replace(/[^\d]/g, '');
    const variants = [
      clean,
      `+${clean}`,
      clean.startsWith('57') ? clean.slice(2) : null,
    ].filter(Boolean) as string[];

    return this.prisma.user.findFirst({
      where: {
        isActive: true,
        phone: { in: variants },
        role: {
          permissions: {
            some: { permission: { name: 'approve_client_ownership_auth' } },
          },
        },
      },
      select: { id: true },
    });
  }

  // ─── Domain methods ───

  /**
   * Verifica si el creador de la orden necesita autorización para asociar el cliente.
   * Un cliente puede pertenecer a varios asesores (co-propiedad). No requiere auth si:
   *   - El cliente no tiene ningún asesor asignado
   *   - El creador es uno de los asesores del cliente
   *   - El creador tiene el permiso `approve_client_ownership_auth` (admin)
   */
  async requiresAuth(
    creatorId: string,
    clientId: string,
  ): Promise<{ required: boolean; advisorId?: string; reason?: string }> {
    const advisors = await this.prisma.clientAdvisor.findMany({
      where: { clientId },
      select: { advisorId: true },
    });

    // Cliente sin asesores → cualquiera puede crear la orden
    if (advisors.length === 0) {
      return { required: false };
    }

    // El creador ya es uno de los asesores dueños del cliente
    if (advisors.some((a) => a.advisorId === creatorId)) {
      return { required: false };
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    const hasAdminBypass = creator?.role?.permissions?.some(
      (rp) => rp.permission.name === 'approve_client_ownership_auth',
    );

    if (hasAdminBypass) {
      return { required: false };
    }

    return {
      required: true,
      // Asesor representativo (informativo para la notificación/solicitud)
      advisorId: advisors[0].advisorId,
      reason:
        'Este cliente pertenece a otro(s) asesor(es). Se requiere autorización de un administrador.',
    };
  }

  /**
   * Crea la solicitud de autorización al momento de crear la orden.
   * Actualiza el campo clientOwnershipAuthStatus de la orden a PENDING.
   * Notifica a los usuarios con permiso approve_client_ownership_auth.
   */
  async createFromOrderCreation(
    requestedById: string,
    orderId: string,
    advisorId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true },
    });

    if (!order) {
      throw new NotFoundException(`Orden con id ${orderId} no encontrada`);
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: requestedById },
      select: USER_SELECT,
    });

    // Este módulo no validaba duplicados: la solicitud nace dentro de la
    // creación de la orden, y la orden guarda su propio
    // `clientOwnershipAuthStatus`, así que dos pendientes para la misma orden
    // nunca son correctas. El índice parcial
    // `client_ownership_auth_requests_pending_unique` es aquí la única
    // validación, y la petición perdedora devuelve la gemela sin notificar.
    const include = {
      requestedBy: { select: USER_SELECT },
      advisor: { select: USER_SELECT },
      order: { select: { id: true, orderNumber: true } },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'client_ownership_auth_requests_pending_unique',
      create: () =>
        this.prisma.clientOwnershipAuthRequest.create({
          data: {
            orderId,
            requestedById,
            advisorId,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.clientOwnershipAuthRequest.findFirst({
          where: { orderId, status: EditRequestStatus.PENDING },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de autorización de cliente duplicada para la orden ${orderId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { clientOwnershipAuthStatus: EditRequestStatus.PENDING },
    });

    await this.notificationsService.notifyUsersWithPermission(
      'approve_client_ownership_auth',
      {
        type: NotificationType.CLIENT_OWNERSHIP_AUTH_PENDING,
        title: 'Nueva solicitud de autorización de cliente',
        message: `${requester?.firstName || requester?.email} solicita crear la orden ${order.orderNumber} para un cliente asignado a otro asesor.`,
        relatedId: request.id,
        relatedType: 'ClientOwnershipAuthRequest',
      },
      { orderId },
    );

    // Notificar por WhatsApp a usuarios con permiso (fire & forget)
    const requesterName =
      [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') ||
      requester?.email ||
      'Usuario';

    this.notifyReviewersByWhatsApp(
      request.id,
      requesterName,
      `crear la orden ${order.orderNumber} para un cliente asignado a otro asesor`,
      'Este cliente pertenece a otro asesor. Se requiere autorización.',
    );

    return request;
  }

  /**
   * Aprobar la solicitud. Desbloquea la orden.
   */
  async approve(
    requestId: string,
    reviewerId: string,
    dto: ApproveClientOwnershipAuthRequestDto,
  ) {
    const request = await this.prisma.clientOwnershipAuthRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    await this.validateReviewerPermission(reviewerId);

    const updatedRequest = await this.prisma.clientOwnershipAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    await this.prisma.order.update({
      where: { id: request.orderId },
      data: { clientOwnershipAuthStatus: EditRequestStatus.APPROVED },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CLIENT_OWNERSHIP_AUTH_APPROVED,
      title: 'Autorización aprobada',
      message: `La autorización para la orden ${request.order.orderNumber} fue aprobada. La orden puede proceder normalmente.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    return updatedRequest;
  }

  /**
   * Rechazar la solicitud. La orden queda marcada como REJECTED pero no se elimina.
   */
  async reject(
    requestId: string,
    reviewerId: string,
    dto: RejectClientOwnershipAuthRequestDto,
  ) {
    const request = await this.prisma.clientOwnershipAuthRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    await this.validateReviewerPermission(reviewerId);

    await this.prisma.clientOwnershipAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    });

    await this.prisma.order.update({
      where: { id: request.orderId },
      data: { clientOwnershipAuthStatus: EditRequestStatus.REJECTED },
    });

    const rejectReason = dto.reviewNotes ? ` Motivo: ${dto.reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CLIENT_OWNERSHIP_AUTH_REJECTED,
      title: 'Autorización rechazada',
      message: `La solicitud de autorización para la orden ${request.order.orderNumber} fue rechazada.${rejectReason} La orden quedará bloqueada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    return this.prisma.clientOwnershipAuthRequest.findUnique({
      where: { id: requestId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });
  }

  /**
   * Solicitudes pendientes para el dashboard del admin.
   */
  async findPendingRequests() {
    return this.prisma.clientOwnershipAuthRequest.findMany({
      where: { status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        advisor: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Todas las solicitudes para auditoría.
   */
  async findAll() {
    return this.prisma.clientOwnershipAuthRequest.findMany({
      include: {
        requestedBy: { select: USER_SELECT },
        advisor: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Solicitudes propias del usuario solicitante.
   */
  async findByUser(userId: string) {
    return this.prisma.clientOwnershipAuthRequest.findMany({
      where: { requestedById: userId },
      include: {
        advisor: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
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
      (rp) => rp.permission.name === 'approve_client_ownership_auth',
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Solo administradores pueden aprobar o rechazar solicitudes de autorización de propiedad de cliente.',
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
      const reviewerPhones = await this.whatsappService.getPhonesByPermission(
        'approve_client_ownership_auth',
      );

      if (reviewerPhones.length === 0) {
        this.logger.warn(
          'No active users with approve_client_ownership_auth permission and phone found for WhatsApp notification',
        );
        return;
      }

      const results = await Promise.allSettled(
        reviewerPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole: 'vendedor',
            actionDescription,
            reason,
            requestId,
            requestType: ApprovalRequestType.CLIENT_OWNERSHIP_AUTH,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for client ownership auth ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.clientOwnershipAuthRequest.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }
}
