import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeneralClosingReviewStatus, GeneralClosingStatus } from '../../generated/prisma';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { GeneralClosingsRepository } from './general-closings.repository';
import { GeneralClosingsService } from './general-closings.service';

const mockRepository = {
  findRegisters: jest.fn(),
  findSessionsOpenedBetween: jest.fn(),
  findSessionOpenings: jest.fn(),
  sumMovements: jest.fn(),
  findByDate: jest.fn(),
  findById: jest.fn(),
  saveReview: jest.fn(),
  close: jest.fn(),
  reopen: jest.fn(),
  findHistory: jest.fn(),
  findClosedDates: jest.fn(),
};

const mockAuditLogs = { logUpdate: jest.fn().mockResolvedValue(undefined) };

const DAY = '2026-10-12';

const register = (id: string, name: string) => ({
  id,
  name,
  isActive: true,
  location: { id: `loc-${id}`, code: id, name },
});

const session = (
  id: string,
  cashRegisterId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  cashRegisterId,
  status: 'CLOSED',
  openingAmount: 100000,
  closingAmount: 250000,
  systemBalance: 250000,
  discrepancy: 0,
  notes: null,
  openedAt: new Date(`${DAY}T13:00:00Z`),
  closedAt: new Date(`${DAY}T23:00:00Z`),
  openedBy: null,
  closedBy: null,
  ...overrides,
});

const movement = (cashSessionId: string, movementType: string, paymentMethod: string, amount: number) => ({
  cashSessionId,
  movementType,
  paymentMethod,
  _sum: { amount },
});

const review = (cashRegisterId: string, status: GeneralClosingReviewStatus, notes: string | null = null) => ({
  cashRegisterId,
  status,
  notes,
  reviewedAt: new Date(),
  reviewedBy: { id: 'conta-1', firstName: 'Lina', lastName: 'C' },
});

const closing = (overrides: Record<string, unknown> = {}) => ({
  id: 'closing-1',
  date: new Date(`${DAY}T00:00:00.000Z`),
  status: GeneralClosingStatus.OPEN,
  notes: null,
  snapshot: null,
  closedAt: null,
  closedBy: null,
  reviews: [],
  events: [],
  ...overrides,
});

