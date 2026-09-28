import type { SedeSummary } from '../../../types';

export interface SedeGroup<T> {
  /** `null` para las filas que no traen sede (no debería pasar desde la fase 2). */
  sede: SedeSummary | null;
  rows: T[];
}

/**
 * Agrupa filas por sede sin intercalarlas: primero la sede activa y después
 * las demás por código. Dentro de cada grupo se respeta el orden recibido.
 * Ver docs/PLAN_SEDES.md §6.2 y §8.
 */
export function groupBySede<T extends { location?: SedeSummary | null }>(
  rows: T[],
  activeLocationId: string | null,
): SedeGroup<T>[] {
  const groups = new Map<string, SedeGroup<T>>();
  for (const row of rows) {
    const key = row.location?.id ?? '';
    const group = groups.get(key) ?? { sede: row.location ?? null, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.sede?.id === activeLocationId) return -1;
    if (b.sede?.id === activeLocationId) return 1;
    return (a.sede?.code ?? '').localeCompare(b.sede?.code ?? '');
  });
}
