import { format } from 'date-fns';
import {
  WorkOrderTimeEntryType,
  type TimeEntryUser,
  type WorkOrderTimeEntry,
} from '../../../types/work-order.types';

/**
 * Cálculos de la línea de tiempo de producción. Todo en hora local del
 * navegador, que en la planta es la de Colombia.
 */

export const DEFAULT_FROM_HOUR = 6;
export const DEFAULT_TO_HOUR = 20;

/** Tarea del temporizador que sigue corriendo. */
export const isRunning = (entry: WorkOrderTimeEntry) =>
  entry.entryType === WorkOrderTimeEntryType.TIMER && !entry.endAt && !entry.voidedAt;

/**
 * La finalizó un supervisor porque el operario no lo hizo: el primer ajuste se
 * hizo con la tarea en curso y solo le puso fin.
 */
export const closedBySupervisor = (entry: WorkOrderTimeEntry) =>
  Boolean(
    entry.adjustedAt &&
      !entry.createdBy &&
      entry.endAt &&
      entry.originalStartAt &&
      !entry.originalEndAt &&
      entry.startAt &&
      new Date(entry.originalStartAt).getTime() === new Date(entry.startAt).getTime(),
  );

/** Necesita revisión: la cerró el sistema y nadie la ha mirado. */
export const needsReview = (entry: WorkOrderTimeEntry) =>
  entry.closedBySystem && !entry.reviewedAt && !entry.voidedAt;

/** Los registros heredados por cantidad de horas no tienen hora: no van en la línea. */
export const hasTimeRange = (entry: WorkOrderTimeEntry) => Boolean(entry.startAt);

export const entryDurationSeconds = (entry: WorkOrderTimeEntry, now: number = Date.now()) => {
  if (!entry.startAt) return Math.round(Number(entry.hoursWorked ?? 0) * 3600);
  const end = entry.endAt ? new Date(entry.endAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(entry.startAt).getTime()) / 1000));
};

const pad = (n: number) => String(n).padStart(2, '0');

/** «1 h 05 min» o «32 min». */
export const formatDuration = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h ? `${h} h ${pad(m)} min` : `${m} min`;
};

/** Cronómetro «00:29:13». */
export const formatTimer = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

export const formatClock = (iso: string | Date) => format(new Date(iso), 'HH:mm');

/** Clave del día local (`yyyy-MM-dd`). */
export const dayKey = (date: string | Date) => format(new Date(date), 'yyyy-MM-dd');

export const userName = (user?: TimeEntryUser | null) => {
  if (!user) return '';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email || 'Usuario';
};

export const userInitials = (user?: TimeEntryUser | null) => {
  const name = userName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
};

/** Colores de operario: estables por id, distinguibles en claro y oscuro. */
const OPERATOR_COLORS = [
  '#2EB0C4',
  '#6366F1',
  '#F97316',
  '#EC4899',
  '#10B981',
  '#A855F7',
  '#EAB308',
  '#EF4444',
];

export const operatorColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return OPERATOR_COLORS[hash % OPERATOR_COLORS.length];
};

/** Días (`yyyy-MM-dd`) con al menos un registro ubicable, en orden. */
export const activityDays = (entries: WorkOrderTimeEntry[]) =>
  [...new Set(entries.filter(hasTimeRange).map((e) => dayKey(e.startAt!)))].sort();

export interface TimelineAxis {
  days: string[];
  fromHour: number;
  toHour: number;
}

/**
 * Eje de la línea: los días visibles y de 6:00 a 20:00, ampliado si alguna
 * tarea empieza antes o termina después (una hora extra a las 21:30, por
 * ejemplo, no puede quedar cortada).
 */
export const buildAxis = (
  days: string[],
  entries: WorkOrderTimeEntry[],
  now: number = Date.now(),
): TimelineAxis => {
  let fromHour = DEFAULT_FROM_HOUR;
  let toHour = DEFAULT_TO_HOUR;
  for (const entry of entries) {
    if (!entry.startAt || !days.includes(dayKey(entry.startAt))) continue;
    const start = new Date(entry.startAt);
    const end = new Date(entry.endAt ? new Date(entry.endAt).getTime() : now);
    fromHour = Math.min(fromHour, start.getHours());
    const endHour = dayKey(end) === dayKey(start) ? end.getHours() + (end.getMinutes() > 0 ? 1 : 0) : 24;
    toHour = Math.max(toHour, Math.min(24, endHour));
  }
  return { days, fromHour, toHour };
};

/** Posición horizontal (0–100 %) de un instante, o `null` si cae en otro día. */
export const positionPercent = (instant: string | Date | number, axis: TimelineAxis) => {
  const date = new Date(instant);
  const index = axis.days.indexOf(dayKey(date));
  if (index < 0) return null;
  const span = axis.toHour - axis.fromHour;
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const within = Math.min(Math.max(hours - axis.fromHour, 0), span);
  return ((index * span + within) / (axis.days.length * span)) * 100;
};

/** Izquierda y ancho de la barra de un registro, en %. */
export const barGeometry = (entry: WorkOrderTimeEntry, axis: TimelineAxis, now: number = Date.now()) => {
  if (!entry.startAt) return null;
  const left = positionPercent(entry.startAt, axis);
  if (left === null) return null;
  const endInstant = entry.endAt ? new Date(entry.endAt) : new Date(now);
  // Una tarea que pasa de medianoche se corta al final de su día.
  const right =
    dayKey(endInstant) === dayKey(entry.startAt)
      ? positionPercent(endInstant, axis)
      : ((axis.days.indexOf(dayKey(entry.startAt)) + 1) / axis.days.length) * 100;
  return { left, width: Math.max(0, (right ?? left) - left) };
};

export interface LanedEntry {
  entry: WorkOrderTimeEntry;
  lane: number;
}

/**
 * Reparte los registros de una fila en carriles para que dos tareas a la vez
 * (de operarios distintos en el mismo ítem) no se pinten una encima de otra.
 */
export const assignLanes = (entries: WorkOrderTimeEntry[], now: number = Date.now()) => {
  const laneEnds: number[] = [];
  const laned: LanedEntry[] = [...entries]
    .filter(hasTimeRange)
    .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())
    .map((entry) => {
      const start = new Date(entry.startAt!).getTime();
      const end = entry.endAt ? new Date(entry.endAt).getTime() : now;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      return { entry, lane };
    });
  return { laned, laneCount: Math.max(1, laneEnds.length) };
};

/** Minutos que faltan para el cierre de la jornada (`HH:mm`), negativos si ya pasó. */
export const minutesUntil = (hhmm: string, now: Date = new Date()) => {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60_000);
};
