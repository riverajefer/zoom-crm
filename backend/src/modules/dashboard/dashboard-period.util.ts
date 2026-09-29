import { businessToday, endOfDay, startOfDay } from '../../common/utils/date-range.util';

/**
 * Periodo de un dashboard y el anterior de la misma duración, para comparar
 * ("+12 % frente al periodo anterior"). Sin fechas, el mes en curso según el
 * calendario del negocio (Bogotá).
 */
export function resolvePeriod(query: { dateFrom?: string; dateTo?: string }) {
  let gte: Date;
  let lte: Date;

  if (query.dateFrom && query.dateTo) {
    gte = startOfDay(query.dateFrom)!;
    lte = endOfDay(query.dateTo)!;
  } else {
    // Mes en curso según el calendario del negocio.
    const [year, month] = businessToday().split('-').map(Number);
    const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, '0');

    gte = startOfDay(`${year}-${mm}-01`)!;
    lte = endOfDay(`${year}-${mm}-${String(ultimoDia).padStart(2, '0')}`)!;
  }

  const periodMs = lte.getTime() - gte.getTime();
  const prevLte = new Date(gte.getTime() - 1);
  const prevGte = new Date(prevLte.getTime() - periodMs);

  return { gte, lte, prevGte, prevLte };
}
