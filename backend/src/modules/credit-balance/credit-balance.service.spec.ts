import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CreditBalanceService } from './credit-balance.service';
import { PrismaService } from '../../database/prisma.service';
import { createMockPrismaService } from '../../database/prisma.service.mock';
import { Prisma } from '../../generated/prisma';

/**
 * Orden con excedente: total 80.000 pagados 100.000 → 20.000 de saldo a favor.
 */
const sourceOrder = (overrides: Record<string, any> = {}) => ({
  id: 'order-src',
  orderNumber: 'OP-2026-0001',
  orderDate: new Date('2026-01-10'),
  total: new Prisma.Decimal(80000),
  paidAmount: new Prisma.Decimal(100000),
  appliedCreditAmount: new Prisma.Decimal(0),
  ...overrides,
});

describe('CreditBalanceService', () => {
  let service: CreditBalanceService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditBalanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CreditBalanceService>(CreditBalanceService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listCreditSources', () => {
    it('devuelve solo las órdenes con excedente disponible', async () => {
      prisma.order.findMany.mockResolvedValue([
        sourceOrder(),
        sourceOrder({
          id: 'order-paid',
          orderNumber: 'OP-2026-0002',
          total: new Prisma.Decimal(50000),
          paidAmount: new Prisma.Decimal(50000),
        }),
      ]);

      const sources = await service.listCreditSources('client-1');

      expect(sources).toHaveLength(1);
      expect(sources[0].orderId).toBe('order-src');
      expect(Number(sources[0].available)).toBe(20000);
    });

    it('descuenta el crédito ya aplicado del excedente disponible', async () => {
      prisma.order.findMany.mockResolvedValue([
        sourceOrder({ appliedCreditAmount: new Prisma.Decimal(15000) }),
      ]);

      const sources = await service.listCreditSources('client-1');

      expect(Number(sources[0].available)).toBe(5000);
    });

    it('excluye la orden destino', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.listCreditSources('client-1', { excludeOrderId: 'order-dst' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientId: 'client-1',
            id: { not: 'order-dst' },
          }),
        }),
      );
    });

    // Anular no toca los pagos y una OP anulada no admite devolución: si su
    // excedente no contara aquí, el cliente lo perdería.
    it('incluye las órdenes anuladas como origen del saldo', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.listCreditSources('client-1');

      const { where } = prisma.order.findMany.mock.calls[0][0];
      expect(where).not.toHaveProperty('status');
    });
  });

  describe('getAvailableCredit', () => {
    it('suma el excedente de todas las órdenes del cliente', async () => {
      prisma.order.findMany.mockResolvedValue([
        sourceOrder(),
        sourceOrder({
          id: 'order-src-2',
          orderNumber: 'OP-2026-0003',
          total: new Prisma.Decimal(10000),
          paidAmount: new Prisma.Decimal(15000),
        }),
      ]);

      const available = await service.getAvailableCredit('client-1');

      expect(Number(available)).toBe(25000);
    });
  });

  describe('assertEnoughCredit', () => {
    it('pasa cuando el saldo disponible alcanza', async () => {
      prisma.order.findMany.mockResolvedValue([sourceOrder()]);

      await expect(
        service.assertEnoughCredit('client-1', 20000),
      ).resolves.toBeUndefined();
    });

    it('falla cuando el monto excede el saldo disponible', async () => {
      prisma.order.findMany.mockResolvedValue([sourceOrder()]);

      await expect(
        service.assertEnoughCredit('client-1', 25000),
      ).rejects.toThrow(BadRequestException);
    });

    it('falla con monto cero o negativo', async () => {
      await expect(service.assertEnoughCredit('client-1', 0)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('applyCredit', () => {
    it('registra la aplicación y descuenta el excedente de la orden origen', async () => {
      prisma.order.findMany.mockResolvedValue([sourceOrder()]);
      prisma.order.findUnique.mockResolvedValue({
        total: new Prisma.Decimal(80000),
        paidAmount: new Prisma.Decimal(100000),
        appliedCreditAmount: new Prisma.Decimal(0),
      });

      await service.applyCredit(prisma as any, {
        clientId: 'client-1',
        paymentId: 'pay-1',
        amount: 20000,
        targetOrderId: 'order-dst',
      });

      expect(prisma.creditBalanceApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: 'pay-1',
          sourceOrderId: 'order-src',
        }),
      });

      const update = prisma.order.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'order-src' });
      expect(Number(update.data.appliedCreditAmount)).toBe(20000);
      // balance = 80.000 - 100.000 + 20.000 → deja de figurar saldo a favor
      expect(Number(update.data.balance)).toBe(0);
    });

    it('consume varias órdenes en orden FIFO cuando una no alcanza', async () => {
      prisma.order.findMany.mockResolvedValue([
        sourceOrder({
          total: new Prisma.Decimal(95000),
          paidAmount: new Prisma.Decimal(100000),
        }), // 5.000 disponibles
        sourceOrder({
          id: 'order-src-2',
          orderNumber: 'OP-2026-0002',
          orderDate: new Date('2026-02-10'),
          total: new Prisma.Decimal(90000),
          paidAmount: new Prisma.Decimal(100000),
        }), // 10.000 disponibles
      ]);
      prisma.order.findUnique.mockResolvedValue({
        total: new Prisma.Decimal(0),
        paidAmount: new Prisma.Decimal(0),
        appliedCreditAmount: new Prisma.Decimal(0),
      });

      await service.applyCredit(prisma as any, {
        clientId: 'client-1',
        paymentId: 'pay-1',
        amount: 12000,
        targetOrderId: 'order-dst',
      });

      const amounts = prisma.creditBalanceApplication.create.mock.calls.map(
        (call: any[]) => [call[0].data.sourceOrderId, Number(call[0].data.amount)],
      );
      expect(amounts).toEqual([
        ['order-src', 5000],
        ['order-src-2', 7000],
      ]);
    });

    it('rechaza aplicar más saldo del disponible', async () => {
      prisma.order.findMany.mockResolvedValue([sourceOrder()]);

      await expect(
        service.applyCredit(prisma as any, {
          clientId: 'client-1',
          paymentId: 'pay-1',
          amount: 30000,
          targetOrderId: 'order-dst',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.creditBalanceApplication.create).not.toHaveBeenCalled();
    });
  });

  describe('releaseCredit', () => {
    it('devuelve el saldo a la orden origen y borra la traza', async () => {
      prisma.creditBalanceApplication.findMany.mockResolvedValue([
        { id: 'app-1', sourceOrderId: 'order-src', amount: new Prisma.Decimal(20000) },
      ]);
      prisma.order.findUnique.mockResolvedValue({
        total: new Prisma.Decimal(80000),
        paidAmount: new Prisma.Decimal(100000),
        appliedCreditAmount: new Prisma.Decimal(20000),
      });

      await service.releaseCredit(prisma as any, 'pay-1');

      const update = prisma.order.update.mock.calls[0][0];
      expect(Number(update.data.appliedCreditAmount)).toBe(0);
      // vuelve a quedar el saldo a favor de 20.000
      expect(Number(update.data.balance)).toBe(-20000);
      expect(prisma.creditBalanceApplication.deleteMany).toHaveBeenCalledWith({
        where: { paymentId: 'pay-1' },
      });
    });

    it('no hace nada si el pago no consumió saldo', async () => {
      prisma.creditBalanceApplication.findMany.mockResolvedValue([]);

      await service.releaseCredit(prisma as any, 'pay-1');

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.creditBalanceApplication.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('resyncCredit', () => {
    it('libera lo aplicado y no vuelve a aplicar si el pago dejó de ser CREDIT_BALANCE', async () => {
      prisma.creditBalanceApplication.findMany.mockResolvedValue([]);

      await service.resyncCredit(prisma as any, {
        paymentId: 'pay-1',
        clientId: 'client-1',
        targetOrderId: 'order-dst',
        amount: 20000,
        isCreditBalance: false,
      });

      expect(prisma.creditBalanceApplication.create).not.toHaveBeenCalled();
    });

    it('reaplica con el monto vigente si sigue siendo CREDIT_BALANCE', async () => {
      prisma.creditBalanceApplication.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([sourceOrder()]);
      prisma.order.findUnique.mockResolvedValue({
        total: new Prisma.Decimal(80000),
        paidAmount: new Prisma.Decimal(100000),
        appliedCreditAmount: new Prisma.Decimal(0),
      });

      await service.resyncCredit(prisma as any, {
        paymentId: 'pay-1',
        clientId: 'client-1',
        targetOrderId: 'order-dst',
        amount: 15000,
        isCreditBalance: true,
      });

      expect(prisma.creditBalanceApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ paymentId: 'pay-1' }),
      });
      expect(
        Number(prisma.creditBalanceApplication.create.mock.calls[0][0].data.amount),
      ).toBe(15000);
    });
  });
});
