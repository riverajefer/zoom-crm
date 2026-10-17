import type { WorkOrderTimeEntry } from '../../../types/work-order.types';
import type { PlantAttendance, PlantOperator } from '../../../types/work-order-time.types';
import { hasTimeRange, isRunning } from './timeline';

/**
 * Cálculos de «Planta hoy»: ocupación y estado de cada operario. Los instantes
 * van en milisegundos para poder sumar y comparar sin convertir fechas.
 */

/** Pasados estos minutos sin tarea, el operario se resalta en naranja. */
export const IDLE_ALERT_MINUTES = 20;

/** Intervalo `[inicio, fin)` en milisegundos. */
export type Interval = [number, number];

/** Une intervalos que se pisan o se tocan; descarta los vacíos. */
export const mergeIntervals = (intervals: Interval[]): Interval[] => {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

/** Tiempo cubierto por al menos un intervalo: lo que se pisa no cuenta doble. */
export const intervalsTotal = (intervals: Interval[]) =>
  mergeIntervals(intervals).reduce((acc, [a, b]) => acc + (b - a), 0);

/** Partes de `a` que también están en `b`. */
export const intersectIntervals = (a: Interval[], b: Interval[]): Interval[] => {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i][0], right[j][0]);
    const end = Math.min(left[i][1], right[j][1]);
    if (end > start) result.push([start, end]);
    if (left[i][1] < right[j][1]) i++;
    else j++;
  }
  return result;
};

/** Franjas en planta; una marca sin salida llega hasta `openEnd`. */
export const attendanceIntervals = (attendance: PlantAttendance[], openEnd: number): Interval[] =>
  attendance.map((a) => [
    new Date(a.clockIn).getTime(),
    a.clockOut ? new Date(a.clockOut).getTime() : Math.max(openEnd, new Date(a.clockIn).getTime()),
  ]);

/** Tramos de tarea; una tarea en curso llega hasta `now`. */
export const entryIntervals = (entries: WorkOrderTimeEntry[], now: number): Interval[] =>
  entries
    .filter((e) => hasTimeRange(e) && !e.voidedAt)
    .map((e) => [new Date(e.startAt!).getTime(), e.endAt ? new Date(e.endAt).getTime() : now]);

export interface Occupancy {
  /** Tiempo en planta (unión de las marcas de asistencia). */
  plantMs: number;
  /** Tiempo dentro de la planta con al menos una tarea abierta. */
  busyMs: number;
  /** `busyMs / plantMs`, o `null` si no estuvo en planta. */
  ratio: number | null;
}

/**
 * Ocupación = unión de los tramos de tarea dentro de la asistencia ÷ tiempo en
 * planta. Dos tareas a la vez no cuentan doble y lo que se trabajó fuera de la
 * asistencia no infla el porcentaje.
 */
export const computeOccupancy = (attendance: Interval[], tasks: Interval[]): Occupancy => {
  const plantMs = intervalsTotal(attendance);
  const busyMs = intervalsTotal(intersectIntervals(attendance, tasks));
  return { plantMs, busyMs, ratio: plantMs > 0 ? busyMs / plantMs : null };
};

export type OperatorStatus =
  | { kind: 'busy'; running: number }
  | { kind: 'idle'; idleMs: number; alert: boolean }
  | { kind: 'left'; at: number | null }
  | { kind: 'no-entry' };

/**
 * Estado del operario para el chip de su fila. «Ahora» solo tiene sentido hoy:
 * en un día pasado se muestra solo si marcó entrada y a qué hora salió.
 */
export const operatorStatus = (
  operator: Pick<PlantOperator, 'attendance' | 'entries'>,
  now: number,
  isToday: boolean,
): OperatorStatus => {
  const running = isToday ? operator.entries.filter(isRunning).length : 0;
  if (running > 0) return { kind: 'busy', running };
  if (!operator.attendance.length) return { kind: 'no-entry' };

  const last = operator.attendance.reduce((a, b) =>
    new Date(b.clockIn).getTime() > new Date(a.clockIn).getTime() ? b : a,
  );
  if (!isToday || last.clockOut) {
    return { kind: 'left', at: last.clockOut ? new Date(last.clockOut).getTime() : null };
  }

  // Sin tarea desde que terminó la última, o desde que entró si no ha hecho nada.
  const lastTaskEnd = Math.max(
    0,
    ...entryIntervals(operator.entries, now).map(([, end]) => end),
  );
  const since = Math.max(new Date(last.clockIn).getTime(), lastTaskEnd);
  const idleMs = Math.max(0, now - since);
  return { kind: 'idle', idleMs, alert: idleMs > IDLE_ALERT_MINUTES * 60_000 };
};

/** ¿Sigue en planta? (última marca sin salida). */
export const isInPlant = (attendance: PlantAttendance[]) => attendance.some((a) => !a.clockOut);

/** Promedio simple de las ocupaciones de quienes estuvieron en planta. */
export const averageOccupancy = (ratios: (number | null)[]) => {
  const valid = ratios.filter((r): r is number => r !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};
