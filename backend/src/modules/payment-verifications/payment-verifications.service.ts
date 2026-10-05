import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, PaymentAccountingStatus } from '../../generated/prisma';
import { endOfDay, startOfDay } from '../../common/utils/date-range.util';
import { NotificationsService } from '../notifications/notifications.service';
import { FilterPaymentVerificationsDto, ObservePaymentDto, VerifyPaymentsDto } from './dto';
import { PaymentVerificationsRepository } from './payment-verifications.repository';

/**
 * Verificación contable de pagos (solo Zoom).
 *
 * En los locales la misma persona vende, registra el pago y lo aprueba en Caja.
 * Contabilidad revisa después cada abono de todas las sedes y lo deja
 * **verificado** u **observado** (con motivo). Es un control posterior: no
 * frena la OP, no cambia el saldo y no mueve dinero. Un pago observado se
 * corrige con los flujos de siempre (editar o anular el pago); al editarlo
 * vuelve solo a la bandeja (`reopenPaymentAccountingReview`).
 */
@Injectable()
export class PaymentVerificationsService {
  constructor(
    private readonly repository: PaymentVerificationsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(filters: FilterPaymentVerificationsDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 25;
    const { data, total, totalAmount } = await this.repository.findMany(
      {
        status: filters.status,
        dateFrom: startOfDay(filters.dateFrom),
        dateTo: endOfDay(filters.dateTo),
        paymentMethod: filters.paymentMethod,
        receivedById: filters.receivedById,
        locationId: filters.locationId,
        search: filters.search?.trim() || undefined,
      },
      page,
      limit,
    );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalAmount: Number(totalAmount ?? 0),
      },
    };
  }

  /** Cuántos pagos hay en cada estado, para las pestañas y el aviso del menú. */
  async getSummary() {
    const groups = await this.repository.countByStatus();
    const summary = {
      [PaymentAccountingStatus.PENDING]: { count: 0, amount: 0 },
      [PaymentAccountingStatus.OBSERVED]: { count: 0, amount: 0 },
      [PaymentAccountingStatus.VERIFIED]: { count: 0, amount: 0 },
    };
    for (const group of groups) {
      summary[group.accountingStatus] = {
        count: group._count._all,
        amount: Number(group._sum.amount ?? 0),
      };
    }
    return summary;
  }

  async getHistory(paymentId: string) {
    await this.loadReviewable([paymentId]);
    return this.repository.findHistory(paymentId);
  }

  /** Da por buenos uno o varios pagos. Los ya verificados se saltan. */
  async verify(dto: VerifyPaymentsDto, reviewerId: string) {
    const paymentIds = [...new Set(dto.paymentIds)];
    const payments = await this.loadReviewable(paymentIds);

    const toVerify = payments
      .filter((p) => p.accountingStatus !== PaymentAccountingStatus.VERIFIED)
      .map((p) => p.id);

    if (toVerify.length > 0) {
      await this.repository.setStatus(
        toVerify,
        PaymentAccountingStatus.VERIFIED,
        reviewerId,
        dto.notes?.trim() || null,
      );
    }

    return { verified: toVerify.length, skipped: paymentIds.length - toVerify.length };
  }

  /**
   * Deja el pago observado y avisa a quien lo recibió y a la caja de su sede.
   * No toca el dinero: la corrección la hace la sede editando o anulando el pago.
   */
  async observe(paymentId: string, dto: ObservePaymentDto, reviewerId: string) {
    const notes = dto.notes?.trim();
    if (!notes) {
      throw new BadRequestException('El motivo de la observación es obligatorio');
    }

    const [payment] = await this.loadReviewable([paymentId]);
    await this.repository.setStatus(
      [paymentId],
      PaymentAccountingStatus.OBSERVED,
      reviewerId,
      notes,
    );

    const amount = `$${Number(payment.amount).toLocaleString('es-CO')}`;
    const notification = {
      type: NotificationType.PAYMENT_ACCOUNTING_OBSERVED,
      title: 'Contabilidad observó un pago',
      message: `El pago de ${amount} de la orden ${payment.order.orderNumber} quedó observado: ${notes}`,
      relatedId: payment.order.id,
      relatedType: 'Order',
    };
    if (payment.receivedById !== reviewerId) {
      await this.notificationsService.create({
        userId: payment.receivedById,
        ...notification,
      });
    }
    await this.notificationsService.notifyUsersWithPermission(
      'approve_advance_payments',
      notification,
      { orderId: payment.order.id },
      [payment.receivedById, reviewerId],
    );

    return { id: paymentId, accountingStatus: PaymentAccountingStatus.OBSERVED };
  }

  /**
   * Carga los pagos pedidos y falla si alguno no está en la bandeja: no existe,
   * está anulado, Caja no lo ha aprobado o es de una sede que el usuario no ve.
   */
  private async loadReviewable(paymentIds: string[]) {
    const payments = await this.repository.findReviewable(paymentIds);
    if (payments.length !== paymentIds.length) {
      throw new NotFoundException(
        paymentIds.length === 1
          ? 'El pago no está disponible para verificación'
          : 'Alguno de los pagos no está disponible para verificación',
      );
    }
    return payments;
  }
}
