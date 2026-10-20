import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductionReportService } from './production-report.service';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import {
  daysBetween,
  intersectIntervals,
  intervalsTotal,
  mergeIntervals,
  shiftDay,
} from './production-report.util';

const HOUR = 3_600_000;
/** Hora de Bogotá (UTC−5) del día `d` de octubre de 2026. */
const b = (d: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 9, d, hh + 5, mm));

const operator = {
  id: 'u1',
  firstName: 'Carlos',
  lastName: 'Mejía',
  email: null,
  cargo: { name: 'Operario', productionArea: { id: 'a1', name: 'Plotter ecosolvente' } },
  // 2.100.000 / 210 = 10.000 la hora
  payrollEmployee: { employeeType: 'REGULAR', monthlySalary: '2100000', dailyRate: null },
};

const entry = (id: string, start: Date, end: Date | null, extra: Record<string, unknown> = {}) => ({
  id,
  userId: 'u1',
  workOrderId: extra.workOrderId ?? 'ot1',
  startAt: start,
  endAt: end,
  closedBySystem: false,
  adjustedAt: null,
  createdById: null,
  voidedAt: null,
  workOrder: {
    workOrderNumber: extra.workOrderNumber ?? 'OT-2026-0001',
    order: { subtotal: '200000', discountAmount: '0', client: { name: 'Colegio Santa Inés' } },
  },
  machine: null,
  ...extra,
});

