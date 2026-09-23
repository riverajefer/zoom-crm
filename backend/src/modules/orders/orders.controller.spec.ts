jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CanEditOrderGuard } from '../../common/guards/can-edit-order.guard';

const mockOrdersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
  addPayment: jest.fn(),
  getPayments: jest.fn(),
  uploadPaymentReceipt: jest.fn(),
  deletePaymentReceipt: jest.fn(),
  registerElectronicInvoice: jest.fn(),
  applyDiscount: jest.fn(),
  getDiscounts: jest.fn(),
  removeDiscount: jest.fn(),
};

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard).useValue({ canActivate: () => true })
      .overrideGuard(CanEditOrderGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('should delegate to ordersService.findAll with filters', async () => {
      const filters = { status: 'PENDING' } as any;
      mockOrdersService.findAll.mockResolvedValue({ data: [], meta: {} });
      await controller.findAll(filters);
      expect(mockOrdersService.findAll).toHaveBeenCalledWith(filters);
    });
  });

  describe('findOne', () => {
    it('should delegate to ordersService.findOne', async () => {
      mockOrdersService.findOne.mockResolvedValue({ id: 'order-1' });
      const result = await controller.findOne('order-1');
      expect(mockOrdersService.findOne).toHaveBeenCalledWith('order-1');
      expect(result).toEqual({ id: 'order-1' });
    });
  });

  describe('create', () => {
    it('should delegate to ordersService.create with dto and userId', async () => {
      const dto = { clientId: 'client-1' } as any;
      mockOrdersService.create.mockResolvedValue({ id: 'order-1' });
      await controller.create(dto, 'user-1');
      expect(mockOrdersService.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('update', () => {
    it('should delegate to ordersService.update', async () => {
      const dto = { notes: 'Updated notes' } as any;
      mockOrdersService.update.mockResolvedValue({ id: 'order-1' });
      await controller.update('order-1', dto, 'user-1');
      expect(mockOrdersService.update).toHaveBeenCalledWith('order-1', dto, 'user-1');
    });
  });

  describe('updateStatus', () => {
    it('should delegate to ordersService.updateStatus', async () => {
      const dto = { status: 'ANULADO', retainedAmount: 150000 } as any;
      mockOrdersService.updateStatus.mockResolvedValue({ id: 'order-1' });
      await controller.updateStatus('order-1', dto, 'user-1');
      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'ANULADO',
        'user-1',
        { retainedAmount: 150000 },
      );
    });
  });

  describe('remove', () => {
    it('should delegate to ordersService.remove', async () => {
      mockOrdersService.remove.mockResolvedValue({ id: 'order-1' });
      await controller.remove('order-1', 'user-1');
      expect(mockOrdersService.remove).toHaveBeenCalledWith('order-1', 'user-1');
    });
  });

  describe('addItem', () => {
    it('should delegate to ordersService.addItem', async () => {
      const dto = { description: 'Camiseta' } as any;
      mockOrdersService.addItem.mockResolvedValue({ id: 'item-1' });
      await controller.addItem('order-1', dto);
      expect(mockOrdersService.addItem).toHaveBeenCalledWith('order-1', dto);
    });
  });

  describe('updateItem', () => {
    it('should delegate to ordersService.updateItem', async () => {
      const dto = { quantity: 5 } as any;
      mockOrdersService.updateItem.mockResolvedValue({ id: 'item-1' });
      await controller.updateItem('order-1', 'item-1', dto);
      expect(mockOrdersService.updateItem).toHaveBeenCalledWith('order-1', 'item-1', dto);
    });
  });

  describe('removeItem', () => {
    it('should delegate to ordersService.removeItem', async () => {
      mockOrdersService.removeItem.mockResolvedValue({ id: 'item-1' });
      await controller.removeItem('order-1', 'item-1');
      expect(mockOrdersService.removeItem).toHaveBeenCalledWith('order-1', 'item-1');
    });
  });

  describe('addPayment', () => {
    it('should delegate to ordersService.addPayment', async () => {
      const dto = { amount: 500000 } as any;
      mockOrdersService.addPayment.mockResolvedValue({ id: 'pay-1' });
      await controller.addPayment('order-1', dto, 'user-1');
      expect(mockOrdersService.addPayment).toHaveBeenCalledWith('order-1', dto, 'user-1');
    });
  });

  describe('getPayments', () => {
    it('should delegate to ordersService.getPayments', async () => {
      mockOrdersService.getPayments.mockResolvedValue([]);
      await controller.getPayments('order-1');
      expect(mockOrdersService.getPayments).toHaveBeenCalledWith('order-1');
    });
  });

  describe('uploadPaymentReceipt', () => {
    it('should delegate to ordersService.uploadPaymentReceipt', async () => {
      const file = { originalname: 'receipt.pdf' } as any;
      mockOrdersService.uploadPaymentReceipt.mockResolvedValue({ url: 'https://s3.example.com/r.pdf' });
      await controller.uploadPaymentReceipt('order-1', 'pay-1', file, 'user-1');
      expect(mockOrdersService.uploadPaymentReceipt).toHaveBeenCalledWith('order-1', 'pay-1', file, 'user-1');
    });
  });

  describe('deletePaymentReceipt', () => {
    it('should delegate to ordersService.deletePaymentReceipt', async () => {
      mockOrdersService.deletePaymentReceipt.mockResolvedValue(undefined);
      await controller.deletePaymentReceipt('order-1', 'pay-1');
      expect(mockOrdersService.deletePaymentReceipt).toHaveBeenCalledWith('order-1', 'pay-1');
    });
  });

  describe('registerElectronicInvoice', () => {
    it('should delegate to ordersService.registerElectronicInvoice', async () => {
      const dto = { electronicInvoiceNumber: 'FE-001' } as any;
      mockOrdersService.registerElectronicInvoice.mockResolvedValue({ id: 'order-1' });
      await controller.registerElectronicInvoice('order-1', dto, 'user-1');
      expect(mockOrdersService.registerElectronicInvoice).toHaveBeenCalledWith('order-1', 'FE-001', 'user-1');
    });
  });

  describe('applyDiscount', () => {
    it('should delegate to ordersService.applyDiscount', async () => {
      const dto = { percentage: 10 } as any;
      mockOrdersService.applyDiscount.mockResolvedValue({ id: 'disc-1' });
      await controller.applyDiscount('order-1', dto, 'user-1');
      expect(mockOrdersService.applyDiscount).toHaveBeenCalledWith('order-1', dto, 'user-1');
    });
  });

  describe('getDiscounts', () => {
    it('should delegate to ordersService.getDiscounts', async () => {
      mockOrdersService.getDiscounts.mockResolvedValue([]);
      await controller.getDiscounts('order-1');
      expect(mockOrdersService.getDiscounts).toHaveBeenCalledWith('order-1');
    });
  });

  describe('removeDiscount', () => {
    it('should delegate to ordersService.removeDiscount', async () => {
      mockOrdersService.removeDiscount.mockResolvedValue(undefined);
      await controller.removeDiscount('order-1', 'disc-1');
      expect(mockOrdersService.removeDiscount).toHaveBeenCalledWith('order-1', 'disc-1');
    });
  });
});
