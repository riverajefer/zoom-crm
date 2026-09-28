import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PayrollEmployeesRepository } from './payroll-employees.repository';
import { CreatePayrollEmployeeDto, EmployeeType } from './dto/create-payroll-employee.dto';
import { UpdatePayrollEmployeeDto } from './dto/update-payroll-employee.dto';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { RolesRepository } from '../../roles/roles.repository';
import { getRequestLocation } from '../../../common/utils/location-context';

/** Rol por defecto asignado a los empleados creados como usuarios del sistema. */
const DEFAULT_EMPLOYEE_ROLE = 'user';

@Injectable()
export class PayrollEmployeesService {
  constructor(
    private readonly employeesRepository: PayrollEmployeesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly rolesRepository: RolesRepository,
  ) {}

  async findAll() {
    return this.employeesRepository.findAll();
  }

  async findOne(id: string) {
    const employee = await this.employeesRepository.findById(id);
    if (!employee) {
      throw new NotFoundException(`Empleado de nómina con ID ${id} no encontrado`);
    }
    return employee;
  }

  async create(dto: CreatePayrollEmployeeDto) {
    // El empleado puede vincularse a un usuario existente o crear uno nuevo.
    const userId = dto.userId
      ? await this.resolveExistingUser(dto)
      : await this.createSystemUser(dto);

    // Validar salario según tipo de empleado
    if (dto.employeeType === EmployeeType.REGULAR && !dto.monthlySalary) {
      throw new BadRequestException('Los empleados regulares requieren salario mensual');
    }
    if (dto.employeeType === EmployeeType.TEMPORARY && !dto.dailyRate) {
      throw new BadRequestException('Los empleados temporales requieren tarifa diaria');
    }

    const employeeLocationId =
      (await this.employeesRepository.findUserDefaultLocationId(userId)) ??
      getRequestLocation()?.locationId ??
      null;

    return this.employeesRepository.create({
      employeeType: dto.employeeType ?? EmployeeType.REGULAR,
      monthlySalary: dto.monthlySalary,
      dailyRate: dto.dailyRate,
      startDate: new Date(dto.startDate),
      contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
      contractType: dto.contractType,
      status: dto.status,
      notes: dto.notes,
      // Identificación
      identificationType: dto.identificationType,
      identificationNumber: dto.identificationNumber,
      documentIssueDate: dto.documentIssueDate ? new Date(dto.documentIssueDate) : null,
      // Nombres
      firstName: dto.firstName,
      middleName: dto.middleName,
      firstLastName: dto.firstLastName,
      secondLastName: dto.secondLastName,
      // Datos personales
      sex: dto.sex,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      // Contacto
      address: dto.address,
      neighborhood: dto.neighborhood,
      phone: dto.phone,
      email: dto.email,
      // Seguridad social
      eps: dto.eps,
      pensionFund: dto.pensionFund,
      // Contacto de emergencia
      emergencyContactName: dto.emergencyContactName,
      emergencyContactRelationship: dto.emergencyContactRelationship,
      emergencyContactPhone: dto.emergencyContactPhone,
      user: { connect: { id: userId } },
      ...(dto.cargoId && { cargo: { connect: { id: dto.cargoId } } }),
      // Sede del empleado: la predeterminada de su usuario, o la sede activa
      // de quien lo crea. Es opcional (docs/PLAN_SEDES.md §5).
      ...(employeeLocationId && { location: { connect: { id: employeeLocationId } } }),
    });
  }

  /** Valida un usuario del sistema existente y que no esté ya en nómina. */
  private async resolveExistingUser(dto: CreatePayrollEmployeeDto): Promise<string> {
    const user = await this.usersRepository.findById(dto.userId!);
    if (!user) {
      throw new BadRequestException(`Usuario con ID ${dto.userId} no encontrado`);
    }
    const existing = await this.employeesRepository.findByUserId(dto.userId!);
    if (existing) {
      throw new BadRequestException('Este usuario ya está registrado en nómina');
    }
    return dto.userId!;
  }

  /**
   * Crea un nuevo usuario del sistema (rol por defecto "user") a partir de los
   * datos personales del empleado. Se usa cuando no se selecciona un usuario.
   */
  private async createSystemUser(dto: CreatePayrollEmployeeDto): Promise<string> {
    if (!dto.password) {
      throw new BadRequestException(
        'La contraseña es requerida para crear el usuario del sistema',
      );
    }
    if (!dto.firstName || !dto.firstLastName) {
      throw new BadRequestException(
        'El primer nombre y el primer apellido son requeridos para crear el usuario del sistema',
      );
    }

    const role = await this.rolesRepository.findByName(DEFAULT_EMPLOYEE_ROLE);
    if (!role) {
      throw new BadRequestException(
        `No se encontró el rol por defecto "${DEFAULT_EMPLOYEE_ROLE}"`,
      );
    }

    const firstName = [dto.firstName, dto.middleName].filter(Boolean).join(' ');
    const lastName = [dto.firstLastName, dto.secondLastName].filter(Boolean).join(' ');

    // El rol lo fija el sistema, no quien da de alta al empleado: no hay
    // escalamiento posible, así que no aplica la regla de privilegios.
    const newUser = await this.usersService.create(
      {
        password: dto.password,
        firstName,
        lastName,
        roleId: role.id,
        ...(dto.email && { email: dto.email }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.cargoId && { cargoId: dto.cargoId }),
      },
      null,
    );

    return newUser.id;
  }

  async update(id: string, dto: UpdatePayrollEmployeeDto) {
    await this.findOne(id);
    const { cargoId, startDate, contractEndDate, documentIssueDate, birthDate, ...rest } = dto;
    return this.employeesRepository.update(id, {
      ...rest,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(contractEndDate !== undefined && {
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
      }),
      ...(documentIssueDate !== undefined && {
        documentIssueDate: documentIssueDate ? new Date(documentIssueDate) : null,
      }),
      ...(birthDate !== undefined && {
        birthDate: birthDate ? new Date(birthDate) : null,
      }),
      ...(cargoId !== undefined && {
        cargo: cargoId ? { connect: { id: cargoId } } : { disconnect: true },
      }),
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.employeesRepository.delete(id);
    return { message: `Empleado de nómina con ID ${id} eliminado` };
  }

  async getHistory(id: string) {
    await this.findOne(id);
    return this.employeesRepository.findHistory(id);
  }
}
