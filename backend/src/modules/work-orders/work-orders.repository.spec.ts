import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../../database/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';
import { WorkOrderStatus } from '../../generated/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockWorkOrderRow = {
  id: 'wo-1',
  workOrderNumber: 'OT-2026-001',
  status: WorkOrderStatus.DRAFT,
  fileName: 'diseno.pdf',
  observations: 'Ninguna',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  order: {
    id: 'order-1',
    orderNumber: 'OP-2026-001',
    deliveryDate: new Date('2026-02-01'),
    total: '500000',
    client: { id: 'client-1', name: 'Cliente Prueba' },
  },
  advisor: {
    id: 'user-1',
    firstName: 'Juan',
    lastName: 'Pérez',
    email: 'juan@example.com',
  },
  designer: null,
  items: [],
};

const mockWorkOrderItem = {
  id: 'item-1',
  workOrderId: 'wo-1',
  productDescription: 'Camiseta',
  observations: null,
};

describe('WorkOrdersRepository', () => {
  let repository: WorkOrdersRepository;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<WorkOrdersRepository>(WorkOrdersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────
  describe('findAll', () => {
    beforeEach(() => {
      (prisma.workOrder.findMany as jest.Mock).mockResolvedValue([mockWorkOrderRow]);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(1);
    });

    it('should return paginated results with correct meta when no filters', async () => {
      const result = await repository.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should apply status filter to where clause', async () => {
      await repository.findAll({ status: WorkOrderStatus.CONFIRMED });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: WorkOrderStatus.CONFIRMED }),
        }),
      );
    });

    it('should apply orderId filter to where clause', async () => {
      await repository.findAll({ orderId: 'order-1' });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orderId: 'order-1' }),
        }),
      );
    });

    it('should apply search filter with OR clause', async () => {
      await repository.findAll({ search: 'OT-001' });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { workOrderNumber: { contains: 'OT-001', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should calculate correct skip based on page and limit', async () => {
      await repository.findAll({ page: 3, limit: 10 });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should calculate totalPages correctly when total is not divisible by limit', async () => {
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(25);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  // ─────────────────────────────────────────
  // findById
  // ─────────────────────────────────────────
  describe('findById', () => {
    it('should return work order when found', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(mockWorkOrderRow);

      const result = await repository.findById('wo-1');

      expect(prisma.workOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wo-1' } }),
      );
      expect(result).toMatchObject({ id: 'wo-1', workOrderNumber: 'OT-2026-001' });
    });

    it('should return null when work order not found', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('bad-id');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // create
  // ─────────────────────────────────────────
  describe('create', () => {
    it('should call prisma.workOrder.create with items nested', async () => {
      (prisma.workOrder.create as jest.Mock).mockResolvedValue(mockWorkOrderRow);

      const data = {
        workOrderNumber: 'OT-2026-001',
        locationId: 'loc-125',
        orderId: 'order-1',
        advisorId: 'user-1',
        status: WorkOrderStatus.DRAFT,
        items: [
          {
            orderItemId: 'oi-1',
            productDescription: 'Camiseta',
            productionAreaIds: ['pa-1'],
            supplies: [{ supplyId: 'supply-1', quantity: 2 }],
          },
        ],
      };

      const result = await repository.create(data);

      expect(prisma.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workOrderNumber: 'OT-2026-001',
            locationId: 'loc-125',
            orderId: 'order-1',
            items: expect.objectContaining({ create: expect.any(Array) }),
          }),
        }),
      );
      expect(result).toMatchObject({ id: 'wo-1' });
    });

    it('should create items without productionAreas when productionAreaIds is empty', async () => {
      (prisma.workOrder.create as jest.Mock).mockResolvedValue(mockWorkOrderRow);

      await repository.create({
        workOrderNumber: 'OT-001',
        locationId: 'loc-125',
        orderId: 'order-1',
        advisorId: 'user-1',
        status: WorkOrderStatus.DRAFT,
        items: [
          {
            orderItemId: 'oi-1',
            productDescription: 'Camiseta',
            productionAreaIds: [],
            supplies: [],
          },
        ],
      });

      const createCall = (prisma.workOrder.create as jest.Mock).mock.calls[0][0];
      const itemCreate = createCall.data.items.create[0];
      expect(itemCreate.productionAreas).toBeUndefined();
      expect(itemCreate.supplies).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────
  // update
  // ─────────────────────────────────────────
  describe('update', () => {
    it('should call prisma.workOrder.update with the provided data', async () => {
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...mockWorkOrderRow,
        fileName: 'nuevo.pdf',
      });

      await repository.update('wo-1', { fileName: 'nuevo.pdf' });

      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: { fileName: 'nuevo.pdf' },
        }),
      );
    });
  });

  // ─────────────────────────────────────────
  // updateStatus
  // ─────────────────────────────────────────
  describe('updateStatus', () => {
    it('should update only the status field', async () => {
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...mockWorkOrderRow,
        status: WorkOrderStatus.CONFIRMED,
      });

      await repository.updateStatus('wo-1', WorkOrderStatus.CONFIRMED);

      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: { status: WorkOrderStatus.CONFIRMED },
        }),
      );
    });
  });

  // ─────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────
  describe('delete', () => {
    it('should call prisma.workOrder.delete with the given id', async () => {
      (prisma.workOrder.delete as jest.Mock).mockResolvedValue(mockWorkOrderRow);

      await repository.delete('wo-1');

      expect(prisma.workOrder.delete).toHaveBeenCalledWith({ where: { id: 'wo-1' } });
    });
  });

  // ─────────────────────────────────────────
  // findItemById
  // ─────────────────────────────────────────
  describe('findItemById', () => {
    it('should return item when found in the given work order', async () => {
      (prisma.workOrderItem.findFirst as jest.Mock).mockResolvedValue(mockWorkOrderItem);

      const result = await repository.findItemById('wo-1', 'item-1');

      expect(prisma.workOrderItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1', workOrderId: 'wo-1' },
        }),
      );
      expect(result).toMatchObject({ id: 'item-1' });
    });

    it('should return null when item not found', async () => {
      (prisma.workOrderItem.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await repository.findItemById('wo-1', 'bad-item');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // updateItem
  // ─────────────────────────────────────────
  describe('updateItem', () => {
    beforeEach(() => {
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));
      (prisma.workOrderItemProductionArea.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.workOrderItemProductionArea.createMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.workOrderItemSupply.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.workOrderItemSupply.createMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.workOrderItem.update as jest.Mock).mockResolvedValue(mockWorkOrderItem);
    });

    it('should replace productionAreas inside a transaction', async () => {
      await repository.updateItem('item-1', {
        productionAreaIds: ['pa-1', 'pa-2'],
      });

      expect(prisma.workOrderItemProductionArea.deleteMany).toHaveBeenCalledWith({
        where: { workOrderItemId: 'item-1' },
      });
      expect(prisma.workOrderItemProductionArea.createMany).toHaveBeenCalledWith({
        data: [
          { workOrderItemId: 'item-1', productionAreaId: 'pa-1' },
          { workOrderItemId: 'item-1', productionAreaId: 'pa-2' },
        ],
      });
    });

    it('should replace supplies inside a transaction', async () => {
      await repository.updateItem('item-1', {
        supplies: [{ supplyId: 'supply-1', quantity: 3, notes: 'urgente' }],
      });

      expect(prisma.workOrderItemSupply.deleteMany).toHaveBeenCalledWith({
        where: { workOrderItemId: 'item-1' },
      });
      expect(prisma.workOrderItemSupply.createMany).toHaveBeenCalledWith({
        data: [
          { workOrderItemId: 'item-1', supplyId: 'supply-1', quantity: 3, notes: 'urgente' },
        ],
      });
    });

    it('should not call createMany for productionAreas when empty array is provided', async () => {
      await repository.updateItem('item-1', { productionAreaIds: [] });

      expect(prisma.workOrderItemProductionArea.deleteMany).toHaveBeenCalled();
      expect(prisma.workOrderItemProductionArea.createMany).not.toHaveBeenCalled();
    });

    it('should update scalar fields on the workOrderItem', async () => {
      await repository.updateItem('item-1', { observations: 'nueva obs' });

      expect(prisma.workOrderItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: { observations: 'nueva obs' },
        }),
      );
    });
  });

  // ─────────────────────────────────────────
  // addSupplyToItem
  // ─────────────────────────────────────────
  describe('addSupplyToItem', () => {
    it('should upsert a supply on a work order item', async () => {
      const mockSupply = {
        id: 'wois-1',
        quantity: 2,
        notes: null,
        supply: { id: 'supply-1', name: 'Hilo', sku: 'HI-001' },
      };
      (prisma.workOrderItemSupply.upsert as jest.Mock).mockResolvedValue(mockSupply);

      const result = await repository.addSupplyToItem('item-1', {
        supplyId: 'supply-1',
        quantity: 2,
      });

      expect(prisma.workOrderItemSupply.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workOrderItemId_supplyId: {
              workOrderItemId: 'item-1',
              supplyId: 'supply-1',
            },
          },
          create: expect.objectContaining({ supplyId: 'supply-1', quantity: 2 }),
          update: expect.objectContaining({ quantity: 2 }),
        }),
      );
      expect(result).toMatchObject({ supply: { id: 'supply-1' } });
    });
  });

  // ─────────────────────────────────────────
  // removeSupplyFromItem
  // ─────────────────────────────────────────
  describe('removeSupplyFromItem', () => {
    it('should delete the supply from the work order item', async () => {
      (prisma.workOrderItemSupply.delete as jest.Mock).mockResolvedValue({});

      await repository.removeSupplyFromItem('item-1', 'supply-1');

      expect(prisma.workOrderItemSupply.delete).toHaveBeenCalledWith({
        where: {
          workOrderItemId_supplyId: {
            workOrderItemId: 'item-1',
            supplyId: 'supply-1',
          },
        },
      });
    });
  });
});
