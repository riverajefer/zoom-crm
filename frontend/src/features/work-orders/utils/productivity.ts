import { format, startOfWeek, subDays } from 'date-fns';
import type {
  ProductivityOperatorRow,
  ProductivityReport,
  ReportInterval,
} from '../../../types/work-order-time.types';
import { userName } from './timeline';
import { intersectIntervals, intervalsTotal } from './plant';

/**
 * Lógica del reporte de productividad que no es dibujo: periodos, hallazgos
 * automáticos, nivel de confianza del registro y celdas del mapa de calor.
 */

export type PeriodPreset = 'fortnight' | 'previous-fortnight' | 'week' | 'last-30' | 'custom';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  fortnight: 'Quincena actual',
  'previous-fortnight': 'Quincena anterior',
  week: 'Esta semana',
  'last-30': 'Últimos 30 días',
  custom: 'Personalizado',
};

const day = (d: Date) => format(d, 'yyyy-MM-dd');
const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/**
 * Rango `[from, to]` de un atajo. Las quincenas son las de la nómina: del 1 al
 * 15 y del 16 a fin de mes. La quincena actual llega hasta hoy.
 */
export const presetRange = (preset: Exclude<PeriodPreset, 'custom'>, today: Date = new Date()) => {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (preset) {
    case 'fortnight':
      return { from: day(new Date(y, m, d <= 15 ? 1 : 16)), to: day(today) };
    case 'previous-fortnight':
      return d <= 15
        ? { from: day(new Date(y, m - 1, 16)), to: day(new Date(y, m - 1, lastDayOfMonth(y, m - 1))) }
        : { from: day(new Date(y, m, 1)), to: day(new Date(y, m, 15)) };
    case 'week':
      return { from: day(startOfWeek(today, { weekStartsOn: 1 })), to: day(today) };
    case 'last-30':
      return { from: day(subDays(today, 29)), to: day(today) };
  }
};

const HOUR = 3_600_000;

