import type { CashMovement, CashMovementType } from '../../../types/cash-register.types';

/**
 * Reglas de saldo de la caja en el cliente. Son espejo de `CASH_IN_DRAWER_WHERE`
 * en el backend (`cash-movement.helpers.ts`), que es lo que usa el cierre: si
 * aquí se cuenta distinto, la sesión activa muestra un saldo y el cierre otro.
 */

type MovementLike = Pick<CashMovement, 'movementType' | 'paymentMethod' | 'amount' | 'isVoided' | 'originalMovement'>;

/** Contramovimiento «-ANUL»: rastro de una anulación, nunca entra a un total. */
export const isReversal = (m: Pick<CashMovement, 'originalMovement'>): boolean => !!m.originalMovement;

/**
 * Movimiento que cuenta en cualquier total (por tipo o por método). La anulación
 * se neutraliza excluyendo el original, no sumando su reversa.
 */
export const countsInTotals = (m: Pick<CashMovement, 'isVoided' | 'originalMovement'>): boolean =>
  !m.isVoided && !isReversal(m);

/**
 * Movimiento que mueve billetes en el cajón. Las transferencias y demás métodos
 * quedan en la sesión, pero no pasan por el conteo físico del cierre.
 */
export const isCashInDrawer = (m: MovementLike): boolean =>
  countsInTotals(m) && (m.paymentMethod || 'CASH') === 'CASH';

export type CashDrawerTotals = Record<CashMovementType, number> & { net: number };

/** Totales por tipo del efectivo en cajón y su neto (lo que se suma al fondo inicial). */
export const summarizeCashDrawer = (movements: MovementLike[]): CashDrawerTotals => {
  const totals: CashDrawerTotals = { INCOME: 0, EXPENSE: 0, WITHDRAWAL: 0, DEPOSIT: 0, net: 0 };
  for (const m of movements) {
    if (!isCashInDrawer(m)) continue;
    const amount = Number(m.amount);
    totals[m.movementType] += amount;
    totals.net += m.movementType === 'INCOME' || m.movementType === 'DEPOSIT' ? amount : -amount;
  }
  return totals;
};
