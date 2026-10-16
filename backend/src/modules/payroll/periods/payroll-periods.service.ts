import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PayrollPeriodsRepository } from './payroll-periods.repository';
import { PayrollItemsRepository } from '../items/payroll-items.repository';
import { PayrollEmployeesRepository } from '../employees/payroll-employees.repository';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto';
import { ClonePayrollPeriodDto } from './dto/clone-payroll-period.dto';

/** Convierte un Decimal de Prisma (o null) a number. */
const toNumber = (value: unknown): number => Number(value ?? 0);

@Injectable()
export class PayrollPeriodsService {
  constructor(
    private readonly periodsRepository: PayrollPeriodsRepository,
    private readonly itemsRepository: PayrollItemsRepository,
    private readonly employeesRepository: PayrollEmployeesRepository,
  ) {}

  async findAll() {
    return this.periodsRepository.findAll();
  }

  async findOne(id: string) {
    const period = await this.periodsRepository.findById(id);
    if (!period) {
      throw new NotFoundException(`Periodo de nómina con ID ${id} no encontrado`);
    }
    return period;
  }

  async create(dto: CreatePayrollPeriodDto) {
    if (new Date(dto.startDate) >= new Date(dto.endDate)) {
      throw new BadRequestException('La fecha de inicio debe ser anterior a la fecha de fin');
    }

    return this.periodsRepository.create({
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      periodType: dto.periodType,
      overtimeDaytimeRate: dto.overtimeDaytimeRate,
      overtimeNighttimeRate: dto.overtimeNighttimeRate,
      overtimeDaytimeFestiveRate: dto.overtimeDaytimeFestiveRate,
      overtimeNighttimeFestiveRate: dto.overtimeNighttimeFestiveRate,
      notes: dto.notes,
    });
  }

  /**
   * Clona un periodo: copia su configuración (tipo, tarifas de horas extra y
   * notas) y crea un registro por cada empleado ACTIVO del periodo origen con
   * los valores fijos (salario base, días trabajados, valor de descanso,
   * auxilio de transporte, descuento EPS/pensión y ahorro al fondo de
   * empleados).
   *
   * Las novedades del periodo anterior —horas extras, comisiones, préstamos,
   * anticipos, descuento de jornada, días no pagados, turnos extra y
   * observaciones— NO se copian: son propias de cada quincena y el usuario las
   * ingresa de nuevo. Las órdenes descontadas (`orderDeductions`) siguen la
   * misma regla, y con más razón: copiarlas le cobraría al empleado dos veces
   * el mismo trabajo. El clon nace sin ellas y el módulo de descuentos las
   * vuelve a aplicar si quedan pendientes. El clon siempre nace en DRAFT para no chocar con la regla
   * de "un solo periodo IN_PROGRESS a la vez".
   */
  async clone(sourceId: string, dto: ClonePayrollPeriodDto) {
    const source = await this.findOne(sourceId);

    if (new Date(dto.startDate) >= new Date(dto.endDate)) {
      throw new BadRequestException('La fecha de inicio debe ser anterior a la fecha de fin');
    }

    const items = (source.payrollItems ?? [])
      .filter((item) => item.employee?.status === 'ACTIVE')
      .map((item) => {
        const baseSalary = toNumber(item.baseSalary);
        const restDayValue = toNumber(item.restDayValue);
        const transportAllowance = toNumber(item.transportAllowance);
        const epsAndPensionDiscount = toNumber(item.epsAndPensionDiscount);
        const employeeFundSavings = toNumber(item.employeeFundSavings);

        return {
          employeeId: item.employee.id,
          daysWorked: item.daysWorked ?? null,
          baseSalary,
          restDayValue,
          transportAllowance,
          epsAndPensionDiscount,
          employeeFundSavings,
          totalPayment: Math.round(
            baseSalary +
              restDayValue +
              transportAllowance -
              epsAndPensionDiscount -
              employeeFundSavings,
          ),
        };
      });

    const { period, itemsCount } = await this.periodsRepository.createWithItems(
      {
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        periodType: source.periodType,
        status: 'DRAFT',
        overtimeDaytimeRate: source.overtimeDaytimeRate,
        overtimeNighttimeRate: source.overtimeNighttimeRate,
        overtimeDaytimeFestiveRate: source.overtimeDaytimeFestiveRate,
        overtimeNighttimeFestiveRate: source.overtimeNighttimeFestiveRate,
        notes: source.notes,
      },
      items,
    );

    return { ...period, clonedItemsCount: itemsCount };
  }

