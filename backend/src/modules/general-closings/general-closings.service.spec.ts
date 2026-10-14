import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeneralClosingReviewStatus, GeneralClosingStatus } from '../../generated/prisma';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import { GeneralClosingsRepository } from './general-closings.repository';
import { GeneralClosingsService } from './general-closings.service';

const mockRepository = {
  findRegisters: jest.fn(),
  findSessionsOpenedBetween: jest.fn(),
  findSessionOpenings: jest.fn(),
  sumMovements: jest.fn(),
  findCashMovements: jest.fn(),
  findHandovers: jest.fn(),
  findExpenseOrders: jest.fn(),
  findAccountsPayable: jest.fn(),
  findHeadquartersOpenSession: jest.fn(),
  findReviewablePayments: jest.fn(),
  findByDate: jest.fn(),
  findById: jest.fn(),
  saveReview: jest.fn(),
  close: jest.fn(),
  reopen: jest.fn(),
  findHistory: jest.fn(),
  findClosedDates: jest.fn(),
};

const mockAuditLogs = { logUpdate: jest.fn().mockResolvedValue(undefined) };
const mockCashMovements = { createMovement: jest.fn() };

const DAY = '2026-10-12';

const register = (id: string, name: string, type = 'STORE') => ({
  id,
  name,
  isActive: true,
  location: { id: `loc-${id}`, code: id, name, type, color: '#000' },
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

const movement = (
  cashSessionId: string,
  movementType: string,
  paymentMethod: string,
  amount: number,
  referenceType: string | null = null,
) => ({ cashSessionId, movementType, paymentMethod, referenceType, _sum: { amount } });

const cashMovement = (overrides: Record<string, unknown>) => ({
  id: 'm',
  cashSessionId: 's1',
  movementType: 'INCOME',
  amount: 0,
  description: 'Movimiento',
  receiptNumber: '104-RC-0001',
  referenceType: null,
  referenceId: null,
  linkedPayment: null,
  ...overrides,
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
    mockRepository.findCashMovements.mockResolvedValue([]);
    mockRepository.findHandovers.mockResolvedValue([]);
    mockRepository.findExpenseOrders.mockResolvedValue([]);
    mockRepository.findAccountsPayable.mockResolvedValue([]);
    mockRepository.findReviewablePayments.mockResolvedValue([]);
    mockRepository.findByDate.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneralClosingsService,
        { provide: GeneralClosingsRepository, useValue: mockRepository },
        { provide: AuditLogsService, useValue: mockAuditLogs },
        { provide: CashMovementService, useValue: mockCashMovements },
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
        handoversIn: 0,
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
      expect(day.blockers).toEqual([
        { cashRegisterId: 'r104', cashRegisterName: 'Caja 104', action: 'La sede tiene que cerrar la caja' },
        { cashRegisterId: 'r119', cashRegisterName: 'Caja 119', action: 'Confirmar que no abrió' },
      ]);
    });

    it('dice lo que falta en cada caja como una acción', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        session('s1', 'r104', { discrepancy: -5000 }),
        session('s2', 'r119'),
      ]);

      const { blockers } = await service.getDay(DAY);

      expect(blockers.map((b) => `${b.cashRegisterName}: ${b.action}`)).toEqual([
        'Caja 104: Dejar el cuadre observado, con nota',
        'Caja 119: Revisar el cuadre',
      ]);
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

  describe('pagos del día', () => {
    const payment = (locationId: string, accountingStatus: string, amount = 100000) => ({
      amount,
      accountingStatus,
      order: { locationId },
    });

    it('cuenta los pagos de cada sede por estado, con la misma fecha que la verificación', async () => {
      mockRepository.findReviewablePayments.mockResolvedValue([
        payment('loc-r104', 'PENDING', 150000),
        payment('loc-r104', 'PENDING', 50000),
        payment('loc-r104', 'VERIFIED'),
        payment('loc-r104', 'OBSERVED'),
        payment('loc-r119', 'VERIFIED'),
      ]);

      const day = await service.getDay(DAY);

      const [from, to] = mockRepository.findReviewablePayments.mock.calls[0];
      expect(from).toEqual(new Date('2026-10-12T05:00:00.000Z'));
      expect(to).toEqual(new Date('2026-10-13T04:59:59.999Z'));
      expect(day.registers[0].payments).toEqual({
        total: 4,
        pending: 2,
        observed: 1,
        verified: 1,
        pendingAmount: 200000,
      });
      // El 119 no abrió caja, pero su pago igual se muestra.
      expect(day.registers[1].payments).toMatchObject({ total: 1, verified: 1, pending: 0 });
    });

    it('no se firma el día con pagos sin verificar; los observados cuentan como revisados', async () => {
      mockRepository.findByDate.mockResolvedValue(
        closing({
          reviews: [
            review('r104', GeneralClosingReviewStatus.VERIFIED),
            review('r119', GeneralClosingReviewStatus.NO_OPERATION),
          ],
        }),
      );
      mockRepository.findReviewablePayments.mockResolvedValue([
        payment('loc-r104', 'PENDING'),
        payment('loc-r104', 'OBSERVED'),
      ]);

      await expect(service.closeDay(DAY, {}, 'conta-1')).rejects.toMatchObject({
        response: { blockers: ['Caja 104: Verificar 1 pago'] },
      });

      mockRepository.findReviewablePayments.mockResolvedValue([payment('loc-r104', 'OBSERVED')]);
      mockRepository.close.mockResolvedValue(true);
      await expect(service.closeDay(DAY, {}, 'conta-1')).resolves.toBeDefined();
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

  describe('receiveHandover', () => {
    const matrizOpen = (openedAt: string) =>
      mockRepository.findHeadquartersOpenSession.mockResolvedValue({ id: 'sm', openedAt: new Date(openedAt) });

    it('deposita en la caja de la Matriz lo contado menos la base que queda', async () => {
      matrizOpen('2026-10-13T13:00:00Z');

      await service.receiveHandover(DAY, 'r104', { baseLeft: 100000 }, 'conta-1');

      const [dto, userId] = mockCashMovements.createMovement.mock.calls[0];
      expect(dto).toMatchObject({
        cashSessionId: 'sm',
        movementType: 'DEPOSIT',
        paymentMethod: 'CASH',
        amount: 150000,
        referenceType: 'CASH_HANDOVER',
        referenceId: 's1',
      });
      expect(userId).toBe('conta-1');
    });

    it('no recibe si la base se lleva todo, si la caja no cerró o si ya se recibió', async () => {
      matrizOpen('2026-10-13T13:00:00Z');
      await expect(service.receiveHandover(DAY, 'r104', { baseLeft: 250000 }, 'c')).rejects.toThrow(
        'no queda efectivo',
      );
      await expect(service.receiveHandover(DAY, 'r119', { baseLeft: 0 }, 'c')).rejects.toThrow(
        'no tiene un cierre',
      );

      mockRepository.findHandovers.mockResolvedValue([
        { id: 'h', amount: 150000, receiptNumber: 'MAT-RC-0007', referenceId: 's1', createdAt: new Date(), performedBy: null },
      ]);
      await expect(service.receiveHandover(DAY, 'r104', { baseLeft: 0 }, 'c')).rejects.toThrow(
        ConflictException,
      );
      expect(mockCashMovements.createMovement).not.toHaveBeenCalled();
    });

    it('exige la caja de la Matriz abierta, de un día posterior y después del cierre del local', async () => {
      mockRepository.findHeadquartersOpenSession.mockResolvedValue(null);
      await expect(service.receiveHandover(DAY, 'r104', { baseLeft: 0 }, 'c')).rejects.toThrow(
        'Abre la caja de la Matriz',
      );

      // Una sesión de la Matriz del mismo día contaría el efectivo dos veces,
      // aunque haya abierto después del cierre del local (23:00Z = 6 p. m.).
      matrizOpen('2026-10-13T01:00:00Z');
      await expect(service.receiveHandover(DAY, 'r104', { baseLeft: 0 }, 'c')).rejects.toThrow(
        'abierta un día después',
      );

      // Del día siguiente, pero abierta antes de que el local cerrara.
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        session('s1', 'r104', { closedAt: new Date('2026-10-13T06:00:00Z') }),
      ]);
      matrizOpen('2026-10-13T05:30:00Z');
      await expect(service.receiveHandover(DAY, 'r104', { baseLeft: 0 }, 'c')).rejects.toThrow(
        'desde antes de que cerrara',
      );
    });

    it('la caja de la Matriz no se entrega a sí misma', async () => {
      mockRepository.findRegisters.mockResolvedValue([register('r104', 'Caja Matriz', 'HEADQUARTERS')]);
      await expect(service.receiveHandover(DAY, 'r104', { baseLeft: 0 }, 'c')).rejects.toThrow(
        'es la que recibe',
      );
    });
  });

  describe('consolidado', () => {
    it('suma todas las cajas como una sola, con la entrega recibida en la base', async () => {
      mockRepository.findRegisters.mockResolvedValue([
        register('r119', 'Caja 119'),
        register('rmat', 'Caja Matriz', 'HEADQUARTERS'),
      ]);
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        session('s1', 'r119', { openingAmount: 100000, closingAmount: 720000, systemBalance: 720000 }),
        session('sm', 'rmat', { openingAmount: 20400, closingAmount: 388400, systemBalance: 388400 }),
      ]);
      mockRepository.sumMovements.mockResolvedValue([
        movement('s1', 'INCOME', 'CASH', 650000),
        movement('s1', 'EXPENSE', 'CASH', 30000),
        // La Matriz recibió $500.000 del cierre de ayer y sacó $1.000.000 del banco.
        movement('sm', 'DEPOSIT', 'CASH', 500000, 'CASH_HANDOVER'),
        movement('sm', 'DEPOSIT', 'CASH', 1000000),
        movement('sm', 'EXPENSE', 'CASH', 1132000),
      ]);
      mockRepository.findCashMovements.mockResolvedValue([
        cashMovement({
          amount: 650000,
          linkedPayment: { order: { orderNumber: '119-OP-2814', client: { name: 'Cliente Uno' } } },
        }),
        cashMovement({ movementType: 'EXPENSE', amount: 30000, referenceType: 'EXPENSE_ORDER', referenceId: 'og1' }),
        cashMovement({ cashSessionId: 'sm', movementType: 'EXPENSE', amount: 820000, referenceType: 'ACCOUNT_PAYABLE', referenceId: 'ap1' }),
        cashMovement({ cashSessionId: 'sm', movementType: 'EXPENSE', amount: 312000, description: 'Gasto personal', receiptNumber: 'MAT-RC-0009' }),
      ]);
      mockRepository.findExpenseOrders.mockResolvedValue([
        { id: 'og1', ogNumber: '119-OG-0003', expenseType: { name: 'Producción' }, items: [{ supplier: { name: 'Sublify' } }] },
      ]);
      mockRepository.findAccountsPayable.mockResolvedValue([
        { id: 'ap1', apNumber: 'MAT-CP-0001', expenseType: { name: 'Nómina' }, supplier: null },
      ]);

      const { consolidated } = await service.getDay(DAY);

      expect(consolidated).toMatchObject({
        base: 620400,
        cashDeposits: 1000000,
        cashSales: 650000,
        cashWithdrawals: 0,
        total: 1108400,
        counted: 1108400,
        difference: 0,
        expenseGroups: [
          { label: 'Nómina', amount: 820000 },
          { label: 'Otros egresos', amount: 312000 },
          { label: 'Producción', amount: 30000 },
        ],
      });
      expect(consolidated.cashReceived).toEqual([
        { location: { code: 'r119', name: 'Caja 119', color: '#000' }, reference: '119-OP-2814', detail: 'Cliente Uno', amount: 650000 },
      ]);
      expect(consolidated.cashExpenses[0]).toMatchObject({ group: 'Producción', reference: '119-OG-0003', detail: 'Sublify' });
      expect(consolidated.cashExpenses[2]).toMatchObject({ group: 'Otros egresos', reference: 'MAT-RC-0009' });
    });

    it('no da un contado mientras alguna caja siga abierta', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        session('s1', 'r104', { status: 'OPEN', closingAmount: null, systemBalance: null, discrepancy: null }),
      ]);

      const { consolidated } = await service.getDay(DAY);

      expect(consolidated.counted).toBeNull();
      expect(consolidated.difference).toBeNull();
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
        response: { blockers: ['Caja 119: Confirmar que no abrió'] },
      });
      expect(mockRepository.close).not.toHaveBeenCalled();
    });

    it('no firma si una caja abrió después de quedar como sin operación', async () => {
      mockRepository.findByDate.mockResolvedValue(reviewed());
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([session('s1', 'r104'), session('s2', 'r119')]);

      await expect(service.closeDay(DAY, {}, 'conta-1')).rejects.toMatchObject({
        response: { blockers: ['Caja 119: Revisar de nuevo: la caja sí abrió'] },
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

  describe('getByLocation', () => {
    it('resume cada caja en el periodo: días cuadrados, faltantes, sobrantes y dinero', async () => {
      mockRepository.findSessionsOpenedBetween.mockResolvedValue([
        // 104: un día cuadrado, uno con faltante (dos sesiones que suman -3.000) y uno con sobrante.
        session('a', 'r104', { openedAt: new Date('2026-10-01T13:00:00Z'), discrepancy: 0 }),
        session('b', 'r104', { openedAt: new Date('2026-10-02T13:00:00Z'), discrepancy: -5000 }),
        session('c', 'r104', { openedAt: new Date('2026-10-02T20:00:00Z'), discrepancy: 2000 }),
        session('d', 'r104', { openedAt: new Date('2026-10-03T13:00:00Z'), discrepancy: 1500 }),
        // 119: un día con la caja todavía abierta, que no cuenta como cuadrado.
        session('e', 'r119', { openedAt: new Date('2026-10-03T13:00:00Z'), status: 'OPEN', discrepancy: null }),
      ]);
      mockRepository.sumMovements.mockResolvedValue([
        movement('a', 'INCOME', 'CASH', 100000),
        movement('b', 'INCOME', 'TRANSFER', 300000),
        movement('d', 'EXPENSE', 'CASH', 20000),
        movement('e', 'INCOME', 'CASH', 50000),
      ]);
      mockRepository.findHandovers.mockResolvedValue([
        { id: 'h', amount: 90000, receiptNumber: 'MAT-RC-1', referenceId: 'a', createdAt: new Date(), performedBy: null },
      ]);
      mockRepository.findReviewablePayments.mockResolvedValue([
        { amount: 300000, accountingStatus: 'OBSERVED', order: { locationId: 'loc-r104' } },
      ]);

      const { rows, totals } = await service.getByLocation('2026-10-01', '2026-10-13');

      expect(rows[0]).toMatchObject({
        daysWithCash: 3,
        daysBalanced: 1,
        daysShort: 1,
        shortTotal: 3000,
        daysOver: 1,
        overTotal: 1500,
        openSessions: 0,
        incomeCash: 100000,
        incomeTransfer: 300000,
        cashExpenses: 20000,
        handedOver: 90000,
        payments: { total: 1, observed: 1, pending: 0 },
      });
      expect(rows[1]).toMatchObject({ daysWithCash: 1, daysBalanced: 0, openSessions: 1, incomeCash: 50000 });
      expect(totals).toMatchObject({ shortTotal: 3000, incomeCash: 150000, openSessions: 1 });
    });

    it('rechaza un periodo al revés o de más de 93 días', async () => {
      await expect(service.getByLocation('2026-10-10', '2026-10-01')).rejects.toThrow('posterior');
      await expect(service.getByLocation('2026-06-01', '2026-10-01')).rejects.toThrow('93 días');
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
