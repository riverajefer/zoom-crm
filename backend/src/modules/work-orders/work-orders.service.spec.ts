import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';
import { WorkOrderStatus, WorkOrderTimeEntryType } from '../../generated/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockOrder = {
  id: 'order-1',
  orderNumber: 'OP-2026-001',
  locationId: 'loc-125',
  status: 'CONFIRMED',
  items: [
    { id: 'oi-1', description: 'Camiseta talla M' },
    { id: 'oi-2', description: 'Camiseta talla L' },
  ],
};

const mockWorkOrder = {
  id: 'wo-1',
  workOrderNumber: 'OT-2026-001',
  status: WorkOrderStatus.DRAFT,
  order: { id: 'order-1', orderNumber: 'OP-2026-001' },
  items: [
    { id: 'woi-1', orderItem: { id: 'oi-1' } },
    { id: 'woi-2', orderItem: { id: 'oi-2' } },
  ],
};

const mockWorkOrderItem = {
  id: 'woi-1',
  workOrderId: 'wo-1',
  productDescription: 'Camiseta talla M',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockWorkOrdersRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findItemById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  updateItem: jest.fn(),
  addSupplyToItem: jest.fn(),
  removeSupplyFromItem: jest.fn(),
  delete: jest.fn(),
  createTimeEntry: jest.fn(),
  updateTimeEntry: jest.fn(),
  deleteTimeEntry: jest.fn(),
  findTimeEntryById: jest.fn(),
};

const mockConsecutivesService = {
  generateNumber: jest.fn(),
  syncWorkOrderCounter: jest.fn(),
};

