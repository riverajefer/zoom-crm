/**
 * Cálculo del monto a pagar de una Orden de Gasto o una Cuenta por Pagar.
 *
 * Vive aquí porque la OG y la CxP que nace de ella tienen que llegar al mismo
 * número: si cada una lo calcula por su lado, la cuenta se paga por un valor y
 * la orden dice otro. Es la misma estructura que usa la OP
 * (`orders.service`): retefuente y ReteICA sobre el subtotal, ReteIVA sobre el
 * IVA. La diferencia es el redondeo, aquí siempre a peso entero: en el gasto no
 * aplica el redondeo comercial a múltiplos de 100 (no hay efectivo de por medio
 * necesariamente) pero dejar centavos deja saldos de $0,50 imposibles de saldar.
 */

export interface ExpenseWithholdingRates {
  applyIva?: boolean | null;
  /** Tasa en decimal (0.19 = 19%). */
  ivaRate?: number | string | { toString(): string } | null;
  retefuenteRate?: number | string | { toString(): string } | null;
  reteICARate?: number | string | { toString(): string } | null;
  reteIVARate?: number | string | { toString(): string } | null;
}

export interface ExpenseTotals {
  subtotal: number;
  ivaAmount: number;
  retefuenteAmount: number;
  reteICAAmount: number;
  reteIVAAmount: number;
  /** Lo que hay que pagarle al proveedor, redondeado a peso entero. */
  total: number;
}

const toRate = (value: ExpenseWithholdingRates[keyof ExpenseWithholdingRates]): number => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Redondeo half-up a peso entero, igual que `formatCurrency` en el frontend. */
const roundToWholePeso = (value: number): number => Math.round(value);

export function computeExpenseTotals(
  subtotal: number,
  rates: ExpenseWithholdingRates,
): ExpenseTotals {
  const ivaRate = rates.applyIva ? (rates.ivaRate != null ? toRate(rates.ivaRate) : 0.19) : 0;
  const ivaAmount = subtotal * ivaRate;

  const retefuenteAmount = subtotal * toRate(rates.retefuenteRate);
  const reteICAAmount = subtotal * toRate(rates.reteICARate);
  const reteIVAAmount = ivaAmount * toRate(rates.reteIVARate);

  const rawTotal =
    subtotal - retefuenteAmount - reteICAAmount + ivaAmount - reteIVAAmount;

  return {
    subtotal,
    ivaAmount,
    retefuenteAmount,
    reteICAAmount,
    reteIVAAmount,
    total: roundToWholePeso(rawTotal),
  };
}

/**
 * Reparte el total a pagar de una OG entre sus ítems, en proporción a la base
 * de cada uno, y devuelve los montos en el mismo orden.
 *
 * Caja paga el total que muestra la OG (con IVA y menos retenciones), pero el
 * egreso se registra por ítem porque cada ítem puede salir por un método de
 * pago distinto. Antes cada egreso llevaba solo la base del ítem: el cajón
 * quedaba corto por el IVA y la Cuenta por Pagar espejo, PARTIAL con ese IVA
 * como deuda falsa.
 *
 * Cada parte va a peso entero y el residuo del redondeo se asigna por mayor
 * resto, así la suma da exactamente `computeExpenseTotals(...).total`.
 */
export function allocateExpenseTotalToItems(
  itemSubtotals: number[],
  rates: ExpenseWithholdingRates,
): number[] {
  const subtotal = itemSubtotals.reduce((sum, value) => sum + value, 0);
  const { total } = computeExpenseTotals(subtotal, rates);
  if (subtotal === 0) return itemSubtotals.map(() => 0);

  const raw = itemSubtotals.map((value) => (total * value) / subtotal);
  const shares = raw.map((value) => Math.floor(value));
  let remainder = total - shares.reduce((sum, value) => sum + value, 0);

  const byRemainder = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; remainder > 0; i = (i + 1) % byRemainder.length, remainder--) {
    shares[byRemainder[i].index] += 1;
  }

  return shares;
}
