import { Test, TestingModule } from '@nestjs/testing';
import { PayrollEmployeesService } from './payroll-employees.service';
import { PayrollEmployeesRepository } from './payroll-employees.repository';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { RolesRepository } from '../../roles/roles.repository';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EmployeeType, ContractType } from './dto/create-payroll-employee.dto';

describe('PayrollEmployeesService', () => {
  let service: PayrollEmployeesService;
  let employeesRepository: PayrollEmployeesRepository;
  let usersRepository: UsersRepository;

  const mockEmployeesRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findUserDefaultLocationId: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findHistory: jest.fn(),
  };

  const mockUsersRepository = {
    findById: jest.fn(),
  };

  const mockUsersService = {
    create: jest.fn(),
  };

  const mockRolesRepository = {
    findByName: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollEmployeesService,
        { provide: PayrollEmployeesRepository, useValue: mockEmployeesRepository },
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RolesRepository, useValue: mockRolesRepository },
      ],
    }).compile();

    service = module.get<PayrollEmployeesService>(PayrollEmployeesService);
    employeesRepository = module.get<PayrollEmployeesRepository>(PayrollEmployeesRepository);
    usersRepository = module.get<UsersRepository>(UsersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all payroll employees', async () => {
      const mockResult = [{ id: '1' }, { id: '2' }];
      mockEmployeesRepository.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll();

      expect(result).toBe(mockResult);
      expect(mockEmployeesRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an employee if found', async () => {
      const mockResult = { id: '1' };
      mockEmployeesRepository.findById.mockResolvedValue(mockResult);

      const result = await service.findOne('1');

      expect(result).toBe(mockResult);
      expect(mockEmployeesRepository.findById).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException if employee not found', async () => {
      mockEmployeesRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      userId: 'user-1',
      employeeType: EmployeeType.REGULAR,
      monthlySalary: 1000,
      startDate: '2026-01-01',
      contractType: ContractType.INDEFINITE,
    };

    it('should throw BadRequestException if user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      expect(usersRepository.findById).toHaveBeenCalledWith('user-1');
    });

    it('should throw BadRequestException if user is already in payroll', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'user-1' });
      mockEmployeesRepository.findByUserId.mockResolvedValue({ id: 'emp-1' });

      await expect(service.create(createDto)).rejects.toThrow(
        new BadRequestException('Este usuario ya está registrado en nómina'),
      );
    });

    it('should throw BadRequestException if regular employee lacks monthlySalary', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'user-1' });
      mockEmployeesRepository.findByUserId.mockResolvedValue(null);

      const badDto = { ...createDto, monthlySalary: undefined };

      await expect(service.create(badDto as any)).rejects.toThrow(
        new BadRequestException('Los empleados regulares requieren salario mensual'),
      );
    });

    it('should throw BadRequestException if temporary employee lacks dailyRate', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'user-1' });
      mockEmployeesRepository.findByUserId.mockResolvedValue(null);

      const badDto = {
        ...createDto,
        employeeType: EmployeeType.TEMPORARY,
        dailyRate: undefined,
      };

      await expect(service.create(badDto as any)).rejects.toThrow(
        new BadRequestException('Los empleados temporales requieren tarifa diaria'),
      );
    });

    it('should create a payroll employee successfully', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'user-1' });
      mockEmployeesRepository.findByUserId.mockResolvedValue(null);
      mockEmployeesRepository.create.mockResolvedValue({ id: 'emp-1', ...createDto });

      const result = await service.create(createDto);

      expect(result.id).toBe('emp-1');
      expect(mockEmployeesRepository.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto = {
      monthlySalary: 1200,
      startDate: '2026-02-01',
    };

    it('should update an employee successfully', async () => {
      mockEmployeesRepository.findById.mockResolvedValue({ id: 'emp-1' });
      mockEmployeesRepository.update.mockResolvedValue({ id: 'emp-1', ...updateDto });

      const result = await service.update('emp-1', updateDto);

      expect(result.id).toBe('emp-1');
      expect(mockEmployeesRepository.update).toHaveBeenCalledWith('emp-1', expect.objectContaining({
        monthlySalary: 1200,
        startDate: expect.any(Date),
      }));
    });

    it('should handle cargoId update and removal', async () => {
      mockEmployeesRepository.findById.mockResolvedValue({ id: 'emp-1' });
      
      // Test connect cargo
      await service.update('emp-1', { cargoId: 'cargo-1' });
      expect(mockEmployeesRepository.update).toHaveBeenCalledWith('emp-1', expect.objectContaining({
        cargo: { connect: { id: 'cargo-1' } }
      }));

      // Test disconnect cargo
      await service.update('emp-1', { cargoId: null as any });
      expect(mockEmployeesRepository.update).toHaveBeenCalledWith('emp-1', expect.objectContaining({
        cargo: { disconnect: true }
      }));
    });
  });

  describe('remove', () => {
    it('should remove an employee successfully', async () => {
      mockEmployeesRepository.findById.mockResolvedValue({ id: 'emp-1' });
      mockEmployeesRepository.delete.mockResolvedValue({ id: 'emp-1' });

      const result = await service.remove('emp-1');

      expect(result.message).toContain('eliminado');
      expect(mockEmployeesRepository.delete).toHaveBeenCalledWith('emp-1');
    });
  });

  describe('getHistory', () => {
    it('should return employee history', async () => {
      mockEmployeesRepository.findById.mockResolvedValue({ id: 'emp-1' });
      const mockHistory = [{ id: 'hist-1' }];
      mockEmployeesRepository.findHistory.mockResolvedValue(mockHistory);

      const result = await service.getHistory('emp-1');

      expect(result).toBe(mockHistory);
      expect(mockEmployeesRepository.findHistory).toHaveBeenCalledWith('emp-1');
    });
  });
});
