import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CashSessionRepository } from './cash-session.repository';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PendingCashEntriesService } from './pending-cash-entries.service';
import { createMockPrismaService } from '../../database/prisma.service.mock';
import { Prisma } from '../../generated/prisma';

const sessionStub = (overrides: Record<string, any> = {}) => ({
  id: 'cs-1',
  status: 'OPEN',
  openingAmount: new Prisma.Decimal(100000),
  notes: 'nota inicial',
  closedAt: null,
  denominations: [],
  ...overrides,
});

describe('CashSessionService', () => {
  let service: CashSessionService;
  let repository: any;
  let prisma: ReturnType<typeof createMockPrismaService> & { cashDenominationCount: any };
  let auditLogs: { logCreate: jest.Mock; logUpdate: jest.Mock };
  let pendingEntries: { flushInto: jest.Mock };

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findLastClosedByRegisterId: jest.fn(),
      findOpenByRegisterId: jest.fn(),
      computeSystemBalance: jest.fn(),
      getMovementCount: jest.fn(),
    };

    prisma = createMockPrismaService() as any;
    prisma.cashDenominationCount = { createMany: jest.fn() };
    // El servicio usa $transaction(async tx => ...); tx === prisma para controlar los mocks.
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    // Solo Zoom: la caja se busca antes de abrir (filtrada por la sede activa).
    (prisma as any).cashRegister = {
      ...((prisma as any).cashRegister ?? {}),
      findUnique: jest.fn().mockResolvedValue({ id: 'reg-1', locationId: 'loc-125' }),
    };

    auditLogs = {
      logCreate: jest.fn().mockResolvedValue(undefined),
      logUpdate: jest.fn().mockResolvedValue(undefined),
    };
    pendingEntries = { flushInto: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashSessionService,
        { provide: CashSessionRepository, useValue: repository },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
        { provide: PendingCashEntriesService, useValue: pendingEntries },
      ],
    }).compile();

    service = module.get<CashSessionService>(CashSessionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('delega en el repositorio', async () => {
      repository.findAll.mockResolvedValue({ data: [] });
      await service.findAll({} as any);
      expect(repository.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('findOne', () => {
    it('devuelve la sesión cuando existe', async () => {
      const s = sessionStub();
      repository.findById.mockResolvedValue(s);
      await expect(service.findOne('cs-1')).resolves.toBe(s);
    });

    it('lanza NotFound cuando no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLastClosingDenominations', () => {
    it('devuelve arreglo vacío si no hay sesión cerrada previa', async () => {
      repository.findLastClosedByRegisterId.mockResolvedValue(null);
      await expect(service.getLastClosingDenominations('reg-1')).resolves.toEqual({
        denominations: [],
      });
    });

    it('devuelve las denominaciones de la última sesión cerrada', async () => {
      repository.findLastClosedByRegisterId.mockResolvedValue({
        id: 'cs-old',
        closedAt: new Date('2026-08-01'),
        denominations: [{ denomination: 50000, quantity: 2 }],
      });
      const result = await service.getLastClosingDenominations('reg-1');
      expect(result.sessionId).toBe('cs-old');
      expect(result.denominations).toHaveLength(1);
    });
  });

  describe('openSession', () => {
    const dto = {
      cashRegisterId: 'reg-1',
      denominations: [
        { denomination: 50000, quantity: 2 },
        { denomination: 100, quantity: 5 },
      ],
      notes: 'apertura',
    } as any;

    it('una caja de otra sede no existe', async () => {
      (prisma as any).cashRegister.findUnique.mockResolvedValue(null);
      await expect(service.openSession(dto, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la caja ya tiene una sesión abierta', async () => {
      repository.findOpenByRegisterId.mockResolvedValue({ id: 'cs-open' });
      await expect(service.openSession(dto, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('abre la sesión, suma denominaciones y descarga la cola de pendientes', async () => {
      repository.findOpenByRegisterId.mockResolvedValue(null);
      prisma.cashSession.create.mockResolvedValue({ id: 'cs-new' });
      repository.findById.mockResolvedValue(sessionStub({ id: 'cs-new' }));

      await service.openSession(dto, 'user-1');

      // 50000*2 + 100*5 = 100500
      expect(prisma.cashSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ openingAmount: expect.anything() }),
        }),
      );
      const openingArg = prisma.cashSession.create.mock.calls[0][0].data.openingAmount;
      expect(Number(openingArg.toString())).toBe(100500);
      expect(prisma.cashDenominationCount.createMany).toHaveBeenCalled();
      expect(pendingEntries.flushInto).toHaveBeenCalledWith(prisma, 'cs-new', 'user-1', 'loc-125');
      expect(repository.findById).toHaveBeenCalledWith('cs-new');
    });
  });

  describe('closeSession', () => {
    const dto = {
      denominations: [{ denomination: 50000, quantity: 3 }],
      notes: 'cierre',
    } as any;

    it('lanza NotFound si la sesión no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.closeSession('cs-1', dto, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rechaza cerrar una sesión que ya está cerrada', async () => {
      repository.findById.mockResolvedValue(sessionStub({ status: 'CLOSED' }));
      await expect(service.closeSession('cs-1', dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cierra la sesión calculando la discrepancia', async () => {
      // opening 100000 + movimientos 50000 = 150000 sistema; conteo 150000 → discrepancia 0
      repository.findById.mockResolvedValueOnce(sessionStub()); // en closeSession
      repository.computeSystemBalance.mockResolvedValue(new Prisma.Decimal(50000));
      prisma.cashSession.update.mockResolvedValue({ id: 'cs-1', status: 'CLOSED' });
      repository.findById.mockResolvedValue(sessionStub({ status: 'CLOSED' })); // findById final

      await service.closeSession('cs-1', dto, 'user-1');

      const updateArg = prisma.cashSession.update.mock.calls[0][0].data;
      expect(Number(updateArg.closingAmount.toString())).toBe(150000);
      expect(Number(updateArg.systemBalance.toString())).toBe(150000);
      expect(Number(updateArg.discrepancy.toString())).toBe(0);
      expect(updateArg.status).toBe('CLOSED');
    });

    it('registra discrepancia negativa cuando falta efectivo', async () => {
      repository.findById.mockResolvedValueOnce(sessionStub());
      repository.computeSystemBalance.mockResolvedValue(new Prisma.Decimal(50000));
      prisma.cashSession.update.mockResolvedValue({ id: 'cs-1' });
      repository.findById.mockResolvedValue(sessionStub({ status: 'CLOSED' }));

      // conteo de solo 100000 (1 billete de 50000 x 2 = 100000)
      await service.closeSession(
        'cs-1',
        { denominations: [{ denomination: 50000, quantity: 2 }] } as any,
        'user-1',
      );

      const updateArg = prisma.cashSession.update.mock.calls[0][0].data;
      expect(Number(updateArg.discrepancy.toString())).toBe(-50000);
    });
  });

  describe('getBalancePreview', () => {
    it('lanza NotFound si la sesión no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getBalancePreview('cs-1')).rejects.toThrow(NotFoundException);
    });

    it('agrega los movimientos por tipo', async () => {
      repository.findById.mockResolvedValue(sessionStub());
      repository.computeSystemBalance.mockResolvedValue(new Prisma.Decimal(30000));
      repository.getMovementCount.mockResolvedValue(4);
      prisma.cashMovement.findMany.mockResolvedValue([
        { movementType: 'INCOME', amount: new Prisma.Decimal(80000) },
        { movementType: 'EXPENSE', amount: new Prisma.Decimal(20000) },
        { movementType: 'WITHDRAWAL', amount: new Prisma.Decimal(10000) },
        { movementType: 'DEPOSIT', amount: new Prisma.Decimal(5000) },
      ] as any);

      const preview = await service.getBalancePreview('cs-1');

      expect(Number(preview.systemBalance.toString())).toBe(130000); // 100000 + 30000
      expect(Number(preview.totalIncome.toString())).toBe(80000);
      expect(Number(preview.totalExpense.toString())).toBe(20000);
      expect(Number(preview.totalWithdrawals.toString())).toBe(10000);
      expect(Number(preview.totalDeposits.toString())).toBe(5000);
      expect(preview.movementCount).toBe(4);
    });
  });
});
