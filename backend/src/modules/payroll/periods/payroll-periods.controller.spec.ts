import { Test, TestingModule } from '@nestjs/testing';
import { PayrollPeriodsController } from './payroll-periods.controller';
import { PayrollPeriodsService } from './payroll-periods.service';
import { PayrollItemsService } from '../items/payroll-items.service';
import { PrismaService } from '../../../database/prisma.service';
import { PayrollPaymentsService } from '../payments/payroll-payments.service';

describe('PayrollPeriodsController', () => {
  let controller: PayrollPeriodsController;
  let periodsService: jest.Mocked<PayrollPeriodsService>;
  let itemsService: jest.Mocked<PayrollItemsService>;

  beforeEach(async () => {
    periodsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getSummary: jest.fn(),
      generateItems: jest.fn(),
    } as any;

    itemsService = {
      findByPeriod: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollPeriodsController],
      providers: [
        { provide: PayrollPeriodsService, useValue: periodsService },
        { provide: PayrollItemsService, useValue: itemsService },
        { provide: PayrollPaymentsService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PayrollPeriodsController>(PayrollPeriodsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return a list of periods', async () => {
      const result: any = { data: [], meta: { total: 0 } };
      periodsService.findAll.mockResolvedValue(result);

      expect(await controller.findAll()).toBe(result);
      expect(periodsService.findAll).toHaveBeenCalledWith();
    });
  });

  describe('findOne', () => {
    it('should return a period by id', async () => {
      const result: any = { id: 'p1' };
      periodsService.findOne.mockResolvedValue(result);

      expect(await controller.findOne('p1')).toBe(result);
      expect(periodsService.findOne).toHaveBeenCalledWith('p1');
    });
  });

  describe('create', () => {
    it('should create a period', async () => {
      const dto: any = { status: 'OPEN', year: 2024, month: 1 };
      const expectedResult: any = { id: 'p1', ...dto };
      periodsService.create.mockResolvedValue(expectedResult);

      expect(await controller.create(dto)).toBe(expectedResult);
      expect(periodsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should update a period', async () => {
      const dto: any = { status: 'CLOSED' };
      const expectedResult: any = { id: 'p1', ...dto };
      periodsService.update.mockResolvedValue(expectedResult);

      expect(await controller.update('p1', dto)).toBe(expectedResult);
      expect(periodsService.update).toHaveBeenCalledWith('p1', dto);
    });
  });

  describe('remove', () => {
    it('should delete a period', async () => {
      periodsService.remove.mockResolvedValue({ message: 'Deleted' } as any);
      const res = await controller.remove('p1');
      expect(periodsService.remove).toHaveBeenCalledWith('p1');
      expect(res).toEqual({ message: 'Deleted' });
    });
  });

  describe('getSummary', () => {
    it('should return period summary', async () => {
      const summary = { totalPayment: 3000, totalBaseSalary: 2400 };
      periodsService.getSummary.mockResolvedValue(summary as any);
      const result = await controller.getSummary('p1');
      expect(periodsService.getSummary).toHaveBeenCalledWith('p1');
      expect(result).toBe(summary);
    });
  });

  describe('generateItems', () => {
    it('should generate items for the period', async () => {
      const response = { message: 'Generated', count: 5 };
      periodsService.generateItems.mockResolvedValue(response as any);
      const result = await controller.generateItems('p1');
      expect(periodsService.generateItems).toHaveBeenCalledWith('p1');
      expect(result).toBe(response);
    });
  });

  describe('getItems', () => {
    it('should return items for a period', async () => {
      const items = [{ id: 'i1' }];
      itemsService.findByPeriod.mockResolvedValue(items as any);
      const result = await controller.getItems('p1');
      expect(itemsService.findByPeriod).toHaveBeenCalledWith('p1');
      expect(result).toBe(items);
    });
  });

  describe('createItem', () => {
    it('should create an item in the period', async () => {
      const dto: any = { employeeId: 'e1', baseSalary: 1000 };
      const created = { id: 'i1', ...dto };
      itemsService.create.mockResolvedValue(created as any);
      const result = await controller.createItem('p1', dto);
      expect(itemsService.create).toHaveBeenCalledWith('p1', dto);
      expect(result).toBe(created);
    });
  });

  describe('updateItem', () => {
    it('should update an item in the period', async () => {
      const dto: any = { baseSalary: 2000 };
      const updated = { id: 'i1', ...dto };
      itemsService.update.mockResolvedValue(updated as any);
      const result = await controller.updateItem('p1', 'i1', dto);
      expect(itemsService.update).toHaveBeenCalledWith('p1', 'i1', dto);
      expect(result).toBe(updated);
    });
  });

  describe('removeItem', () => {
    it('should remove an item from the period', async () => {
      const response = { message: 'Deleted' };
      itemsService.remove.mockResolvedValue(response as any);
      const result = await controller.removeItem('p1', 'i1');
      expect(itemsService.remove).toHaveBeenCalledWith('p1', 'i1');
      expect(result).toBe(response);
    });
  });
});
