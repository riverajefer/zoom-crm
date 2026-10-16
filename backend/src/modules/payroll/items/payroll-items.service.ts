import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PayrollItemsRepository } from './payroll-items.repository';
import { PayrollPeriodsRepository } from '../periods/payroll-periods.repository';
import { PayrollEmployeesRepository } from '../employees/payroll-employees.repository';
import { CreatePayrollItemDto } from './dto/create-payroll-item.dto';
import { UpdatePayrollItemDto } from './dto/update-payroll-item.dto';

const cop = (n: number) =>
  `$${Math.round(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

@Injectable()
export class PayrollItemsService {
  constructor(
    private readonly itemsRepository: PayrollItemsRepository,
    private readonly periodsRepository: PayrollPeriodsRepository,
    private readonly employeesRepository: PayrollEmployeesRepository,
  ) {}

  async findByPeriod(periodId: string) {
    return this.itemsRepository.findByPeriod(periodId);
  }

  async findOne(itemId: string) {
    const item = await this.itemsRepository.findById(itemId);
    if (!item) {
      throw new NotFoundException(`Registro de nómina con ID ${itemId} no encontrado`);
    }
    return item;
  }

  async create(periodId: string, dto: CreatePayrollItemDto) {
    // Verificar que el periodo existe
    const period = await this.periodsRepository.findById(periodId);
    if (!period) {
      throw new NotFoundException(`Periodo con ID ${periodId} no encontrado`);
    }

    // Verificar que el empleado existe
    const employee = await this.employeesRepository.findById(dto.employeeId);
    if (!employee) {
      throw new NotFoundException(`Empleado con ID ${dto.employeeId} no encontrado`);
    }

    // Verificar que no existe ya un registro para este empleado en el periodo
    const existing = await this.itemsRepository.findByPeriodAndEmployee(
      periodId,
      dto.employeeId,
    );
    if (existing) {
      throw new BadRequestException(
        'Ya existe un registro de nómina para este empleado en el periodo',
      );
    }

    return this.itemsRepository.create(
      {
        daysWorked: dto.daysWorked,
        baseSalary: dto.baseSalary,
        overtimeDaytimeHours: dto.overtimeDaytimeHours,
        overtimeNighttimeHours: dto.overtimeNighttimeHours,
        overtimeDaytimeValue: dto.overtimeDaytimeValue,
        overtimeNighttimeValue: dto.overtimeNighttimeValue,
        commissions: dto.commissions,
        restDayValue: dto.restDayValue,
        transportAllowance: dto.transportAllowance,
        workdayDiscount: dto.workdayDiscount,
        loans: dto.loans,
        advances: dto.advances,
        nonPaidDays: dto.nonPaidDays,
        epsAndPensionDiscount: dto.epsAndPensionDiscount,
        employeeFundSavings: dto.employeeFundSavings,
        totalPayment: dto.totalPayment,
        observations: dto.observations,
        period: { connect: { id: periodId } },
        employee: { connect: { id: dto.employeeId } },
      },
      dto.extraShifts,
    );
  }

  async update(periodId: string, itemId: string, dto: UpdatePayrollItemDto) {
    // Ensure item belongs to period
    const item = await this.findOne(itemId);
    if (item.periodId !== periodId) {
      throw new BadRequestException('El registro no pertenece al periodo indicado');
    }
    if (dto.totalPayment !== undefined) {
      const { paidAmount } = await this.itemsRepository.getPaymentTotals(itemId);
      if (Number(dto.totalPayment) < paidAmount) {
        throw new BadRequestException(
          `A este empleado ya se le pagaron ${cop(paidAmount)}: el total del periodo ` +
            'no puede quedar por debajo de eso. Si el pago fue un error, anúlalo primero.',
        );
      }
    }
    const { extraShifts, ...itemData } = dto;
    return this.itemsRepository.update(itemId, itemData, extraShifts);
  }

  async remove(periodId: string, itemId: string) {
    const item = await this.findOne(itemId);
    if (item.periodId !== periodId) {
      throw new BadRequestException('El registro no pertenece al periodo indicado');
    }
    // Borrarlo deja la llave del descuento en NULL: la OP seguiría pagada sin
    // que a nadie se le hubiera descontado el valor.
    const applied = await this.itemsRepository.countAppliedDeductions(itemId);
    if (applied > 0) {
      throw new BadRequestException(
        `El registro tiene ${applied} descuento(s) por nómina aplicado(s). ` +
          'Cancélalos desde Nómina › Descuento de Órdenes antes de eliminarlo.',
      );
    }

    const { count } = await this.itemsRepository.getPaymentTotals(itemId);
    if (count > 0) {
      throw new BadRequestException(
        `El registro tiene ${count} pago(s) registrado(s) (incluidos anulados) y no se puede eliminar.`,
      );
    }

    await this.itemsRepository.delete(itemId);
    return { message: `Registro de nómina con ID ${itemId} eliminado` };
  }
}
