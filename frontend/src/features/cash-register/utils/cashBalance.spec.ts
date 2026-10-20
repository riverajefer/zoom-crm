import { describe, expect, it } from 'vitest';
import { countsInTotals, isCashInDrawer, summarizeCashDrawer } from './cashBalance';
import type { CashMovement } from '../../../types/cash-register.types';

type Mov = Pick<CashMovement, 'movementType' | 'paymentMethod' | 'amount' | 'isVoided' | 'originalMovement'>;

const mov = (over: Partial<Mov>): Mov => ({
  movementType: 'INCOME',
  paymentMethod: 'CASH',
  amount: '0',
  isVoided: false,
  originalMovement: null,
  ...over,
});

describe('cashBalance', () => {
  it('deja fuera las transferencias del efectivo en cajón', () => {
    expect(isCashInDrawer(mov({ paymentMethod: 'TRANSFER' }))).toBe(false);
    expect(isCashInDrawer(mov({ paymentMethod: 'CASH' }))).toBe(true);
  });

  it('no cuenta anulados ni reversas «-ANUL» en ningún total', () => {
    expect(countsInTotals(mov({ isVoided: true }))).toBe(false);
    expect(countsInTotals(mov({ originalMovement: { id: 'o1', receiptNumber: 'RC-1' } }))).toBe(false);
    expect(countsInTotals(mov({}))).toBe(true);
  });

  it('suma por tipo solo el efectivo y da el neto con signo', () => {
    const totals = summarizeCashDrawer([
      mov({ movementType: 'INCOME', amount: '500000' }),
      mov({ movementType: 'INCOME', amount: '4225000', paymentMethod: 'TRANSFER' }),
      mov({ movementType: 'INCOME', amount: '80600', isVoided: true }),
      mov({ movementType: 'EXPENSE', amount: '30000' }),
      mov({ movementType: 'EXPENSE', amount: '2000000', paymentMethod: 'TRANSFER' }),
      mov({ movementType: 'DEPOSIT', amount: '10000' }),
      mov({ movementType: 'WITHDRAWAL', amount: '100000' }),
      // Reversa de un egreso: tipo inverso (INCOME), no debe sumar.
      mov({ movementType: 'INCOME', amount: '30000', originalMovement: { id: 'x', receiptNumber: 'RC-9' } }),
    ]);

    expect(totals).toEqual({
      INCOME: 500000,
      EXPENSE: 30000,
      DEPOSIT: 10000,
      WITHDRAWAL: 100000,
      net: 500000 + 10000 - 30000 - 100000,
    });
  });
});
