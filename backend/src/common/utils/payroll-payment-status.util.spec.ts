import {
  computeItemBalance,
  computeItemPaidAmount,
  computeItemPaymentStatus,
} from './payroll-payment-status.util';

describe('payroll-payment-status.util', () => {
  it('suma solo los pagos no anulados', () => {
    expect(
      computeItemPaidAmount([
        { amount: '612000', isVoided: false },
        { amount: 20000 },
        { amount: 100000, isVoided: true },
      ]),
    ).toBe(632000);
  });

  it('sin pagos, lo pagado es 0', () => {
    expect(computeItemPaidAmount(undefined)).toBe(0);
    expect(computeItemPaidAmount([])).toBe(0);
  });

  it('calcula el saldo con decimales sin ruido de coma flotante', () => {
    expect(computeItemBalance('1009964.30', 1009964.1)).toBe(0.2);
  });

  it.each([
    [632000, 0, 'PENDING'],
    [632000, 300000, 'PARTIAL'],
    [632000, 632000, 'PAID'],
    // Quien no trabajó en el periodo no impide cerrarlo
    [0, 0, 'PAID'],
  ])('total %p con %p pagado → %s', (total, paid, expected) => {
    expect(computeItemPaymentStatus(total, paid)).toBe(expected);
  });
});