  async update(id: string, dto: UpdatePayrollPeriodDto) {
    await this.findOne(id);

    if (dto.startDate && dto.endDate && new Date(dto.startDate) >= new Date(dto.endDate)) {
      throw new BadRequestException('La fecha de inicio debe ser anterior a la fecha de fin');
    }

    // Regla de negocio: solo puede existir un periodo de nómina "en curso"
    // (IN_PROGRESS) a la vez, para que los anticipos se vinculen sin ambigüedad.
    if (dto.status === 'IN_PROGRESS') {
      const openPeriod = await this.periodsRepository.findCurrent();
      if (openPeriod && openPeriod.id !== id) {
        throw new BadRequestException(
          `Ya existe un periodo de nómina en curso (${openPeriod.name}). Cámbialo de estado antes de poner otro en curso.`,
        );
      }
    }

    // «Pagado» se pone solo cuando a todos se les pagó. Marcarlo a mano con
    // saldos pendientes escondería a quién falta por pagar.
    if (dto.status === 'PAID') {
      const summary = await this.periodsRepository.getSummary(id);
      if (summary.totalPending > 0) {
        const pendingCount =
          summary.paymentStatusCount.PENDING + summary.paymentStatusCount.PARTIAL;
        throw new BadRequestException(
          `Aún hay ${pendingCount} empleado(s) con saldo por pagar. ` +
            'El periodo pasa a «Pagado» solo cuando se registra el pago de todos.',
        );
      }
    }

    return this.periodsRepository.update(id, {
      ...dto,
      ...(dto.startDate && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Sus registros caen en cascada y la llave del descuento queda en NULL: la
    // OP seguiría pagada sin que a nadie se le hubiera descontado el valor.
    const applied = await this.periodsRepository.countAppliedDeductions(id);
    if (applied > 0) {
      throw new BadRequestException(
        `El periodo tiene ${applied} descuento(s) por nómina aplicado(s). ` +
          'Cancélalos desde Nómina › Descuento de Órdenes antes de eliminarlo.',
      );
    }

    // La llave de los pagos es RESTRICT: borrar el periodo se llevaría la
    // historia de a quién se le pagó y cómo.
    const payments = await this.periodsRepository.countPayments(id);
    if (payments > 0) {
      throw new BadRequestException(
        `El periodo tiene ${payments} pago(s) registrado(s) a empleados y no se puede eliminar.`,
      );
    }

    await this.periodsRepository.delete(id);
    return { message: `Periodo de nómina con ID ${id} eliminado` };
  }

  async getSummary(id: string) {
    await this.findOne(id);
    return this.periodsRepository.getSummary(id);
  }

  /**
   * Lista los anticipos (cuentas por pagar Personal/Anticipos) vinculados al
   * periodo. Cada anticipo incluye el usuario beneficiario para poder agruparlos
   * por empleado en la nómina y aplicar el descuento correspondiente.
   */
  async getAdvances(id: string) {
    await this.findOne(id);
    return this.periodsRepository.findAdvancesByPeriod(id);
  }

  /**
   * Genera automáticamente registros de nómina para todos los empleados activos
   * que no tengan ya un registro en el periodo. Precarga baseSalary = 0 para
   * que el usuario ingrese los días trabajados.
   */
  async generateItems(periodId: string) {
    await this.findOne(periodId);

    const activeEmployees = await this.employeesRepository.findAll().then(
      (employees) => employees.filter((e) => e.status === 'ACTIVE'),
    );

    const itemsToCreate = activeEmployees.map((employee) => ({
      periodId,
      employeeId: employee.id,
      baseSalary: 0,
      totalPayment: 0,
    }));

    const result = await this.itemsRepository.createMany(itemsToCreate);
    return {
      message: `Se generaron registros para ${result.count} empleado(s) activo(s)`,
      count: result.count,
    };
  }
}
