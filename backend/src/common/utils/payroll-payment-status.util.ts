/**
 * Estado de pago de un registro de nómina, derivado de sus pagos.
 *
 * Lo pagado nunca se guarda en `payroll_items`: se suma de `payroll_payments`
 * excluyendo los anulados, para que una anulación no pueda dejarlo desfasado.
 */
export type PayrollPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';

interface PaymentLike {
  amount: unknown;
  isVoided?: boolean | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeItemPaidAmount(payments: PaymentLike[] | null | undefined): number {
  return round2(
    (payments ?? [])
      .filter((p) => !p.isVoided)
      .reduce((acc, p) => acc + Number(p.amount), 0),
  );
}

export function computeItemBalance(totalPayment: unknown, paidAmount: number): number {
  return round2(Number(totalPayment) - paidAmount);
}

/**
 * Un registro en $0 (alguien que no trabajó en el periodo) cuenta como pagado:
 * no hay nada que entregarle y no debe impedir que el periodo se cierre.
 */
export function computeItemPaymentStatus(
  totalPayment: unknown,
  paidAmount: number,
): PayrollPaymentStatus {
  if (computeItemBalance(totalPayment, paidAmount) <= 0) return 'PAID';
  return paidAmount > 0 ? 'PARTIAL' : 'PENDING';
}
