import { formatCurrency } from '../../../utils/formatters';
import { PAYMENT_METHOD_LABELS } from '../../../types/expense-order.types';

const methodLabel = (method: string) =>
  PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method;

/**
 * Método de pago de un ítem como texto. Con pago mixto lleva el monto de cada
 * parte, que es lo que Caja entrega: «Efectivo $70.000 + Transferencia $49.000».
 */
export const itemPaymentLabel = (item: {
  paymentMethod: string;
  payments?: Array<{ paymentMethod: string; amount: string }>;
}): string =>
  item.payments?.length
    ? item.payments
        .map((payment) => `${methodLabel(payment.paymentMethod)} ${formatCurrency(payment.amount)}`)
        .join(' + ')
    : methodLabel(item.paymentMethod);
