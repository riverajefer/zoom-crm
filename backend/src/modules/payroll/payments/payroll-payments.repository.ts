import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma, PayrollPeriodStatus } from '../../../generated/prisma';

type Tx = Prisma.TransactionClient;

const userSummarySelect = {
  select: { id: true, firstName: true, lastName: true },
} as const;

export const payrollPaymentSelect = {
  id: true,
  payrollItemId: true,
  amount: true,
  paymentMethod: true,
  paidAt: true,
  reference: true,
  bankEntity: true,
  notes: true,
  createdAt: true,
  isVoided: true,
  voidedAt: true,
  voidReason: true,
  createdBy: userSummarySelect,
  voidedBy: userSummarySelect,
} satisfies Prisma.PayrollPaymentSelect;

@Injectable()
export class PayrollPaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Bloquea el periodo. Se bloquea el periodo y no solo el registro porque el
   * cierre automático lee todos los registros: dos pagos simultáneos sobre
   * empleados distintos, cada uno sin ver el del otro, dejarían el periodo
   * abierto con todo pagado.
   */
  async lockPeriod(tx: Tx, periodId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM payroll_periods WHERE id = ${periodId} FOR UPDATE`;
  }

  async findItemWithPayments(tx: Tx, itemId: string) {
    return tx.payrollItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        periodId: true,
        totalPayment: true,
        payments: { where: { isVoided: false }, select: { amount: true } },
      },
    });
  }

  async createPayments(tx: Tx, rows: Prisma.PayrollPaymentCreateManyInput[]) {
    return tx.payrollPayment.createManyAndReturn({ data: rows, select: payrollPaymentSelect });
  }

  async findPaymentById(tx: Tx, id: string) {
    return tx.payrollPayment.findUnique({
      where: { id },
      select: { id: true, isVoided: true, payrollItem: { select: { periodId: true } } },
    });
  }

  async voidPayment(tx: Tx, id: string, userId: string, reason: string) {
    return tx.payrollPayment.update({
      where: { id },
      data: { isVoided: true, voidedAt: new Date(), voidedById: userId, voidReason: reason },
      select: payrollPaymentSelect,
    });
  }

  /** Total y pagos vigentes de cada registro del periodo, para el cierre automático. */
  async findPeriodItemsForStatus(tx: Tx, periodId: string) {
    return tx.payrollItem.findMany({
      where: { periodId },
      select: {
        totalPayment: true,
        payments: { where: { isVoided: false }, select: { amount: true } },
      },
    });
  }

  async findPeriodStatus(tx: Tx, periodId: string) {
    return tx.payrollPeriod.findUnique({ where: { id: periodId }, select: { status: true } });
  }

  async updatePeriodStatus(tx: Tx, periodId: string, status: PayrollPeriodStatus) {
    await tx.payrollPeriod.update({ where: { id: periodId }, data: { status } });
  }

  async findByPeriod(periodId: string) {
    return this.prisma.payrollPayment.findMany({
      where: { payrollItem: { periodId } },
      select: payrollPaymentSelect,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
