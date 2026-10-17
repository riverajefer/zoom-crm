import { describe, expect, it } from 'vitest';
import {
  activityDays,
  assignLanes,
  barGeometry,
  buildAxis,
  entryDurationSeconds,
  formatDuration,
  formatTimer,
  isRunning,
  minutesUntil,
  needsReview,
  positionPercent,
} from './timeline';
import { WorkOrderTimeEntryType, type WorkOrderTimeEntry } from '../../../types/work-order.types';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();

const entry = (overrides: Partial<WorkOrderTimeEntry> = {}): WorkOrderTimeEntry => ({
  id: 'e1',
  workOrderId: 'wo1',
  entryType: WorkOrderTimeEntryType.TIMER,
  workedDate: '2026-10-17T00:00:00.000Z',
  hoursWorked: null,
  startAt: at(17, 8),
  endAt: at(17, 10),
  closedBySystem: false,
  createdAt: at(17, 8),
  updatedAt: at(17, 8),
  user: { id: 'u1', firstName: 'Carlos', lastName: 'Mejía' },
  ...overrides,
});

describe('timeline utils', () => {
  it('formatea duración y cronómetro', () => {
    expect(formatDuration(32 * 60)).toBe('32 min');
    expect(formatDuration(65 * 60)).toBe('1 h 05 min');
    expect(formatTimer(29 * 60 + 13)).toBe('00:29:13');
  });

  it('una tarea sin fin está en curso y se mide hasta ahora', () => {
    const running = entry({ endAt: null });
    expect(isRunning(running)).toBe(true);
    expect(entryDurationSeconds(running, new Date(at(17, 8, 30)).getTime())).toBe(30 * 60);
    expect(isRunning(entry({ endAt: null, voidedAt: at(17, 9) }))).toBe(false);
  });

  it('un registro heredado por cantidad usa hoursWorked', () => {
    const legacy = entry({ entryType: WorkOrderTimeEntryType.HOURS, startAt: null, endAt: null, hoursWorked: '1.5' });
    expect(entryDurationSeconds(legacy)).toBe(5400);
    expect(activityDays([legacy])).toEqual([]);
  });

  it('pide revisión solo si la cerró el sistema y nadie la revisó', () => {
    expect(needsReview(entry({ closedBySystem: true }))).toBe(true);
    expect(needsReview(entry({ closedBySystem: true, reviewedAt: at(18, 8) }))).toBe(false);
  });

  it('ubica las barras en un eje de 6:00 a 20:00', () => {
    const axis = buildAxis(['2026-10-17'], []);
    expect(axis).toEqual({ days: ['2026-10-17'], fromHour: 6, toHour: 20 });
    expect(positionPercent(at(17, 13), axis)).toBe(50);
    expect(positionPercent(at(16, 13), axis)).toBeNull();
    expect(barGeometry(entry(), axis)).toEqual({ left: (2 / 14) * 100, width: (2 / 14) * 100 });
  });

  it('amplía el eje si una tarea termina después de las 20:00', () => {
    const late = entry({ startAt: at(17, 19), endAt: at(17, 21, 30) });
    expect(buildAxis(['2026-10-17'], [late]).toHour).toBe(22);
  });

  it('con varios días, cada día ocupa su tramo', () => {
    const axis = buildAxis(['2026-10-16', '2026-10-17'], []);
    expect(positionPercent(at(16, 6), axis)).toBe(0);
    expect(positionPercent(at(17, 6), axis)).toBe(50);
  });

  it('dos tareas solapadas van en carriles distintos', () => {
    const a = entry({ id: 'a', startAt: at(17, 8), endAt: at(17, 10) });
    const b = entry({ id: 'b', startAt: at(17, 9), endAt: at(17, 11) });
    const c = entry({ id: 'c', startAt: at(17, 10), endAt: at(17, 12) });
    const { laned, laneCount } = assignLanes([c, b, a]);
    expect(laneCount).toBe(2);
    expect(laned.map((l) => [l.entry.id, l.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ]);
  });

  it('calcula los minutos que faltan para el cierre', () => {
    expect(minutesUntil('18:00', new Date(2026, 9, 17, 17, 40))).toBe(20);
    expect(minutesUntil('18:00', new Date(2026, 9, 17, 18, 10))).toBe(-10);
  });
});
