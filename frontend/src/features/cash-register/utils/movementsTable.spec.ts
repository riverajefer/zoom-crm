import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOVEMENT_TABLE_FILTERS,
  countActiveFilters,
  filterMovements,
  movementOrigin,
  movementStatus,
  summarizeMovements,
} from './movementsTable';
import type { CashMovement } from '../../../types/cash-register.types';

let seq = 0;
const mov = (over: Partial<CashMovement> = {}): CashMovement => {
  seq += 1;
  return {
    id: `m${seq}`,
    cashSessionId: 's1',
    receiptNumber: `RC-2026-${String(seq).padStart(4, '0')}`,
    movementType: 'INCOME',
    paymentMethod: 'CASH',
    amount: '1000',
    description: 'Movimiento',
    isVoided: false,
    originalMovement: null,
    performedById: 'u1',
    performedBy: { id: 'u1', firstName: 'Catalina', lastName: 'Gómez' },
    createdAt: '2026-10-19T14:00:00.000Z',
    updatedAt: '2026-10-19T14:00:00.000Z',
    ...over,
  };
};

const filters = (over: Partial<typeof DEFAULT_MOVEMENT_TABLE_FILTERS> = {}) => ({
  ...DEFAULT_MOVEMENT_TABLE_FILTERS,
  ...over,
});

describe('movementsTable', () => {
  it('distingue activo, anulado y reversa «-ANUL»', () => {
    expect(movementStatus(mov())).toBe('ACTIVE');
    expect(movementStatus(mov({ isVoided: true }))).toBe('VOIDED');
    expect(
      movementStatus(mov({ originalMovement: { id: 'x', receiptNumber: 'RC-1' } })),
    ).toBe('REVERSAL');
  });

  it('toma como manual lo que no tiene una referencia conocida', () => {
    expect(movementOrigin(mov({ referenceType: 'ORDER' }))).toBe('ORDER');
    expect(movementOrigin(mov({ referenceType: 'ACCOUNT_PAYABLE' }))).toBe('ACCOUNT_PAYABLE');
    expect(movementOrigin(mov({ referenceType: undefined }))).toBe('MANUAL');
    expect(movementOrigin(mov({ referenceType: 'ALGO_NUEVO' }))).toBe('MANUAL');
  });

  it('por defecto muestra solo lo que suma; «anulados» muestra lo que no', () => {
    const activo = mov();
    const anulado = mov({ isVoided: true });
    const reversa = mov({ originalMovement: { id: anulado.id, receiptNumber: anulado.receiptNumber } });
    const todos = [activo, anulado, reversa];

    expect(filterMovements(todos, filters())).toEqual([activo]);
    expect(filterMovements(todos, filters({ status: 'VOIDED' }))).toEqual([anulado, reversa]);
    expect(filterMovements(todos, filters({ status: 'ALL' }))).toHaveLength(3);
  });

  it('combina tipo, método, origen y usuario', () => {
    const a = mov({ movementType: 'EXPENSE', paymentMethod: 'TRANSFER', referenceType: 'EXPENSE_ORDER' });
    const b = mov({ movementType: 'EXPENSE', paymentMethod: 'CASH', referenceType: 'EXPENSE_ORDER' });
    const c = mov({ movementType: 'INCOME', paymentMethod: 'TRANSFER', performedById: 'u2' });

    expect(filterMovements([a, b, c], filters({ type: 'EXPENSE', method: 'TRANSFER' }))).toEqual([a]);
    expect(filterMovements([a, b, c], filters({ origin: 'EXPENSE_ORDER' }))).toEqual([a, b]);
    expect(filterMovements([a, b, c], filters({ performedById: 'u2' }))).toEqual([c]);
  });

  it('busca en recibo, concepto, referencia, usuario y monto', () => {
    const op = mov({
      description: 'Abono',
      orderRef: { id: 'o1', orderNumber: 'OP-2026-3724', status: 'X', client: { name: 'Textiles Andes' } },
    });
    const otro = mov({ description: 'Depósito base', amount: '250000' });

    expect(filterMovements([op, otro], filters({ search: 'andes' }))).toEqual([op]);
    expect(filterMovements([op, otro], filters({ search: 'op-2026-3724' }))).toEqual([op]);
    expect(filterMovements([op, otro], filters({ search: '250000' }))).toEqual([otro]);
    expect(filterMovements([op, otro], filters({ search: 'catalina' }))).toHaveLength(2);
    expect(filterMovements([op, otro], filters({ search: op.receiptNumber.toLowerCase() }))).toEqual([op]);
  });

  it('cuenta los filtros que se apartan del valor por defecto', () => {
    expect(countActiveFilters(filters())).toBe(0);
    expect(countActiveFilters(filters({ search: '   ' }))).toBe(0);
    expect(countActiveFilters(filters({ search: 'x', status: 'ALL', method: 'CASH' }))).toBe(3);
  });

  it('totaliza por método, con el efectivo primero, y deja fuera anulados y reversas', () => {
    const totals = summarizeMovements([
      mov({ movementType: 'INCOME', paymentMethod: 'TRANSFER', amount: '300000' }),
      mov({ movementType: 'INCOME', paymentMethod: 'CASH', amount: '500000' }),
      mov({ movementType: 'DEPOSIT', paymentMethod: 'CASH', amount: '100000' }),
      mov({ movementType: 'EXPENSE', paymentMethod: 'CASH', amount: '80000' }),
      mov({ movementType: 'WITHDRAWAL', paymentMethod: 'CASH', amount: '20000' }),
      mov({ movementType: 'EXPENSE', paymentMethod: 'CASH', amount: '999999', isVoided: true }),
      mov({ movementType: 'INCOME', paymentMethod: 'CASH', amount: '999999', originalMovement: { id: 'x', receiptNumber: 'RC-9' } }),
    ]);

    expect(totals.count).toBe(5);
    expect(totals.excludedCount).toBe(2);
    expect(totals.income).toBe(900000);
    expect(totals.expense).toBe(100000);
    expect(totals.net).toBe(800000);
    expect(totals.byMethod).toEqual([
      { method: 'CASH', count: 4, income: 600000, expense: 100000 },
      { method: 'TRANSFER', count: 1, income: 300000, expense: 0 },
    ]);
  });
});
