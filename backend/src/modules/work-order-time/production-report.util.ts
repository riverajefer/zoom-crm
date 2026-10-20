/**
 * Utilidades del reporte de productividad: intervalos `[inicio, fin)` en
 * milisegundos y días del calendario de Colombia. Son las mismas reglas que usa
 * «Planta hoy» en el frontend (`features/work-orders/utils/plant.ts`).
 */

export type Interval = [number, number];

/** Une intervalos que se pisan o se tocan; descarta los vacíos. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(([a, b]) => b > a)
    .map(([a, b]) => [a, b] as Interval)
    .sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Tiempo cubierto por al menos un intervalo: lo que se pisa no cuenta doble. */
export function intervalsTotal(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((acc, [a, b]) => acc + (b - a), 0);
}

/** Partes de `a` que también están en `b`. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
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
}

/** Días `YYYY-MM-DD` entre `from` y `to`, ambos incluidos. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** Corre un día `YYYY-MM-DD` `n` días (negativo hacia atrás). */
export function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
