import { applyColombianRounding } from '../../../utils/formatters';

/** IVA que el registro DTF traslada a la OP al convertirse. */
export const DTF_IVA_RATE = 0.19;

/**
 * Total que se le cobra al cliente por un registro DTF. Es exactamente el mismo
 * número que tendrá la OP al convertirse: `valor + IVA` con el redondeo
 * comercial al múltiplo de 50.
 *
 * Cobrar un valor distinto del total de la OP deja un saldo menor a $50 que
 * el cliente ya no debe y que nadie puede saldar. Debe coincidir con
 * `computeDtfTotalToCharge` del backend.
 */
export const dtfTotalToCharge = (value: number, applyIva: boolean): number =>
  applyColombianRounding(applyIva ? value * (1 + DTF_IVA_RATE) : value);

/** IVA que se le suma al valor base, ya considerado el redondeo del total. */
export const dtfIvaAmount = (value: number, applyIva: boolean): number =>
  applyIva ? dtfTotalToCharge(value, applyIva) - value : 0;

/**
 * Saldo pendiente del registro DTF: lo que falta por cobrar tras el abono.
 * Es negativo cuando el cliente abonó de más; para ese caso usa
 * `dtfCreditBalance`, que devuelve el excedente en positivo.
 */
export const dtfPendingBalance = (
  value: number,
  applyIva: boolean,
  abono: number,
): number => dtfTotalToCharge(value, applyIva) - (abono || 0);

/**
 * Saldo a favor que le queda al cliente cuando abona por encima del total.
 * Igual que en el formulario de OP, el excedente no se rechaza: viaja con el
 * abono a la orden y queda disponible para otra OP o para devolución.
 */
export const dtfCreditBalance = (
  value: number,
  applyIva: boolean,
  abono: number,
): number => Math.max(0, (abono || 0) - dtfTotalToCharge(value, applyIva));
