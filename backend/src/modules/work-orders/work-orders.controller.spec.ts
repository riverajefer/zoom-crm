jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { WorkOrderStatus } from '../../generated/prisma';

const mockWorkOrdersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  findOneForView: jest.fn(),
  lookupInOtherLocations: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
  addSupplyToItem: jest.fn(),
  removeSupplyFromItem: jest.fn(),
};

const mockUser = {
  id: 'user-1',
  email: 'advisor@example.com',
  permissions: ['read_work_orders', 'create_work_orders', 'update_work_orders', 'delete_work_orders'],
};

const mockWorkOrder = {
  id: 'wo-1',
  workOrderNumber: 'OT-2026-001',
  status: WorkOrderStatus.DRAFT,
};

describe('WorkOrdersController', () => {
  let controller: WorkOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkOrdersController],
      providers: [
        { provide: WorkOrdersService, useValue: mockWorkOrdersService },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkOrdersController>(WorkOrdersController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────
  describe('findAll', () => {
    it('should delegate to workOrdersService.findAll with filters', async () => {
      const filters = { status: WorkOrderStatus.DRAFT, page: 1, limit: 20 } as any;
      mockWorkOrdersService.findAll.mockResolvedValue({ data: [mockWorkOrder], meta: {} });

      const result = await controller.findAll(filters);

      expect(mockWorkOrdersService.findAll).toHaveBeenCalledWith(filters);
      expect(result).toMatchObject({ data: [mockWorkOrder] });
    });
  });

  // ─────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────
  describe('findOne', () => {
    it('should delegate to workOrdersService.findOneForView with id', async () => {
      mockWorkOrdersService.findOneForView.mockResolvedValue(mockWorkOrder);

      const result = await controller.findOne('wo-1');

      expect(mockWorkOrdersService.findOneForView).toHaveBeenCalledWith('wo-1');
      expect(result).toEqual(mockWorkOrder);
    });
  });

  // ─────────────────────────────────────────
  // create
  // ─────────────────────────────────────────
  describe('create', () => {
    it('should delegate with DRAFT status when no status query param', async () => {
      const dto = { orderId: 'order-1', items: [] } as any;
      mockWorkOrdersService.create.mockResolvedValue(mockWorkOrder);

      await controller.create(dto, mockUser as any, undefined);

      expect(mockWorkOrdersService.create).toHaveBeenCalledWith(
        dto,
        'user-1',
        WorkOrderStatus.DRAFT,
      );
    });

    it('should delegate with CONFIRMED status when status=CONFIRMED is passed', async () => {
      const dto = { orderId: 'order-1', items: [] } as any;
      mockWorkOrdersService.create.mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CONFIRMED,
      });

      await controller.create(dto, mockUser as any, WorkOrderStatus.CONFIRMED);

      expect(mockWorkOrdersService.create).toHaveBeenCalledWith(
        dto,
        'user-1',
        WorkOrderStatus.CONFIRMED,
      );
    });

    it('should use DRAFT status when an invalid status is passed', async () => {
      mockWorkOrdersService.create.mockResolvedValue(mockWorkOrder);

      await controller.create({} as any, mockUser as any, 'IN_PRODUCTION' as any);

      expect(mockWorkOrdersService.create).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        WorkOrderStatus.DRAFT,
      );
    });
  });

  // ─────────────────────────────────────────
  // update
  // ─────────────────────────────────────────
  describe('update', () => {
    it('should delegate to workOrdersService.update with id and dto', async () => {
      const dto = { fileName: 'nuevo.pdf' } as any;
      mockWorkOrdersService.update.mockResolvedValue(mockWorkOrder);

      await controller.update('wo-1', dto);

      expect(mockWorkOrdersService.update).toHaveBeenCalledWith('wo-1', dto);
    });
  });

  // ─────────────────────────────────────────
  // updateStatus
  // ─────────────────────────────────────────
  describe('updateStatus', () => {
    it('should delegate to workOrdersService.updateStatus with id and dto', async () => {
      const dto = { status: WorkOrderStatus.CONFIRMED } as any;
      mockWorkOrdersService.updateStatus.mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.CONFIRMED,
      });

      const mockUser = { id: 'user-1', email: 'admin@test.com' } as any;
      await controller.updateStatus('wo-1', dto, mockUser);

      expect(mockWorkOrdersService.updateStatus).toHaveBeenCalledWith('wo-1', dto, mockUser);
    });
  });

  // ─────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────
  describe('remove', () => {
    it('should delegate to workOrdersService.remove with id', async () => {
      mockWorkOrdersService.remove.mockResolvedValue(undefined);

      await controller.remove('wo-1');

      expect(mockWorkOrdersService.remove).toHaveBeenCalledWith('wo-1');
    });
  });

  // ─────────────────────────────────────────
  // addSupplyToItem
  // ─────────────────────────────────────────
  describe('addSupplyToItem', () => {
    it('should delegate to workOrdersService.addSupplyToItem with correct params', async () => {
      const dto = { supplyId: 'supply-1', quantity: 3 } as any;
      mockWorkOrdersService.addSupplyToItem.mockResolvedValue({
        id: 'wois-1',
        supply: { id: 'supply-1' },
      });

      const result = await controller.addSupplyToItem('wo-1', 'woi-1', dto);

      expect(mockWorkOrdersService.addSupplyToItem).toHaveBeenCalledWith('wo-1', 'woi-1', dto);
      expect(result).toMatchObject({ supply: { id: 'supply-1' } });
    });
  });

  // ─────────────────────────────────────────
  // removeSupplyFromItem
  // ─────────────────────────────────────────
  describe('removeSupplyFromItem', () => {
    it('should delegate to workOrdersService.removeSupplyFromItem with correct params', async () => {
      mockWorkOrdersService.removeSupplyFromItem.mockResolvedValue(undefined);

      await controller.removeSupplyFromItem('wo-1', 'woi-1', 'supply-1');

      expect(mockWorkOrdersService.removeSupplyFromItem).toHaveBeenCalledWith(
        'wo-1',
        'woi-1',
        'supply-1',
      );
    });
  });
});
