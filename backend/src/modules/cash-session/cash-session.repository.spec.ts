import { Test, TestingModule } from '@nestjs/testing';
import { CashSessionRepository } from './cash-session.repository';
import { PrismaService } from '../../database/prisma.service';
import { CashMovementType, Prisma } from '../../generated/prisma';

describe('CashSessionRepository', () => {
  let repository: CashSessionRepository;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      cashMovement: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      cashSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashSessionRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<CashSessionRepository>(CashSessionRepository);
  });

  describe('computeSystemBalance', () => {
    it('should add income and deposits, subtract expenses and withdrawals', async () => {
      prisma.cashMovement.findMany.mockResolvedValue([
        { movementType: CashMovementType.INCOME, amount: new Prisma.Decimal(100000) },
        { movementType: CashMovementType.DEPOSIT, amount: new Prisma.Decimal(50000) },
        { movementType: CashMovementType.EXPENSE, amount: new Prisma.Decimal(20000) },
        { movementType: CashMovementType.WITHDRAWAL, amount: new Prisma.Decimal(30000) },
      ]);

      const balance = await repository.computeSystemBalance('cs1');

      expect(Number(balance.toString())).toBe(100000);
    });

    it('should exclude voided movements and their counter-movements', async () => {
      await repository.computeSystemBalance('cs1');

      // Una anulación se neutraliza excluyendo el movimiento original; si además
      // se contara su reversa, el saldo no cambiaría al anular.
      expect(prisma.cashMovement.findMany).toHaveBeenCalledWith({
        where: {
          cashSessionId: 'cs1',
          isVoided: false,
          paymentMethod: 'CASH',
          originalMovement: null,
        },
        select: { movementType: true, amount: true },
      });
    });
  });

  describe('getMovementCount', () => {
    it('should not count voided movements nor counter-movements', async () => {
      await repository.getMovementCount('cs1');

      expect(prisma.cashMovement.count).toHaveBeenCalledWith({
        where: { cashSessionId: 'cs1', isVoided: false, originalMovement: null },
      });
    });
  });

  describe('findAll', () => {
    it('should resolve a date-only range to the full day in Bogotá time', async () => {
      await repository.findAll({ openedFrom: '2026-09-28', openedTo: '2026-09-28' });

      const { where } = prisma.cashSession.findMany.mock.calls[0][0];
      expect(where.openedAt.gte.toISOString()).toBe('2026-09-28T05:00:00.000Z');
      expect(where.openedAt.lte.toISOString()).toBe('2026-09-29T04:59:59.999Z');
    });
  });
});