const mockInventoryService = {
  handleWorkOrderCompletion: jest.fn(),
  // Add other required methods if needed
};

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: WorkOrdersRepository, useValue: mockWorkOrdersRepository },
        { provide: ConsecutivesService, useValue: mockConsecutivesService },
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);

    // Defaults
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
    (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue(null);
    (mockConsecutivesService.generateNumber as jest.Mock).mockResolvedValue('OT-2026-001');
    (mockWorkOrdersRepository.create as jest.Mock).mockResolvedValue(mockWorkOrder);
    (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(mockWorkOrder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────
  // create
  // ─────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      orderId: 'order-1',
      items: [
        { orderItemId: 'oi-1', productDescription: 'Camiseta talla M' },
      ],
    };

    it('should create a work order with DRAFT status by default', async () => {
      const result = await service.create(createDto as any, 'user-1');

      expect(mockConsecutivesService.generateNumber).toHaveBeenCalledWith('WORK_ORDER', 'loc-125');
      expect(mockWorkOrdersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workOrderNumber: 'OT-2026-001',
          orderId: 'order-1',
          advisorId: 'user-1',
          status: WorkOrderStatus.DRAFT,
        }),
      );
      expect(result).toMatchObject({ id: 'wo-1' });
    });

    it('should create a work order with CONFIRMED status when explicitly passed', async () => {
      await service.create(createDto as any, 'user-1', WorkOrderStatus.CONFIRMED);

      expect(mockWorkOrdersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: WorkOrderStatus.CONFIRMED }),
      );
    });

    it('should throw NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(
        new NotFoundException('Orden con id order-1 no encontrada'),
      );
    });

    it('should throw BadRequestException when order is in DRAFT status', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: 'DRAFT',
      });

      await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when order is in CANCELLED status', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: 'CANCELLED',
      });

      await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow creation when order is in IN_PRODUCTION status', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: 'IN_PRODUCTION',
      });

      await expect(service.create(createDto as any, 'user-1')).resolves.toBeDefined();
    });

    it('should allow creation when order is in READY status', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: 'READY',
      });

      await expect(service.create(createDto as any, 'user-1')).resolves.toBeDefined();
    });

    it('should throw BadRequestException when order already has an active work order', async () => {
      (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue({
        workOrderNumber: 'OT-2026-000',
      });

      await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when an orderItemId does not belong to the order', async () => {
      const dtoWithBadItem = {
        orderId: 'order-1',
        items: [{ orderItemId: 'oi-INVALID', productDescription: 'Algo' }],
      };

      await expect(service.create(dtoWithBadItem as any, 'user-1')).rejects.toThrow(
        new BadRequestException(
          'El item con orderItemId oi-INVALID no pertenece a la orden order-1',
        ),
      );
    });

    it('should use order item description when productDescription is not provided', async () => {
      const dtoWithoutDesc = {
        orderId: 'order-1',
        items: [{ orderItemId: 'oi-1' }],
      };

      await service.create(dtoWithoutDesc as any, 'user-1');

      expect(mockWorkOrdersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ productDescription: 'Camiseta talla M' }),
          ]),
        }),
      );
    });
  });

  // ─────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────
  describe('findAll', () => {
    it('should delegate to repository with filters', async () => {
      const filters = { status: WorkOrderStatus.DRAFT, page: 1, limit: 20 };
      (mockWorkOrdersRepository.findAll as jest.Mock).mockResolvedValue({
        data: [mockWorkOrder],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const result = await service.findAll(filters as any);

      expect(mockWorkOrdersRepository.findAll).toHaveBeenCalledWith(filters);
      expect(result.data).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────
  describe('findOne', () => {
    it('should return work order when found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(mockWorkOrder);

      const result = await service.findOne('wo-1');

      expect(mockWorkOrdersRepository.findById).toHaveBeenCalledWith('wo-1');
      expect(result).toMatchObject({ id: 'wo-1' });
    });

    it('should throw NotFoundException when work order not found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(
        new NotFoundException('OT con id bad-id no encontrada'),
      );
    });
  });

  // ─────────────────────────────────────────
  // update
  // ─────────────────────────────────────────
  describe('update', () => {
    it('should update scalar fields on a DRAFT work order', async () => {
      (mockWorkOrdersRepository.update as jest.Mock).mockResolvedValue(mockWorkOrder);
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(mockWorkOrder);

      const dto = { fileName: 'nuevo.pdf' };
      await service.update('wo-1', dto as any);

      expect(mockWorkOrdersRepository.update).toHaveBeenCalledWith('wo-1', { fileName: 'nuevo.pdf' });
    });

    it('should update scalar fields on a CONFIRMED work order', async () => {
      const confirmedWorkOrder = { ...mockWorkOrder, status: WorkOrderStatus.CONFIRMED };
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(confirmedWorkOrder);
      (mockWorkOrdersRepository.update as jest.Mock).mockResolvedValue(confirmedWorkOrder);

      await service.update('wo-1', { fileName: 'updated.pdf' } as any);

      expect(mockWorkOrdersRepository.update).toHaveBeenCalled();
    });

    it('should update scalar fields on an IN_PRODUCTION work order', async () => {
      const inProductionWorkOrder = { ...mockWorkOrder, status: WorkOrderStatus.IN_PRODUCTION };
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(inProductionWorkOrder);
      (mockWorkOrdersRepository.update as jest.Mock).mockResolvedValue(inProductionWorkOrder);

      await service.update('wo-1', { fileName: 'updated-in-production.pdf' } as any);

      expect(mockWorkOrdersRepository.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when work order is COMPLETED', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.COMPLETED,
      });

      await expect(service.update('wo-1', { fileName: 'x.pdf' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when work order is CANCELLED', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CANCELLED,
      });

      await expect(service.update('wo-1', { fileName: 'x.pdf' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when work order not found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.update('bad-id', {} as any)).rejects.toThrow(
        new NotFoundException('OT con id bad-id no encontrada'),
      );
    });

    it('should reconcile items when items array is provided', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        items: [{ id: 'oi-1', description: 'Camiseta' }],
      });
      (mockWorkOrdersRepository.updateItem as jest.Mock).mockResolvedValue(mockWorkOrderItem);
      (mockWorkOrdersRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockWorkOrder)
        .mockResolvedValue(mockWorkOrder);

      const dto = {
        items: [{ orderItemId: 'oi-1', productDescription: 'Camiseta actualizada' }],
      };

      await service.update('wo-1', dto as any);

      expect(mockWorkOrdersRepository.updateItem).toHaveBeenCalledWith(
        'woi-1',
        expect.objectContaining({ productDescription: 'Camiseta actualizada' }),
      );
    });
  });

  // ─────────────────────────────────────────
  // updateStatus
  // ─────────────────────────────────────────
  describe('updateStatus', () => {
    it('should transition DRAFT → CONFIRMED successfully', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.DRAFT,
      });
      (mockWorkOrdersRepository.updateStatus as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CONFIRMED,
      });

      const result = await service.updateStatus('wo-1', {
        status: WorkOrderStatus.CONFIRMED,
      });

      expect(mockWorkOrdersRepository.updateStatus).toHaveBeenCalledWith(
        'wo-1',
        WorkOrderStatus.CONFIRMED,
      );
      expect(result).toMatchObject({ status: WorkOrderStatus.CONFIRMED });
    });

    it('should transition DRAFT → CANCELLED successfully', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.DRAFT,
      });
      (mockWorkOrdersRepository.updateStatus as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CANCELLED,
      });

      await service.updateStatus('wo-1', { status: WorkOrderStatus.CANCELLED });

      expect(mockWorkOrdersRepository.updateStatus).toHaveBeenCalledWith(
        'wo-1',
        WorkOrderStatus.CANCELLED,
      );
    });

    it('should transition CONFIRMED → IN_PRODUCTION successfully', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CONFIRMED,
      });
      (mockWorkOrdersRepository.updateStatus as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.IN_PRODUCTION,
      });

      await service.updateStatus('wo-1', { status: WorkOrderStatus.IN_PRODUCTION });

      expect(mockWorkOrdersRepository.updateStatus).toHaveBeenCalledWith(
        'wo-1',
        WorkOrderStatus.IN_PRODUCTION,
      );
    });

    it('should transition IN_PRODUCTION → COMPLETED successfully', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.IN_PRODUCTION,
      });
      (mockWorkOrdersRepository.updateStatus as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.COMPLETED,
      });

      await service.updateStatus('wo-1', { status: WorkOrderStatus.COMPLETED });

      expect(mockWorkOrdersRepository.updateStatus).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid transition DRAFT → COMPLETED', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.DRAFT,
      });

      await expect(
        service.updateStatus('wo-1', { status: WorkOrderStatus.COMPLETED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid transition COMPLETED → DRAFT', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.COMPLETED,
      });

      await expect(
        service.updateStatus('wo-1', { status: WorkOrderStatus.DRAFT }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid transition CANCELLED → CONFIRMED', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CANCELLED,
      });

      await expect(
        service.updateStatus('wo-1', { status: WorkOrderStatus.CONFIRMED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when work order not found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateStatus('bad-id', { status: WorkOrderStatus.CONFIRMED }),
      ).rejects.toThrow(new NotFoundException('OT con id bad-id no encontrada'));
    });
  });

  // ─────────────────────────────────────────
  // addSupplyToItem
  // ─────────────────────────────────────────
  describe('addSupplyToItem', () => {
    const addSupplyDto = { supplyId: 'supply-1', quantity: 3 };

    beforeEach(() => {
      (mockWorkOrdersRepository.findItemById as jest.Mock).mockResolvedValue(mockWorkOrderItem);
      (mockWorkOrdersRepository.addSupplyToItem as jest.Mock).mockResolvedValue({
        id: 'wois-1',
        supply: { id: 'supply-1', name: 'Hilo' },
      });
    });

    it('should add a supply to a work order item', async () => {
      const result = await service.addSupplyToItem('wo-1', 'woi-1', addSupplyDto as any);

      expect(mockWorkOrdersRepository.findById).toHaveBeenCalledWith('wo-1');
      expect(mockWorkOrdersRepository.findItemById).toHaveBeenCalledWith('wo-1', 'woi-1');
      expect(mockWorkOrdersRepository.addSupplyToItem).toHaveBeenCalledWith(
        'woi-1',
        expect.objectContaining({ supplyId: 'supply-1', quantity: 3 }),
      );
      expect(result).toMatchObject({ supply: { id: 'supply-1' } });
    });

    it('should throw NotFoundException when work order not found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addSupplyToItem('bad-wo', 'woi-1', addSupplyDto as any),
      ).rejects.toThrow(new NotFoundException('OT con id bad-wo no encontrada'));
    });

    it('should throw NotFoundException when item does not belong to work order', async () => {
      (mockWorkOrdersRepository.findItemById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addSupplyToItem('wo-1', 'bad-item', addSupplyDto as any),
      ).rejects.toThrow(
        new NotFoundException('Item con id bad-item no encontrado en la OT wo-1'),
      );
    });
  });

  // ─────────────────────────────────────────
  // removeSupplyFromItem
  // ─────────────────────────────────────────
  describe('removeSupplyFromItem', () => {
    beforeEach(() => {
      (mockWorkOrdersRepository.findItemById as jest.Mock).mockResolvedValue(mockWorkOrderItem);
      (mockWorkOrdersRepository.removeSupplyFromItem as jest.Mock).mockResolvedValue({});
    });

    it('should remove a supply from a work order item', async () => {
      await service.removeSupplyFromItem('wo-1', 'woi-1', 'supply-1');

      expect(mockWorkOrdersRepository.removeSupplyFromItem).toHaveBeenCalledWith(
        'woi-1',
        'supply-1',
      );
    });

    it('should throw NotFoundException when work order not found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeSupplyFromItem('bad-wo', 'woi-1', 'supply-1'),
      ).rejects.toThrow(new NotFoundException('OT con id bad-wo no encontrada'));
    });

    it('should throw NotFoundException when item not found', async () => {
      (mockWorkOrdersRepository.findItemById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeSupplyFromItem('wo-1', 'bad-item', 'supply-1'),
      ).rejects.toThrow(
        new NotFoundException('Item con id bad-item no encontrado en la OT wo-1'),
      );
    });
  });

  // ─────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────
  describe('remove', () => {
    it('should delete a work order in DRAFT status', async () => {
      (mockWorkOrdersRepository.delete as jest.Mock).mockResolvedValue(mockWorkOrder);

      await service.remove('wo-1');

      expect(mockWorkOrdersRepository.delete).toHaveBeenCalledWith('wo-1');
    });

    it('should throw NotFoundException when work order not found', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow(
        new NotFoundException('OT con id bad-id no encontrada'),
      );
    });

    it('should throw BadRequestException when work order is CONFIRMED', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CONFIRMED,
      });

      await expect(service.remove('wo-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when work order is IN_PRODUCTION', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.IN_PRODUCTION,
      });

      await expect(service.remove('wo-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when work order is COMPLETED', async () => {
      (mockWorkOrdersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.COMPLETED,
      });

      await expect(service.remove('wo-1')).rejects.toThrow(BadRequestException);
    });
  });
});
