import type { WorkOrderTimeEntry } from '../../../types/work-order.types';
import type { PlantOperator } from '../../../types/work-order-time.types';
import { userName } from './timeline';
import type { OperatorStatus } from './plant';

/**
 * Filtros de «Planta hoy». Hay dos tipos:
 *
 * - **De operario** (operario, área, estado): quitan filas enteras.
 * - **De tarea** (OT, máquina): dejan en cada fila solo las barras que
 *   coinciden, y ocultan a quien no tenga ninguna. La ocupación de la fila se
 *   sigue calculando con todas sus tareas del día, para no confundir «ocupado»
 *   con «ocupado en esta OT».
 */

/** Valor del filtro de máquina para las tareas que no registraron máquina. */
export const NO_MACHINE = 'sin-maquina';

export type StatusFilter = 'all' | 'busy' | 'idle' | 'idle-alert' | 'left' | 'no-entry';

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  busy: 'Con tarea ahora',
  idle: 'Sin tarea ahora',
  'idle-alert': 'Sin tarea hace más de 20 min',
  left: 'Ya salieron',
  'no-entry': 'Sin entrada',
};

/** Estados que solo tienen sentido mirando el día de hoy. */
export const TODAY_ONLY_STATUSES: StatusFilter[] = ['busy', 'idle', 'idle-alert'];

export interface PlantFilters {
  operatorIds: string[];
  areaIds: string[];
  workOrderIds: string[];
  machineIds: string[];
  status: StatusFilter;
}

export const EMPTY_FILTERS: PlantFilters = {
  operatorIds: [],
  areaIds: [],
  workOrderIds: [],
  machineIds: [],
  status: 'all',
};

export interface FilterOption {
  id: string;
  label: string;
}

const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label, 'es');

/** Opciones de cada filtro, sacadas de lo que hay ese día (no del catálogo completo). */
export const buildFilterOptions = (operators: PlantOperator[]) => {
  const areas = new Map<string, string>();
  const workOrders = new Map<string, string>();
  const machines = new Map<string, string>();
  let anyWithoutMachine = false;

  for (const op of operators) {
    const area = op.user.cargo?.productionArea;
    if (area) areas.set(area.id, area.name);
    for (const e of op.entries) {
      workOrders.set(e.workOrderId, e.workOrder?.workOrderNumber ?? 'OT');
      if (e.machine) machines.set(e.machine.id, e.machine.name);
      else anyWithoutMachine = true;
    }
  }

  const toOptions = (map: Map<string, string>) =>
    [...map].map(([id, label]) => ({ id, label })).sort(byLabel);

  return {
    operators: operators.map((op) => ({ id: op.user.id, label: userName(op.user) })).sort(byLabel),
    areas: toOptions(areas),
    // El número de OT ordena bien como texto (OT-2026-0145 < OT-2026-0146).
    workOrders: toOptions(workOrders),
    machines: [
      ...toOptions(machines),
      ...(anyWithoutMachine ? [{ id: NO_MACHINE, label: 'Sin máquina' }] : []),
    ],
  };
};

export const hasTaskFilters = (f: PlantFilters) => f.workOrderIds.length > 0 || f.machineIds.length > 0;

export const activeFilterCount = (f: PlantFilters) =>
  [f.operatorIds, f.areaIds, f.workOrderIds, f.machineIds].filter((list) => list.length > 0).length +
  (f.status === 'all' ? 0 : 1);

/** ¿La tarea pasa los filtros de OT y máquina? */
export const entryMatches = (entry: WorkOrderTimeEntry, f: PlantFilters) => {
  if (f.workOrderIds.length && !f.workOrderIds.includes(entry.workOrderId)) return false;
  if (f.machineIds.length && !f.machineIds.includes(entry.machine?.id ?? NO_MACHINE)) return false;
  return true;
};

export const statusMatches = (status: OperatorStatus, filter: StatusFilter) => {
  switch (filter) {
    case 'all':
      return true;
    case 'busy':
      return status.kind === 'busy';
    case 'idle':
      return status.kind === 'idle';
    case 'idle-alert':
      return status.kind === 'idle' && status.alert;
    case 'left':
      return status.kind === 'left';
    case 'no-entry':
      return status.kind === 'no-entry';
  }
};

export interface FilterableRow {
  operator: PlantOperator;
  status: OperatorStatus;
}

/**
 * Aplica los filtros. Devuelve cada fila que queda con las tareas que se deben
 * pintar (`visibleEntries`).
 */
export const applyPlantFilters = <T extends FilterableRow>(rows: T[], f: PlantFilters) =>
  rows.flatMap((row) => {
    const { user } = row.operator;
    if (f.operatorIds.length && !f.operatorIds.includes(user.id)) return [];
    if (f.areaIds.length && !f.areaIds.includes(user.cargo?.productionArea?.id ?? '')) return [];
    if (!statusMatches(row.status, f.status)) return [];

    const visibleEntries = row.operator.entries.filter((e) => entryMatches(e, f));
    if (hasTaskFilters(f) && visibleEntries.length === 0) return [];
    return [{ ...row, visibleEntries }];
  });

// ─────────────────────────────────────────────────────────────────────────────
// URL: los filtros viajan en el enlace para poder compartir una vista filtrada.
// ─────────────────────────────────────────────────────────────────────────────

const PARAMS = {
  operatorIds: 'operario',
  areaIds: 'area',
  workOrderIds: 'ot',
  machineIds: 'maquina',
} as const;

const STATUS_PARAM = 'estado';

export const filtersFromParams = (params: URLSearchParams): PlantFilters => {
  const list = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const status = params.get(STATUS_PARAM) as StatusFilter | null;
  return {
    operatorIds: list(PARAMS.operatorIds),
    areaIds: list(PARAMS.areaIds),
    workOrderIds: list(PARAMS.workOrderIds),
    machineIds: list(PARAMS.machineIds),
    status: status && status in STATUS_FILTER_LABELS ? status : 'all',
  };
};

/** Escribe los filtros en `params` (conserva los demás parámetros). */
export const filtersToParams = (f: PlantFilters, base: URLSearchParams): URLSearchParams => {
  const next = new URLSearchParams(base);
  (Object.keys(PARAMS) as (keyof typeof PARAMS)[]).forEach((key) => {
    if (f[key].length) next.set(PARAMS[key], f[key].join(','));
    else next.delete(PARAMS[key]);
  });
  if (f.status === 'all') next.delete(STATUS_PARAM);
  else next.set(STATUS_PARAM, f.status);
  return next;
};
