import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
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
  ApproveDiscountApprovalDto,
  RejectDiscountApprovalDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma';
import { queueLocationFilter } from '../../common/utils/location-context';
import { assertNotSelfReview } from '../../common/utils/self-review.util';

/**
 * Recalcula los totales de una OP dentro de la transacción indicada.
 *
 * Lo registra `OrdersService` al iniciar: el recálculo vive allá (redondeo,
 * retenciones, descuento por nómina) y `OrdersService` ya depende de este
 * servicio, así que inyectarlo al revés armaría un ciclo entre módulos.
 */
export type OrderTotalsRecalculator = (
  orderId: string,
  tx: Prisma.TransactionClient,
) => Promise<unknown>;

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class DiscountApprovalsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(DiscountApprovalsService.name);
  private recalculateOrderTotals: OrderTotalsRecalculator | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('DISCOUNT_APPROVAL', this);
  }

  registerOrderTotalsRecalculator(recalculator: OrderTotalsRecalculator) {
    this.recalculateOrderTotals = recalculator;
  }

  /**
   * Marca la solicitud como aprobada y recalcula la OP para que el descuento,
   * que hasta ahora no contaba, baje el total. Todo en una transacción: un
   * descuento aprobado que no se refleja en el total sería otra forma de saldo
   * equivocado.
   */
  private async markApproved(
    requestId: string,
    orderId: string,
    data: Pick<
      Prisma.DiscountApprovalUncheckedUpdateInput,
      'reviewedById' | 'reviewNotes'
    >,
  ) {
    const recalculate = this.recalculateOrderTotals;
    if (!recalculate) {
      throw new Error(
        'DiscountApprovalsService: OrdersService no registró el recálculo de totales',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.discountApproval.update({
        where: { id: requestId },
        data: {
          ...data,
          status: EditRequestStatus.APPROVED,
          reviewedAt: new Date(),
        },
        include: {
          requestedBy: { select: USER_SELECT },
          reviewedBy: { select: USER_SELECT },
          order: { select: { id: true, orderNumber: true } },
        },
      });

      await recalculate(orderId, tx);

      await tx.order.update({
        where: { id: orderId },
        data: { discountApprovalStatus: EditRequestStatus.APPROVED },
      });

      return updated;
    });
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.discountApproval.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `aprobación de descuento - Orden ${request.order.orderNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.discountApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: { order: { select: { id: true, orderNumber: true } } },
    });

    if (!request) return;

    await this.markApproved(requestId, request.orderId, {
      reviewedById: reviewerId,
      reviewNotes: 'Aprobado vía WhatsApp',
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.DISCOUNT_APPROVAL_APPROVED,
      title: 'Descuento aprobado',
      message: `El descuento de la orden ${request.order.orderNumber} ha sido aprobado.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.discountApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) return;

    await this.prisma.discountApproval.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
    });

    await this.prisma.order.update({
      where: { id: request.orderId },
      data: { discountApprovalStatus: EditRequestStatus.REJECTED },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.DISCOUNT_APPROVAL_REJECTED,
      title: 'Descuento rechazado',
      message: `El descuento de la orden ${request.order.orderNumber} ha sido rechazado vía WhatsApp.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });
  }

  /**
   * Busca reviewer por teléfono validando permiso approve_discounts.
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
            some: { permission: { name: 'approve_discounts' } },
          },
        },
      },
      select: { id: true },
    });
  }

  // ─── Domain methods ───

  /**
   * Verificar si el usuario requiere aprobación de descuento
   */
  async requiresApproval(userId: string): Promise<{ required: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    // Si el usuario tiene permiso approve_discounts, no requiere aprobación
    const hasPermission = user?.role?.permissions?.some(
      (rp) => rp.permission.name === 'approve_discounts',
    );

    if (hasPermission) {
      return { required: false };
    }

    return {
      required: true,
      reason: 'El descuento requiere aprobación',
    };
  }

  /**
   * Crea la solicitud de aprobación de un descuento recién aplicado.
   *
   * Corre dentro de la transacción que crea el descuento y ANTES de recalcular
   * la OP: el recálculo ignora los descuentos con una solicitud sin aprobar, así
   * que el total no baja hasta que alguien con `approve_discounts` lo autorice.
   * Las notificaciones salen aparte, con `notifyPendingRequest`, una vez
   * confirmada la transacción.
   */
  async createPendingRequest(
    tx: Prisma.TransactionClient,
    params: { requestedById: string; orderId: string; discountId: string },
  ): Promise<{ id: string }> {
    const request = await tx.discountApproval.create({
      data: {
        orderId: params.orderId,
        discountId: params.discountId,
        requestedById: params.requestedById,
        status: EditRequestStatus.PENDING,
      },
      select: { id: true },
    });

    await tx.order.update({
      where: { id: params.orderId },
      data: { discountApprovalStatus: EditRequestStatus.PENDING },
    });

    return request;
  }

  /**
   * Avisa a quienes pueden aprobar descuentos (in-app y WhatsApp).
   */
  async notifyPendingRequest(requestId: string): Promise<void> {
    const request = await this.prisma.discountApproval.findUnique({
      where: { id: requestId },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
        discount: { select: { amount: true, reason: true } },
      },
    });

    if (!request) {
      throw new NotFoundException(
        `Solicitud de descuento ${requestId} no encontrada`,
      );
    }

    const { requestedBy: user, order, discount } = request;

    // Formatear monto y razón para los mensajes
    const amountFormatted = discount
      ? `$${Number(discount.amount).toLocaleString('es-CO')}`
      : '';
    const discountReason = discount?.reason ?? '';
    const discountDetail = discount
      ? ` de ${amountFormatted} (Motivo: ${discountReason})`
      : '';

    // Notificar a usuarios con permiso approve_discounts (in-app)
    await this.notificationsService.notifyUsersWithPermission(
      'approve_discounts',
      {
        type: NotificationType.DISCOUNT_APPROVAL_PENDING,
        title: 'Nueva solicitud de aprobación de descuento',
        message: `${user?.firstName || user?.email} solicita aprobación del descuento${discountDetail} de la orden ${order.orderNumber}`,
        relatedId: request.id,
        relatedType: 'DiscountApproval',
      },
      { orderId: request.orderId },
    );

    // Notificar por WhatsApp a usuarios con permiso (fire & forget)
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      'Usuario';

    this.notifyReviewersByWhatsApp(
      request.id,
      requesterName,
      `aprobación del descuento${discountDetail} de la orden ${order.orderNumber}`,
      `El descuento requiere aprobación`,
    );
  }

  /**
   * Aprobar solicitud
   */
  async approve(
    requestId: string,
    reviewerId: string,
    dto: ApproveDiscountApprovalDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.discountApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    // 2. Validar que revisor tiene permiso
    await this.validateReviewerPermission(reviewerId);
    await assertNotSelfReview(this.prisma, {
      requestedById: request.requestedById,
      reviewerId,
    });

    // 3. Aprobar y aplicar el descuento al total de la orden
    const updatedRequest = await this.markApproved(requestId, request.orderId, {
      reviewedById: reviewerId,
      reviewNotes: dto.reviewNotes,
    });

    // 5. Notificar al solicitante
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.DISCOUNT_APPROVAL_APPROVED,
      title: 'Descuento aprobado',
      message: `El descuento de la orden ${request.order.orderNumber} ha sido aprobado.`,
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
    reviewerId: string,
    dto: RejectDiscountApprovalDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.discountApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    // 2. Validar que revisor tiene permiso
    await this.validateReviewerPermission(reviewerId);
    await assertNotSelfReview(this.prisma, {
      requestedById: request.requestedById,
      reviewerId,
    });

    // 3. Actualizar solicitud a REJECTED
    await this.prisma.discountApproval.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    });

    // 4. Actualizar estado de aprobación de descuento en la orden
    await this.prisma.order.update({
      where: { id: request.orderId },
      data: { discountApprovalStatus: EditRequestStatus.REJECTED },
    });

    // 5. Notificar al solicitante
    const rejectReason = dto.reviewNotes ? ` Motivo: ${dto.reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.DISCOUNT_APPROVAL_REJECTED,
      title: 'Descuento rechazado',
      message: `El descuento de la orden ${request.order.orderNumber} ha sido rechazado.${rejectReason}`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    // Re-fetch para retornar datos actualizados
    return this.prisma.discountApproval.findUnique({
      where: { id: requestId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });
  }

  /**
   * Obtener solicitudes pendientes (para dashboard de aprobación)
   */
  async findPendingRequests() {
    return this.prisma.discountApproval.findMany({
      where: { status: EditRequestStatus.PENDING, order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true, total: true } },
        discount: { select: { id: true, amount: true, reason: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener todas las solicitudes (auditoría)
   */
  async findAll() {
    return this.prisma.discountApproval.findMany({
      where: { order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
        discount: { select: { id: true, amount: true, reason: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener una solicitud por id
   */
  async findOne(id: string) {
    const request = await this.prisma.discountApproval.findUnique({
      where: { id },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
        discount: { select: { id: true, amount: true, reason: true } },
      },
    });

    if (!request) {
      throw new NotFoundException(`Solicitud de aprobación de descuento ${id} no encontrada`);
    }

    return request;
  }

  /**
   * Obtener solicitudes propias del usuario
   */
  async findByUser(userId: string) {
    return this.prisma.discountApproval.findMany({
      where: { requestedById: userId },
      include: {
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
        discount: { select: { id: true, amount: true, reason: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Validar que el usuario tiene permiso approve_discounts
   */
  private async validateReviewerPermission(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const hasPermission = user?.role?.permissions?.some(
      (rp) => rp.permission.name === 'approve_discounts',
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Solo usuarios con permiso de aprobación de descuentos pueden aprobar/rechazar solicitudes',
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
        await this.whatsappService.getPhonesByPermission('approve_discounts');

      if (reviewerPhones.length === 0) {
        this.logger.warn(
          'No active users with approve_discounts permission and phone found for WhatsApp notification',
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
            requestType: ApprovalRequestType.DISCOUNT_APPROVAL,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for discount approval ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.discountApproval.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }
}
