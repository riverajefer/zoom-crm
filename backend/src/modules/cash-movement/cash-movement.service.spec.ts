import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashMovementService } from './cash-movement.service';
import { CashMovementRepository } from './cash-movement.repository';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { CashMovementType, Prisma } from '../../generated/prisma';

describe('CashMovementService', () => {
  let service: CashMovementService;
  let prisma: any;
  let repository: any;

  const openMovement = (overrides: Record<string, any> = {}) => ({
    id: 'cm1',
    cashSessionId: 'cs1',
    receiptNumber: 'RC-2026-0001',
    movementType: CashMovementType.INCOME,
    paymentMethod: 'CASH',
    amount: new Prisma.Decimal(50000),
    description: 'Abono a Orden OP-2026-0001',
    referenceType: 'ORDER',
    referenceId: 'o1',
    isVoided: false,
    createdAt: new Date('2026-08-03T14:35:00Z'),
    linkedPayment: null,
    cashSession: { id: 'cs1', status: 'OPEN', cashRegisterId: 'cr1' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      cashSession: { findUnique: jest.fn(), findFirst: jest.fn() },
      cashMovement: {
        create: jest.fn().mockResolvedValue({ id: 'counter1' }),
        update: jest.fn(),
      },
      order: { findUnique: jest.fn(), update: jest.fn() },
      payment: {
        create: jest.fn(),
        delete: jest.fn(),
        update: jest.fn().mockResolvedValue({ orderId: 'o1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
      // `lockOrderForUpdate` bloquea la OP con SQL crudo.
      $queryRaw: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));

    repository = {
      findById: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashMovementService,
        { provide: CashMovementRepository, useValue: repository },
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditLogsService,
          useValue: {
            logCreate: jest.fn().mockResolvedValue(undefined),
            logUpdate: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConsecutivesService,
          useValue: { generateNumber: jest.fn().mockResolvedValue('RC-2026-0002') },
        },
        {
          provide: CreditBalanceService,
          useValue: { releaseCredit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<CashMovementService>(CashMovementService);
  });

  describe('voidMovement', () => {
    it('should create the counter-movement with the inverse type', async () => {
      repository.findById.mockResolvedValue(openMovement());

      await service.voidMovement('cm1', { voidReason: 'Error de digitación' }, 'u1');

      const counterArgs = prisma.cashMovement.create.mock.calls[0][0];
      expect(counterArgs.data.movementType).toBe(CashMovementType.EXPENSE);
      expect(counterArgs.data.receiptNumber).toBe('RC-2026-0001-ANUL');
      expect(counterArgs.data.amount).toEqual(new Prisma.Decimal(50000));
    });

    it.each([
      [CashMovementType.INCOME, CashMovementType.EXPENSE],
      [CashMovementType.EXPENSE, CashMovementType.INCOME],
      [CashMovementType.WITHDRAWAL, CashMovementType.DEPOSIT],
      [CashMovementType.DEPOSIT, CashMovementType.WITHDRAWAL],
    ])('should invert %s into %s', async (original, expected) => {
      repository.findById.mockResolvedValue(openMovement({ movementType: original }));

      await service.voidMovement('cm1', { voidReason: 'Reversa' }, 'u1');

      expect(prisma.cashMovement.create.mock.calls[0][0].data.movementType).toBe(expected);
    });

    it('should mark the original as voided', async () => {
      repository.findById.mockResolvedValue(openMovement());

      await service.voidMovement('cm1', { voidReason: 'Error de digitación' }, 'u1');

      const voidArgs = prisma.cashMovement.update.mock.calls[0][0];
      expect(voidArgs.where).toEqual({ id: 'cm1' });
      expect(voidArgs.data.isVoided).toBe(true);
      expect(voidArgs.data.voidedById).toBe('u1');
      expect(voidArgs.data.voidReason).toBe('Error de digitación');
    });

    it('should reject a movement that is already voided', async () => {
      repository.findById.mockResolvedValue(openMovement({ isVoided: true }));

      await expect(
        service.voidMovement('cm1', { voidReason: 'x' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    // El error casi siempre se detecta al día siguiente, con la caja ya cerrada.
    // Antes eso se rechazaba y la gente terminaba editando montos a mano.
    it('registra la reversa en la sesión abierta cuando la del movimiento ya cerró', async () => {
      repository.findById.mockResolvedValue(
        openMovement({
          cashSession: { id: 'cs1', status: 'CLOSED', cashRegisterId: 'cr1' },
        }),
      );
      prisma.cashSession.findFirst.mockResolvedValue({ id: 'cs-hoy' });

      await service.voidMovement('cm1', { voidReason: 'Pago duplicado' }, 'u1');

      const counterArgs = prisma.cashMovement.create.mock.calls[0][0];
      // La reversa cae en la caja de hoy, no en el cierre ya firmado.
      expect(counterArgs.data.cashSessionId).toBe('cs-hoy');
      expect(counterArgs.data.description).toContain('de caja cerrada del');
    });

    it('rechaza si la caja cerró y no hay ninguna sesión abierta donde revertir', async () => {
      repository.findById.mockResolvedValue(
        openMovement({
          cashSession: { id: 'cs1', status: 'CLOSED', cashRegisterId: 'cr1' },
        }),
      );
      prisma.cashSession.findFirst.mockResolvedValue(null);

      await expect(
        service.voidMovement('cm1', { voidReason: 'x' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('anula el pago sin borrarlo y recalcula el saldo desde los pagos vivos', async () => {
      repository.findById.mockResolvedValue(
        openMovement({
          linkedPayment: { id: 'pay1', orderId: 'o1', amount: new Prisma.Decimal(50000) },
        }),
      );
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        total: new Prisma.Decimal(100000),
        paidAmount: new Prisma.Decimal(50000),
        appliedCreditAmount: new Prisma.Decimal(0),
      });

      await service.voidMovement('cm1', { voidReason: 'Reversa' }, 'u1');

      const orderUpdate = prisma.order.update.mock.calls[0][0];
      expect(Number(orderUpdate.data.paidAmount)).toBe(0);

      // La fila sobrevive marcada: el Historial de Pagos tiene que poder contar
      // qué pasó y quién lo autorizó, no dejar un hueco.
      expect(prisma.payment.delete).not.toHaveBeenCalled();
      const paymentUpdate = prisma.payment.update.mock.calls[0][0];
      expect(paymentUpdate.where).toEqual({ id: 'pay1' });
      expect(paymentUpdate.data.isVoided).toBe(true);
      expect(paymentUpdate.data.voidedById).toBe('u1');
      expect(paymentUpdate.data.voidReason).toBe('Reversa');
    });
  });

  describe('findOne', () => {
    it('devuelve el movimiento cuando existe', async () => {
      repository.findById.mockResolvedValue(openMovement());
      await expect(service.findOne('cm1')).resolves.toBeDefined();
    });

    it('lanza NotFound cuando no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('delega en el repositorio', async () => {
      repository.findAll.mockResolvedValue({ data: [] });
      await service.findAll({ page: 1 } as any);
      expect(repository.findAll).toHaveBeenCalledWith({ page: 1 });
    });
  });

  describe('createMovement', () => {
    const dto = {
      cashSessionId: 'cs1',
      movementType: CashMovementType.INCOME,
      amount: 50000,
      description: 'Ingreso',
    } as any;

    it('lanza NotFound si la sesión de caja no existe', async () => {
      prisma.cashSession.findUnique.mockResolvedValue(null);
      await expect(service.createMovement(dto, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('rechaza registrar en una sesión cerrada', async () => {
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs1', status: 'CLOSED' });
      await expect(service.createMovement(dto, 'u1')).rejects.toThrow(
        /sesión cerrada/,
      );
    });

    it('crea un movimiento simple (sin orden asociada)', async () => {
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs1', status: 'OPEN', cashRegister: { locationId: 'loc-125' } });
      prisma.cashMovement.create.mockResolvedValueOnce({ id: 'cm-new' });
      repository.findById.mockResolvedValue(openMovement({ id: 'cm-new' }));

      const result: any = await service.createMovement(dto, 'u1');

      expect(prisma.cashMovement.create).toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(result.id).toBe('cm-new');
    });

    it('crea el Payment y actualiza el saldo cuando el movimiento es de una ORDER', async () => {
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs1', status: 'OPEN', cashRegister: { locationId: 'loc-125' } });
      prisma.cashMovement.create.mockResolvedValueOnce({ id: 'cm-new' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        total: new Prisma.Decimal(100000),
        paidAmount: new Prisma.Decimal(0),
        appliedCreditAmount: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(100000),
        status: 'ACTIVE',
      });
      repository.findById.mockResolvedValue(openMovement({ id: 'cm-new' }));

      await service.createMovement(
        { ...dto, referenceType: 'ORDER', referenceId: 'o1' },
        'u1',
      );

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orderId: 'o1', cashMovementId: 'cm-new' }),
        }),
      );
      const orderUpdate = prisma.order.update.mock.calls[0][0];
      expect(Number(orderUpdate.data.paidAmount)).toBe(50000);
    });

    it('rechaza si el monto excede el saldo de la orden', async () => {
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs1', status: 'OPEN', cashRegister: { locationId: 'loc-125' } });
      prisma.cashMovement.create.mockResolvedValueOnce({ id: 'cm-new' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        total: new Prisma.Decimal(100000),
        paidAmount: new Prisma.Decimal(80000),
        appliedCreditAmount: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(20000),
        status: 'ACTIVE',
      });

      await expect(
        service.createMovement({ ...dto, referenceType: 'ORDER', referenceId: 'o1' }, 'u1'),
      ).rejects.toThrow(/excede el saldo/);
    });

    it('lanza NotFound si la orden referenciada no existe', async () => {
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs1', status: 'OPEN', cashRegister: { locationId: 'loc-125' } });
      prisma.cashMovement.create.mockResolvedValueOnce({ id: 'cm-new' });
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement({ ...dto, referenceType: 'ORDER', referenceId: 'o1' }, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
