import { Prisma } from '../../generated/prisma';

/**
 * Redondeo comercial del total de una orden al múltiplo de 50 más cercano, que
 * es la moneda más pequeña en circulación en Colombia: un total como $94.350
 * se puede pagar exacto y no se toca. Se truncan los centavos y luego el resto
 * contra 50 decide: 01–24 baja, 25–49 sube.
 *
 * Hasta 2026-11 redondeaba a múltiplos de 100 (01–40 baja, 41–99 sube), lo que
 * cobraba $50 de más en totales como $94.350 → $94.400.
 *
 * Vive aquí y no dentro de `orders.service` porque cualquier módulo que le
 * cobre al cliente antes de que exista la OP (hoy DTF) tiene que cobrar
 * exactamente el mismo número: cuando un módulo redondea y el otro no, el
 * abono queda corto contra el total y la OP nace con un saldo que nadie
 * debe y nadie puede saldar.
 */
export function applyColombianRounding(value: Prisma.Decimal): Prisma.Decimal {
  const truncated = value.toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);
  const remainder = truncated.mod(50).toNumber();
  if (remainder === 0) return truncated;
  if (remainder < 25) return truncated.sub(remainder);
  return truncated.add(50 - remainder);
}

/**
 * Redondea el total al peso entero. Se usa cuando hay retenciones, donde el
 * redondeo comercial a múltiplos de 50 distorsionaría la base del certificado
 * de retención, pero dejar el total con centavos tampoco sirve: el cliente paga
 * pesos enteros y el residuo (0,50) queda como un saldo a favor imposible de
 * saldar. Se redondea igual que `formatCurrency` en el frontend (half-up), para
 * que lo que el asesor ve cobrar sea exactamente el total almacenado.
 */
export function roundToWholePeso(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** IVA que traslada un registro DTF a la OP al convertirse. */
export const DTF_IVA_RATE = new Prisma.Decimal(0.19);

/**
 * Total que hay que cobrarle al cliente por un registro DTF: es el mismo número
 * que tendrá la OP al convertirse (`subtotal + IVA`, con redondeo comercial),
 * calculado aquí porque el abono se recibe en el mostrador antes de que la OP
 * exista.
 */
export function computeDtfTotalToCharge(
  value: Prisma.Decimal | number | string,
  applyIva: boolean,
): Prisma.Decimal {
  const subtotal = new Prisma.Decimal(value);
  const rawTotal = applyIva ? subtotal.mul(DTF_IVA_RATE.add(1)) : subtotal;
  return applyColombianRounding(rawTotal);
}

/**
 * Normaliza una tasa (IVA, retefuente, ReteICA, ReteIVA) antes de guardarla.
 *
 * El formulario recibe el porcentaje y lo divide entre 100 en JavaScript, donde
 * `1.104 / 100` no es `0.01104` sino `0.011040000000000001`. Ese residuo se
 * guardaba tal cual y después multiplicaba el subtotal, así que el total de la
 * orden terminaba con cola: en producción quedaron totales como
 * `770383.695999999999330`, y con ellos un saldo de `-0.304` que nadie podía
 * saldar.
 *
 * Seis decimales sobran para cualquier tasa real —la más fina que usa el
 * cliente es ReteICA a cuatro— y cortan el ruido de la división en coma
 * flotante. El redondeo del total (`roundToWholePeso`) tapa el síntoma; esto
 * corrige el origen, que además se muestra en el certificado de retención.
 */
export function normalizeRate(
  value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value.toString()).toDecimalPlaces(6);
}
