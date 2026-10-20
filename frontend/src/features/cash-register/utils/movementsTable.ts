import type { CashMovement, CashMovementType } from '../../../types/cash-register.types';
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods';
import { countsInTotals, isReversal } from './cashBalance';

/**
 * Filtros y totales de la tabla de movimientos de la sesión activa. Viven fuera
 * del componente para que los totales del pie usen exactamente la misma regla
 * que el resto de la caja (`countsInTotals`): un anulado o su reversa «-ANUL» se
 * ven en la tabla, pero nunca suman.
 */

export type MovementStatus = 'ACTIVE' | 'VOIDED' | 'REVERSAL';

export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  ACTIVE: 'Activo',
  VOIDED: 'Anulado',
  REVERSAL: 'Reversa',
};

export const movementStatus = (
  m: Pick<CashMovement, 'isVoided' | 'originalMovement'>,
): MovementStatus => (isReversal(m) ? 'REVERSAL' : m.isVoided ? 'VOIDED' : 'ACTIVE');

export type MovementOrigin =
  | 'ORDER'
  | 'EXPENSE_ORDER'
  | 'ACCOUNT_PAYABLE'
  | 'REFUND'
  | 'WORK_ORDER'
  | 'MANUAL';

export const MOVEMENT_ORIGIN_LABELS: Record<MovementOrigin, string> = {
  ORDER: 'Orden de pedido',
  EXPENSE_ORDER: 'Orden de gasto',
  ACCOUNT_PAYABLE: 'Cuenta por pagar',
  REFUND: 'Devolución',
  WORK_ORDER: 'Orden de trabajo',
  MANUAL: 'Manual',
};

/** Lo que no tiene una referencia conocida se registró a mano desde la caja. */
export const movementOrigin = (m: Pick<CashMovement, 'referenceType'>): MovementOrigin =>
  m.referenceType && m.referenceType in MOVEMENT_ORIGIN_LABELS
    ? (m.referenceType as MovementOrigin)
    : 'MANUAL';

export const isInflow = (type: CashMovementType): boolean =>
  type === 'INCOME' || type === 'DEPOSIT';

/** Documento al que pertenece el movimiento, tal como lo reconoce el cliente. */
export const movementReference = (
  m: Pick<CashMovement, 'orderRef' | 'expenseOrderRef'>,
): string | null => {
  if (m.orderRef) return `${m.orderRef.orderNumber} — ${m.orderRef.client.name}`;
  if (m.expenseOrderRef) return m.expenseOrderRef.ogNumber;
  return null;
};

export const performerName = (m: Pick<CashMovement, 'performedBy'>): string => {
  const u = m.performedBy;
  if (!u) return '';
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.username || '';
};

export interface MovementTableFilters {
  search: string;
  type: CashMovementType | 'ALL';
  method: string | 'ALL';
  origin: MovementOrigin | 'ALL';
  /** `VOIDED` incluye anulados y reversas: todo lo que no suma. */
  status: 'ACTIVE' | 'VOIDED' | 'ALL';
  performedById: string | 'ALL';
}

export const DEFAULT_MOVEMENT_TABLE_FILTERS: MovementTableFilters = {
  search: '',
  type: 'ALL',
  method: 'ALL',
  origin: 'ALL',
  status: 'ACTIVE',
  performedById: 'ALL',
};

export const countActiveFilters = (f: MovementTableFilters): number =>
  (Object.keys(DEFAULT_MOVEMENT_TABLE_FILTERS) as Array<keyof MovementTableFilters>).filter(
    (key) =>
      key === 'search'
        ? f.search.trim() !== ''
        : f[key] !== DEFAULT_MOVEMENT_TABLE_FILTERS[key],
  ).length;

export function filterMovements(
  movements: CashMovement[],
  f: MovementTableFilters,
): CashMovement[] {
  const q = f.search.trim().toLowerCase();
  return movements.filter((m) => {
    if (f.type !== 'ALL' && m.movementType !== f.type) return false;
    if (f.method !== 'ALL' && (m.paymentMethod || 'CASH') !== f.method) return false;
    if (f.origin !== 'ALL' && movementOrigin(m) !== f.origin) return false;
    if (f.status === 'ACTIVE' && !countsInTotals(m)) return false;
    if (f.status === 'VOIDED' && countsInTotals(m)) return false;
    if (f.performedById !== 'ALL' && m.performedById !== f.performedById) return false;
    if (!q) return true;
    return [
      m.receiptNumber,
      m.description,
      movementReference(m) ?? '',
      performerName(m),
      PAYMENT_METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod ?? '',
      String(Math.round(Number(m.amount))),
    ].some((value) => value.toLowerCase().includes(q));
  });
}

export interface MethodTotals {
  method: string;
  count: number;
  income: number;
  expense: number;
}

export interface MovementTotals {
  /** Movimientos que suman: sin anulados ni reversas. */
  count: number;
  /** Filas visibles que no suman (anulados y reversas). */
  excludedCount: number;
  income: number;
  expense: number;
  net: number;
  byMethod: MethodTotals[];
}

/** Totales de las filas visibles. El efectivo va primero: es lo que se cuenta al cierre. */
export function summarizeMovements(rows: CashMovement[]): MovementTotals {
  const byMethod = new Map<string, MethodTotals>();
  let income = 0;
  let expense = 0;
  let count = 0;

  for (const m of rows) {
    if (!countsInTotals(m)) continue;
    const method = m.paymentMethod || 'CASH';
    const entry = byMethod.get(method) ?? { method, count: 0, income: 0, expense: 0 };
    const amount = Number(m.amount);
    if (isInflow(m.movementType)) {
      entry.income += amount;
      income += amount;
    } else {
      entry.expense += amount;
      expense += amount;
    }
    entry.count += 1;
    count += 1;
    byMethod.set(method, entry);
  }

  return {
    count,
    excludedCount: rows.length - count,
    income,
    expense,
    net: income - expense,
    byMethod: [...byMethod.values()].sort((a, b) =>
      a.method === 'CASH'
        ? -1
        : b.method === 'CASH'
          ? 1
          : (PAYMENT_METHOD_LABELS[a.method] ?? a.method).localeCompare(
              PAYMENT_METHOD_LABELS[b.method] ?? b.method,
            ),
    ),
  };
}
