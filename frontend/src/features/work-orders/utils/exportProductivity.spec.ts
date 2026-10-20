import { describe, expect, it } from 'vitest';
import { buildProductivitySheets } from './exportProductivity';
import type { ProductivityReport } from '../../../types/work-order-time.types';

const H = 3_600_000;
const totals = {
  plantMs: 10 * H,
  busyMs: 7.5 * H,
  taskMs: 8 * H,
  extraMs: 0.5 * H,
  occupancy: 0.75,
  workOrders: 2,
  entries: 5,
  closedBySystem: 1,
};

const base: ProductivityReport = {
  from: '2026-10-16',
  to: '2026-10-20',
  workdayEnd: '18:00',
  costs: null,
  totals,
  daily: [{ date: '2026-10-19', plantMs: 10 * H, busyMs: 7.5 * H }],
  areas: [],
  operators: [
    {
      user: { id: 'u1', firstName: 'Carlos', lastName: 'Mejía', cargo: { name: 'Operario', productionArea: { id: 'a', name: 'Plotter' } } },
      daysWorked: 1,
      plantMs: 10 * H,
      busyMs: 7.5 * H,
      taskMs: 8 * H,
      extraMs: 0.5 * H,
      occupancy: 0.75,
      parallel: 8 / 7.5,
      workOrders: [{ id: 'w', workOrderNumber: 'OT-1', ms: 8 * H }],
      machines: [{ id: 'm', name: 'PLOTTER ECOSOLVENTE', ms: 4 * H }],
      quality: { entries: 5, closedBySystem: 1, adjusted: 0, added: 0, voided: 0, unregisteredMs: 2.5 * H, outsideAttendanceMs: 0 },
      days: [],
    },
  ],
  workOrders: [{ id: 'w', workOrderNumber: 'OT-1', client: 'Hotel Mirador', personMs: 7.5 * H, people: 1, days: 1, firstDay: '2026-10-19', lastDay: '2026-10-19' }],
  machines: {
    dailyHours: 10,
    workingDays: 4,
    rows: [{ id: 'm', name: 'PLOTTER ECOSOLVENTE', area: null, useMs: 4 * H, utilization: 0.1, workOrders: 1, operators: 1, hourly: [] }],
    withoutMachineMs: 4 * H,
  },
  previous: { from: '2026-10-11', to: '2026-10-15', totals: { ...totals, plantMs: 0, busyMs: 0, occupancy: null } },
};

const sheet = (name: string, report = base) => buildProductivitySheets(report, 'Sin filtros').find((s) => s.name === name)!;

describe('exportProductivity', () => {
  it('arma una hoja por pestaña', () => {
    expect(buildProductivitySheets(base, 'Sin filtros').map((s) => s.name)).toEqual([
      'Resumen',
      'Operarios',
      'OTs',
      'Máquinas',
      'Calidad del registro',
      'Por día',
    ]);
  });

  it('las horas van como número decimal y los porcentajes de 0 a 100', () => {
    const op = sheet('Operarios').rows[1];
    expect(op).toEqual(['Carlos Mejía', 'Operario', 'Plotter', 1, 10, 7.5, 75, 1.07, 0.5, 1, 'PLOTTER ECOSOLVENTE']);
    expect(sheet('Resumen').rows).toContainEqual(['Ocupación (%)', 75, null]);
    expect(sheet('Máquinas').rows[1]).toEqual(['PLOTTER ECOSOLVENTE', null, 4, 10, 1, 1]);
    expect(sheet('Por día').rows[1]).toEqual(['19/10/2026', 10, 7.5, 75]);
  });

  it('sin permiso de costos no hay columnas de dinero', () => {
    expect(sheet('Operarios').rows[0]).not.toContain('Valor hora (COP)');
    expect(sheet('OTs').rows[0]).not.toContain('Mano de obra (COP)');
  });

  it('con costos agrega las columnas y los parámetros', () => {
    const withCosts: ProductivityReport = {
      ...base,
      costs: { hourlyDivisor: 210, overtimeFactor: 1.25 },
      totals: { ...totals, cost: { periodCost: 300000, laborCost: 75000, costPerProductiveHour: 40000, operatorsWithoutSalary: 0 } },
      operators: [{ ...base.operators[0], cost: { hourlyRate: 9047.6, periodCost: 300000, overtimeCost: 5654.8, costPerProductiveHour: 40000 } }],
      workOrders: [{ ...base.workOrders[0], laborCost: 75000, saleValue: 500000, laborShare: 0.15, costIncomplete: false }],
    };
    expect(sheet('Operarios', withCosts).rows[1].slice(-3)).toEqual([9048, 300000, 40000]);
    expect(sheet('OTs', withCosts).rows[1].slice(-4)).toEqual([75000, 500000, 15, 'No']);
    expect(sheet('Resumen', withCosts).rows).toContainEqual(['Valor hora = salario ÷', 210, 'horas al mes']);
  });
});
