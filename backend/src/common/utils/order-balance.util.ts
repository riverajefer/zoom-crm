import { Prisma } from '../../generated/prisma';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

const toDecimal = (value: DecimalLike): Prisma.Decimal =>
  value === null || value === undefined
    ? new Prisma.Decimal(0)
    : new Prisma.Decimal(value.toString());

/**
 * Filtro canónico de los pagos que cuentan como dinero de la orden.
 *
 * Un pago anulado sobrevive en la tabla para que el Historial de Pagos pueda
 * mostrar qué pasó y quién lo autorizó, pero no es dinero: no suma a
 * `paidAmount` ni a los reportes. Úsalo en TODO `where` que sume pagos; si se
 * olvida en uno solo, la plata anulada reaparece como saldo a favor.
 */
export const ACTIVE_PAYMENT_WHERE = { isVoided: false } as const;

/**
 * Suma los pagos que siguen vivos, descartando los anulados.
 *
 * Recibe la lista completa a propósito: así el llamador puede traerse los pagos
 * una sola vez para mostrarlos (anulados incluidos) y sumar solo los vivos.
 */
export function sumActivePayments(
  payments: { amount: DecimalLike; isVoided?: boolean }[],
): Prisma.Decimal {
  return payments.reduce(
    (sum, payment) =>
      payment.isVoided ? sum : sum.add(toDecimal(payment.amount)),
    new Prisma.Decimal(0),
  );
}

/**
 * Abono neto de una orden a partir de sus pagos.
 *
 * Los `Payment` no se borran al aprobar una devolución: el dinero devuelto se
 * descuenta de `paidAmount`. Por eso, cada vez que `paidAmount` se recalcula
 * sumando los pagos hay que volver a restar lo devuelto, o el dinero que ya salió
 * de la caja reaparece como saldo a favor disponible.
 *
 * paidAmount = suma(pagos) - refundedAmount
 */
export function computeNetPaidAmount(
  paymentsTotal: DecimalLike,
  refundedAmount: DecimalLike = 0,
): Prisma.Decimal {
  const net = toDecimal(paymentsTotal).sub(toDecimal(refundedAmount));
  return net.lessThan(0) ? new Prisma.Decimal(0) : net;
}

/**
 * Entrada de los cálculos de saldo.
 *
 * Es un objeto y no una lista de posicionales a propósito: `reversedAmount` es
 * obligatorio, así que TypeScript obliga a decidir qué hacer con él en cada
 * lugar que calcule un saldo. Si fuera opcional, olvidarlo en un solo servicio
 * devolvería un saldo silenciosamente equivocado —una OP mostrando como deuda un
 * trabajo que ya se anuló— que es exactamente el error que este campo existe
 * para evitar.
 */
export interface OrderBalanceInput {
  total: DecimalLike;
  paidAmount: DecimalLike;
  /**
   * Parte del excedente de esta orden que ya se aplicó como pago de otras
   * órdenes: al sumarla, ese saldo deja de figurar como saldo a favor y no
   * puede volver a gastarse ni devolverse.
   */
  appliedCreditAmount?: DecimalLike;
  /**
   * Valor de venta anulado por devoluciones de reversión. Reduce lo que la orden
   * vale, no lo que el cliente pagó: por eso resta del total y no del abono.
   */
  reversedAmount: DecimalLike;
}

/**
 * Saldo pendiente de una orden.
 *
 * balance = (total - reversedAmount) - paidAmount + appliedCreditAmount
 */
export function computeOrderBalance({
  total,
  paidAmount,
  appliedCreditAmount = 0,
  reversedAmount,
}: OrderBalanceInput): Prisma.Decimal {
  return toDecimal(total)
    .sub(toDecimal(reversedAmount))
    .sub(toDecimal(paidAmount))
    .add(toDecimal(appliedCreditAmount));
}

/**
 * Saldo a favor disponible de una orden (0 si no hay excedente).
 * Es el inverso del balance cuando este es negativo.
 *
 * Pasarle un `reversedAmount` mayor que cero responde la pregunta "si anulo esta
 * parte de la venta, ¿cuánto dinero le queda sobrando al cliente?", que es el
 * tope de lo que puede salir de la caja en una devolución.
 */
export function computeAvailableOverpayment(
  input: OrderBalanceInput,
): Prisma.Decimal {
  const balance = computeOrderBalance(input);
  return balance.lessThan(0) ? balance.negated() : new Prisma.Decimal(0);
}

/**
 * Lo máximo que la empresa puede retener al anular una orden.
 *
 * Anular marca como anulada toda la venta menos lo retenido
 * (`reversedAmount = total - retenido`), así que lo pagado que no se retiene
 * queda como saldo a favor. El tope es lo que el cliente pagó y todavía no usó
 * como saldo en otras órdenes —retener más dejaría una deuda en una OP que ya no
 * existe— sin pasar de lo que la venta aún vale tras devoluciones anteriores.
 *
 * El frontend repite esta fórmula en el diálogo de anulación
 * (`features/orders/utils/annulment.ts`): si cambias una, cambia la otra.
 */
export function computeMaxRetainableOnAnnul(
  input: Required<OrderBalanceInput>,
): Prisma.Decimal {
  const liveSale = toDecimal(input.total).sub(toDecimal(input.reversedAmount));
  const unusedPaid = toDecimal(input.paidAmount).sub(
    toDecimal(input.appliedCreditAmount),
  );
  const max = Prisma.Decimal.min(liveSale, unusedPaid);
  return max.greaterThan(0) ? max : new Prisma.Decimal(0);
}

/**
 * Porción de venta anulada llevada a la base comisionable (`subtotal - descuento`).
 *
 * `reversedAmount` está en pesos con IVA y con el redondeo comercial del total,
 * mientras que la comisión se liquida sobre el subtotal sin IVA. Restar uno del
 * otro directamente le quitaría al asesor más de lo que ganó. El prorrateo
 * mantiene la proporción: si se anula la mitad de la venta, se anula la mitad de
 * la base.
 *
 * Un total en cero (OP de $0) no tiene nada que prorratear.
 */
export function computeReversedNetAmount(
  reversedAmount: DecimalLike,
  total: DecimalLike,
  subtotal: DecimalLike,
  discountAmount: DecimalLike = 0,
): Prisma.Decimal {
  const totalDecimal = toDecimal(total);
  if (totalDecimal.isZero()) return new Prisma.Decimal(0);

  const commissionBase = toDecimal(subtotal).sub(toDecimal(discountAmount));
  return toDecimal(reversedAmount).mul(commissionBase).div(totalDecimal);
}
