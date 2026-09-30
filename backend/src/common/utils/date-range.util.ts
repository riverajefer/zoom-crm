/**
 * Utilidades para convertir filtros de fecha en límites de día completos.
 *
 * Todos los filtros por "día" del sistema se resuelven en la zona horaria de
 * operación del negocio (Colombia), no en UTC. Un usuario que filtra
 * "01/07/2026" espera el día 01 de julio tal como lo vive en Bogotá, y el mismo
 * día debe significar exactamente lo mismo en la tarjeta de totales, en el
 * listado y en el archivo exportado a Excel.
 *
 * Los filtros pueden llegar en dos formatos:
 *  - Fecha simple `YYYY-MM-DD` (p. ej. desde un DatePicker sin hora). Se expande
 *    al día completo en hora Colombia: `00:00:00.000-05:00` a
 *    `23:59:59.999-05:00`.
 *  - Fecha-hora ISO completa `YYYY-MM-DDTHH:mm:ss.sssZ`. Representa un instante
 *    exacto y se usa tal cual (p. ej. rangos de asistencia con hora).
 *
 * Ojo con el error clásico: `new Date('2026-07-01')` se interpreta como
 * medianoche **UTC**, que en Colombia son las 7:00 p. m. del 30 de junio. Usar
 * ese valor como límite corre el rango 5 horas y mueve de día las órdenes
 * creadas entre las 7:00 p. m. y la medianoche.
 */

/** Zona horaria de operación del negocio. */
export const BUSINESS_TIMEZONE = 'America/Bogota';

/**
 * Desfase fijo de la zona del negocio. Colombia no aplica horario de verano
 * (sin cambios desde 1993), por lo que un offset fijo es exacto y evita
 * dependencias de librerías de zonas horarias.
 */
export const BUSINESS_UTC_OFFSET = '-05:00';

/** Verdadero si el string incluye componente horario (fecha-hora ISO). */
function hasTimeComponent(date: string): boolean {
  return date.includes('T');
}

/**
 * Inicio del día en hora Colombia para un filtro `desde`. Si el valor ya es una
 * fecha-hora ISO completa, se respeta el instante recibido.
 * Devuelve `undefined` si no se provee fecha o si el valor es inválido.
 */
export function startOfDay(date?: string): Date | undefined {
  if (!date) return undefined;
  const parsed = new Date(
    hasTimeComponent(date)
      ? date
      : `${date}T00:00:00.000${BUSINESS_UTC_OFFSET}`,
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Fin del día en hora Colombia para un filtro `hasta`, de modo que el rango sea
 * inclusivo y filtrar el mismo día en `desde`/`hasta` devuelva sus registros.
 * Si el valor ya es una fecha-hora ISO completa, se respeta el instante recibido.
 * Devuelve `undefined` si no se provee fecha o si el valor es inválido.
 */
export function endOfDay(date?: string): Date | undefined {
  if (!date) return undefined;
  const parsed = new Date(
    hasTimeComponent(date)
      ? date
      : `${date}T23:59:59.999${BUSINESS_UTC_OFFSET}`,
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Fecha de hoy (`YYYY-MM-DD`) según el calendario del negocio. Usar esto en vez
 * de `new Date().toISOString().split('T')[0]`, que a partir de las 7:00 p. m.
 * hora Colombia ya devuelve el día siguiente.
 */
export function businessToday(): string {
  return businessDate(new Date());
}

/**
 * Día (`YYYY-MM-DD`) de un instante según el calendario del negocio. Un pago de
 * las 7:02 p. m. del 29 es del 29, aunque en UTC ya sea el 30.
 */
export function businessDate(date: Date): string {
  // 'en-CA' formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
  }).format(date);
}
