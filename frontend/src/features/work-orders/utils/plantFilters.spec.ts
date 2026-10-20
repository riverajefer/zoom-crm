import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  NO_MACHINE,
  activeFilterCount,
  applyPlantFilters,
  buildFilterOptions,
  filtersFromParams,
  filtersToParams,
  type PlantFilters,
} from './plantFilters';
import type { OperatorStatus } from './plant';
import type { PlantOperator } from '../../../types/work-order-time.types';
import { WorkOrderTimeEntryType, type WorkOrderTimeEntry } from '../../../types/work-order.types';

const entry = (id: string, userId: string, wo: string, machine?: string): WorkOrderTimeEntry => ({
  id,
  workOrderId: wo,
  workOrder: { id: wo, workOrderNumber: `OT-2026-${wo}` },
  entryType: WorkOrderTimeEntryType.TIMER,
  workedDate: '2026-10-20T00:00:00.000Z',
  hoursWorked: '1',
  startAt: '2026-10-20T13:00:00.000Z',
  endAt: '2026-10-20T14:00:00.000Z',
  closedBySystem: false,
  createdAt: '2026-10-20T13:00:00.000Z',
  updatedAt: '2026-10-20T13:00:00.000Z',
  user: { id: userId },
  machine: machine ? { id: machine, name: `Máquina ${machine}` } : null,
});

const operator = (
  id: string,
  name: string,
  area: string | null,
  entries: WorkOrderTimeEntry[],
): PlantOperator => ({
  user: {
    id,
    firstName: name,
    cargo: area ? { name: 'Operario', productionArea: { id: area, name: `Área ${area}` } } : null,
  },
  attendance: [],
  entries,
});

const busy: OperatorStatus = { kind: 'busy', running: 1 };
const idleLong: OperatorStatus = { kind: 'idle', idleMs: 40 * 60_000, alert: true };
const noEntry: OperatorStatus = { kind: 'no-entry' };

const carlos = operator('carlos', 'Carlos', 'uv', [entry('c1', 'carlos', '0146', 'dtf'), entry('c2', 'carlos', '0149')]);
const jhon = operator('jhon', 'Jhon', 'conf', [entry('j1', 'jhon', '0148', 'coser')]);
const user = operator('user', 'Usuario', null, []);

const rows = [
  { operator: carlos, status: busy },
  { operator: jhon, status: idleLong },
  { operator: user, status: noEntry },
];

const withFilters = (f: Partial<PlantFilters>) => ({ ...EMPTY_FILTERS, ...f });
const ids = (result: ReturnType<typeof applyPlantFilters>) => result.map((r) => r.operator.user.id);

describe('plantFilters', () => {
  it('arma las opciones con lo que hay ese día, incluida «Sin máquina»', () => {
    const options = buildFilterOptions([carlos, jhon, user]);
    expect(options.operators.map((o) => o.label)).toEqual(['Carlos', 'Jhon', 'Usuario']);
    expect(options.areas.map((o) => o.id)).toEqual(['conf', 'uv']);
    expect(options.workOrders.map((o) => o.label)).toEqual(['OT-2026-0146', 'OT-2026-0148', 'OT-2026-0149']);
    expect(options.machines.map((o) => o.id)).toEqual(['coser', 'dtf', NO_MACHINE]);
  });

  it('sin filtros muestra a todos con todas sus tareas', () => {
    const result = applyPlantFilters(rows, EMPTY_FILTERS);
    expect(ids(result)).toEqual(['carlos', 'jhon', 'user']);
    expect(result[0].visibleEntries).toHaveLength(2);
  });

  it('filtra por operario y por área', () => {
    expect(ids(applyPlantFilters(rows, withFilters({ operatorIds: ['jhon'] })))).toEqual(['jhon']);
    expect(ids(applyPlantFilters(rows, withFilters({ areaIds: ['uv'] })))).toEqual(['carlos']);
  });

  it('por OT deja solo las barras de esa OT y oculta a quien no trabajó en ella', () => {
    const result = applyPlantFilters(rows, withFilters({ workOrderIds: ['0146'] }));
    expect(ids(result)).toEqual(['carlos']);
    expect(result[0].visibleEntries.map((e) => e.id)).toEqual(['c1']);
  });

  it('por máquina, incluida «Sin máquina»', () => {
    expect(ids(applyPlantFilters(rows, withFilters({ machineIds: ['coser'] })))).toEqual(['jhon']);
    const none = applyPlantFilters(rows, withFilters({ machineIds: [NO_MACHINE] }));
    expect(none[0].visibleEntries.map((e) => e.id)).toEqual(['c2']);
  });

  it('por estado', () => {
    expect(ids(applyPlantFilters(rows, withFilters({ status: 'busy' })))).toEqual(['carlos']);
    expect(ids(applyPlantFilters(rows, withFilters({ status: 'idle-alert' })))).toEqual(['jhon']);
    expect(ids(applyPlantFilters(rows, withFilters({ status: 'no-entry' })))).toEqual(['user']);
  });

  it('los filtros se combinan', () => {
    expect(ids(applyPlantFilters(rows, withFilters({ areaIds: ['uv'], machineIds: ['coser'] })))).toEqual([]);
  });

  it('cuenta los filtros activos', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount(withFilters({ workOrderIds: ['a', 'b'], status: 'busy' }))).toBe(2);
  });

  it('viajan en la URL sin pisar otros parámetros', () => {
    const base = new URLSearchParams('timeEntry=x');
    const params = filtersToParams(withFilters({ workOrderIds: ['a', 'b'], status: 'idle' }), base);
    expect(params.get('ot')).toBe('a,b');
    expect(params.get('estado')).toBe('idle');
    expect(params.get('timeEntry')).toBe('x');
    expect(filtersFromParams(params)).toEqual(withFilters({ workOrderIds: ['a', 'b'], status: 'idle' }));
    expect(filtersToParams(EMPTY_FILTERS, params).toString()).toBe('timeEntry=x');
  });

  it('un estado desconocido en la URL se ignora', () => {
    expect(filtersFromParams(new URLSearchParams('estado=raro')).status).toBe('all');
  });
});
