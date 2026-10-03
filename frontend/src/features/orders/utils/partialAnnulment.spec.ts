import { describe, expect, it } from 'vitest';
import {
  computeItemsSaleValue,
  computePartialAnnulment,
  getAliveQuantity,
} from './partialAnnulment';

// Caso real: OP-2026-3431. Marca en rígido por $750.000 que se cayó y un DTF UV
// de $70.000 que sí se entregó; el cliente había abonado $410.000.
const op3431 = {
  itemsAmount: 750000,
  orderSubtotal: 820000,
  orderTotal: 820000,
  currentBalance: 410000,
  paidAmount: 410000,
};

describe('computePartialAnnulment', () => {
  it('sin retención, se anula lo que valía el ítem y sobra lo abonado de más', () => {
    const result = computePartialAnnulment({ ...op3431, retainedAmount: 0 });

    expect(result.reversedAmount).toBe(750000);
    // Queda valiendo 70.000 y abonó 410.000.
    expect(result.availableToRefund).toBe(340000);
    expect(result.balanceAfter).toBe(-340000);
  });

  it('lo que retiene la empresa no se anula ni se devuelve', () => {
    const result = computePartialAnnulment({
      ...op3431,
      retainedAmount: 100000,
    });

    expect(result.reversedAmount).toBe(650000);
    expect(result.availableToRefund).toBe(240000);
  });

  it('si el cliente no ha abonado de más, la anulación solo baja la deuda', () => {
    const result = computePartialAnnulment({
      ...op3431,
      retainedAmount: 0,
      paidAmount: 50000,
      currentBalance: 770000,
    });

    expect(result.availableToRefund).toBe(0);
    expect(result.balanceAfter).toBe(20000);
  });

  it('nunca propone devolver más de lo que el cliente abonó', () => {
    const result = computePartialAnnulment({
      ...op3431,
      retainedAmount: 0,
      paidAmount: 100000,
      currentBalance: -50000,
    });

    expect(result.availableToRefund).toBe(100000);
  });
});

describe('computeItemsSaleValue', () => {
  it('lleva el valor del ítem al total con IVA', () => {
    // Subtotal 820.000 + IVA 19 % = 975.800.
    expect(computeItemsSaleValue(750000, 975800, 820000)).toBe(892500);
  });

  it('anular todos los ítems anula exactamente el total, con su redondeo', () => {
    expect(computeItemsSaleValue(35000, 41700, 35000)).toBe(41700);
  });

  it('una orden sin subtotal no tiene nada que prorratear', () => {
    expect(computeItemsSaleValue(1000, 0, 0)).toBe(0);
  });
});

describe('getAliveQuantity', () => {
  it('descuenta lo ya anulado', () => {
    expect(getAliveQuantity({ quantity: 150, annulledQuantity: '50' })).toBe(100);
  });

  it('un ítem sin anulaciones tiene toda su cantidad viva', () => {
    expect(getAliveQuantity({ quantity: '150' })).toBe(150);
  });
});
