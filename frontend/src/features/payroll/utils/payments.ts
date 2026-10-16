import { isAxiosError } from 'axios';
import type {
  PayrollItem,
  PayrollPaymentMethod,
  PayrollPaymentStatus,
} from '../../../types/payroll-item.types';

/**
 * Estado de pago de un registro. Misma regla que
 * `backend/src/common/utils/payroll-payment-status.util.ts`: lo pagado es la
 * suma de los pagos no anulados (el backend ya los filtra) y un registro en $0
 * cuenta como pagado.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

export const itemPaidAmount = (item: Pick<PayrollItem, 'payments'>): number =>
  round2((item.payments ?? []).reduce((acc, p) => acc + Number(p.amount), 0));

export const itemPaidBy = (
  item: Pick<PayrollItem, 'payments'>,
  method: PayrollPaymentMethod,
): number =>
  round2(
    (item.payments ?? [])
      .filter((p) => p.paymentMethod === method)
      .reduce((acc, p) => acc + Number(p.amount), 0),
  );

export const itemBalance = (item: Pick<PayrollItem, 'payments' | 'totalPayment'>): number =>
  round2(Number(item.totalPayment) - itemPaidAmount(item));

export const itemPaymentStatus = (
  item: Pick<PayrollItem, 'payments' | 'totalPayment'>,
): PayrollPaymentStatus => {
  if (itemBalance(item) <= 0) return 'PAID';
  return itemPaidAmount(item) > 0 ? 'PARTIAL' : 'PENDING';
};

export const paymentStatusMeta: Record<
  PayrollPaymentStatus,
  { label: string; color: 'default' | 'warning' | 'success' }
> = {
  PENDING: { label: 'Pendiente', color: 'default' },
  PARTIAL: { label: 'Abonado', color: 'warning' },
  PAID: { label: 'Pagado', color: 'success' },
};

/** Mensaje del backend (los 400 de pagos explican qué falta) o el texto por defecto. */
export const apiErrorMessage = (err: unknown, fallback: string): string => {
  const msg = isAxiosError<{ message?: string | string[] }>(err)
    ? err.response?.data?.message
    : undefined;
  if (Array.isArray(msg)) return msg.join('. ');
  return msg || fallback;
};