/** «96 h 17 min», «45 min» o «0 h». */
export const msLabel = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h && !m) return '0 h';
  return h ? (m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`) : `${m} min`;
};

/** Horas con un decimal, para ejes y barras: «7,5 h». */
export const hoursLabel = (ms: number) =>
  `${(ms / HOUR).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;

export const percentLabel = (ratio: number | null | undefined) =>
  ratio == null ? '—' : `${Math.round(ratio * 100)} %`;

const cop = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Pesos redondeados: a cientos por debajo de $100.000 y a miles por encima. */
export const copLabel = (value: number | null | undefined) => {
  if (value == null) return '—';
  const rounded = value < 100_000 ? Math.round(value / 100) * 100 : Math.round(value / 1000) * 1000;
  return `$ ${cop.format(rounded)}`;
};

/** Semáforo de mano de obra frente a la venta: hasta 15 % bien, hasta 30 % atención. */
export const laborShareLevel = (share: number | null | undefined): 'success' | 'warning' | 'error' | null =>
  share == null ? null : share > 0.3 ? 'error' : share > 0.15 ? 'warning' : 'success';

/** Cambio relativo frente al periodo anterior (`null` si no hay con qué comparar). */
export const relativeChange = (current: number, previous: number) =>
  previous > 0 ? (current - previous) / previous : null;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * ¿Qué tanto confiar en las horas de un operario? Baja si más del 10 % de sus
 * tareas las cerró el sistema (olvidó finalizar, las horas quedan infladas) o
 * si anuló más de 2; media desde el 5 %.
 */
export const confidenceLevel = (q: ProductivityOperatorRow['quality']): ConfidenceLevel => {
  const valid = q.entries - q.voided;
  const share = valid > 0 ? q.closedBySystem / valid : 0;
  if (share > 0.1 || q.voided > 2) return 'low';
  if (share > 0.05) return 'medium';
  return 'high';
};

export interface Insight {
  severity: 'warning' | 'error' | 'info' | 'success';
  text: string;
}

/**
 * Hallazgos que se leen sin abrir tablas: quién tiene la ocupación más baja,
 * quién olvida finalizar y quién trabaja fuera de la asistencia.
 */
export const buildInsights = (report: ProductivityReport): Insight[] => {
  const insights: Insight[] = [];
  const rows = report.operators.filter((r) => r.plantMs > 0);

  const lowest = rows
    .filter((r) => r.occupancy !== null)
    .sort((a, b) => (a.occupancy ?? 0) - (b.occupancy ?? 0))[0];
  if (lowest && rows.length > 1) {
    insights.push({
      severity: 'warning',
      text: `${userName(lowest.user)} tiene la ocupación más baja (${percentLabel(lowest.occupancy)}): ${msLabel(
        lowest.plantMs - lowest.busyMs,
      )} en planta sin tarea registrada.`,
    });
  }

  const forgetful = rows
    .map((r) => ({ r, valid: r.quality.entries - r.quality.voided }))
    .filter(({ valid, r }) => valid > 0 && r.quality.closedBySystem > 0)
    .sort((a, b) => b.r.quality.closedBySystem / b.valid - a.r.quality.closedBySystem / a.valid)[0];
  if (forgetful) {
    const share = forgetful.r.quality.closedBySystem / forgetful.valid;
    insights.push({
      severity: share > 0.1 ? 'error' : 'warning',
      text: `${userName(forgetful.r.user)} olvida finalizar: el sistema cerró ${forgetful.r.quality.closedBySystem} de ${
        forgetful.valid
      } tareas (${percentLabel(share)}). Esas horas pueden estar infladas.`,
    });
  }

  const outside = report.operators
    .filter((r) => r.quality.outsideAttendanceMs >= HOUR)
    .sort((a, b) => b.quality.outsideAttendanceMs - a.quality.outsideAttendanceMs)[0];
  if (outside) {
    insights.push({
      severity: 'info',
      text: `${userName(outside.user)} tiene ${msLabel(
        outside.quality.outsideAttendanceMs,
      )} de tareas fuera de su asistencia: no cuentan en la ocupación. ¿Olvidó marcar entrada o salida?`,
    });
  }

  if (report.costs) {
    const heaviest = report.workOrders
      .filter((w) => w.laborShare != null)
      .sort((a, b) => (b.laborShare ?? 0) - (a.laborShare ?? 0))[0];
    if (heaviest && (heaviest.laborShare ?? 0) > 0.15) {
      insights.push({
        severity: (heaviest.laborShare ?? 0) > 0.3 ? 'error' : 'warning',
        text: `${heaviest.workOrderNumber}${heaviest.client ? ` (${heaviest.client})` : ''} es la OT con más mano de obra frente a su venta: ${percentLabel(
          heaviest.laborShare,
        )} de ${copLabel(heaviest.saleValue)} sin IVA.`,
      });
    }
    const missing = report.totals.cost?.operatorsWithoutSalary ?? 0;
    if (missing > 0) {
      insights.push({
        severity: 'info',
        text: `${missing} operario${missing === 1 ? ' no tiene' : 's no tienen'} salario en nómina: su tiempo no suma al costo.`,
      });
    }
  }

  const prev = report.previous.totals.occupancy;
  const curr = report.totals.occupancy;
  if (prev !== null && curr !== null && Math.abs(curr - prev) >= 0.03) {
    insights.push({
      severity: curr > prev ? 'success' : 'warning',
      text: `La ocupación ${curr > prev ? 'subió' : 'bajó'} ${Math.round(Math.abs(curr - prev) * 100)} puntos frente al periodo anterior (${percentLabel(
        prev,
      )} → ${percentLabel(curr)}).`,
    });
  }
  return insights;
};

export interface HeatCell {
  hour: number;
  plantMs: number;
  busyMs: number;
}

/**
 * Celdas hora por hora de un día del operario: cuánto estuvo en planta y
 * cuánto en tareas dentro de cada hora (hora local del navegador).
 */
export const heatmapCells = (
  date: string,
  attendance: ReportInterval[],
  busy: ReportInterval[],
  fromHour: number,
  toHour: number,
): HeatCell[] => {
  const cells: HeatCell[] = [];
  for (let hour = fromHour; hour < toHour; hour++) {
    const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
    const slot: ReportInterval[] = [[start, start + HOUR]];
    cells.push({
      hour,
      plantMs: intervalsTotal(intersectIntervals(attendance, slot)),
      busyMs: intervalsTotal(intersectIntervals(busy, slot)),
    });
  }
  return cells;
};

/** Rango de horas del mapa de calor: de 6 a 20, ampliado si alguien entró antes o salió después. */
export const heatmapHours = (days: { attendance: ReportInterval[] }[]) => {
  let from = 6;
  let to = 20;
  for (const d of days) {
    for (const [s, e] of d.attendance) {
      from = Math.min(from, new Date(s).getHours());
      const end = new Date(e);
      to = Math.max(to, Math.min(24, end.getHours() + (end.getMinutes() > 0 ? 1 : 0)));
    }
  }
  return { from, to };
};
