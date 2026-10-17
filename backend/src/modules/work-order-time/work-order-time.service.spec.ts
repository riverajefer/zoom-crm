import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkOrderTimeService } from './work-order-time.service';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import { PrismaService } from '../../database/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';
import { WorkOrderStatus, WorkOrderTimeEntryType } from '../../generated/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const OPERATOR = 'user-operario';
const SUPERVISOR = 'user-supervisor';

const trackableWorkOrder = {
  id: 'wo-1',
  status: WorkOrderStatus.IN_PRODUCTION,
  order: { status: 'IN_PRODUCTION' },
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  workOrderId: 'wo-1',
  workOrderItemId: 'woi-1',
  machineId: null,
  userId: OPERATOR,
  user: { id: OPERATOR, firstName: 'Carlos', lastName: 'Mejía', email: null },
  entryType: WorkOrderTimeEntryType.TIMER,
  startAt: hoursAgo(2),
  endAt: null,
  notes: 'Impresión',
  extendedAt: null,
  closedBySystem: false,
  reviewedAt: null,
  adjustedAt: null,
  originalStartAt: null,
  originalEndAt: null,
  voidedAt: null,
  ...overrides,
});

const mockRepository = {
  findWorkOrder: jest.fn(),
  findWorkOrderItem: jest.fn(),
  findMachine: jest.fn(),
  findUser: jest.fn(),
  findById: jest.fn(),
  findRunningByUser: jest.fn(),
  countRunningByUser: jest.fn(),
  findRunningTask: jest.fn(),
  findRunningToClose: jest.fn(),
  findPendingReview: jest.fn(),
  findOperators: jest.fn(),
  findPlantOperators: jest.fn(),
  findAttendanceForDay: jest.fn(),
  findEntriesForDay: jest.fn(),
  findActiveMachines: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  closeIfRunning: jest.fn(),
  extendIfRunning: jest.fn(),
};