describe('GeneralClosingsService', () => {
  let service: GeneralClosingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['setImmediate'] }).setSystemTime(new Date('2026-10-13T15:00:00Z'));
    mockRepository.findRegisters.mockResolvedValue([register('r104', 'Caja 104'), register('r119', 'Caja 119')]);
    mockRepository.findSessionsOpenedBetween.mockResolvedValue([session('s1', 'r104')]);
    mockRepository.sumMovements.mockResolvedValue([]);
    mockRepository.findByDate.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneralClosingsService,
        { provide: GeneralClosingsRepository, useValue: mockRepository },
        { provide: AuditLogsService, useValue: mockAuditLogs },
      ],
    }).compile();
    service = module.get(GeneralClosingsService);
  });

  afterEach(() => jest.useRealTimers());

  describe('getDay', () => {
    it('busca las sesiones del día completo en hora de Bogotá', async () => {
      await service.getDay(DAY);

      const [from, to] = mockRepository.findSessionsOpenedBetween.mock.calls[0];
      expect(from).toEqual(new Date('2026-10-12T05:00:00.000Z'));
      expect(to).toEqual(new Date('2026-10-13T04:59:59.999Z'));
    });

    it('rechaza una fecha mal escrita o que no ha llegado', async () => {
      await expect(service.getDay('12/10/2026')).rejects.toThrow(BadRequestException);
      await expect(service.getDay('2026-02-30')).rejects.toThrow(BadRequestException);
      await expect(service.getDay('2026-10-14')).rejects.toThrow(BadRequestException);
    });

    it('separa los movimientos por medio de pago y deja el efectivo en el cuadre', async () => {
      mockRepository.sumMovements.mockResolvedValue([
        movement('s1', 'INCOME', 'CASH', 200000),
        movement('s1', 'INCOME', 'TRANSFER', 80000),
        movement('s1', 'INCOME', 'CARD', 30000),
        movement('s1', 'INCOME', 'CHECK', 10000),
        movement('s1', 'DEPOSIT', 'CASH', 5000),
        movement('s1', 'EXPENSE', 'CASH', 40000),
        movement('s1', 'EXPENSE', 'TRANSFER', 15000),
        movement('s1', 'WITHDRAWAL', 'CASH', 15000),
      ]);

      const day = await service.getDay(DAY);

      expect(day.registers[0].totals).toEqual({
        openingAmount: 100000,
        incomeCash: 200000,
        incomeTransfer: 80000,
        incomeCard: 30000,
        incomeOther: 10000,
        deposits: 5000,
        cashExpenses: 40000,
        otherExpenses: 15000,
        withdrawals: 15000,
        expected: 250000,
        counted: 250000,
        discrepancy: 0,
      });
      expect(day.registers[1].status).toBe('NO_SESSION');
      expect(day.totals.incomeCash).toBe(200000);
    });

    it('con varias sesiones: base de la primera, cierre de la última y suma de diferencias', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        session('s1', 'r104', { closingAmount: 149000, systemBalance: 150000, discrepancy: -1000 }),
        session('s2', 'r104', { openingAmount: 149000, closingAmount: 300500, systemBalance: 300000, discrepancy: 500 }),
      ]);

      const { totals, status } = (await service.getDay(DAY)).registers[0];

      expect(status).toBe('CLOSED');
      expect(totals.openingAmount).toBe(100000);
      expect(totals.expected).toBe(300000);
      expect(totals.counted).toBe(300500);
      expect(totals.discrepancy).toBe(-500);
    });

    it('una caja abierta calcula el esperado en vivo y bloquea el cierre', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        session('s1', 'r104', { status: 'OPEN', closingAmount: null, systemBalance: null, discrepancy: null }),
      ]);
      mockRepository.sumMovements.mockResolvedValue([
        movement('s1', 'INCOME', 'CASH', 50000),
        movement('s1', 'EXPENSE', 'CASH', 20000),
      ]);

      const day = await service.getDay(DAY);

      expect(day.registers[0].status).toBe('OPEN');
      expect(day.registers[0].totals.expected).toBe(130000);
      expect(day.registers[0].totals.counted).toBeNull();
      expect(day.blockers).toEqual(['Caja 104 sigue abierta', 'Caja 119 está sin revisar']);
    });

    it('un día firmado devuelve la foto y lo que cambió después', async () => {
      const signed = await service.getDay(DAY);
      mockRepository.findByDate.mockResolvedValue(
        closing({
          status: GeneralClosingStatus.CLOSED,
          snapshot: { registers: signed.registers, totals: signed.totals },
        }),
      );
      // Después de firmar se anuló un ingreso: el movimiento original ya no suma.
      mockRepository.sumMovements.mockResolvedValue([movement('s1', 'INCOME', 'TRANSFER', 80000)]);

      const day = await service.getDay(DAY);

      expect(day.registers[0].totals.incomeTransfer).toBe(0);
      expect(day.drift).toEqual([
        { cashRegisterId: 'r104', cashRegisterName: 'Caja 104', field: 'incomeTransfer', signed: 0, current: 80000 },
      ]);
      expect(day.blockers).toEqual([]);
    });
  });

  describe('reviewRegister', () => {
    it('guarda la revisión de una caja cerrada y cuadrada', async () => {
      await service.reviewRegister(DAY, 'r104', { status: GeneralClosingReviewStatus.VERIFIED }, 'conta-1');

      expect(mockRepository.saveReview).toHaveBeenCalledWith(new Date(`${DAY}T00:00:00.000Z`), 'r104', {
        status: GeneralClosingReviewStatus.VERIFIED,
        notes: null,
        reviewedById: 'conta-1',
      });
    });

    it('no revisa una caja que sigue abierta', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([session('s1', 'r104', { status: 'OPEN' })]);

      await expect(
        service.reviewRegister(DAY, 'r104', { status: GeneralClosingReviewStatus.VERIFIED }, 'conta-1'),
      ).rejects.toThrow('sigue abierta');
    });

    it('una caja con diferencia no se da por verificada', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([session('s1', 'r104', { discrepancy: -2000 })]);

      await expect(
        service.reviewRegister(DAY, 'r104', { status: GeneralClosingReviewStatus.VERIFIED }, 'conta-1'),
      ).rejects.toThrow('observada');
    });

    it('observada exige nota', async () => {
      await expect(
        service.reviewRegister(DAY, 'r104', { status: GeneralClosingReviewStatus.OBSERVED }, 'conta-1'),
      ).rejects.toThrow('lleva nota');
    });

    it('sin operación es solo para la caja que no abrió', async () => {
      await expect(
        service.reviewRegister(DAY, 'r104', { status: GeneralClosingReviewStatus.NO_OPERATION }, 'conta-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reviewRegister(DAY, 'r119', { status: GeneralClosingReviewStatus.VERIFIED }, 'conta-1'),
      ).rejects.toThrow('sin operación');

      await service.reviewRegister(DAY, 'r119', { status: GeneralClosingReviewStatus.NO_OPERATION }, 'conta-1');
      expect(mockRepository.saveReview).toHaveBeenCalledTimes(1);
    });

    it('no cambia un día ya firmado ni una caja que no existe', async () => {
      await expect(
        service.reviewRegister(DAY, 'otra', { status: GeneralClosingReviewStatus.VERIFIED }, 'conta-1'),
      ).rejects.toThrow(NotFoundException);

      mockRepository.findByDate.mockResolvedValue(closing({ status: GeneralClosingStatus.CLOSED }));
      await expect(
        service.reviewRegister(DAY, 'r104', { status: GeneralClosingReviewStatus.VERIFIED }, 'conta-1'),
      ).rejects.toThrow('reabrirlo');
    });
  });

  describe('closeDay', () => {
    const reviewed = () =>
      closing({
        reviews: [
          review('r104', GeneralClosingReviewStatus.VERIFIED),
          review('r119', GeneralClosingReviewStatus.NO_OPERATION),
        ],
      });

    it('firma el día con la foto de las cajas y sus totales', async () => {
      mockRepository.findByDate.mockResolvedValue(reviewed());
      mockRepository.close.mockResolvedValue(true);

      await service.closeDay(DAY, { notes: 'Todo en orden' }, 'conta-1');

      const [id, data] = mockRepository.close.mock.calls[0];
      expect(id).toBe('closing-1');
      expect(data.notes).toBe('Todo en orden');
      expect(data.userId).toBe('conta-1');
      expect(data.snapshot.registers).toHaveLength(2);
      expect(data.snapshot.registers[0].review.status).toBe(GeneralClosingReviewStatus.VERIFIED);
      expect(data.snapshot.totals.counted).toBe(250000);
    });

    it('no firma con cajas sin revisar', async () => {
      mockRepository.findByDate.mockResolvedValue(
        closing({ reviews: [review('r104', GeneralClosingReviewStatus.VERIFIED)] }),
      );

      await expect(service.closeDay(DAY, {}, 'conta-1')).rejects.toMatchObject({
        response: { blockers: ['Caja 119 está sin revisar'] },
      });
      expect(mockRepository.close).not.toHaveBeenCalled();
    });

    it('no firma si una caja abrió después de quedar como sin operación', async () => {
      mockRepository.findByDate.mockResolvedValue(reviewed());
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([session('s1', 'r104'), session('s2', 'r119')]);

      await expect(service.closeDay(DAY, {}, 'conta-1')).rejects.toMatchObject({
        response: { blockers: [expect.stringContaining('Caja 119 sí tuvo sesión')] },
      });
    });

    it('no firma un día sin ninguna revisión ni uno ya firmado', async () => {
      await expect(service.closeDay(DAY, {}, 'conta-1')).rejects.toThrow(BadRequestException);

      mockRepository.findByDate.mockResolvedValue(reviewed());
      mockRepository.close.mockResolvedValue(false);
      await expect(service.closeDay(DAY, {}, 'conta-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('reopen', () => {
    it('quita la firma con el motivo', async () => {
      mockRepository.findById.mockResolvedValue(closing({ status: GeneralClosingStatus.CLOSED }));
      mockRepository.reopen.mockResolvedValue(true);

      await service.reopen('closing-1', { reason: 'Faltó un retiro' }, 'admin-1');

      expect(mockRepository.reopen).toHaveBeenCalledWith('closing-1', 'Faltó un retiro', 'admin-1');
    });

    it('falla si el cierre no existe o no está firmado', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(service.reopen('x', { reason: 'm' }, 'admin-1')).rejects.toThrow(NotFoundException);

      mockRepository.findById.mockResolvedValue(closing());
      mockRepository.reopen.mockResolvedValue(false);
      await expect(service.reopen('closing-1', { reason: 'm' }, 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findPendingDays', () => {
    it('agrupa las sesiones por día de Bogotá y omite los días firmados', async () => {
      mockRepository.findSessionOpenings.mockResolvedValue([
        { openedAt: new Date('2026-10-11T14:00:00Z'), status: 'CLOSED' },
        // 9:30 p. m. del 11 en Bogotá, aunque en UTC ya sea el 12.
        { openedAt: new Date('2026-10-12T02:30:00Z'), status: 'OPEN' },
        { openedAt: new Date('2026-10-12T14:00:00Z'), status: 'CLOSED' },
        { openedAt: new Date('2026-10-10T14:00:00Z'), status: 'CLOSED' },
      ]);
      mockRepository.findClosedDates.mockResolvedValue([{ date: new Date('2026-10-10T00:00:00.000Z') }]);

      const days = await service.findPendingDays();

      expect(days).toEqual([
        { date: '2026-10-12', sessions: 1, openSessions: 0 },
        { date: '2026-10-11', sessions: 2, openSessions: 1 },
      ]);
      const [, before] = mockRepository.findSessionOpenings.mock.calls[0];
      expect(before).toEqual(new Date('2026-10-13T05:00:00.000Z'));
    });
  });
});
