import type { PayrollAdvance } from '../../../types/payroll-period.types';

/**
 * Lo que Caja realmente le entregó al empleado por este anticipo.
 *
 * Es lo único que se descuenta en nómina: un anticipo cuya solicitud de pago
 * fue rechazada o venció sigue vinculado al periodo, pero el empleado nunca
 * recibió el dinero. `paidAmount` ya excluye los pagos revertidos (el backend
 * lo recalcula con los pagos vivos al revertir).
 */
export const advanceDisbursed = (a: Pick<PayrollAdvance, 'paidAmount'>) =>
  Number(a.paidAmount ?? 0);

/** Parte del anticipo que sigue sin desembolsar (no se descuenta). */
export const advanceNotDisbursed = (a: Pick<PayrollAdvance, 'totalAmount' | 'paidAmount'>) =>
  Math.max(Number(a.totalAmount) - advanceDisbursed(a), 0);

export const sumDisbursed = (advances: PayrollAdvance[]) =>
  advances.reduce((sum, a) => sum + advanceDisbursed(a), 0);

export const sumNotDisbursed = (advances: PayrollAdvance[]) =>
  advances.reduce((sum, a) => sum + advanceNotDisbursed(a), 0);
