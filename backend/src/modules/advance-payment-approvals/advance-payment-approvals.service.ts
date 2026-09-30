import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import {
  ApproveAdvancePaymentApprovalDto,
  RejectAdvancePaymentApprovalDto,
} from './dto';
import { ApprovalRequestType, EditRequestStatus, NotificationType, Prisma } from '../../generated/prisma';
import {
  ACTIVE_PAYMENT_WHERE,
  computeNetPaidAmount,
  computeOrderBalance,
} from '../../common/utils/order-balance.util';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { lockOrderForUpdate } from '../../common/utils/order-lock.util';
import { queueLocationFilter } from '../../common/utils/location-context';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class AdvancePaymentApprovalsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(AdvancePaymentApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
    private readonly wsEventsGateway: WsEventsGateway,
    private readonly creditBalanceService: CreditBalanceService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('ADVANCE_PAYMENT', this);
  }

  /**
   * Recalcula `Order.advancePaymentStatus` a partir de todas las solicitudes de
   * la orden, en vez de escribir el resultado de la última revisada.
   *
   * El campo es uno solo por orden, pero las solicitudes son varias: una por
   * pago. Al escribirlo directo gana la última escritura, y eso deja órdenes
   * trabadas para siempre. Caso real (OP-2026-1504): el asesor registró el mismo
   * pago tres veces, Caja aprobó el bueno a las 17:19:53 y rechazó el duplicado
   * a las 17:20:32; el rechazo borró la aprobación y la orden quedó bloqueada
   * con el dinero completo en caja. `updateStatus()` bloquea con REJECTED y la
   * única ruta que limpia el rechazo es registrar un pago nuevo, que en una
   * orden ya pagada sería dinero inventado.
   *
   * El orden de precedencia refleja lo que de verdad falta:
   *
   * - Alguna solicitud PENDING → PENDING: Caja todavía no responde.
   * - Sobrevive un pago aprobado → APPROVED: el rechazo era de un duplicado y
   *   la orden sí tiene abono válido. `paymentId` queda en NULL al eliminarse
   *   el pago (ON DELETE SET NULL), así que sirve para distinguirlos.
   * - Solo quedan rechazos → REJECTED: la orden se quedó sin abono y el asesor
   *   tiene que rehacerlo. Es el bloqueo que el flujo buscaba desde el inicio.
   * - Solo quedan vencidas → EXPIRED: nadie puede aprobarlas ya, no se bloquea.
   */
  private async syncOrderAdvanceStatus(
    tx: Prisma.TransactionClient,
    orderId: string,
    rejectedReason: string | null,
  ): Promise<void> {
    const approvals = await tx.advancePaymentApproval.findMany({
      where: { orderId },
      select: { status: true, paymentId: true },
    });

    if (approvals.length === 0) return;

    const has = (status: EditRequestStatus) =>
      approvals.some((approval) => approval.status === status);

    const hasApprovedAlive = approvals.some(
      (approval) =>
        approval.status === EditRequestStatus.APPROVED &&
        approval.paymentId !== null,
    );

    let status: EditRequestStatus;
    if (has(EditRequestStatus.PENDING)) {
      status = EditRequestStatus.PENDING;
    } else if (hasApprovedAlive) {
      status = EditRequestStatus.APPROVED;
    } else if (has(EditRequestStatus.REJECTED)) {
      status = EditRequestStatus.REJECTED;
    } else if (has(EditRequestStatus.EXPIRED)) {
      status = EditRequestStatus.EXPIRED;
    } else {
      // Solo quedan aprobaciones cuyo pago se eliminó por otra vía (devolución,
      // edición). No hay nada pendiente ni rechazado: no se bloquea.
      status = EditRequestStatus.APPROVED;
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        advancePaymentStatus: status,
        advancePaymentRejectedReason:
          status === EditRequestStatus.REJECTED ? rejectedReason : null,
      },
    });
  }

  /**
   * Elimina el pago rechazado y recalcula los totales de la orden a partir de
   * los pagos que sobreviven.
   *
   * No se puede asumir que la orden queda en cero: puede tener otros pagos ya
   * aprobados o abonos registrados por Caja posteriormente, y esos deben seguir
   * descontándose del saldo.
   */
  private async deleteRejectedPaymentAndRecalculate(
    orderId: string,
    paymentId: string | null,
    rejectedReason: string | null,
    reviewerId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // El pago queda en null si la solicitud ya había sido procesada antes.
      if (paymentId) {
        // El movimiento de caja se crea al registrar el pago, antes de que el
        // admin apruebe. Si el anticipo se rechaza hay que anularlo: de lo
        // contrario sobrevive a la eliminación del pago (la FK vive en Payment)
        // y sigue contando como ingreso en el arqueo y en el reporte de caja.
        //
        // Se anula administrativamente, sin exigir sesión abierta ni generar
        // contramovimiento: ese dinero nunca debió entrar a la caja.
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          select: { cashMovementId: true },
        });

        // Si el anticipo rechazado consumía saldo a favor, devolverlo a las OPs
        // de origen antes de borrar el pago (la traza se borra en cascada).
        await this.creditBalanceService.releaseCredit(tx, paymentId);

        if (payment?.cashMovementId) {
          await tx.cashMovement.update({
            where: { id: payment.cashMovementId },
            data: {
              isVoided: true,
              voidedById: reviewerId,
              voidedAt: new Date(),
              voidReason: rejectedReason
                ? `Anticipo rechazado: ${rejectedReason}`
                : 'Anticipo rechazado',
            },
          });
        }

        await tx.payment.delete({ where: { id: paymentId } });
      }

      // Bloquea la OP antes de leerla: ver `lockOrderForUpdate`.
      await lockOrderForUpdate(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          total: true,
          appliedCreditAmount: true,
          refundedAmount: true,
          reversedAmount: true,
        },
      });
      if (!order) return;

      const remainingPayments = await tx.payment.findMany({
        where: { orderId, ...ACTIVE_PAYMENT_WHERE },
        select: { amount: true },
      });

      // Neto de devoluciones: los pagos siguen ahí, pero ese dinero ya salió.
      const paidAmount = computeNetPaidAmount(
        remainingPayments.reduce(
          (sum, payment) => sum.add(payment.amount),
          new Prisma.Decimal(0),
        ),
        order.refundedAmount,
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          paidAmount,
          balance: computeOrderBalance({
            total: order.total,
            paidAmount,
            appliedCreditAmount: order.appliedCreditAmount,
            reversedAmount: order.reversedAmount,
          }),
        },
      });

      // El rechazo no implica que la orden quede bloqueada: puede tener otro
      // pago aprobado en pie. Lo decide el conjunto de solicitudes, no esta.
      await this.syncOrderAdvanceStatus(tx, orderId, rejectedReason);
    });
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.advancePaymentApproval.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `aprobación de anticipo - Orden ${request.order.orderNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.advancePaymentApproval.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
      },
      include: { order: { select: { id: true, orderNumber: true } } },
    });

    await this.syncOrderAdvanceStatus(this.prisma, request.orderId, null);

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.ADVANCE_PAYMENT_APPROVAL_APPROVED,
      title: 'Anticipo aprobado',
      message: `El anticipo de la orden ${request.order.orderNumber} ha sido aprobado. Ya puedes cambiar el estado de la orden.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    this.wsEventsGateway.emitApprovalUpdated(request);
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.advancePaymentApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        order: { select: { id: true, orderNumber: true, total: true } },
        payment: { select: { id: true, amount: true } },
      },
    });

    if (!request) return;

    await this.prisma.advancePaymentApproval.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
    });

    // Eliminar pago y revertir montos
    await this.deleteRejectedPaymentAndRecalculate(
      request.orderId,
      request.paymentId,
      'Rechazado vía WhatsApp',
      reviewerId,
    );

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.ADVANCE_PAYMENT_APPROVAL_REJECTED,
      title: 'Anticipo rechazado',
      message: `El anticipo de la orden ${request.order.orderNumber} ha sido rechazado. El pago ha sido eliminado.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    this.wsEventsGateway.emitApprovalUpdated({ id: requestId, status: 'REJECTED', orderId: request.orderId });
  }

  /**
   * Busca reviewer por teléfono validando permiso approve_advance_payments.
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
            some: { permission: { name: 'approve_advance_payments' } },
          },
        },
      },
      select: { id: true },
    });
  }

  // ─── Domain methods ───

  /**
   * Verificar si el pago requiere autorización de Caja.
   *
   * Política: TODO pago entrante debe ser autorizado por Caja, sin importar el
   * rol que lo registró (incluidos admin y el propio rol Caja). No hay bypass
   * por permiso: `approve_advance_payments` solo determina QUIÉN puede aprobar
   * desde la cola de Caja, no exime de la solicitud.
   *
   * Se conserva la firma `(userId)` por compatibilidad con los llamadores.
   */
  async requiresApproval(
    _userId: string,
  ): Promise<{ required: boolean; reason?: string }> {
    return {
      required: true,
      reason: 'El pago requiere autorización de Caja',
    };
  }

  /**
   * Crear solicitud de aprobación de anticipo (llamado automáticamente al crear orden)
   */
  async createFromOrderCreation(
    userId: string,
    orderId: string,
    paymentId: string,
    paymentLabel: string = 'anticipo',
  ) {
    const [order, user, payment] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: USER_SELECT,
      }),
      this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { amount: true, paymentMethod: true },
      }),
    ]);

    if (!order) {
      throw new NotFoundException(`Orden con id ${orderId} no encontrada`);
    }

    // Crear solicitud
    const request = await this.prisma.advancePaymentApproval.create({
      data: {
        orderId,
        paymentId,
        // Snapshot: el pago se elimina si la solicitud es rechazada, pero el
        // historial debe seguir mostrando de cuánto era el anticipo.
        paymentAmount: payment?.amount ?? null,
        paymentMethod: payment?.paymentMethod ?? null,
        requestedById: userId,
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    // Actualizar estado de anticipo en la orden (limpia rechazo previo si lo había)
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        advancePaymentStatus: EditRequestStatus.PENDING,
        advancePaymentRejectedReason: null,
      },
    });

    // Formatear monto y método para los mensajes
    const amountFormatted = payment
      ? `$${Number(payment.amount).toLocaleString('es-CO')}`
      : '';
    const methodLabel = payment
      ? this.formatPaymentMethod(payment.paymentMethod)
      : '';
    const paymentDetail =
      payment ? ` de ${amountFormatted} vía ${methodLabel}` : '';

    // Notificar a usuarios con permiso approve_advance_payments (in-app)
    await this.notificationsService.notifyUsersWithPermission(
      'approve_advance_payments',
      {
        type: NotificationType.ADVANCE_PAYMENT_APPROVAL_PENDING,
        title: `Nueva solicitud de aprobación de ${paymentLabel}`,
        message: `${user?.firstName || user?.email} solicita aprobación del ${paymentLabel}${paymentDetail} de la orden ${order.orderNumber}`,
        relatedId: request.id,
        relatedType: 'AdvancePaymentApproval',
      },
      { orderId: request.orderId },
    );

    // Notificaciones WA de anticipo desactivadas temporalmente
    // const requesterName =
    //   [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    //   user?.email ||
    //   'Usuario';

    // this.notifyReviewersByWhatsApp(
    //   request.id,
    //   requesterName,
    //   `aprobación del ${paymentLabel}${paymentDetail} de la orden ${order.orderNumber}`,
    //   `El ${paymentLabel} requiere aprobación de Caja`,
    // );

    // Emitir evento WebSocket en tiempo real
    const fullRequest = await this.prisma.advancePaymentApproval.findUnique({
      where: { id: request.id },
      include: {
        requestedBy: { select: USER_SELECT },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            paidAmount: true,
            client: {
              select: { id: true, name: true },
            },
          },
        },
        payment: { select: { id: true, amount: true, paymentMethod: true, reference: true, notes: true } },
      },
    });
    if (fullRequest) {
      this.wsEventsGateway.emitApprovalCreated(fullRequest);
    }

    return request;
  }

  private formatPaymentMethod(method: string): string {
    const labels: Record<string, string> = {
      CASH: 'Efectivo',
      TRANSFER: 'Transferencia',
      CARD: 'Tarjeta',
      CHECK: 'Cheque',
      CREDIT: 'Crédito',
      OTHER: 'Otro',
    };
    return labels[method] ?? method;
  }

  /**
   * Aprobar solicitud
   */
  async approve(
    requestId: string,
    reviewerId: string,
    dto: ApproveAdvancePaymentApprovalDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.advancePaymentApproval.findFirst({
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

    // 3. Actualizar solicitud a APPROVED
    const updatedRequest = await this.prisma.advancePaymentApproval.update({
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

    // 4. Actualizar estado de anticipo en la orden. Si quedan otras solicitudes
    //    pendientes en la misma orden, sigue bloqueada hasta que Caja responda.
    await this.syncOrderAdvanceStatus(this.prisma, request.orderId, null);

    // 5. Notificar al solicitante
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.ADVANCE_PAYMENT_APPROVAL_APPROVED,
      title: 'Anticipo aprobado',
      message: `El anticipo de la orden ${request.order.orderNumber} ha sido aprobado. Ya puedes cambiar el estado de la orden.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    // 6. Emitir evento WebSocket
    this.wsEventsGateway.emitApprovalUpdated(updatedRequest);

    return updatedRequest;
  }

  /**
   * Rechazar solicitud — elimina el pago y revierte paidAmount/balance
   */
  async reject(
    requestId: string,
    reviewerId: string,
    dto: RejectAdvancePaymentApprovalDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.advancePaymentApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, total: true } },
        payment: { select: { id: true, amount: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    // 2. Validar que revisor tiene permiso
    await this.validateReviewerPermission(reviewerId);

    // 3. Actualizar solicitud a REJECTED
    await this.prisma.advancePaymentApproval.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    });

    // 4. Eliminar el pago y recalcular montos en la orden
    await this.deleteRejectedPaymentAndRecalculate(
      request.orderId,
      request.paymentId,
      dto.reviewNotes ?? null,
      reviewerId,
    );

    // 5. Notificar al solicitante
    const rejectReason = dto.reviewNotes ? ` Motivo: ${dto.reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.ADVANCE_PAYMENT_APPROVAL_REJECTED,
      title: 'Anticipo rechazado',
      message: `El anticipo de la orden ${request.order.orderNumber} ha sido rechazado. El pago ha sido eliminado y el saldo actualizado.${rejectReason}`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    // 6. Emitir evento WebSocket
    this.wsEventsGateway.emitApprovalUpdated({ id: requestId, status: 'REJECTED', orderId: request.orderId });

    // Re-fetch para retornar datos actualizados
    return this.prisma.advancePaymentApproval.findUnique({
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
    return this.prisma.advancePaymentApproval.findMany({
      where: { status: EditRequestStatus.PENDING, order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            paidAmount: true,
            client: {
              select: { id: true, name: true },
            },
          },
        },
        payment: { select: { id: true, amount: true, paymentMethod: true, reference: true, notes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener todas las solicitudes (auditoría)
   */
  async findAll() {
    return this.prisma.advancePaymentApproval.findMany({
      where: { order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
        payment: { select: { id: true, amount: true, paymentMethod: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitudes propias del usuario
   */
  async findByUser(userId: string) {
    return this.prisma.advancePaymentApproval.findMany({
      where: { requestedById: userId },
      include: {
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
        payment: { select: { id: true, amount: true, paymentMethod: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Validar que el usuario tiene permiso approve_advance_payments
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
      (rp) => rp.permission.name === 'approve_advance_payments',
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Solo usuarios con permiso de aprobación de anticipos pueden aprobar/rechazar solicitudes',
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
        'approve_advance_payments',
      );

      if (reviewerPhones.length === 0) {
        this.logger.warn(
          'No active users with approve_advance_payments permission and phone found for WhatsApp notification',
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
            requestType: ApprovalRequestType.ADVANCE_PAYMENT,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for advance payment approval ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.advancePaymentApproval.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }
}
