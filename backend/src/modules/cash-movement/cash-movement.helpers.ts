import { CashMovementType, Prisma } from '../../generated/prisma';

/**
 * Tipo inverso de un movimiento, usado al generar el contramovimiento de una
 * anulación: la reversa de un ingreso es un egreso, y la de un retiro es un
 * depósito (y viceversa).
 */
export const INVERSE_MOVEMENT_TYPE: Record<CashMovementType, CashMovementType> = {
  INCOME: CashMovementType.EXPENSE,
  EXPENSE: CashMovementType.INCOME,
  WITHDRAWAL: CashMovementType.DEPOSIT,
  DEPOSIT: CashMovementType.WITHDRAWAL,
};

/**
 * Excluye los contramovimientos de anulación de cualquier cálculo de saldo.
 *
 * El modelo de saldos de caja neutraliza una anulación excluyendo el movimiento
 * original (`isVoided: true`), no sumando su reversa. El contramovimiento existe
 * únicamente como rastro visible/imprimible; si además entrara al cálculo, la
 * anulación quedaría en cero neto (o restaría dos veces) en vez de revertir.
 *
 * `originalMovement` es el lado inverso de la relación `CounterMovement`: solo
 * está presente en un movimiento que fue creado como reversa de otro.
 */
export const EXCLUDE_REVERSALS: Prisma.CashMovementWhereInput = {
  originalMovement: null,
};

/**
 * `referenceType` del depósito con el que la Matriz recibe el efectivo de un
 * local (solo Zoom, cierre general). `referenceId` es la sesión del local que
 * lo entrega. No es dinero nuevo: el consolidado lo cuenta en la base.
 */
export const CASH_HANDOVER_REFERENCE = 'CASH_HANDOVER';
