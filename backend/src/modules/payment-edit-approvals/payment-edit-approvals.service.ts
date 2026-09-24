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
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import { StorageService } from '../storage/storage.service';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import {
  ApprovePaymentEditApprovalDto,
  RejectPaymentEditApprovalDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma';
import {
  ACTIVE_PAYMENT_WHERE,
  computeNetPaidAmount,
  computeOrderBalance,
} from '../../common/utils/order-balance.util';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { lockOrderForUpdate } from '../../common/utils/order-lock.util';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  reportMovementEditedAfterClose,
  syncPaymentCashMovement,
} from '../cash-session/payment-cash-movement.util';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

/**
 * Payload de edición de un pago. Solo los campos presentes (no undefined)
 * representan un cambio solicitado.
 */
export interface PaymentEditPayload {
  amount?: number;
  paymentMethod?: PaymentMethod;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  bankEntity?: string;
  reason?: string;
  /** Comprobante actual del pago (para revertir/limpiar al aplicar). */
  oldReceiptFileId?: string | null;
  /** Comprobante propuesto, ya subido a storage pero sin enlazar al pago. */
  newReceiptFileId?: string | null;
}

@Injectable()
export class PaymentEditApprovalsService
  implements OnModuleInit, ApprovalRequestHandler
{
  private readonly logger = new Logger(PaymentEditApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
    private readonly wsEventsGateway: WsEventsGateway,
    private readonly storageService: StorageService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly consecutivesService: ConsecutivesService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('PAYMENT_EDIT', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(
    requestId: string,
  ): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.paymentEditApproval.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `edición de pago - Orden ${request.order.orderNumber}`,
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
            some: { permission: { name: 'approve_payment_edits' } },
          },
        },
      },
      select: { id: true },
    });
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.paymentEditApproval.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }

  // ─── Domain methods ───

  /**
   * Verificar si el usuario requiere aprobación para editar un pago.
   * Quien tenga approve_payment_edits edita directamente (sin solicitud).
   */
  async requiresApproval(
    userId: string,
  ): Promise<{ required: boolean; reason?: string }> {
    const hasPermission = await this.userHasApprovePermission(userId);
    if (hasPermission) {
      return { required: false };
    }
    return {
      required: true,
      reason: 'La edición de un pago requiere aprobación del administrador',
    };
  }

  /**
   * Crear solicitud de edición de pago (payload pendiente).
   * NO modifica el pago: el cambio solo se aplica al aprobar.
   */
  async createRequest(
    orderId: string,
    paymentId: string,
    userId: string,
    payload: PaymentEditPayload,
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
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          paymentDate: true,
          reference: true,
          notes: true,
          bankEntity: true,
        },
      }),
    ]);

    if (!order) {
      throw new NotFoundException(`Orden con id ${orderId} no encontrada`);
    }
    if (!payment) {
      throw new NotFoundException(`Pago con id ${paymentId} no encontrado`);
    }

    // Evitar solicitudes duplicadas pendientes para el mismo pago
    const existingPending = await this.prisma.paymentEditApproval.findFirst({
      where: { paymentId, status: EditRequestStatus.PENDING },
      select: { id: true },
    });
    if (existingPending) {
      return this.prisma.paymentEditApproval.findUnique({
        where: { id: existingPending.id },
        include: {
          requestedBy: { select: USER_SELECT },
          order: { select: { id: true, orderNumber: true } },
        },
      });
    }

    const request = await this.prisma.paymentEditApproval.create({
      data: {
        orderId,
        paymentId,
        requestedById: userId,
        reason: payload.reason,
        // Snapshot anterior
        oldAmount: payment.amount,
        oldPaymentMethod: payment.paymentMethod,
        oldPaymentDate: payment.paymentDate,
        oldReference: payment.reference,
        oldNotes: payment.notes,
        oldBankEntity: payment.bankEntity,
        oldReceiptFileId: payload.oldReceiptFileId ?? null,
        // Payload pendiente
        newAmount:
          payload.amount !== undefined
            ? new Prisma.Decimal(payload.amount)
            : null,
        newPaymentMethod: payload.paymentMethod ?? null,
        newPaymentDate: payload.paymentDate
          ? new Date(payload.paymentDate)
          : null,
        newReference: payload.reference ?? null,
        newNotes: payload.notes ?? null,
        newBankEntity: payload.bankEntity ?? null,
        newReceiptFileId: payload.newReceiptFileId ?? null,
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    const oldFormatted = `$${Number(payment.amount).toLocaleString('es-CO')}`;
    const newFormatted =
      payload.amount !== undefined
        ? `$${Number(payload.amount).toLocaleString('es-CO')}`
        : oldFormatted;
    const changeDetail =
      payload.amount !== undefined
        ? ` (de ${oldFormatted} a ${newFormatted})`
        : '';

    // Notificación in-app a usuarios con permiso de aprobación
    await this.notificationsService.notifyUsersWithPermission(
      'approve_payment_edits',
      {
        type: NotificationType.PAYMENT_EDIT_APPROVAL_PENDING,
        title: 'Nueva solicitud de edición de pago',
        message: `${user?.firstName || user?.email} solicita editar un pago${changeDetail} de la orden ${order.orderNumber}`,
        relatedId: request.id,
        relatedType: 'PaymentEditApproval',
      },
    );

    // Notificación WhatsApp con botones Autorizar/Rechazar
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      'Usuario';
    this.notifyReviewersByWhatsApp(
      request.id,
      requesterName,
      `editar un pago${changeDetail} de la orden ${order.orderNumber}`,
      payload.reason || 'La edición de un pago requiere autorización',
    );

    // Evento WebSocket en tiempo real
    this.wsEventsGateway.emitApprovalCreated(request);

    return request;
  }

  /**
   * Aprobar solicitud — aplica el payload pendiente al pago y recalcula totales.
   */
  async approve(
    requestId: string,
    reviewerId: string,
    dto: ApprovePaymentEditApprovalDto,
  ) {
    await this.validateReviewerPermission(reviewerId);
    return this.applyApproval(requestId, reviewerId, dto.reviewNotes);
  }

  /**
   * Rechazar solicitud — el pago queda intacto.
   */
  async reject(
    requestId: string,
    reviewerId: string,
    dto: RejectPaymentEditApprovalDto,
  ) {
    await this.validateReviewerPermission(reviewerId);
    return this.applyRejection(requestId, reviewerId, dto.reviewNotes);
  }

  async findPendingRequests() {
    return this.prisma.paymentEditApproval.findMany({
      where: { status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            paidAmount: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.paymentEditApproval.findMany({
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.paymentEditApproval.findMany({
      where: { requestedById: userId },
      include: {
        reviewedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lista las solicitudes de edición de un pago/orden (para mostrar estado en UI).
   */
  async findByOrder(orderId: string) {
    return this.prisma.paymentEditApproval.findMany({
      where: { orderId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Internals ───

  /**
   * Aplica una edición aprobada al pago: actualiza el Payment, recalcula
   * paidAmount/balance de la orden y ajusta el movimiento de caja vinculado.
   */
  private async applyApproval(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.paymentEditApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    const { approved: updatedRequest, editedAfterClose } =
      await this.prisma.$transaction(async (tx) => {
      // 1. Construir los datos a aplicar (solo campos con payload)
      const paymentData: Prisma.PaymentUpdateInput = {};
      if (request.newAmount !== null) paymentData.amount = request.newAmount;
      if (request.newPaymentMethod !== null)
        paymentData.paymentMethod = request.newPaymentMethod;
      if (request.newPaymentDate !== null)
        paymentData.paymentDate = request.newPaymentDate;
      if (request.newReference !== null)
        paymentData.reference = request.newReference;
      if (request.newNotes !== null) paymentData.notes = request.newNotes;
      if (request.newBankEntity !== null)
        paymentData.bankEntity = request.newBankEntity;
      // Comprobante propuesto: enlazar el nuevo archivo al pago
      if (request.newReceiptFileId !== null)
        paymentData.receiptFileId = request.newReceiptFileId;

      // 2. Aplicar al pago. El método anterior se lee del pago vivo, no del
      // snapshot de la solicitud: otra edición pudo cambiarlo mientras esta
      // esperaba aprobación.
      const before = await tx.payment.findUniqueOrThrow({
        where: { id: request.paymentId },
        select: { paymentMethod: true },
      });
      const payment = await tx.payment.update({
        where: { id: request.paymentId },
        data: paymentData,
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          cashMovementId: true,
        },
      });

      // 3. Dejar el movimiento de caja coherente con el pago (anularlo si
      // dejó de ser dinero, ajustarlo, o crearlo si ahora sí lo es). Mismo
      // código que la edición directa: ver `syncPaymentCashMovement`.
      const editedAfterClose = await syncPaymentCashMovement(tx, {
        paymentId: request.paymentId,
        previousMethod: before.paymentMethod,
        updated: payment,
        orderId: request.orderId,
        orderNumber: request.order.orderNumber,
        userId: reviewerId,
        generateReceiptNumber: () =>
          this.consecutivesService.generateNumber('CASH_RECEIPT'),
      });

      // 4. Reajustar el consumo de saldo a favor (el monto o el método pudieron cambiar)
      const order = await tx.order.findUnique({
        where: { id: request.orderId },
        select: { clientId: true },
      });

      if (order) {
        await this.creditBalanceService.resyncCredit(tx, {
          paymentId: request.paymentId,
          clientId: order.clientId,
          targetOrderId: request.orderId,
          amount: payment.amount,
          isCreditBalance:
            payment.paymentMethod === PaymentMethod.CREDIT_BALANCE,
        });
      }

      // 5. Recalcular paidAmount/balance de la orden (total no cambia)
      await this.recalculateOrderPaidAmount(request.orderId, tx);

      // 6. Marcar solicitud como aprobada
      const approved = await tx.paymentEditApproval.update({
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
          order: { select: { id: true, orderNumber: true } },
        },
      });

      return { approved, editedAfterClose };
    });

    if (editedAfterClose) {
      reportMovementEditedAfterClose(
        this.logger,
        this.auditLogsService,
        editedAfterClose,
        request.paymentId,
        reviewerId,
      );
    }

    // Si se reemplazó el comprobante, eliminar el archivo anterior (fuera de la txn)
    if (request.newReceiptFileId && request.oldReceiptFileId) {
      try {
        await this.storageService.deleteFile(
          request.oldReceiptFileId,
          reviewerId,
        );
      } catch (error) {
        this.logger.error(
          `No se pudo eliminar el comprobante anterior ${request.oldReceiptFileId}: ${error.message}`,
        );
      }
    }

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.PAYMENT_EDIT_APPROVAL_APPROVED,
      title: 'Edición de pago aprobada',
      message: `La edición del pago de la orden ${request.order.orderNumber} ha sido aprobada y aplicada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    this.wsEventsGateway.emitApprovalUpdated(updatedRequest);

    return updatedRequest;
  }

  /**
   * Rechaza la solicitud: el pago queda intacto.
   */
  private async applyRejection(
    requestId: string,
    reviewerId: string,
    reviewNotes?: string,
  ) {
    const request = await this.prisma.paymentEditApproval.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    const updatedRequest = await this.prisma.paymentEditApproval.update({
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
        order: { select: { id: true, orderNumber: true } },
      },
    });

    // El comprobante propuesto quedó huérfano (nunca se enlazó): eliminarlo
    if (request.newReceiptFileId) {
      try {
        await this.storageService.hardDeleteFile(request.newReceiptFileId);
      } catch (error) {
        this.logger.error(
          `No se pudo eliminar el comprobante propuesto ${request.newReceiptFileId}: ${error.message}`,
        );
      }
    }

    const rejectReason = reviewNotes ? ` Motivo: ${reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.PAYMENT_EDIT_APPROVAL_REJECTED,
      title: 'Edición de pago rechazada',
      message: `La edición del pago de la orden ${request.order.orderNumber} ha sido rechazada. El pago no fue modificado.${rejectReason}`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    this.wsEventsGateway.emitApprovalUpdated(updatedRequest);

    return updatedRequest;
  }

  /**
   * Recalcula paidAmount/balance de la orden sumando todos los pagos.
   * El total de la orden NO cambia al editar un pago.
   */
  private async recalculateOrderPaidAmount(
    orderId: string,
    tx: Prisma.TransactionClient,
  ) {
    // Bloquea la OP antes de leerla: ver `lockOrderForUpdate`.
    await lockOrderForUpdate(tx, orderId);
    const [order, payments] = await Promise.all([
      tx.order.findUnique({
        where: { id: orderId },
        select: {
          total: true,
          appliedCreditAmount: true,
          refundedAmount: true,
          reversedAmount: true,
        },
      }),
      tx.payment.findMany({
        where: { orderId, ...ACTIVE_PAYMENT_WHERE },
        select: { amount: true },
      }),
    ]);

    let paymentsTotal = new Prisma.Decimal(0);
    for (const payment of payments) {
      paymentsTotal = paymentsTotal.add(payment.amount);
    }

    // Neto de devoluciones: los pagos siguen ahí, pero ese dinero ya salió.
    const paidAmount = computeNetPaidAmount(paymentsTotal, order?.refundedAmount);

    const balance = computeOrderBalance({
      total: order?.total ?? 0,
      paidAmount,
      appliedCreditAmount: order?.appliedCreditAmount,
      reversedAmount: order?.reversedAmount ?? 0,
    });

    await tx.order.update({
      where: { id: orderId },
      data: { paidAmount, balance },
    });
  }

  private async userHasApprovePermission(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });
    return !!user?.role?.permissions?.some(
      (rp) => rp.permission.name === 'approve_payment_edits',
    );
  }

  private async validateReviewerPermission(userId: string): Promise<void> {
    const hasPermission = await this.userHasApprovePermission(userId);
    if (!hasPermission) {
      throw new ForbiddenException(
        'Solo usuarios con permiso de aprobación de ediciones de pago pueden aprobar/rechazar solicitudes',
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
        'approve_payment_edits',
      );

      if (reviewerPhones.length === 0) {
        this.logger.warn(
          'No active users with approve_payment_edits permission and phone for WhatsApp notification',
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
            requestType: ApprovalRequestType.PAYMENT_EDIT,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `WhatsApp notifications for payment edit approval ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }
}
