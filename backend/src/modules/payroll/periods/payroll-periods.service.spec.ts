import { Test, TestingModule } from '@nestjs/testing';
import { PayrollPeriodsService } from './payroll-periods.service';
import { PayrollPeriodsRepository } from './payroll-periods.repository';
import { PayrollItemsRepository } from '../items/payroll-items.repository';
import { PayrollEmployeesRepository } from '../employees/payroll-employees.repository';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PayrollPeriodType } from './dto/create-payroll-period.dto';

describe('PayrollPeriodsService', () => {
  let service: PayrollPeriodsService;
  let periodsRepository: jest.Mocked<PayrollPeriodsRepository>;
  let itemsRepository: jest.Mocked<PayrollItemsRepository>;
  let employeesRepository: jest.Mocked<PayrollEmployeesRepository>;

  beforeEach(async () => {
    periodsRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      createWithItems: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getSummary: jest.fn(),
      countAppliedDeductions: jest.fn().mockResolvedValue(0),
      countPayments: jest.fn().mockResolvedValue(0),
    } as any;

    itemsRepository = {
      createMany: jest.fn(),
    } as any;

    employeesRepository = {
      findAll: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollPeriodsService,
        { provide: PayrollPeriodsRepository, useValue: periodsRepository },
        { provide: PayrollItemsRepository, useValue: itemsRepository },
        { provide: PayrollEmployeesRepository, useValue: employeesRepository },
      ],
    }).compile();

    service = module.get<PayrollPeriodsService>(PayrollPeriodsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all periods', async () => {
      periodsRepository.findAll.mockResolvedValue([{ id: 'p1' }] as any);
      const result = await service.findAll();
      expect(result).toEqual([{ id: 'p1' }]);
    });
  });

  describe('findOne', () => {
    it('should return a period', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      expect(await service.findOne('p1')).toEqual({ id: 'p1' });
    });

    it('should throw NotFoundException if not found', async () => {
      periodsRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('p1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'Enero 2024',
      startDate: new Date('2024-01-01').toISOString(),
      endDate: new Date('2024-01-31').toISOString(),
      periodType: PayrollPeriodType.MONTHLY,
      overtimeDaytimeRate: 1.5,
      overtimeNighttimeRate: 2.0,
    };

    it('should create a period', async () => {
      periodsRepository.create.mockResolvedValue({ id: 'p1', ...createDto } as any);
      const result = await service.create(createDto);
      expect(periodsRepository.create).toHaveBeenCalled();
      expect(result.id).toBe('p1');
    });

    it('should throw BadRequestException if startDate >= endDate', async () => {
      await expect(service.create({ ...createDto, startDate: '2024-02-01' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('clone', () => {
    const cloneDto = {
      name: '2 QUINCENA ENERO 2026',
      startDate: new Date('2026-01-16').toISOString(),
      endDate: new Date('2026-01-31').toISOString(),
    };

    const sourcePeriod = {
      id: 'p1',
      name: '1 QUINCENA ENERO 2026',
      periodType: 'BIWEEKLY',
      status: 'PAID',
      overtimeDaytimeRate: 9950,
      overtimeNighttimeRate: 13900,
      overtimeDaytimeFestiveRate: 17927,
      overtimeNighttimeFestiveRate: 22096,
      notes: 'Notas del periodo',
      payrollItems: [
        {
          id: 'i1',
          daysWorked: 15,
          baseSalary: 1000000,
          restDayValue: 50000,
          transportAllowance: 100000,
          epsAndPensionDiscount: 80000,
          employeeFundSavings: 30000,
          // Novedades que NO deben copiarse
          overtimeDaytimeHours: 4,
          overtimeDaytimeValue: 39800,
          commissions: 200000,
          loans: 150000,
          advances: 300000,
          workdayDiscount: 20000,
          nonPaidDays: 10000,
          observations: 'Incapacidad 2 días',
          employee: { id: 'e1', status: 'ACTIVE' },
        },
        {
          id: 'i2',
          daysWorked: 15,
          baseSalary: 900000,
          restDayValue: null,
          transportAllowance: null,
          epsAndPensionDiscount: null,
          employeeFundSavings: null,
          employee: { id: 'e2', status: 'INACTIVE' },
        },
      ],
    };

    it('should throw NotFoundException if source period does not exist', async () => {
      periodsRepository.findById.mockResolvedValue(null);
      await expect(service.clone('p1', cloneDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if startDate >= endDate', async () => {
      periodsRepository.findById.mockResolvedValue(sourcePeriod as any);
      await expect(
        service.clone('p1', { ...cloneDto, startDate: '2026-02-01', endDate: '2026-01-16' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should copy period config, skip inactive employees and reset novelties', async () => {
      periodsRepository.findById.mockResolvedValue(sourcePeriod as any);
      periodsRepository.createWithItems.mockResolvedValue({
        period: { id: 'p2', name: cloneDto.name },
        itemsCount: 1,
      } as any);

      const result = await service.clone('p1', cloneDto);

      const [periodData, items] = periodsRepository.createWithItems.mock.calls[0];

      // Configuración heredada del origen, pero siempre en DRAFT
      expect(periodData).toEqual({
        name: cloneDto.name,
        startDate: new Date(cloneDto.startDate),
        endDate: new Date(cloneDto.endDate),
        periodType: 'BIWEEKLY',
        status: 'DRAFT',
        overtimeDaytimeRate: 9950,
        overtimeNighttimeRate: 13900,
        overtimeDaytimeFestiveRate: 17927,
        overtimeNighttimeFestiveRate: 22096,
        notes: 'Notas del periodo',
      });

      // Solo el empleado ACTIVE, con los fijos copiados y sin novedades
      expect(items).toEqual([
        {
          employeeId: 'e1',
          daysWorked: 15,
          baseSalary: 1000000,
          restDayValue: 50000,
          transportAllowance: 100000,
          epsAndPensionDiscount: 80000,
          employeeFundSavings: 30000,
          // 1000000 + 50000 + 100000 - 80000 - 30000
          totalPayment: 1040000,
        },
      ]);

      expect(result).toEqual({ id: 'p2', name: cloneDto.name, clonedItemsCount: 1 });
    });

    it('should handle a source period without items', async () => {
      periodsRepository.findById.mockResolvedValue({ ...sourcePeriod, payrollItems: [] } as any);
      periodsRepository.createWithItems.mockResolvedValue({
        period: { id: 'p2' },
        itemsCount: 0,
      } as any);

      const result = await service.clone('p1', cloneDto);

      expect(periodsRepository.createWithItems.mock.calls[0][1]).toEqual([]);
      expect(result.clonedItemsCount).toBe(0);
    });
  });

  describe('update', () => {
    it('should update a period', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      periodsRepository.update.mockResolvedValue({ id: 'p1', name: 'Updated' } as any);

      const result = await service.update('p1', { name: 'Updated' });
      expect(periodsRepository.update).toHaveBeenCalledWith('p1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw BadRequestException if startDate >= endDate', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      await expect(service.update('p1', { startDate: '2024-02-01', endDate: '2024-01-01' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove a period', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      periodsRepository.delete.mockResolvedValue(true as any);
      
      const result = await service.remove('p1');
      expect(periodsRepository.delete).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ message: 'Periodo de nómina con ID p1 eliminado' });
    });
  });

  // Los registros caen en cascada y la llave del descuento queda en NULL: la OP
  // seguiría pagada sin que a nadie se le hubiera descontado el valor.
  describe('remove con descuentos por nómina aplicados', () => {
    it('bloquea el borrado', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      periodsRepository.countAppliedDeductions.mockResolvedValue(2);

      await expect(service.remove('p1')).rejects.toThrow(BadRequestException);
      expect(periodsRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('generateItems', () => {
    it('should generate items for active employees', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      employeesRepository.findAll.mockResolvedValue([
        { id: 'e1', status: 'ACTIVE' },
        { id: 'e2', status: 'INACTIVE' },
      ] as any);
      itemsRepository.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.generateItems('p1');
      
      expect(itemsRepository.createMany).toHaveBeenCalledWith([
        { periodId: 'p1', employeeId: 'e1', baseSalary: 0, totalPayment: 0 }
      ]);
      expect(result).toEqual({ message: 'Se generaron registros para 1 empleado(s) activo(s)', count: 1 });
    });
  });

  describe('getSummary', () => {
    it('should return summary from repository', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      const summary = { totalPayment: 3000, totalBaseSalary: 2400, employeeCount: 2, totalEpsAndPension: 300, totalPayrollCost: 3300 };
      periodsRepository.getSummary.mockResolvedValue(summary as any);

      const result = await service.getSummary('p1');
      expect(periodsRepository.getSummary).toHaveBeenCalledWith('p1');
      expect(result).toEqual(summary);
    });

    it('should throw NotFoundException if period not found', async () => {
      periodsRepository.findById.mockResolvedValue(null);
      await expect(service.getSummary('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update (date conversion)', () => {
    it('should convert date strings to Date objects', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      periodsRepository.update.mockResolvedValue({ id: 'p1' } as any);

      await service.update('p1', { startDate: '2024-01-01', endDate: '2024-01-31' });
      expect(periodsRepository.update).toHaveBeenCalledWith('p1', expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      }));
    });

    it('should pass through non-date fields without conversion', async () => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
      periodsRepository.update.mockResolvedValue({ id: 'p1', name: 'New' } as any);

      await service.update('p1', { name: 'New' });
      expect(periodsRepository.update).toHaveBeenCalledWith('p1', { name: 'New' });
    });
  });

  describe('pagos a empleados', () => {
    beforeEach(() => {
      periodsRepository.findById.mockResolvedValue({ id: 'p1' } as any);
    });

    it('no deja marcar «Pagado» a mano con saldos pendientes', async () => {
      periodsRepository.getSummary.mockResolvedValue({
        totalPending: 20000,
        paymentStatusCount: { PENDING: 1, PARTIAL: 1, PAID: 3 },
      } as any);

      await expect(service.update('p1', { status: 'PAID' } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(periodsRepository.update).not.toHaveBeenCalled();
    });

    it('deja marcar «Pagado» cuando no queda saldo', async () => {
      periodsRepository.getSummary.mockResolvedValue({
        totalPending: 0,
        paymentStatusCount: { PENDING: 0, PARTIAL: 0, PAID: 5 },
      } as any);
      periodsRepository.update.mockResolvedValue({ id: 'p1' } as any);

      await service.update('p1', { status: 'PAID' } as any);
      expect(periodsRepository.update).toHaveBeenCalled();
    });

    it('bloquea el borrado si hay pagos registrados', async () => {
      periodsRepository.countPayments.mockResolvedValue(3);
      await expect(service.remove('p1')).rejects.toThrow(BadRequestException);
      expect(periodsRepository.delete).not.toHaveBeenCalled();
    });
  });
});
