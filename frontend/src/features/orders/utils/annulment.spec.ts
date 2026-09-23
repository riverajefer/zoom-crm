import { describe, expect, it } from 'vitest';
import { getAnnulmentAmounts } from './annulment';

const money = (overrides: Record<string, string> = {}) => ({
  total: '500000',
  paidAmount: '0',
  appliedCreditAmount: '0',
  reversedAmount: '0',
  ...overrides,
});

describe('getAnnulmentAmounts', () => {
  it('sin pagos no hay nada que retener ni saldo que dejar', () => {
    expect(getAnnulmentAmounts(money())).toEqual({
      unusedPaid: 0,
      maxRetainable: 0,
    });
  });

  it('con abono parcial se puede retener hasta lo abonado', () => {
    expect(getAnnulmentAmounts(money({ paidAmount: '200000' }))).toEqual({
      unusedPaid: 200000,
      maxRetainable: 200000,
    });
  });

  // El caso de OP-2026-1053: sobrepagada y con parte del excedente ya usado.
  it('en una OP sobrepagada no se retiene más que el valor de la venta', () => {
    expect(
      getAnnulmentAmounts(
        money({
          total: '3855000',
          paidAmount: '4306700',
          appliedCreditAmount: '345400',
        }),
      ),
    ).toEqual({ unusedPaid: 3961300, maxRetainable: 3855000 });
  });

  it('descuenta la venta ya anulada por devoluciones anteriores', () => {
    expect(
      getAnnulmentAmounts(
        money({ paidAmount: '500000', reversedAmount: '200000' }),
      ).maxRetainable,
    ).toBe(300000);
  });
});
