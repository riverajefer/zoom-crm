import { Test, TestingModule } from '@nestjs/testing';
import { PendingCashEntriesService } from './pending-cash-entries.service';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { Prisma, PaymentMethod } from '../../generated/prisma';

const mockPrisma = {
  payment: { aggregate: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  cashSession: { findFirst: jest.fn() },
};
const mockConsecutives = { generateNumber: jest.fn() };

// `tx` del $transaction: es el objeto que recibe flushInto.
const mockTx: any = {
  payment: { findMany: jest.fn(), update: jest.fn() },
  cashMovement: { create: jest.fn() },
};

const makePending = (overrides: Record<string, any> = {}) => ({
  id: 'pay-1',
  amount: new Prisma.Decimal(30000),
  paymentMethod: PaymentMethod.TRANSFER,
  paymentDate: new Date('2026-08-16T14:00:00.000Z'),
  cashMovementId: null,
  order: { id: 'order-1', orderNumber: 'OP-2026-0100' },
  ...overrides,
});

describe('PendingCashEntriesService', () => {
  let service: PendingCashEntriesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingCashEntriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConsecutivesService, useValue: mockConsecutives },
      ],
    }).compile();
    service = module.get(PendingCashEntriesService);

    mockConsecutives.generateNumber.mockResolvedValue('RC-2026-9001');
    mockTx.cashMovement.create.mockResolvedValue({ id: 'mov-new' });
  });

  describe('flushInto', () => {
    it('ingresa el abono pendiente a la sesión que se abre y lo desmarca', async () => {
      mockTx.payment.findMany.mockResolvedValue([makePending()]);

      const n = await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-125');

      expect(n).toBe(1);
      expect(mockTx.cashMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cashSessionId: 'session-9',
            movementType: 'INCOME',
            paymentMethod: PaymentMethod.TRANSFER,
            referenceType: 'ORDER',
            referenceId: 'order-1',
            performedById: 'user-1',
          }),
        }),
      );
      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { cashMovementId: 'mov-new', pendingCashEntry: false },
      });
    });

    it('deja rastro de la fecha real del abono en la descripción', async () => {
      // El movimiento entra con la fecha de la sesión, así que la fecha en que
      // se cobró tiene que quedar visible o se pierde para la conciliación.
      mockTx.payment.findMany.mockResolvedValue([makePending()]);

      await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-125');

      const { description } = mockTx.cashMovement.create.mock.calls[0][0].data;
      expect(description).toContain('OP-2026-0100');
      expect(description).toContain('2026-08-16');
      expect(description).toContain('sin caja abierta');
    });

    it('no crea movimiento si el pago ya tenía uno (duplicaría el ingreso)', async () => {
      mockTx.payment.findMany.mockResolvedValue([
        makePending({ cashMovementId: 'mov-existente' }),
      ]);

      const n = await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-125');

      expect(mockTx.cashMovement.create).not.toHaveBeenCalled();
      expect(n).toBe(0);
      // Igual se baja la bandera para que no quede reintentándose.
      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { pendingCashEntry: false },
      });
    });

    it('procesa varios abonos y devuelve el conteo', async () => {
      mockTx.payment.findMany.mockResolvedValue([
        makePending({ id: 'p1' }),
        makePending({ id: 'p2' }),
        makePending({ id: 'p3' }),
      ]);

      const n = await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-125');

      expect(n).toBe(3);
      expect(mockTx.cashMovement.create).toHaveBeenCalledTimes(3);
      expect(mockConsecutives.generateNumber).toHaveBeenCalledTimes(3);
    });

    it('no hace nada si la cola está vacía', async () => {
      mockTx.payment.findMany.mockResolvedValue([]);

      const n = await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-125');

      expect(n).toBe(0);
      expect(mockTx.cashMovement.create).not.toHaveBeenCalled();
      expect(mockConsecutives.generateNumber).not.toHaveBeenCalled();
    });

    it('usa el tx recibido, no el prisma global (debe ser atómico con la apertura)', async () => {
      mockTx.payment.findMany.mockResolvedValue([makePending()]);

      await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-125');

      expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('isAnySessionOpen', () => {
    it('devuelve true cuando hay una sesión abierta', async () => {
      mockPrisma.cashSession.findFirst.mockResolvedValue({ id: 'session-1' });

      expect(await service.isAnySessionOpen()).toEqual({ isOpen: true });
    });

    it('devuelve false cuando no hay ninguna', async () => {
      mockPrisma.cashSession.findFirst.mockResolvedValue(null);

      expect(await service.isAnySessionOpen()).toEqual({ isOpen: false });
    });

    it('no expone datos de caja: solo el booleano', async () => {
      // Lo consultan las comerciales, que no tienen permiso sobre caja.
      mockPrisma.cashSession.findFirst.mockResolvedValue({
        id: 'session-1',
        openingAmount: 500000,
      });

      const res = await service.isAnySessionOpen();

      expect(Object.keys(res)).toEqual(['isOpen']);
    });
  });

  describe('getPendingSummary', () => {
    it('devuelve conteo y monto en espera', async () => {
      mockPrisma.payment.aggregate.mockResolvedValue({
        _count: 2,
        _sum: { amount: new Prisma.Decimal(75000) },
      });
      mockPrisma.payment.findMany.mockResolvedValue([makePending()]);

      const res = await service.getPendingSummary();

      expect(res.count).toBe(2);
      expect(Number(res.totalAmount.toString())).toBe(75000);
      expect(res.payments).toHaveLength(1);
    });

    it('devuelve 0 y no null cuando no hay nada en cola', async () => {
      mockPrisma.payment.aggregate.mockResolvedValue({
        _count: 0,
        _sum: { amount: null },
      });
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const res = await service.getPendingSummary();

      expect(res.count).toBe(0);
      expect(Number(res.totalAmount.toString())).toBe(0);
    });
  });

  // Solo Zoom (docs/PLAN_SEDES.md §4)
  it('al abrir una caja solo entran los abonos pendientes de su sede', async () => {
    mockTx.payment.findMany.mockResolvedValue([]);

    await service.flushInto(mockTx, 'session-9', 'user-1', 'loc-119');

    expect(mockTx.payment.findMany.mock.calls.at(-1)[0].where.order).toEqual({ locationId: 'loc-119' });
  });
});
