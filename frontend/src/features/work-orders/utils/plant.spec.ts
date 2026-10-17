import { describe, expect, it } from 'vitest';
import {
  attendanceIntervals,
  averageOccupancy,
  computeOccupancy,
  entryIntervals,
  intersectIntervals,
  intervalsTotal,
  mergeIntervals,
  operatorStatus,
  type Interval,
} from './plant';
import { WorkOrderTimeEntryType, type WorkOrderTimeEntry } from '../../../types/work-order.types';

const MIN = 60_000;
const H = 60 * MIN;
/** Instante del 17 oct 2026 en hora local. */
const t = (h: number, m = 0) => new Date(2026, 9, 17, h, m).getTime();
const iso = (h: number, m = 0) => new Date(t(h, m)).toISOString();

const entry = (overrides: Partial<WorkOrderTimeEntry> = {}): WorkOrderTimeEntry => ({
  id: 'e1',
  workOrderId: 'wo1',
  entryType: WorkOrderTimeEntryType.TIMER,
  workedDate: '2026-10-17T00:00:00.000Z',
  hoursWorked: null,
  startAt: iso(8),
  endAt: iso(10),
  closedBySystem: false,
  createdAt: iso(8),
  updatedAt: iso(8),
  user: { id: 'u1', firstName: 'Carlos', lastName: 'Mejía' },
  ...overrides,
});

describe('mergeIntervals / intervalsTotal', () => {
  it('une los que se pisan y los que se tocan', () => {
    expect(
      mergeIntervals([
        [t(10), t(11)],
        [t(8), t(9)],
        [t(8, 30), t(9, 30)],
        [t(11), t(12)],
      ]),
    ).toEqual([
      [t(8), t(9, 30)],
      [t(10), t(12)],
    ]);
  });

  it('dos tareas a la vez no cuentan doble', () => {
    // 8:00–10:00 y 9:00–10:30 → 2 h 30, no 3 h 30.
    expect(intervalsTotal([[t(8), t(10)], [t(9), t(10, 30)]])).toBe(2.5 * H);
  });

  it('una tarea dentro de otra no suma nada', () => {
    expect(intervalsTotal([[t(8), t(12)], [t(9), t(10)]])).toBe(4 * H);
  });

  it('descarta intervalos vacíos o al revés', () => {
    expect(mergeIntervals([[t(9), t(9)], [t(10), t(9)]])).toEqual([]);
    expect(intervalsTotal([])).toBe(0);
  });
});

describe('intersectIntervals', () => {
  it('deja solo lo que está en ambos', () => {
    const a: Interval[] = [[t(7), t(12)], [t(13), t(17)]];
    const b: Interval[] = [[t(6), t(8)], [t(11), t(14)], [t(16), t(19)]];
    expect(intersectIntervals(a, b)).toEqual([
      [t(7), t(8)],
      [t(11), t(12)],
      [t(13), t(14)],
      [t(16), t(17)],
    ]);
  });

  it('sin cruce, vacío', () => {
    expect(intersectIntervals([[t(7), t(8)]], [[t(9), t(10)]])).toEqual([]);
  });
});

