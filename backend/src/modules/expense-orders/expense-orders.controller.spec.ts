import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseOrdersController } from './expense-orders.controller';
import { ExpenseOrdersService } from './expense-orders.service';
import { CreateExpenseOrderDto, UpdateExpenseOrderDto } from './dto';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { ExpenseOrderStatus } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';

describe('ExpenseOrdersController', () => {
  let controller: ExpenseOrdersController;
  let service: jest.Mocked<ExpenseOrdersService>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
      addItem: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpenseOrdersController],
      providers: [
        { provide: ExpenseOrdersService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ExpenseOrdersController>(ExpenseOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with filters', async () => {
      const filters = { page: 1, limit: 10 };
      await controller.findAll(filters);
      expect(service.findAll).toHaveBeenCalledWith(filters);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id', async () => {
      await controller.findOne('order-1');
      expect(service.findOne).toHaveBeenCalledWith('order-1');
    });
  });

  describe('create', () => {
    const user: AuthenticatedUser = {
      id: 'u1',
      email: 'test@test.com',
      username: 'testuser',
      roleId: 'r1',
    };
    const dto = {
      expenseTypeId: 't1',
      expenseSubcategoryId: 's1',
      authorizedToId: 'auth-1',
      items: [],
    } as any;

    it('should call service.create with defaults', async () => {
      await controller.create(dto, user);
      expect(service.create).toHaveBeenCalledWith(dto, 'u1', ExpenseOrderStatus.DRAFT);
    });

    it('should pass status to service.create if provided', async () => {
      await controller.create(dto, user, ExpenseOrderStatus.CREATED);
      expect(service.create).toHaveBeenCalledWith(dto, 'u1', ExpenseOrderStatus.CREATED);
    });
  });

  describe('update', () => {
    it('should call service.update with id, dto and the current user', async () => {
      const dto: UpdateExpenseOrderDto = { observations: 'test' };
      const user = { id: 'u1' } as AuthenticatedUser;
      await controller.update('order-1', dto, user);
      expect(service.update).toHaveBeenCalledWith('order-1', dto, user);
    });
  });

  describe('updateStatus', () => {
    it('should call service.updateStatus', async () => {
      const user = { id: 'u1' } as AuthenticatedUser;
      await controller.updateStatus('order-1', { status: ExpenseOrderStatus.CREATED }, user);
      expect(service.updateStatus).toHaveBeenCalledWith('order-1', { status: ExpenseOrderStatus.CREATED }, user);
    });
  });

  describe('remove', () => {
    it('should call service.remove with id', async () => {
      await controller.remove('order-1');
      expect(service.remove).toHaveBeenCalledWith('order-1');
    });
  });
});