describe('production-report.util', () => {
  it('une, suma e intersecta intervalos', () => {
    expect(mergeIntervals([[5, 8], [1, 3], [2, 4]])).toEqual([[1, 4], [5, 8]]);
    expect(intervalsTotal([[0, 10], [5, 15]])).toBe(15);
    expect(intersectIntervals([[0, 10]], [[5, 20]])).toEqual([[5, 10]]);
  });

  it('recorre y corre días', () => {
    expect(daysBetween('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('ProductionReportService', () => {
  let service: ProductionReportService;
  let attendance: { userId: string; clockIn: Date; clockOut: Date | null }[];
  let entries: ReturnType<typeof entry>[];
  const repository = {
    findReportOperators: jest.fn(),
    findAttendanceInRange: jest.fn(),
    findEntriesInRange: jest.fn(),
    roleHasPermission: jest.fn(),
    findActiveMachines: jest.fn(),
  };
  const now = b(20, 11, 0);

  beforeEach(() => {
    attendance = [];
    entries = [];
    repository.findReportOperators.mockResolvedValue([operator]);
    repository.roleHasPermission.mockResolvedValue(false);
    repository.findActiveMachines.mockResolvedValue([
      { id: 'm1', name: 'PLOTTER ECOSOLVENTE', productionArea: { id: 'a1', name: 'Plotter ecosolvente' } },
      { id: 'm2', name: 'CALANDRA', productionArea: { id: 'a2', name: 'Calandra' } },
    ]);
    // Solo lo que cae en el rango pedido, para que el periodo anterior salga vacío.
    repository.findAttendanceInRange.mockImplementation(async (_ids, from: Date, to: Date) =>
      attendance.filter((a) => a.clockIn >= from && a.clockIn <= to),
    );
    repository.findEntriesInRange.mockImplementation(async (_ids, from: Date, to: Date) =>
      entries.filter((e) => e.startAt >= from && e.startAt <= to),
    );
    service = new ProductionReportService(
      repository as unknown as WorkOrderTimeRepository,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('calcula planta, tareas, ocupación, paralelo y lo que quedó fuera de la asistencia', async () => {
    attendance.push({ userId: 'u1', clockIn: b(14, 8), clockOut: b(14, 17) });
    entries.push(
      entry('a', b(14, 8, 30), b(14, 10, 30)),
      entry('b', b(14, 9, 30), b(14, 11), { workOrderId: 'ot2', workOrderNumber: 'OT-2026-0002' }),
      // Olvidada: la cerró el sistema a las 18:30; la asistencia termina a las 17:00.
      entry('c', b(14, 14), b(14, 18, 30), { closedBySystem: true }),
      entry('v', b(14, 12), b(14, 13), { voidedAt: b(14, 13) }),
    );

    const report = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);
    const row = report.operators[0];

    expect(row.plantMs).toBe(9 * HOUR);
    expect(row.busyMs).toBe(5.5 * HOUR); // 8:30–11:00 + 14:00–17:00
    expect(row.taskMs).toBe(6.5 * HOUR); // 2 + 1,5 + 3: el paralelo suma las dos
    expect(row.occupancy).toBeCloseTo(5.5 / 9);
    expect(row.parallel).toBeCloseTo(6.5 / 5.5);
    expect(row.extraMs).toBe(0);
    expect(row.daysWorked).toBe(1);
    expect(row.quality).toEqual({
      entries: 4,
      closedBySystem: 1,
      adjusted: 0,
      added: 0,
      voided: 1,
      unregisteredMs: 3.5 * HOUR,
      outsideAttendanceMs: 1.5 * HOUR,
    });
    expect(row.workOrders.map((o) => o.workOrderNumber)).toEqual(['OT-2026-0001', 'OT-2026-0002']);
    expect(report.totals.workOrders).toBe(2);
    expect(report.totals.closedBySystem).toBe(1);
    expect(report.daily).toEqual([{ date: '2026-10-14', plantMs: 9 * HOUR, busyMs: 5.5 * HOUR }]);
    expect(report.areas).toEqual([{ id: 'a1', name: 'Plotter ecosolvente', plantMs: 9 * HOUR, busyMs: 5.5 * HOUR }]);
  });

  it('las horas en tareas después de las 18:00 son horas extra', async () => {
    attendance.push({ userId: 'u1', clockIn: b(14, 8), clockOut: b(14, 19, 30) });
    entries.push(entry('a', b(14, 17), b(14, 19)));

    const { operators } = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);

    expect(operators[0].extraMs).toBe(1 * HOUR);
  });

  it('hoy, la asistencia abierta y la tarea en curso llegan hasta ahora', async () => {
    attendance.push({ userId: 'u1', clockIn: b(20, 8), clockOut: null });
    entries.push(entry('a', b(20, 9), null));

    const { operators } = await service.getReport({ from: '2026-10-20', to: '2026-10-20' }, 'role', now);

    expect(operators[0].plantMs).toBe(3 * HOUR); // 8:00 → 11:00
    expect(operators[0].busyMs).toBe(2 * HOUR); // 9:00 → 11:00
  });

  it('un día pasado con la salida sin marcar llega hasta el cierre de la jornada', async () => {
    attendance.push({ userId: 'u1', clockIn: b(14, 8), clockOut: null });

    const { operators } = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);

    expect(operators[0].plantMs).toBe(10 * HOUR); // 8:00 → 18:00
  });

  it('trae los totales del periodo anterior de la misma duración', async () => {
    attendance.push(
      { userId: 'u1', clockIn: b(14, 8), clockOut: b(14, 12) },
      { userId: 'u1', clockIn: b(12, 8), clockOut: b(12, 10) },
    );

    const report = await service.getReport({ from: '2026-10-13', to: '2026-10-14' }, 'role', now);

    expect(report.previous.from).toBe('2026-10-11');
    expect(report.previous.to).toBe('2026-10-12');
    expect(report.totals.plantMs).toBe(4 * HOUR);
    expect(report.previous.totals.plantMs).toBe(2 * HOUR);
  });

  it('pasa los filtros a las consultas', async () => {
    await service.getReport({ from: '2026-10-14', to: '2026-10-14', areaId: 'a1', userId: 'u1', machineId: 'm1' }, 'role', now);

    expect(repository.findReportOperators).toHaveBeenCalledWith(
      expect.objectContaining({ areaId: 'a1', userId: 'u1' }),
    );
    expect(repository.findEntriesInRange).toHaveBeenCalledWith(['u1'], expect.any(Date), expect.any(Date), 'm1');
  });

  describe('costos', () => {
    const day14 = () => {
      attendance.push({ userId: 'u1', clockIn: b(14, 8), clockOut: b(14, 17) });
      entries.push(
        entry('a', b(14, 8, 30), b(14, 10, 30)),
        entry('b', b(14, 9, 30), b(14, 11), { workOrderId: 'ot2', workOrderNumber: 'OT-2026-0002' }),
        entry('c', b(14, 14), b(14, 18, 30), { closedBySystem: true }),
      );
    };

    it('sin el permiso no viajan ni el salario ni los costos', async () => {
      day14();
      const report = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);

      expect(report.costs).toBeNull();
      expect(report.totals.cost).toBeUndefined();
      expect(report.operators[0]).not.toHaveProperty('cost');
      expect(report.operators[0].user).not.toHaveProperty('payrollEmployee');
      expect(report.workOrders[0]).not.toHaveProperty('laborCost');
      // El tiempo prorrateado por OT sí se ve.
      expect(report.workOrders.map((w) => [w.workOrderNumber, w.personMs])).toEqual([
        ['OT-2026-0001', 4.5 * HOUR],
        ['OT-2026-0002', 1 * HOUR],
      ]);
    });

    it('con el permiso: valor hora, costo del periodo y costo por hora productiva', async () => {
      repository.roleHasPermission.mockResolvedValue(true);
      day14();
      const report = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);
      const cost = (report.operators[0] as { cost: Record<string, number> }).cost;

      expect(report.costs).toEqual({ hourlyDivisor: 210, overtimeFactor: 1.25 });
      expect(cost.hourlyRate).toBe(10_000);
      expect(cost.periodCost).toBeCloseTo(70_000); // 2.100.000 × 1 día ÷ 30
      expect(cost.costPerProductiveHour).toBeCloseTo(70_000 / 5.5);
      expect(report.operators[0].user).not.toHaveProperty('payrollEmployee');
    });

    it('la mano de obra de la OT se prorratea: dos tareas a la vez se reparten la hora', async () => {
      repository.roleHasPermission.mockResolvedValue(true);
      day14();
      const report = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);
      const [ot1, ot2] = report.workOrders as {
        laborCost: number;
        laborShare: number;
        saleValue: number;
        people: number;
      }[];

      // ot1: 8:30–9:30 sola, 9:30–10:30 a medias, 14:00–17:00 (lo de después de la salida no cuenta) = 4,5 h
      expect(ot1.laborCost).toBeCloseTo(45_000);
      expect(ot1.saleValue).toBe(200_000);
      expect(ot1.laborShare).toBeCloseTo(0.225);
      // ot2: 9:30–10:30 a medias + 10:30–11:00 = 1 h
      expect(ot2.laborCost).toBeCloseTo(10_000);
      // El total cuadra con las horas en tareas: no se cobra dos veces la misma hora.
      expect(report.totals.cost!.laborCost).toBeCloseTo(55_000);
    });

    it('la hora extra se cobra con recargo en el periodo y en la OT', async () => {
      repository.roleHasPermission.mockResolvedValue(true);
      attendance.push({ userId: 'u1', clockIn: b(14, 8), clockOut: b(14, 19, 30) });
      entries.push(entry('a', b(14, 17), b(14, 19)));

      const report = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);
      const cost = (report.operators[0] as { cost: Record<string, number> }).cost;

      expect(cost.overtimeCost).toBeCloseTo(12_500); // 1 h × 10.000 × 1,25
      expect((report.workOrders[0] as { laborCost: number }).laborCost).toBeCloseTo(22_500); // 10.000 + 12.500
    });

    it('un temporal usa la tarifa diaria por día trabajado', async () => {
      repository.roleHasPermission.mockResolvedValue(true);
      repository.findReportOperators.mockResolvedValue([
        { ...operator, payrollEmployee: { employeeType: 'TEMPORARY', monthlySalary: null, dailyRate: '70000' } },
      ]);
      day14();
      const report = await service.getReport({ from: '2026-10-13', to: '2026-10-14' }, 'role', now);
      const cost = (report.operators[0] as { cost: Record<string, number> }).cost;

      expect(cost.hourlyRate).toBe(10_000); // 70.000 ÷ 7 h
      expect(cost.periodCost).toBeCloseTo(70_000); // un solo día trabajado
    });

    it('sin salario registrado no hay costo y se cuenta como faltante', async () => {
      repository.roleHasPermission.mockResolvedValue(true);
      repository.findReportOperators.mockResolvedValue([{ ...operator, payrollEmployee: null }]);
      day14();
      const report = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);

      expect((report.operators[0] as { cost: unknown }).cost).toBeNull();
      expect(report.totals.cost!.operatorsWithoutSalary).toBe(1);
      // Nadie de la OT tiene salario: sin costo, no $0.
      expect(report.workOrders[0]).toMatchObject({ costIncomplete: true, laborCost: null, laborShare: null });
    });
  });

  it('rechaza un rango al revés o de más de 92 días', async () => {
    await expect(service.getReport({ from: '2026-10-15', to: '2026-10-01' }, 'role', now)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getReport({ from: '2026-01-01', to: '2026-10-01' }, 'role', now)).rejects.toThrow('92 días');
  });

  describe('máquinas', () => {
    const plotter = { id: 'm1', name: 'PLOTTER ECOSOLVENTE' };

    it('el uso es la unión de sus tareas, y aparecen también las que nadie usó', async () => {
      const other = { ...operator, id: 'u2' };
      repository.findReportOperators.mockResolvedValue([operator, other]);
      entries.push(
        entry('a', b(14, 8), b(14, 10), { machine: plotter }),
        // Otro operario en la misma máquina, solapado: no la usa el doble.
        { ...entry('b', b(14, 9), b(14, 11), { machine: plotter }), userId: 'u2', workOrderId: 'ot2' },
        entry('c', b(14, 14), b(14, 15)), // sin máquina
      );

      const { machines } = await service.getReport({ from: '2026-10-14', to: '2026-10-14' }, 'role', now);

      expect(machines.workingDays).toBe(1);
      expect(machines.dailyHours).toBe(10);
      expect(machines.rows.map((m) => [m.name, m.useMs, m.operators, m.workOrders])).toEqual([
        ['PLOTTER ECOSOLVENTE', 3 * HOUR, 2, 2],
        ['CALANDRA', 0, 0, 0],
      ]);
      expect(machines.rows[0].utilization).toBeCloseTo(0.3); // 3 h de 10
      expect(machines.rows[0].hourly.slice(8, 11)).toEqual([HOUR, HOUR, HOUR]);
      expect(machines.withoutMachineMs).toBe(1 * HOUR);
    });

    it('los domingos no cuentan como día hábil de la máquina', async () => {
      const { machines } = await service.getReport({ from: '2026-10-17', to: '2026-10-19' }, 'role', now);
      expect(machines.workingDays).toBe(2); // sábado 17 y lunes 19
    });

    it('con filtro de área solo muestra las máquinas de esa área (y las que se usaron)', async () => {
      const { machines } = await service.getReport(
        { from: '2026-10-14', to: '2026-10-14', areaId: 'a1' },
        'role',
        now,
      );
      expect(machines.rows.map((m) => m.name)).toEqual(['PLOTTER ECOSOLVENTE']);
    });
  });
});
