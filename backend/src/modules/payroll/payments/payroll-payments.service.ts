import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import {
  computeItemBalance,
  computeItemPaidAmount,
  computeItemPaymentStatus,
} from '../../../common/utils/payroll-payment-status.util';
import { PayrollPaymentsRepository } from './payroll-payments.repository';
import { CreatePayrollPaymentsDto } from './dto/create-payroll-payments.dto';
import { VoidPayrollPaymentDto } from './dto/void-payroll-payment.dto';

type Tx = Prisma.TransactionClient;

const cop = (n: number) =>
  `$${Math.round(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

/**
 * Pagos de nómina por empleado. Es solo registro: no toca Caja ni pide
 * aprobación, porque quien paga va tachando uno a uno mientras entrega el
 * dinero. El control está en que nunca se paga más que el saldo y en que un
 * error se anula con motivo en vez de borrarse.
 */
@Injectable()
export class PayrollPaymentsService {
  constructor(private readonly repository: PayrollPaymentsRepository) {}

  async findByPeriod(periodId: string) {
    return this.repository.findByPeriod(periodId);
  }

  async register(
    periodId: string,
    itemId: string,
    dto: CreatePayrollPaymentsDto,
    userId: string,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPeriod(tx, periodId);

      const item = await this.repository.findItemWithPayments(tx, itemId);
      if (!item) {
        throw new NotFoundException(`Registro de nómina con ID ${itemId} no encontrado`);
      }
      if (item.periodId !== periodId) {
        throw new BadRequestException('El registro no pertenece al periodo indicado');
      }

      const paid = computeItemPaidAmount(item.payments);
      const balance = computeItemBalance(item.totalPayment, paid);
      const amount = dto.lines.reduce((acc, l) => acc + l.amount, 0);

      if (balance <= 0) {
        throw new BadRequestException('A este empleado ya se le pagó todo el periodo');
      }
      if (Math.round(amount * 100) > Math.round(balance * 100)) {
        throw new BadRequestException(
          `El pago (${cop(amount)}) supera el saldo pendiente del empleado (${cop(balance)})`,
        );
      }

      const paidAt = new Date(dto.paidAt);
      const payments = await this.repository.createPayments(
        tx,
        dto.lines.map((line) => ({
          payrollItemId: itemId,
          amount: line.amount,
          paymentMethod: line.paymentMethod,
          paidAt,
          reference: line.reference?.trim() || null,
          bankEntity: line.bankEntity?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: userId,
        })),
      );

      const periodStatus = await this.syncPeriodStatus(tx, periodId);
      return { payments, periodStatus };
    });
  }

  async void(
    periodId: string,
    paymentId: string,
    dto: VoidPayrollPaymentDto,
    userId: string,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPeriod(tx, periodId);

      const payment = await this.repository.findPaymentById(tx, paymentId);
      if (!payment) {
        throw new NotFoundException(`Pago de nómina con ID ${paymentId} no encontrado`);
      }
      if (payment.payrollItem.periodId !== periodId) {
        throw new BadRequestException('El pago no pertenece al periodo indicado');
      }
      if (payment.isVoided) {
        throw new BadRequestException('Este pago ya fue anulado');
      }

      const voided = await this.repository.voidPayment(tx, paymentId, userId, dto.reason.trim());
      const periodStatus = await this.syncPeriodStatus(tx, periodId);
      return { payment: voided, periodStatus };
    });
  }

  /**
   * El periodo queda «Pagado» cuando a todos se les pagó, y vuelve a
   * «Calculado» si una anulación reabre un saldo. Solo corre al registrar o
   * anular un pago: los periodos que se marcaron pagados antes de que existiera
   * este registro no se tocan.
   */
  private async syncPeriodStatus(tx: Tx, periodId: string) {
    const [period, items] = await Promise.all([
      this.repository.findPeriodStatus(tx, periodId),
      this.repository.findPeriodItemsForStatus(tx, periodId),
    ]);
    if (!period) throw new NotFoundException(`Periodo con ID ${periodId} no encontrado`);

    const allPaid =
      items.length > 0 &&
      items.every(
        (i) =>
          computeItemPaymentStatus(i.totalPayment, computeItemPaidAmount(i.payments)) === 'PAID',
      );

    if (allPaid && period.status !== 'PAID') {
      await this.repository.updatePeriodStatus(tx, periodId, 'PAID');
      return 'PAID' as const;
    }
    if (!allPaid && period.status === 'PAID') {
      await this.repository.updatePeriodStatus(tx, periodId, 'CALCULATED');
      return 'CALCULATED' as const;
    }
    return period.status;
  }
}
