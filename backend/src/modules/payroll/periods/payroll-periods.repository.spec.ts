import { Test, TestingModule } from '@nestjs/testing';
import { PayrollPeriodsRepository } from './payroll-periods.repository';
import { PrismaService } from '../../../database/prisma.service';

describe('PayrollPeriodsRepository', () => {
  let repository: PayrollPeriodsRepository;
  let prisma: any;

  const mockPrisma = {
    payrollPeriod: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    payrollItem: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollPeriodsRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<PayrollPeriodsRepository>(PayrollPeriodsRepository);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findAll', () => {
    it('should call findMany ordered by startDate desc', async () => {
      prisma.payrollPeriod.findMany.mockResolvedValue([{ id: 'p1' }]);
      const result = await repository.findAll();
      expect(result).toEqual([{ id: 'p1' }]);
      expect(prisma.payrollPeriod.findMany).toHaveBeenCalledWith({
        select: expect.any(Object),
        orderBy: { startDate: 'desc' },
      });
    });
  });

  describe('findById', () => {
    it('should call findUnique with payrollItems include', async () => {
      prisma.payrollPeriod.findUnique.mockResolvedValue({ id: 'p1', payrollItems: [] });
      const result = await repository.findById('p1');
      expect(result).toEqual({ id: 'p1', payrollItems: [] });
      expect(prisma.payrollPeriod.findUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
        select: expect.objectContaining({ payrollItems: expect.any(Object) }),
      });
    });

    it('should return null when not found', async () => {
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should call prisma.payrollPeriod.create', async () => {
      const data = { name: 'Enero 2024', startDate: new Date(), endDate: new Date(), periodType: 'MONTHLY' } as any;
      prisma.payrollPeriod.create.mockResolvedValue({ id: 'p1', ...data });
      const result = await repository.create(data);
      expect(prisma.payrollPeriod.create).toHaveBeenCalledWith({ data, select: expect.any(Object) });
      expect(result.id).toBe('p1');
    });
  });

  describe('update', () => {
    it('should call prisma.payrollPeriod.update', async () => {
      prisma.payrollPeriod.update.mockResolvedValue({ id: 'p1', name: 'Updated' });
      const result = await repository.update('p1', { name: 'Updated' } as any);
      expect(prisma.payrollPeriod.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Updated' },
        select: expect.any(Object),
      });
      expect(result.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call prisma.payrollPeriod.delete', async () => {
      prisma.payrollPeriod.delete.mockResolvedValue({ id: 'p1' });
      const result = await repository.delete('p1');
      expect(prisma.payrollPeriod.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('getSummary', () => {
    it('should aggregate payment totals from items', async () => {
      prisma.payrollItem.findMany.mockResolvedValue([
        {
          totalPayment: 1000,
          baseSalary: 800,
          epsAndPensionDiscount: 100,
          employeeFundSavings: 50,
          payments: [],
        },
        {
          totalPayment: 2000,
          baseSalary: 1600,
          epsAndPensionDiscount: 200,
          employeeFundSavings: 50,
          payments: [],
        },
      ]);
      const result = await repository.getSummary('p1');
      expect(result).toEqual({
        employeeCount: 2,
        totalBaseSalary: 2400,
        totalPayment: 3000,
        totalEpsAndPension: 300,
        totalEmployeeFundSavings: 100,
        totalOrderDeductions: 0,
        totalPayrollCost: 3400,
        totalPaidCash: 0,
        totalPaidTransfer: 0,
        totalPaid: 0,
        totalPending: 3000,
        paymentStatusCount: { PENDING: 2, PARTIAL: 0, PAID: 0 },
      });
      expect(prisma.payrollItem.findMany).toHaveBeenCalledWith({
        where: { periodId: 'p1' },
        select: {
          totalPayment: true,
          baseSalary: true,
          orderDeductions: true,
          epsAndPensionDiscount: true,
          employeeFundSavings: true,
          payments: {
            where: { isVoided: false },
            select: { amount: true, paymentMethod: true },
          },
        },
      });
    });

    it('should handle null epsAndPensionDiscount and employeeFundSavings', async () => {
      prisma.payrollItem.findMany.mockResolvedValue([
        {
          totalPayment: 500,
          baseSalary: 400,
          epsAndPensionDiscount: null,
          employeeFundSavings: null,
          payments: [],
        },
      ]);
      const result = await repository.getSummary('p1');
      expect(result.totalEpsAndPension).toBe(0);
      expect(result.totalEmployeeFundSavings).toBe(0);
      expect(result.totalPayrollCost).toBe(500);
    });

    // Las órdenes descontadas se retienen pero NO se giran a un tercero: la
    // empresa se las queda. Aun así suman al costo bruto, porque el empleado se
    // ganó ese dinero y la nómina costó lo mismo — solo que una parte se cobró
    // contra una OP en vez de consignarse.
    it('cuenta las órdenes descontadas dentro del costo bruto', async () => {
      prisma.payrollItem.findMany.mockResolvedValue([
        {
          totalPayment: 750,
          baseSalary: 1000,
          epsAndPensionDiscount: 0,
          employeeFundSavings: 0,
          orderDeductions: 250,
          payments: [],
        },
      ]);

      const result = await repository.getSummary('p1');

      expect(result.totalOrderDeductions).toBe(250);
      // Se le consignan 750 y se le descuentan 250: la nómina costó los 1000.
      expect(result.totalPayrollCost).toBe(1000);
    });

    it('should return zeros for empty period', async () => {
      prisma.payrollItem.findMany.mockResolvedValue([]);
      const result = await repository.getSummary('p1');
      expect(result).toEqual({
        employeeCount: 0,
        totalBaseSalary: 0,
        totalPayment: 0,
        totalEpsAndPension: 0,
        totalEmployeeFundSavings: 0,
        totalOrderDeductions: 0,
        totalPayrollCost: 0,
        totalPaidCash: 0,
        totalPaidTransfer: 0,
        totalPaid: 0,
        totalPending: 0,
        paymentStatusCount: { PENDING: 0, PARTIAL: 0, PAID: 0 },
      });
    });

    // El control de pagos uno a uno: efectivo y transferencia por separado,
    // sin contar los anulados (el filtro va en la consulta).
    it('separa lo pagado en efectivo y por transferencia, y lo que falta', async () => {
      prisma.payrollItem.findMany.mockResolvedValue([
        {
          totalPayment: 632000,
          baseSalary: 0,
          payments: [
            { amount: 612000, paymentMethod: 'CASH' },
            { amount: 20000, paymentMethod: 'TRANSFER' },
          ],
        },
        { totalPayment: 1329000, baseSalary: 0, payments: [{ amount: 329000, paymentMethod: 'TRANSFER' }] },
        { totalPayment: 970000, baseSalary: 0, payments: [] },
      ]);

      const result = await repository.getSummary('p1');

      expect(result.totalPaidCash).toBe(612000);
      expect(result.totalPaidTransfer).toBe(349000);
      expect(result.totalPending).toBe(1000000 + 970000);
      expect(result.paymentStatusCount).toEqual({ PENDING: 1, PARTIAL: 1, PAID: 1 });
    });
  });
});