describe('computeOccupancy', () => {
  it('tareas en paralelo dentro de la asistencia', () => {
    // En planta 8:00–12:00 (4 h). Tareas 8:00–10:00 y 9:00–11:00 → ocupado 3 h.
    const occ = computeOccupancy([[t(8), t(12)]], [[t(8), t(10)], [t(9), t(11)]]);
    expect(occ.plantMs).toBe(4 * H);
    expect(occ.busyMs).toBe(3 * H);
    expect(occ.ratio).toBeCloseTo(0.75);
  });

  it('lo trabajado fuera de la asistencia no cuenta', () => {
    // Marcó entrada a las 9:00 pero arrancó la tarea a las 8:00.
    const occ = computeOccupancy([[t(9), t(11)]], [[t(8), t(10)]]);
    expect(occ.busyMs).toBe(1 * H);
    expect(occ.ratio).toBeCloseTo(0.5);
  });

  it('varias marcas de asistencia (salió a almorzar)', () => {
    // 8–12 y 13–17 = 8 h en planta; tarea 11–14 → solo 11–12 y 13–14 cuentan.
    const occ = computeOccupancy([[t(8), t(12)], [t(13), t(17)]], [[t(11), t(14)]]);
    expect(occ.plantMs).toBe(8 * H);
    expect(occ.busyMs).toBe(2 * H);
    expect(occ.ratio).toBeCloseTo(0.25);
  });

  it('nunca pasa del 100 %', () => {
    const occ = computeOccupancy([[t(8), t(10)]], [[t(7), t(11)], [t(8), t(9)]]);
    expect(occ.ratio).toBe(1);
  });

  it('sin asistencia la ocupación es nula, no 0 %', () => {
    expect(computeOccupancy([], [[t(8), t(9)]]).ratio).toBeNull();
  });
});

describe('attendanceIntervals / entryIntervals', () => {
  it('una marca sin salida llega hasta el corte; una tarea en curso, hasta ahora', () => {
    expect(
      attendanceIntervals([{ id: 'a', clockIn: iso(8), clockOut: null }], t(11)),
    ).toEqual([[t(8), t(11)]]);
    expect(entryIntervals([entry({ endAt: null })], t(9, 30))).toEqual([[t(8), t(9, 30)]]);
  });

  it('ignora anulados y registros sin hora', () => {
    expect(
      entryIntervals([entry({ voidedAt: iso(12) }), entry({ startAt: null, hoursWorked: '2' })], t(12)),
    ).toEqual([]);
  });
});

describe('operatorStatus', () => {
  const inPlant = [{ id: 'a', clockIn: iso(7, 55), clockOut: null }];

  it('con tareas en curso: «En N tareas»', () => {
    const status = operatorStatus(
      { attendance: inPlant, entries: [entry({ endAt: null }), entry({ id: 'e2', endAt: null })] },
      t(10),
      true,
    );
    expect(status).toEqual({ kind: 'busy', running: 2 });
  });

  it('sin tarea: cuenta desde que terminó la última y alerta pasados 20 min', () => {
    const entries = [entry({ endAt: iso(10, 15) })];
    expect(operatorStatus({ attendance: inPlant, entries }, t(10, 30), true)).toEqual({
      kind: 'idle',
      idleMs: 15 * MIN,
      alert: false,
    });
    expect(operatorStatus({ attendance: inPlant, entries }, t(10, 47), true)).toEqual({
      kind: 'idle',
      idleMs: 32 * MIN,
      alert: true,
    });
  });

  it('sin ninguna tarea: cuenta desde la entrada', () => {
    const status = operatorStatus({ attendance: inPlant, entries: [] }, t(8, 5), true);
    expect(status).toEqual({ kind: 'idle', idleMs: 10 * MIN, alert: false });
  });

  it('sin marca de entrada', () => {
    expect(operatorStatus({ attendance: [], entries: [] }, t(10), true)).toEqual({ kind: 'no-entry' });
  });

  it('ya salió: muestra la hora de salida', () => {
    const attendance = [{ id: 'a', clockIn: iso(7), clockOut: iso(16, 30) }];
    expect(operatorStatus({ attendance, entries: [] }, t(17), true)).toEqual({ kind: 'left', at: t(16, 30) });
  });

  it('en un día pasado no hay «ahora»: ni en curso ni sin tarea', () => {
    const status = operatorStatus({ attendance: inPlant, entries: [entry({ endAt: null })] }, t(10), false);
    expect(status).toEqual({ kind: 'left', at: null });
  });
});

describe('averageOccupancy', () => {
  it('promedia solo a quienes estuvieron en planta', () => {
    expect(averageOccupancy([0.5, null, 1])).toBeCloseTo(0.75);
    expect(averageOccupancy([null])).toBeNull();
  });
});
