import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  confidenceLevel,
  heatmapCells,
  heatmapHours,
  msLabel,
  presetRange,
  relativeChange,
} from './productivity';
import type { ProductivityOperatorRow, ProductivityReport } from '../../../types/work-order-time.types';

const H = 3_600_000;
const at = (hh: number, mm = 0) => new Date(2026, 9, 14, hh, mm).getTime();

const quality = (over: Partial<ProductivityOperatorRow['quality']> = {}): ProductivityOperatorRow['quality'] => ({
  entries: 20,
  closedBySystem: 0,
  adjusted: 0,
  added: 0,
  voided: 0,
  unregisteredMs: 0,
  outsideAttendanceMs: 0,
  ...over,
});

const row = (id: string, name: string, plantH: number, busyH: number, q = quality()): ProductivityOperatorRow => ({
  user: { id, firstName: name },
  daysWorked: 1,
  plantMs: plantH * H,
  busyMs: busyH * H,
  taskMs: busyH * H,
  extraMs: 0,
  occupancy: plantH ? busyH / plantH : null,
  parallel: 1,
  workOrders: [],
  machines: [],
  quality: q,
  days: [],
});

const totals = (occupancy: number | null) => ({
  plantMs: 0,
  busyMs: 0,
  taskMs: 0,
  extraMs: 0,
  occupancy,
  workOrders: 0,
  entries: 0,
  closedBySystem: 0,
});

const report = (operators: ProductivityOperatorRow[], occ: number, prevOcc: number | null): ProductivityReport => ({
  from: '2026-10-01',
  to: '2026-10-15',
  workdayEnd: '18:00',
  totals: totals(occ),
  daily: [],
  areas: [],
  operators,
  previous: { from: '2026-09-16', to: '2026-09-30', totals: totals(prevOcc) },
});

describe('productivity utils', () => {
  it('las quincenas siguen la nómina: 1–15 y 16–fin de mes', () => {
    expect(presetRange('fortnight', new Date(2026, 9, 20))).toEqual({ from: '2026-10-16', to: '2026-10-20' });
    expect(presetRange('previous-fortnight', new Date(2026, 9, 20))).toEqual({ from: '2026-10-01', to: '2026-10-15' });
    expect(presetRange('previous-fortnight', new Date(2026, 9, 5))).toEqual({ from: '2026-09-16', to: '2026-09-30' });
    expect(presetRange('week', new Date(2026, 9, 21))).toEqual({ from: '2026-10-19', to: '2026-10-21' });
    expect(presetRange('last-30', new Date(2026, 9, 30))).toEqual({ from: '2026-10-01', to: '2026-10-30' });
  });

  it('formatea duraciones y cambios', () => {
    expect(msLabel(96 * H + 17 * 60_000)).toBe('96 h 17 min');
    expect(msLabel(45 * 60_000)).toBe('45 min');
    expect(msLabel(0)).toBe('0 h');
    expect(relativeChange(110, 100)).toBeCloseTo(0.1);
    expect(relativeChange(10, 0)).toBeNull();
  });

  it('niveles de confianza', () => {
    expect(confidenceLevel(quality())).toBe('high');
    expect(confidenceLevel(quality({ closedBySystem: 2 }))).toBe('medium'); // 10 %
    expect(confidenceLevel(quality({ closedBySystem: 3 }))).toBe('low'); // 15 %
    expect(confidenceLevel(quality({ voided: 3 }))).toBe('low');
  });

  it('arma los hallazgos del periodo', () => {
    const r = report(
      [
        row('a', 'Carlos', 8, 7),
        row('b', 'Mateo', 8, 4, quality({ closedBySystem: 4 })),
        row('c', 'Diana', 8, 6, quality({ outsideAttendanceMs: 2 * H })),
      ],
      0.7,
      0.6,
    );
    const texts = buildInsights(r).map((i) => i.text);
    expect(texts[0]).toContain('Mateo tiene la ocupación más baja (50 %)');
    expect(texts[1]).toContain('Mateo olvida finalizar: el sistema cerró 4 de 20');
    expect(texts[2]).toContain('Diana tiene 2 h de tareas fuera de su asistencia');
    expect(texts[3]).toContain('subió 10 puntos');
  });

  it('calcula las celdas del mapa de calor por hora', () => {
    const cells = heatmapCells('2026-10-14', [[at(8), at(10)]], [[at(8, 30), at(9)]], 8, 10);
    expect(cells).toEqual([
      { hour: 8, plantMs: H, busyMs: 0.5 * H },
      { hour: 9, plantMs: H, busyMs: 0 },
    ]);
    expect(heatmapHours([{ attendance: [[at(5, 45), at(20, 30)]] }])).toEqual({ from: 5, to: 21 });
  });
});
