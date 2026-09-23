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
  CreateStatusChangeRequestDto,
  ApproveStatusChangeRequestDto,
  RejectStatusChangeRequestDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
  OrderStatus,
  Prisma,
} from '../../generated/prisma';
import { computeMaxRetainableOnAnnul } from '../../common/utils/order-balance.util';

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  IN_PRODUCTION: 'En Producción',
  READY: 'Lista para Entrega',
  DELIVERED: 'Entregada',
  DELIVERED_ON_CREDIT: 'Entregado a Crédito',
  WARRANTY: 'Garantía',
  PAID: 'Pagada',
  RETURNED: 'Devuelta',
  ANULADO: 'Anulada',
};

const formatCop = (amount: Prisma.Decimal): string =>
  `$${Number(amount).toLocaleString('es-CO')}`;

@Injectable()
export class OrderStatusChangeRequestsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(OrderStatusChangeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('STATUS_CHANGE', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.orderStatusChangeRequest.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `cambio de estado de la Orden ${request.order.orderNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.orderStatusChangeRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
      },
      include: { order: { select: { orderNumber: true } } },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.STATUS_CHANGE_REQUEST_APPROVED,
      title: 'Solicitud de cambio de estado aprobada',
      message: `Tu solicitud para cambiar la orden ${request.order.orderNumber} a ${request.requestedStatus} ha sido aprobada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.orderStatusChangeRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
      include: { order: { select: { orderNumber: true } } },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.STATUS_CHANGE_REQUEST_REJECTED,
      title: 'Solicitud de cambio de estado rechazada',
      message: `Tu solicitud para cambiar la orden ${request.order.orderNumber} a ${request.requestedStatus} ha sido rechazada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });
  }

  // ─── Domain methods ───

  /**
   * Crear solicitud de cambio de estado
   */
  async create(userId: string, dto: CreateStatusChangeRequestDto) {
    // 1. Validar que orden existe
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${dto.orderId} not found`);
    }

    // 2. Validar que el estado actual coincide
    if (order.status !== dto.currentStatus) {
      throw new BadRequestException(
        `Current order status is ${order.status}, not ${dto.currentStatus}`,
      );
    }

    // 3. Validar que usuario NO es admin (admins pueden cambiar directamente)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (user?.role?.name === 'admin') {
      throw new BadRequestException(
        'Administrators can change order status directly without requesting permission',
      );
    }

    // 3b. En una anulación con dinero, lo que retiene la empresa se decide al
    // pedirla, para que el admin lo apruebe junto con la anulación.
    const annulment =
      dto.requestedStatus === OrderStatus.ANULADO
        ? this.resolveAnnulmentAmounts(order, dto.retainedAmount)
        : null;

    // 4. Validar que no hay solicitud PENDING del mismo usuario para el mismo cambio
    const existingRequest =
      await this.prisma.orderStatusChangeRequest.findFirst({
        where: {
          orderId: dto.orderId,
          requestedById: userId,
          requestedStatus: dto.requestedStatus,
          status: EditRequestStatus.PENDING,
        },
      });

    if (existingRequest) {
      throw new BadRequestException(
        'You already have a pending status change request for this order',
      );
    }

    // 5. Crear solicitud
    //
    // El índice parcial `order_status_change_requests_pending_unique` cierra la
    // carrera del doble clic; la petición perdedora devuelve la gemela sin
    // notificar de nuevo.
    const include = {
      requestedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
        },
      },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'order_status_change_requests_pending_unique',
      create: () =>
        this.prisma.orderStatusChangeRequest.create({
          data: {
            orderId: dto.orderId,
            requestedById: userId,
            currentStatus: dto.currentStatus,
            requestedStatus: dto.requestedStatus,
            reason: dto.reason,
            retainedAmount: annulment?.retained ?? null,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.orderStatusChangeRequest.findFirst({
          where: {
            orderId: dto.orderId,
            requestedById: userId,
            requestedStatus: dto.requestedStatus,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de cambio de estado duplicada para la orden ${dto.orderId} por el usuario ${userId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    // 6. Notificar a todos los administradores (in-app)
    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.STATUS_CHANGE_REQUEST_PENDING,
      title: 'Nueva solicitud de cambio de estado',
      message: `${request.requestedBy.firstName || request.requestedBy.email} solicita cambiar la orden ${request.order.orderNumber} de ${dto.currentStatus} a ${dto.requestedStatus}${annulment?.summary ? `. ${annulment.summary}` : ''}`,
      relatedId: request.id,
      relatedType: 'OrderStatusChangeRequest',
    });

    // 7. Notificar administradores por WhatsApp (fire & forget)
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      request.requestedBy.email ||
      'Usuario';
    const requesterRole = user?.role?.name || 'usuario';

    this.notifyAdminsByWhatsApp(
      request.id,
      requesterName,
      requesterRole,
      `cambiar el estado de la Orden ${request.order.orderNumber} de ${ORDER_STATUS_LABELS[dto.currentStatus] || dto.currentStatus} a ${ORDER_STATUS_LABELS[dto.requestedStatus] || dto.requestedStatus}${annulment?.summary ? ` (${annulment.summary})` : ''}`,
      dto.reason || 'Sin motivo especificado',
    );

    return request;
  }

  /**
   * Valida lo que retiene la empresa al anular y arma el resumen que ve el admin.
   *
   * Sin dinero en la orden no hay nada que decidir: se guarda 0 y no se muestra
   * resumen. El tope se vuelve a validar al ejecutar la anulación, con la OP
   * bloqueada, porque entre pedir y ejecutar pueden entrar pagos o devoluciones.
   */
  private resolveAnnulmentAmounts(
    order: {
      total: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      appliedCreditAmount: Prisma.Decimal;
      reversedAmount: Prisma.Decimal;
    },
    retainedAmount: number | undefined,
  ): { retained: Prisma.Decimal; summary: string | null } {
    const max = computeMaxRetainableOnAnnul(order);
    const retained = new Prisma.Decimal(retainedAmount ?? 0);

    if (retained.greaterThan(max)) {
      throw new BadRequestException(
        `La empresa no puede retener ${formatCop(retained)}: el máximo es ${formatCop(max)}, lo que el cliente pagó y no ha usado en otras órdenes`,
      );
    }

    const unusedPaid = new Prisma.Decimal(order.paidAmount).sub(
      order.appliedCreditAmount,
    );
    if (unusedPaid.lessThanOrEqualTo(0)) return { retained, summary: null };

    return {
      retained,
      summary: `La empresa retiene ${formatCop(retained)} y quedan ${formatCop(unusedPaid.sub(retained))} como saldo a favor del cliente`,
    };
  }

  /**
   * Aprobar solicitud
   */
  async approve(
    requestId: string,
    adminId: string,
    dto: ApproveStatusChangeRequestDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.orderStatusChangeRequest.findFirst({
      where: {
        id: requestId,
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: true,
        order: {
          select: { orderNumber: true, status: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Status change request not found or already processed',
      );
    }

    // 2. Validar que revisor es admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException('Only administrators can approve requests');
    }

    // 3. Validar que el estado de la orden no cambió desde la solicitud
    if (request.order.status !== request.currentStatus) {
      throw new BadRequestException(
        `Order status has changed from ${request.currentStatus} to ${request.order.status}. Request is no longer valid.`,
      );
    }

    // 4. Actualizar solicitud
    const updatedRequest = await this.prisma.orderStatusChangeRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // 5. Notificar al solicitante
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.STATUS_CHANGE_REQUEST_APPROVED,
      title: 'Solicitud de cambio de estado aprobada',
      message: `Tu solicitud para cambiar la orden ${request.order.orderNumber} a ${request.requestedStatus} ha sido aprobada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    return updatedRequest;
  }

  /**
   * Rechazar solicitud
   */
  async reject(
    requestId: string,
    adminId: string,
    dto: RejectStatusChangeRequestDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.orderStatusChangeRequest.findFirst({
      where: {
        id: requestId,
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: true,
        order: {
          select: { orderNumber: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Status change request not found or already processed',
      );
    }

    // 2. Validar que revisor es admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException('Only administrators can reject requests');
    }

    // 3. Actualizar solicitud
    const updatedRequest = await this.prisma.orderStatusChangeRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // 4. Notificar al solicitante
    const rejectReason = dto.reviewNotes
      ? ` Motivo: ${dto.reviewNotes}`
      : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.STATUS_CHANGE_REQUEST_REJECTED,
      title: 'Solicitud de cambio de estado rechazada',
      message: `Tu solicitud para cambiar la orden ${request.order.orderNumber} a ${request.requestedStatus} ha sido rechazada.${rejectReason}`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    return updatedRequest;
  }

  /**
   * Validar si el cambio de estado requiere autorización
   */
  async requiresAuthorization(
    orderId: string,
    newStatus: OrderStatus,
    userId: string,
  ): Promise<{ required: boolean; reason?: string }> {
    // 1. Verificar si el usuario es admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (user?.role?.name === 'admin') {
      return { required: false };
    }

    // 2. Si el cambio es a DELIVERED_ON_CREDIT → SÍ requiere autorización
    if (newStatus === OrderStatus.DELIVERED_ON_CREDIT) {
      return {
        required: true,
        reason: 'Entregar a crédito requiere aprobación administrativa',
      };
    }

    // 3. Si el cambio es a ANULADO → SÍ requiere autorización
    if (newStatus === OrderStatus.ANULADO) {
      return {
        required: true,
        reason: 'Anular una orden requiere aprobación administrativa',
      };
    }

    return { required: false };
  }

  /**
   * Verificar si usuario tiene solicitud aprobada
   */
  async hasApprovedRequest(
    orderId: string,
    userId: string,
    newStatus: OrderStatus,
  ): Promise<boolean> {
    return !!(await this.findApprovedRequest(orderId, userId, newStatus));
  }

  /**
   * La solicitud aprobada más reciente del usuario para ese cambio. Al anular,
   * de aquí sale lo que retiene la empresa: vale lo que aprobó el admin, no lo
   * que mande el frontend al ejecutar.
   */
  async findApprovedRequest(
    orderId: string,
    userId: string,
    newStatus: OrderStatus,
  ) {
    return this.prisma.orderStatusChangeRequest.findFirst({
      where: {
        orderId,
        requestedById: userId,
        requestedStatus: newStatus,
        status: EditRequestStatus.APPROVED,
      },
      orderBy: { reviewedAt: 'desc' },
      select: { id: true, retainedAmount: true },
    });
  }

  /**
   * Obtener todas las solicitudes pendientes
   */
  /**
   * Solicitudes de cambio de estado que el administrador todavía tiene que responder.
   *
   * Filtrar solo por `status: PENDING` deja fantasmas: si la orden llega al estado
   * pedido por otra vía —un admin la anula directamente en vez de responder la
   * solicitud— la fila se queda PENDING y sigue apareciendo aunque ya no haya nada
   * que decidir. Las tres pendientes que había en producción eran exactamente eso:
   * las tres órdenes ya estaban ANULADO, que es lo que se había solicitado.
   *
   * `NOT { order: { status: requestedStatus } }` no se puede expresar en Prisma
   * comparando dos columnas, así que el descarte se hace en memoria. Son listas de
   * decenas de filas, no de miles.
   */
  async findPendingRequests(orderId?: string) {
    const requests = await this.findPendingRequestRows(orderId);

    return requests.filter(
      (request) => request.order?.status !== request.requestedStatus,
    );
  }

  /**
   * Cierra las solicitudes que pedían justamente el estado al que la orden acaba
   * de llegar. Se llama cuando el cambio se hizo por fuera de la solicitud.
   *
   * Se marcan APPROVED porque lo que el solicitante pidió sí ocurrió, y como
   * revisor queda quien ejecutó el cambio, que es la atribución real.
   *
   * Devuelve cuántas cerró.
   */
  async closePendingRequestsForReachedStatus(
    orderId: string,
    reachedStatus: OrderStatus,
    reviewerId: string,
  ): Promise<number> {
    const { count } = await this.prisma.orderStatusChangeRequest.updateMany({
      where: {
        orderId,
        requestedStatus: reachedStatus,
        status: EditRequestStatus.PENDING,
      },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'La orden fue llevada al estado solicitado',
      },
    });

    if (count > 0) {
      this.logger.log(
        `Orden ${orderId}: se cerraron ${count} solicitud(es) de cambio a ${reachedStatus} al alcanzarse el estado`,
      );
    }

    return count;
  }

  private async findPendingRequestRows(orderId?: string) {
    return this.prisma.orderStatusChangeRequest.findMany({
      where: {
        ...(orderId ? { orderId } : {}),
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener todas las solicitudes
   */
  async findAllRequests(orderId?: string) {
    return this.prisma.orderStatusChangeRequest.findMany({
      where: {
        ...(orderId ? { orderId } : {}),
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitudes de un usuario
   */
  async findByUser(userId: string) {
    return this.prisma.orderStatusChangeRequest.findMany({
      where: { requestedById: userId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitud por ID
   */
  async findOne(requestId: string) {
    const request = await this.prisma.orderStatusChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Status change request not found');
    }

    return request;
  }

  /**
   * Consumir (marcar como usada) una solicitud aprobada después del cambio exitoso
   */
  async consumeApprovedRequest(
    orderId: string,
    userId: string,
    newStatus: OrderStatus,
  ) {
    // Encontrar la solicitud aprobada
    const approvedRequest =
      await this.prisma.orderStatusChangeRequest.findFirst({
        where: {
          orderId,
          requestedById: userId,
          requestedStatus: newStatus,
          status: EditRequestStatus.APPROVED,
        },
      });

    if (approvedRequest) {
      // No cambiar el estado, solo registrar que fue usada (opcional: podrías agregar un campo "used" si quieres)
      // Por ahora, las solicitudes aprobadas permanecen en estado APPROVED
      // Esto permite audit trail completo
    }
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
            requestType: ApprovalRequestType.STATUS_CHANGE,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for status change request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.orderStatusChangeRequest.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }
}