describe('WorkOrderTimeService', () => {
  let service: WorkOrderTimeService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrderTimeService,
        { provide: WorkOrderTimeRepository, useValue: mockRepository },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    service = module.get(WorkOrderTimeService);

    mockRepository.findWorkOrder.mockResolvedValue(trackableWorkOrder);
    mockRepository.findWorkOrderItem.mockResolvedValue({ id: 'woi-1' });
    mockRepository.findMachine.mockResolvedValue({ id: 'machine-1', isActive: true });
    mockRepository.findRunningTask.mockResolvedValue(null);
    mockRepository.countRunningByUser.mockResolvedValue(0);
    mockRepository.create.mockImplementation(async (data) => ({ id: 'new-entry', ...data }));
    mockRepository.update.mockImplementation(async (id, data) => ({ id, ...data }));
    mockRepository.closeIfRunning.mockResolvedValue(1);
    mockRepository.extendIfRunning.mockResolvedValue(1);
    // Quien corrige no es admin, salvo que el test diga otra cosa.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'supervisor' } });
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────
  // getSchedule
  // ─────────────────────────────────────────
  describe('getSchedule', () => {
    it('la jornada de producción termina a las 18:00 por defecto', () => {
      expect(service.getSchedule()).toEqual({
        workdayEnd: '18:00',
        overtimeCap: '23:59',
        warningMinutes: 30,
        maxRunningTasks: 3,
      });
    });
  });

  // ─────────────────────────────────────────
  // start
  // ─────────────────────────────────────────
  describe('start', () => {
    const dto = { workOrderId: 'wo-1', workOrderItemId: 'woi-1', machineId: 'machine-1', notes: '  Laminado ' };

    it('crea una tarea TIMER con la hora del servidor', async () => {
      const before = Date.now();
      await service.start(dto, OPERATOR);

      const data = mockRepository.create.mock.calls[0][0];
      expect(data).toMatchObject({
        workOrderId: 'wo-1',
        workOrderItemId: 'woi-1',
        machineId: 'machine-1',
        userId: OPERATOR,
        entryType: WorkOrderTimeEntryType.TIMER,
        notes: 'Laminado',
      });
      expect(data.startAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(data.endAt).toBeUndefined();
    });

    it('rechaza una OT en borrador', async () => {
      mockRepository.findWorkOrder.mockResolvedValue({ ...trackableWorkOrder, status: WorkOrderStatus.DRAFT });
      await expect(service.start(dto, OPERATOR)).rejects.toThrow(BadRequestException);
    });

    it('rechaza una OT cuya OP está anulada', async () => {
      mockRepository.findWorkOrder.mockResolvedValue({ ...trackableWorkOrder, order: { status: 'ANULADO' } });
      await expect(service.start(dto, OPERATOR)).rejects.toThrow('anulada');
    });

    it('rechaza un ítem que no es de la OT', async () => {
      mockRepository.findWorkOrderItem.mockResolvedValue(null);
      await expect(service.start(dto, OPERATOR)).rejects.toThrow(NotFoundException);
    });

    it('rechaza una máquina desactivada', async () => {
      mockRepository.findMachine.mockResolvedValue({ id: 'machine-1', isActive: false });
      await expect(service.start(dto, OPERATOR)).rejects.toThrow('desactivada');
    });

    it('si la tarea ya está en curso la devuelve en vez de crear otra (doble toque)', async () => {
      mockRepository.findRunningTask.mockResolvedValue({ id: 'entry-1' });
      mockRepository.findById.mockResolvedValue(makeEntry());

      const result = await service.start(dto, OPERATOR);

      expect(result).toMatchObject({ id: 'entry-1' });
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('no deja pasar de 3 tareas en curso', async () => {
      mockRepository.countRunningByUser.mockResolvedValue(3);
      await expect(service.start(dto, OPERATOR)).rejects.toThrow('Ya tienes 3 tareas en curso');
    });

    it('si pierde la carrera contra el índice único devuelve la tarea gemela', async () => {
      mockRepository.create.mockRejectedValue({
        code: 'P2002',
        meta: { driverAdapterError: { cause: { constraint: 'work_order_time_entries_running_unique' } } },
      });
      mockRepository.findRunningTask.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'twin' });
      mockRepository.findById.mockResolvedValue(makeEntry({ id: 'twin' }));

      await expect(service.start(dto, OPERATOR)).resolves.toMatchObject({ id: 'twin' });
    });

    it('una tarea general de la OT va sin ítem', async () => {
      await service.start({ workOrderId: 'wo-1' }, OPERATOR);
      expect(mockRepository.findRunningTask).toHaveBeenCalledWith(OPERATOR, 'wo-1', null);
      expect(mockRepository.create.mock.calls[0][0].workOrderItemId).toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // stop / extend
  // ─────────────────────────────────────────
  describe('stop', () => {
    it('cierra la tarea con la hora del servidor y calcula las horas', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry({ startAt: hoursAgo(1.5) }));

      await service.stop('entry-1', OPERATOR);

      const [, data] = mockRepository.closeIfRunning.mock.calls[0];
      expect(Number(data.hoursWorked.toString())).toBeCloseTo(1.5, 1);
      expect(data.closedBySystem).toBeUndefined();
    });

    it('no deja finalizar la tarea de otra persona', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry());
      await expect(service.stop('entry-1', 'otro')).rejects.toThrow(ForbiddenException);
    });

    it('si ya estaba finalizada la devuelve sin tocarla', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry({ endAt: new Date() }));
      await service.stop('entry-1', OPERATOR);
      expect(mockRepository.closeIfRunning).not.toHaveBeenCalled();
    });

    it('404 si el registro no existe', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(service.stop('nope', OPERATOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('extend', () => {
    it('marca la tarea como extendida', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry());
      await service.extend('entry-1', OPERATOR);
      expect(mockRepository.extendIfRunning).toHaveBeenCalledWith('entry-1', expect.any(Date));
    });

    it('no se puede extender una tarea finalizada', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry({ endAt: new Date() }));
      await expect(service.extend('entry-1', OPERATOR)).rejects.toThrow(BadRequestException);
    });

    it('no se puede extender la tarea de otra persona', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry());
      await expect(service.extend('entry-1', 'otro')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────
  // adjust
  // ─────────────────────────────────────────
  describe('adjust', () => {
    const closed = () => makeEntry({ startAt: hoursAgo(5), endAt: hoursAgo(3) });

    it('guarda el valor original la primera vez y recalcula las horas', async () => {
      const entry = closed();
      mockRepository.findById.mockResolvedValue(entry);
      const startAt = hoursAgo(4).toISOString();

      await service.adjust('entry-1', { startAt, reason: 'Inició más tarde' }, SUPERVISOR);

      const [, data] = mockRepository.update.mock.calls[0];
      expect(data.originalStartAt).toEqual(entry.startAt);
      expect(data.originalEndAt).toEqual(entry.endAt);
      expect(data.adjustedById).toBe(SUPERVISOR);
      expect(data.adjustReason).toBe('Inició más tarde');
      expect(Number(data.hoursWorked.toString())).toBeCloseTo(1, 1);
    });

    it('en un segundo ajuste no pisa el valor original', async () => {
      mockRepository.findById.mockResolvedValue({ ...closed(), adjustedAt: new Date() });
      await service.adjust('entry-1', { startAt: hoursAgo(4).toISOString(), reason: 'Otro ajuste' }, SUPERVISOR);
      const [, data] = mockRepository.update.mock.calls[0];
      expect(data).not.toHaveProperty('originalStartAt');
    });

    it('una tarea cerrada por el sistema queda revisada al ajustarla', async () => {
      mockRepository.findById.mockResolvedValue({ ...closed(), closedBySystem: true });
      await service.adjust('entry-1', { endAt: hoursAgo(4).toISOString(), reason: 'Terminó antes' }, SUPERVISOR);
      const [, data] = mockRepository.update.mock.calls[0];
      expect(data.reviewedById).toBe(SUPERVISOR);
    });

    it('no deja que un supervisor ajuste sus propias horas', async () => {
      mockRepository.findById.mockResolvedValue({ ...closed(), user: { id: SUPERVISOR } });
      await expect(
        service.adjust('entry-1', { endAt: hoursAgo(4).toISOString(), reason: 'Mis horas' }, SUPERVISOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('el admin sí puede ajustar sus propias horas', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'admin' } });
      mockRepository.findById.mockResolvedValue({ ...closed(), user: { id: SUPERVISOR } });
      await expect(
        service.adjust('entry-1', { endAt: hoursAgo(4).toISOString(), reason: 'Mis horas' }, SUPERVISOR),
      ).resolves.toBeDefined();
    });

    it('rechaza un fin anterior al inicio', async () => {
      mockRepository.findById.mockResolvedValue(closed());
      await expect(
        service.adjust('entry-1', { endAt: hoursAgo(6).toISOString(), reason: 'Error de fin' }, SUPERVISOR),
      ).rejects.toThrow('El fin tiene que ser después del inicio.');
    });

    it('rechaza una hora en el futuro', async () => {
      mockRepository.findById.mockResolvedValue(closed());
      await expect(
        service.adjust('entry-1', { endAt: new Date(Date.now() + 3_600_000).toISOString(), reason: 'Futuro' }, SUPERVISOR),
      ).rejects.toThrow('todavía no ha pasado');
    });

    it('rechaza un registro de más de 24 horas', async () => {
      mockRepository.findById.mockResolvedValue(closed());
      await expect(
        service.adjust('entry-1', { startAt: hoursAgo(30).toISOString(), reason: 'Muy largo' }, SUPERVISOR),
      ).rejects.toThrow('más de 24 horas');
    });

    it('rechaza un ajuste sin cambios', async () => {
      const entry = closed();
      mockRepository.findById.mockResolvedValue(entry);
      await expect(
        service.adjust('entry-1', { startAt: entry.startAt.toISOString(), reason: 'Nada cambió' }, SUPERVISOR),
      ).rejects.toThrow('No hay cambios');
    });

    it('una tarea en curso sigue en curso si no se le da fin', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry());
      await service.adjust('entry-1', { startAt: hoursAgo(1).toISOString(), reason: 'Inicio real' }, SUPERVISOR);
      const [, data] = mockRepository.update.mock.calls[0];
      expect(data.endAt).toBeNull();
      expect(data.hoursWorked).toBeNull();
    });

    it('un registro por cantidad de horas pide inicio y fin y pasa a rango', async () => {
      mockRepository.findById.mockResolvedValue(
        makeEntry({ entryType: WorkOrderTimeEntryType.HOURS, startAt: null, endAt: null }),
      );
      await expect(
        service.adjust('entry-1', { startAt: hoursAgo(3).toISOString(), reason: 'Solo inicio' }, SUPERVISOR),
      ).rejects.toThrow('indica el inicio y el fin');

      await service.adjust(
        'entry-1',
        { startAt: hoursAgo(3).toISOString(), endAt: hoursAgo(2).toISOString(), reason: 'Rango real' },
        SUPERVISOR,
      );
      expect(mockRepository.update.mock.calls[0][1].entryType).toBe(WorkOrderTimeEntryType.RANGE);
    });

    it('no se ajusta un registro anulado', async () => {
      mockRepository.findById.mockResolvedValue({ ...closed(), voidedAt: new Date() });
      await expect(
        service.adjust('entry-1', { endAt: hoursAgo(4).toISOString(), reason: 'Anulado' }, SUPERVISOR),
      ).rejects.toThrow('anulado');
    });
  });

  // ─────────────────────────────────────────
  // void / review / manual
  // ─────────────────────────────────────────
  describe('void', () => {
    it('anula y, si estaba en curso, la cierra', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry());
      await service.void('entry-1', { reason: 'OT equivocada' }, SUPERVISOR);
      const [, data] = mockRepository.update.mock.calls[0];
      expect(data.voidedById).toBe(SUPERVISOR);
      expect(data.voidReason).toBe('OT equivocada');
      expect(data.endAt).toBeInstanceOf(Date);
    });

    it('no anula dos veces', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry({ voidedAt: new Date() }));
      await expect(service.void('entry-1', { reason: 'De nuevo' }, SUPERVISOR)).rejects.toThrow('ya está anulado');
    });
  });

  describe('markReviewed', () => {
    it('solo aplica a tareas que cerró el sistema', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry({ endAt: new Date() }));
      await expect(service.markReviewed('entry-1', SUPERVISOR)).rejects.toThrow(BadRequestException);
    });

    it('marca la revisión con quien la hizo', async () => {
      mockRepository.findById.mockResolvedValue(makeEntry({ endAt: new Date(), closedBySystem: true }));
      await service.markReviewed('entry-1', SUPERVISOR);
      expect(mockRepository.update.mock.calls[0][1].reviewedById).toBe(SUPERVISOR);
    });
  });

  describe('createManual', () => {
    const dto = {
      workOrderId: 'wo-1',
      userId: OPERATOR,
      workOrderItemId: 'woi-1',
      startAt: hoursAgo(5).toISOString(),
      endAt: hoursAgo(4).toISOString(),
      reason: 'La tablet estaba descargada',
    };

    beforeEach(() => mockRepository.findUser.mockResolvedValue({ id: OPERATOR, isActive: true }));

    it('crea un rango marcado como agregado por el supervisor', async () => {
      await service.createManual(dto, SUPERVISOR);
      const data = mockRepository.create.mock.calls[0][0];
      expect(data).toMatchObject({
        entryType: WorkOrderTimeEntryType.RANGE,
        userId: OPERATOR,
        createdById: SUPERVISOR,
        adjustReason: 'La tablet estaba descargada',
      });
      expect(Number(data.hoursWorked.toString())).toBe(1);
    });

    it('un supervisor no se agrega horas a sí mismo', async () => {
      mockRepository.findUser.mockResolvedValue({ id: SUPERVISOR, isActive: true });
      await expect(service.createManual({ ...dto, userId: SUPERVISOR }, SUPERVISOR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permite agregar horas olvidadas a una OT ya completada', async () => {
      mockRepository.findWorkOrder.mockResolvedValue({ ...trackableWorkOrder, status: WorkOrderStatus.COMPLETED });
      await expect(service.createManual(dto, SUPERVISOR)).resolves.toBeDefined();
    });

    it('rechaza un operario inactivo', async () => {
      mockRepository.findUser.mockResolvedValue({ id: OPERATOR, isActive: false });
      await expect(service.createManual(dto, SUPERVISOR)).rejects.toThrow('inactivo');
    });
  });

  // ─────────────────────────────────────────
  // closeRunningTasks
  // ─────────────────────────────────────────
  describe('closeRunningTasks', () => {
    it('al fin de la jornada solo busca las no extendidas y las marca como cerradas por el sistema', async () => {
      mockRepository.findRunningToClose.mockResolvedValue([
        { id: 'a', startAt: hoursAgo(3) },
        { id: 'b', startAt: hoursAgo(1) },
      ]);

      const closed = await service.closeRunningTasks(false);

      expect(mockRepository.findRunningToClose).toHaveBeenCalledWith(false);
      expect(closed).toBe(2);
      expect(mockRepository.closeIfRunning.mock.calls[0][1].closedBySystem).toBe(true);
    });

    it('no cuenta las que otra petición ya cerró', async () => {
      mockRepository.findRunningToClose.mockResolvedValue([{ id: 'a', startAt: hoursAgo(3) }]);
      mockRepository.closeIfRunning.mockResolvedValue(0);
      await expect(service.closeRunningTasks(true)).resolves.toBe(0);
    });

    it('una tarea de un día anterior se cierra al final de su día, no hoy', async () => {
      const startAt = hoursAgo(40);
      mockRepository.findRunningToClose.mockResolvedValue([{ id: 'a', startAt }]);

      await service.closeRunningTasks(true);

      const [, data] = mockRepository.closeIfRunning.mock.calls[0];
      expect(data.endAt.getTime()).toBeLessThan(Date.now() - 12 * 3_600_000);
    });

    it('si una falla sigue con las demás', async () => {
      mockRepository.findRunningToClose.mockResolvedValue([
        { id: 'a', startAt: hoursAgo(3) },
        { id: 'b', startAt: hoursAgo(2) },
      ]);
      mockRepository.closeIfRunning.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(1);
      await expect(service.closeRunningTasks(false)).resolves.toBe(1);
    });
  });

  // ─────────────────────────────────────────
  // findPlant («Planta hoy»)
  // ─────────────────────────────────────────
  describe('findPlant', () => {
    const carlos = { id: 'u-carlos', firstName: 'Carlos', lastName: 'Mejía', email: null, cargo: null };
    const paola = { id: 'u-paola', firstName: 'Paola', lastName: 'Díaz', email: null, cargo: { name: 'DTF' } };

    beforeEach(() => {
      mockRepository.findPlantOperators.mockResolvedValue([carlos, paola]);
      mockRepository.findAttendanceForDay.mockResolvedValue([]);
      mockRepository.findEntriesForDay.mockResolvedValue([]);
    });

    it('el día es el calendario de Colombia (00:00 a 23:59:59.999, -05:00)', async () => {
      await service.findPlant('2026-10-17');

      const [userIds, start, end] = mockRepository.findAttendanceForDay.mock.calls[0];
      expect(userIds).toEqual(['u-carlos', 'u-paola']);
      expect(start.toISOString()).toBe('2026-10-17T05:00:00.000Z');
      expect(end.toISOString()).toBe('2026-10-18T04:59:59.999Z');
      expect(mockRepository.findEntriesForDay).toHaveBeenCalledWith(userIds, start, end);
    });

    it('agrupa asistencia y tareas por operario', async () => {
      const clockIn = new Date('2026-10-17T12:55:00.000Z');
      mockRepository.findAttendanceForDay.mockResolvedValue([
        { id: 'att-1', userId: 'u-carlos', clockIn, clockOut: null },
      ]);
      mockRepository.findEntriesForDay.mockResolvedValue([
        { ...makeEntry({ id: 'e-1' }), user: { id: 'u-carlos' } },
        { ...makeEntry({ id: 'e-2' }), user: { id: 'u-carlos' } },
      ]);

      const result = await service.findPlant('2026-10-17');

      expect(result.date).toBe('2026-10-17');
      const [c, p] = result.operators;
      expect(c.user).toBe(carlos);
      expect(c.attendance).toEqual([{ id: 'att-1', clockIn, clockOut: null }]);
      expect(c.entries.map((e) => e.id)).toEqual(['e-1', 'e-2']);
      // Paola sin entrada ni tareas: igual sale en la lista.
      expect(p.user).toBe(paola);
      expect(p.attendance).toEqual([]);
      expect(p.entries).toEqual([]);
    });

    it('sin fecha usa el día de hoy', async () => {
      const result = await service.findPlant();
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rechaza una fecha imposible', async () => {
      await expect(service.findPlant('2026-13-45')).rejects.toThrow(BadRequestException);
    });

    it('sin operarios no consulta asistencia ni tareas', async () => {
      mockRepository.findPlantOperators.mockResolvedValue([]);

      const result = await service.findPlant('2026-10-17');

      expect(result.operators).toEqual([]);
      expect(mockRepository.findAttendanceForDay).not.toHaveBeenCalled();
      expect(mockRepository.findEntriesForDay).not.toHaveBeenCalled();
    });
  });
});
