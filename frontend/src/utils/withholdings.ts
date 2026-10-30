/**
 * Retenciones del lado del gasto (Orden de Gasto y Cuenta por Pagar).
 *
 * Las mismas tasas y la misma estructura de cálculo que la OP: retefuente y
 * ReteICA sobre el subtotal, ReteIVA sobre el IVA. El total se redondea a peso
 * entero, igual que en `computeExpenseTotals` del backend, para que la pantalla
 * y el saldo de la cuenta digan el mismo número.
 */

export interface WithholdingsValue {
  /** Check «Aplicar Retenciones». */
  apply: boolean;
  /** Valor del select: '' | '2.5' | '3.5' | '4.0' | 'other'. */
  retefuente: string;
  /** Porcentaje escrito a mano cuando `retefuente === 'other'`. */
  retefuenteCustom: string;
  reteICA: string;
  reteIVA: string;
}

export const EMPTY_WITHHOLDINGS: WithholdingsValue = {
  apply: false,
  retefuente: '',
  retefuenteCustom: '',
  reteICA: '',
  reteIVA: '',
};

export const RETEFUENTE_OPTIONS = ['2.5', '3.5', '4.0'] as const;
export const RETEICA_OPTIONS = ['0.414', '0.692', '0.966', '1.104'] as const;
export const RETEIVA_OPTIONS = ['15'] as const;

/** Porcentajes efectivos (19 = 19%), ya resueltos el «Otro» y el check apagado. */
export interface WithholdingPercentages {
  retefuente: number;
  reteICA: number;
  reteIVA: number;
}

const toPercentage = (value: string | undefined): number => {
  const parsed = parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

export function getWithholdingPercentages(value: WithholdingsValue): WithholdingPercentages {
  if (!value.apply) return { retefuente: 0, reteICA: 0, reteIVA: 0 };
  return {
    retefuente:
      value.retefuente === 'other'
        ? toPercentage(value.retefuenteCustom)
        : toPercentage(value.retefuente),
    reteICA: toPercentage(value.reteICA),
    reteIVA: toPercentage(value.reteIVA),
  };
}

/** Reconstruye el estado del formulario desde las tasas guardadas (0.025 = 2.5%). */
export function withholdingsFromRates(rates: {
  retefuenteRate?: string | number | null;
  reteICARate?: string | number | null;
  reteIVARate?: string | number | null;
}): WithholdingsValue {
  const toPct = (rate: string | number | null | undefined): number => {
    const parsed = Number(rate ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    // 0.035 * 100 da 3.5000000000000004 en coma flotante y ese número termina
    // impreso en la etiqueta de la retención.
    return Math.round(parsed * 100 * 1e4) / 1e4;
  };

  const retefuentePct = toPct(rates.retefuenteRate);
  const reteICAPct = toPct(rates.reteICARate);
  const reteIVAPct = toPct(rates.reteIVARate);

  if (retefuentePct === 0 && reteICAPct === 0 && reteIVAPct === 0) {
    return { ...EMPTY_WITHHOLDINGS };
  }

  const known = RETEFUENTE_OPTIONS.find((opt) => parseFloat(opt) === retefuentePct);

  return {
    apply: true,
    retefuente: retefuentePct === 0 ? '' : (known ?? 'other'),
    retefuenteCustom: retefuentePct > 0 && !known ? String(retefuentePct) : '',
    reteICA: reteICAPct === 0 ? '' : String(reteICAPct),
    reteIVA: reteIVAPct === 0 ? '' : String(reteIVAPct),
  };
}

/** ¿El check está activo pero sin ninguna retención elegida? */
export function isWithholdingsSelectionEmpty(value: WithholdingsValue): boolean {
  if (!value.apply) return false;
  const pct = getWithholdingPercentages(value);
  return pct.retefuente === 0 && pct.reteICA === 0 && pct.reteIVA === 0;
}

export interface ExpenseTotalsInput {
  applyIva: boolean;
  /** Porcentaje de IVA en la UI (19 = 19%). */
  ivaPercentage: number;
  withholdings: WithholdingsValue;
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

export function computeExpenseTotals(subtotal: number, input: ExpenseTotalsInput): ExpenseTotals {
  const pct = getWithholdingPercentages(input.withholdings);

  const ivaAmount = input.applyIva ? subtotal * (input.ivaPercentage / 100) : 0;
  const retefuenteAmount = subtotal * (pct.retefuente / 100);
  const reteICAAmount = subtotal * (pct.reteICA / 100);
  const reteIVAAmount = ivaAmount * (pct.reteIVA / 100);

  const rawTotal = subtotal - retefuenteAmount - reteICAAmount + ivaAmount - reteIVAAmount;

  return {
    subtotal,
    ivaAmount,
    retefuenteAmount,
    reteICAAmount,
    reteIVAAmount,
    total: Math.round(rawTotal),
  };
}

/**
 * Reparte el total a pagar entre los ítems, igual que
 * `allocateExpenseTotalToItems` del backend: el pago mixto de cada ítem tiene
 * que sumar exactamente esta parte, o el backend lo rechaza.
 */
export function allocateExpenseTotalToItems(itemSubtotals: number[], total: number): number[] {
  const subtotal = itemSubtotals.reduce((sum, value) => sum + value, 0);
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

/** Tasas en decimal (0.025) listas para enviar al backend. */
export function toWithholdingRates(value: WithholdingsValue): {
  retefuenteRate: number;
  reteICARate: number;
  reteIVARate: number;
} {
  const pct = getWithholdingPercentages(value);
  return {
    retefuenteRate: pct.retefuente / 100,
    reteICARate: pct.reteICA / 100,
    reteIVARate: pct.reteIVA / 100,
  };
}
