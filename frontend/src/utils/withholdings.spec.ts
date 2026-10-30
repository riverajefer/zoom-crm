import { describe, expect, it } from 'vitest';
import {
  EMPTY_WITHHOLDINGS,
  allocateExpenseTotalToItems,
  computeExpenseTotals,
  getWithholdingPercentages,
  isWithholdingsSelectionEmpty,
  toWithholdingRates,
  withholdingsFromRates,
  type WithholdingsValue,
} from './withholdings';

const withholdings = (patch: Partial<WithholdingsValue> = {}): WithholdingsValue => ({
  ...EMPTY_WITHHOLDINGS,
  ...patch,
});

describe('getWithholdingPercentages', () => {
  it('devuelve ceros con el check apagado, aunque haya selección', () => {
    expect(getWithholdingPercentages(withholdings({ retefuente: '2.5', reteICA: '0.414' }))).toEqual({
      retefuente: 0,
      reteICA: 0,
      reteIVA: 0,
    });
  });

  it('lee el porcentaje escrito a mano cuando el retefuente es «Otro»', () => {
    const pct = getWithholdingPercentages(
      withholdings({ apply: true, retefuente: 'other', retefuenteCustom: '1.5' }),
    );

    expect(pct.retefuente).toBe(1.5);
  });
});

describe('withholdingsFromRates', () => {
  it('deja el formulario vacío cuando no hay retenciones guardadas', () => {
    expect(withholdingsFromRates({ retefuenteRate: '0', reteICARate: '0', reteIVARate: '0' })).toEqual(
      EMPTY_WITHHOLDINGS,
    );
  });

  it('reconoce una tasa de la lista', () => {
    expect(withholdingsFromRates({ retefuenteRate: '0.025', reteIVARate: '0.15' })).toEqual({
      apply: true,
      retefuente: '2.5',
      retefuenteCustom: '',
      reteICA: '',
      reteIVA: '15',
    });
  });

  it('cae en «Otro» cuando la tasa guardada no está en la lista', () => {
    const value = withholdingsFromRates({ retefuenteRate: '0.015' });

    expect(value.retefuente).toBe('other');
    expect(value.retefuenteCustom).toBe('1.5');
  });
});

describe('isWithholdingsSelectionEmpty', () => {
  it('marca el check activo sin ninguna retención elegida', () => {
    expect(isWithholdingsSelectionEmpty(withholdings({ apply: true }))).toBe(true);
  });

  it('no marca nada con el check apagado', () => {
    expect(isWithholdingsSelectionEmpty(EMPTY_WITHHOLDINGS)).toBe(false);
  });

  it('no marca nada si hay al menos una retención', () => {
    expect(isWithholdingsSelectionEmpty(withholdings({ apply: true, reteICA: '0.414' }))).toBe(false);
  });
});

describe('computeExpenseTotals', () => {
  it('redondea a peso entero el total con IVA', () => {
    const totals = computeExpenseTotals(684550, {
      applyIva: true,
      ivaPercentage: 19,
      withholdings: EMPTY_WITHHOLDINGS,
    });

    expect(totals.total).toBe(814615);
  });

  it('calcula retefuente y ReteICA sobre el subtotal, y ReteIVA sobre el IVA', () => {
    const totals = computeExpenseTotals(1000000, {
      applyIva: true,
      ivaPercentage: 19,
      withholdings: withholdings({
        apply: true,
        retefuente: '2.5',
        reteICA: '0.414',
        reteIVA: '15',
      }),
    });

    expect(totals.retefuenteAmount).toBe(25000);
    expect(totals.reteICAAmount).toBe(4140);
    expect(totals.reteIVAAmount).toBe(28500);
    // 1.000.000 - 25.000 - 4.140 + 190.000 - 28.500
    expect(totals.total).toBe(1132360);
  });
});

describe('toWithholdingRates', () => {
  it('convierte los porcentajes a decimal para el backend', () => {
    expect(
      toWithholdingRates(withholdings({ apply: true, retefuente: '2.5', reteIVA: '15' })),
    ).toEqual({ retefuenteRate: 0.025, reteICARate: 0, reteIVARate: 0.15 });
  });
});

describe('allocateExpenseTotalToItems', () => {
  it('reparte en proporción a la base', () => {
    expect(allocateExpenseTotalToItems([100000, 50000], 178500)).toEqual([119000, 59500]);
  });

  // Los mismos valores que el spec del backend: si difieren, el pago mixto se rechaza.
  it('el peso de redondeo cae en el primero y la suma da exacto el total', () => {
    const shares = allocateExpenseTotalToItems([33333, 33333], 79333);

    expect(shares).toEqual([39667, 39666]);
  });

  it('sin base devuelve ceros', () => {
    expect(allocateExpenseTotalToItems([0, 0], 0)).toEqual([0, 0]);
  });
});
