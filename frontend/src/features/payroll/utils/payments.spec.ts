import { describe, expect, it } from 'vitest';
import { itemBalance, itemPaidAmount, itemPaidBy, itemPaymentStatus } from './payments';

const item = (totalPayment: string, payments: [number, 'CASH' | 'TRANSFER'][] = []) => ({
  totalPayment,
  payments: payments.map(([amount, paymentMethod], i) => ({
    id: String(i),
    amount: String(amount),
    paymentMethod,
    paidAt: '2026-10-15',
  })),
});

describe('payroll payments utils', () => {
  it('separa efectivo y transferencia en un pago mixto', () => {
    const moises = item('632000.00', [
      [612000, 'CASH'],
      [20000, 'TRANSFER'],
    ]);
    expect(itemPaidAmount(moises)).toBe(632000);
    expect(itemPaidBy(moises, 'CASH')).toBe(612000);
    expect(itemPaidBy(moises, 'TRANSFER')).toBe(20000);
    expect(itemBalance(moises)).toBe(0);
    expect(itemPaymentStatus(moises)).toBe('PAID');
  });

  it('pendiente, abonado y registro en $0', () => {
    expect(itemPaymentStatus(item('970000'))).toBe('PENDING');
    expect(itemPaymentStatus(item('970000', [[500000, 'CASH']]))).toBe('PARTIAL');
    expect(itemPaymentStatus(item('0'))).toBe('PAID');
  });

  it('tolera registros sin la lista de pagos (endpoints de historial)', () => {
    expect(itemPaidAmount({ payments: undefined })).toBe(0);
  });
});
