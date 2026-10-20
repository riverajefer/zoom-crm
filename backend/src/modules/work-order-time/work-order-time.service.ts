import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WorkOrderStatus, WorkOrderTimeEntryType } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { isForbiddenSelfReview } from '../../common/utils/self-review.util';
import { isUniqueViolationOn } from '../../common/utils/unique-violation.util';
import { businessToday, endOfDay, startOfDay } from '../../common/utils/date-range.util';
import {
  AdjustTimeEntryDto,
  CloseTimeEntryDto,
  CreateManualTimeEntryDto,
  StartTimeEntryDto,
  VoidTimeEntryDto,
} from './dto';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import {
  FUTURE_TOLERANCE_MS,
  MAX_ENTRY_HOURS,
  MAX_RUNNING_TASKS,
  PRODUCTION_OVERTIME_CAP,
  WORKDAY_END_WARNING_MINUTES,
  businessDate,
  hoursBetween,
  parseProductionWorkdayEnd,
  systemCloseTime,
  workdayEndInstant,
  workedDateFor,
} from './work-order-time.util';

const RUNNING_UNIQUE_INDEX = 'work_order_time_entries_running_unique';

/** Estados de OT en los que se produce y, por lo tanto, se mide el tiempo. */
const TRACKABLE_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.CONFIRMED,
  WorkOrderStatus.IN_PRODUCTION,
  WorkOrderStatus.READY,
];

/** Estados en los que un supervisor puede agregar un registro olvidado. */
const MANUAL_ENTRY_STATUSES: WorkOrderStatus[] = [
  ...TRACKABLE_STATUSES,
  WorkOrderStatus.COMPLETED,
];

const SELF_ADJUST_MESSAGE =
  'No puedes ajustar ni anular tus propias horas: debe hacerlo otro supervisor.';

@Injectable()
export class WorkOrderTimeService {
  private readonly logger = new Logger(WorkOrderTimeService.name);

  constructor(
    private readonly repository: WorkOrderTimeRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Horario que el frontend necesita para avisar antes del cierre. */
  getSchedule() {
    const workdayEnd = parseProductionWorkdayEnd(
      this.configService.get<string>('PRODUCTION_WORKDAY_END'),
    );
    return {
      workdayEnd: workdayEnd.label,
      overtimeCap: PRODUCTION_OVERTIME_CAP,
      warningMinutes: WORKDAY_END_WARNING_MINUTES,
      maxRunningTasks: MAX_RUNNING_TASKS,
    };
  }

  // ---------------------------------------------------------------------------
  // Operario
  // ---------------------------------------------------------------------------

  /**
   * Inicia una tarea. La hora la pone el servidor: el operario no puede
   * escribirla, que es justamente lo que pidió el cliente.
   */
  async start(dto: StartTimeEntryDto, userId: string) {
    await this.assertWorkOrderTrackable(dto.workOrderId, TRACKABLE_STATUSES);
    const workOrderItemId = dto.workOrderItemId ?? null;
    if (workOrderItemId) await this.assertItemInWorkOrder(dto.workOrderId, workOrderItemId);
    if (dto.machineId) await this.assertMachineUsable(dto.machineId);

    const existing = await this.repository.findRunningTask(userId, dto.workOrderId, workOrderItemId);
    if (existing) {
      // Doble toque o dos pestañas: la tarea ya está corriendo, no es un error.
      return this.repository.findById(existing.id);
    }

    const running = await this.repository.countRunningByUser(userId);
    if (running >= MAX_RUNNING_TASKS) {
      throw new BadRequestException(
        `Ya tienes ${MAX_RUNNING_TASKS} tareas en curso. Finaliza una para iniciar otra.`,
      );
    }

    const now = new Date();
    try {
      return await this.repository.create({
        workOrderId: dto.workOrderId,
        workOrderItemId,
        userId,
        machineId: dto.machineId ?? null,
        entryType: WorkOrderTimeEntryType.TIMER,
        workedDate: workedDateFor(now),
        startAt: now,
        notes: dto.notes?.trim() || null,
      });
    } catch (error) {
      if (isUniqueViolationOn(error, RUNNING_UNIQUE_INDEX)) {
        const twin = await this.repository.findRunningTask(userId, dto.workOrderId, workOrderItemId);
        if (twin) return this.repository.findById(twin.id);
      }
      throw error;
    }
  }

  /** Finaliza una tarea propia. Si ya estaba cerrada, la devuelve tal cual. */
  async stop(entryId: string, userId: string) {
    const entry = await this.findEntryOrFail(entryId);
    if (entry.user.id !== userId) {
      throw new ForbiddenException('Solo puedes finalizar tus propias tareas.');
    }
    if (entry.entryType !== WorkOrderTimeEntryType.TIMER || entry.endAt || entry.voidedAt) {
      return entry;
    }

    const now = new Date();
    await this.repository.closeIfRunning(entryId, {
      endAt: now,
      hoursWorked: new Prisma.Decimal(hoursBetween(entry.startAt!, now)),
    });
    return this.repository.findById(entryId);
  }

  /** «Sigo trabajando»: la tarea no se cierra al fin de la jornada, sino en el tope. */
  async extend(entryId: string, userId: string) {
    const entry = await this.findEntryOrFail(entryId);
    if (entry.user.id !== userId) {
      throw new ForbiddenException('Solo puedes extender tus propias tareas.');
    }
    if (entry.endAt || entry.voidedAt) {
      throw new BadRequestException('La tarea ya fue finalizada; inicia una nueva si sigues trabajando.');
    }

    await this.repository.extendIfRunning(entryId, new Date());
    return this.repository.findById(entryId);
  }

  async findMyRunning(userId: string) {
    const entries = await this.repository.findRunningByUser(userId);
    return { entries, schedule: this.getSchedule() };
  }

  findActiveMachines() {
    return this.repository.findActiveMachines();
  }

  // ---------------------------------------------------------------------------
  // Supervisor
  // ---------------------------------------------------------------------------

  findPendingReview() {
    return this.repository.findPendingReview();
  }

  findOperators() {
    return this.repository.findOperators();
  }

  /**
   * «Planta hoy»: por cada operario, su asistencia del día y lo que registró en
   * todas las OT. El día es el del calendario de Colombia.
   */
  async findPlant(date?: string) {
    const day = date ?? businessToday();
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    if (!dayStart || !dayEnd) {
      throw new BadRequestException('La fecha no es válida.');
    }

    const operators = await this.repository.findPlantOperators();
    const userIds = operators.map((o) => o.id);
    const [attendance, entries] = userIds.length
      ? await Promise.all([
          this.repository.findAttendanceForDay(userIds, dayStart, dayEnd),
          this.repository.findEntriesForDay(userIds, dayStart, dayEnd),
        ])
      : [[], []];

    return {
      date: day,
      schedule: this.getSchedule(),
      operators: operators.map((operator) => ({
        user: operator,
        attendance: attendance
          .filter((a) => a.userId === operator.id)
          .map(({ id, clockIn, clockOut }) => ({ id, clockIn, clockOut })),
        entries: entries.filter((e) => e.user.id === operator.id),
      })),
    };
  }

  /**
   * Corrige un registro. Siempre con motivo; la primera vez se guardan el
   * inicio y el fin originales para que el cambio quede a la vista.
   */
  async adjust(entryId: string, dto: AdjustTimeEntryDto, supervisorId: string) {
    const entry = await this.findEntryOrFail(entryId);
    if (entry.voidedAt) {
      throw new BadRequestException('El registro está anulado y ya no se puede ajustar.');
    }
    await this.assertNotOwnEntry(entry.user.id, supervisorId);

    const startAt = dto.startAt ? new Date(dto.startAt) : entry.startAt;
    const endAt = dto.endAt !== undefined ? new Date(dto.endAt) : entry.endAt;
    if (!startAt || (entry.entryType === WorkOrderTimeEntryType.HOURS && !endAt)) {
      throw new BadRequestException(
        'Este registro se hizo por cantidad de horas: indica el inicio y el fin para ajustarlo.',
      );
    }
    this.assertValidRange(startAt, endAt);

    const workOrderItemId =
      dto.workOrderItemId !== undefined ? dto.workOrderItemId : entry.workOrderItemId;
    if (workOrderItemId && workOrderItemId !== entry.workOrderItemId) {
      await this.assertItemInWorkOrder(entry.workOrderId, workOrderItemId);
    }
    const machineId = dto.machineId !== undefined ? dto.machineId : entry.machineId;
    if (machineId && machineId !== entry.machineId) {
      await this.assertMachineUsable(machineId);
    }
    const notes = dto.notes !== undefined ? dto.notes.trim() || null : entry.notes;

    const unchanged =
      sameInstant(startAt, entry.startAt) &&
      sameInstant(endAt, entry.endAt) &&
      workOrderItemId === entry.workOrderItemId &&
      machineId === entry.machineId &&
      notes === entry.notes;
    if (unchanged) {
      throw new BadRequestException('No hay cambios para guardar.');
    }

    const now = new Date();
    const firstAdjustment = !entry.adjustedAt;
    try {
      return await this.repository.update(entryId, {
        startAt,
        endAt,
        hoursWorked: endAt ? new Prisma.Decimal(hoursBetween(startAt, endAt)) : null,
        workedDate: workedDateFor(startAt),
        // Un registro por cantidad de horas pasa a ser un rango al ajustarlo.
        ...(entry.entryType === WorkOrderTimeEntryType.HOURS && {
          entryType: WorkOrderTimeEntryType.RANGE,
        }),
        workOrderItemId,
        machineId,
        notes,
        adjustedAt: now,
        adjustedById: supervisorId,
        adjustReason: dto.reason.trim(),
        ...(firstAdjustment && {
          originalStartAt: entry.startAt,
          originalEndAt: entry.endAt,
        }),
        ...(entry.closedBySystem && !entry.reviewedAt && {
          reviewedAt: now,
          reviewedById: supervisorId,
        }),
      });
    } catch (error) {
      if (isUniqueViolationOn(error, RUNNING_UNIQUE_INDEX)) {
        throw new BadRequestException(
          'El operario ya tiene esa tarea en curso en ese ítem; finalízala antes de mover este registro.',
        );
      }
      throw error;
    }
  }

  /** Anula un registro: no se borra, deja de contar. Si estaba en curso, se cierra. */
  async void(entryId: string, dto: VoidTimeEntryDto, supervisorId: string) {
    const entry = await this.findEntryOrFail(entryId);
    if (entry.voidedAt) {
      throw new BadRequestException('El registro ya está anulado.');
    }
    await this.assertNotOwnEntry(entry.user.id, supervisorId);

    const now = new Date();
    const stillRunning = entry.entryType === WorkOrderTimeEntryType.TIMER && !entry.endAt;
    return this.repository.update(entryId, {
      ...(stillRunning && {
        endAt: now,
        hoursWorked: new Prisma.Decimal(hoursBetween(entry.startAt!, now)),
      }),
      voidedAt: now,
      voidedById: supervisorId,
      voidReason: dto.reason.trim(),
    });
  }

  /**
   * El supervisor finaliza ahora la tarea de otro operario (se fue sin darle
   * Finalizar). Queda como un ajuste: con motivo, con su nombre y con el valor
   * original («en curso»). El fin es la hora del servidor, no una que se escriba.
   */
  async closeOnBehalf(entryId: string, dto: CloseTimeEntryDto, supervisorId: string) {
    const entry = await this.findEntryOrFail(entryId);
    if (entry.entryType !== WorkOrderTimeEntryType.TIMER || entry.endAt || entry.voidedAt) {
      throw new BadRequestException('La tarea ya no está en curso.');
    }
    await this.assertNotOwnEntry(entry.user.id, supervisorId);

    const now = new Date();
    const closed = await this.repository.closeIfRunning(entryId, {
      endAt: now,
      hoursWorked: new Prisma.Decimal(hoursBetween(entry.startAt!, now)),
      adjustedAt: now,
      adjustedById: supervisorId,
      adjustReason: dto.reason.trim(),
      ...(!entry.adjustedAt && { originalStartAt: entry.startAt, originalEndAt: null }),
    });
    if (closed === 0) {
      // El operario (o el cierre automático) la finalizó un instante antes.
      throw new BadRequestException('La tarea ya no está en curso.');
    }
    return this.repository.findById(entryId);
  }

  /** Da por buena la hora con la que el sistema cerró una tarea olvidada. */
  async markReviewed(entryId: string, supervisorId: string) {
    const entry = await this.findEntryOrFail(entryId);
    if (!entry.closedBySystem) {
      throw new BadRequestException('Solo se revisan las tareas que cerró el sistema.');
    }
    if (entry.reviewedAt) {
      return entry;
    }
    await this.assertNotOwnEntry(entry.user.id, supervisorId);

    return this.repository.update(entryId, {
      reviewedAt: new Date(),
      reviewedById: supervisorId,
    });
  }

  /** Registro olvidado: el operario trabajó y no usó el temporizador. */
  async createManual(dto: CreateManualTimeEntryDto, supervisorId: string) {
    await this.assertWorkOrderTrackable(dto.workOrderId, MANUAL_ENTRY_STATUSES);
    if (dto.workOrderItemId) await this.assertItemInWorkOrder(dto.workOrderId, dto.workOrderItemId);
    if (dto.machineId) await this.assertMachineUsable(dto.machineId);

    const operator = await this.repository.findUser(dto.userId);
    if (!operator || !operator.isActive) {
      throw new BadRequestException('El operario no existe o está inactivo.');
    }
    await this.assertNotOwnEntry(dto.userId, supervisorId);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.assertValidRange(startAt, endAt);

    const now = new Date();
    return this.repository.create({
      workOrderId: dto.workOrderId,
      workOrderItemId: dto.workOrderItemId ?? null,
      userId: dto.userId,
      machineId: dto.machineId ?? null,
      entryType: WorkOrderTimeEntryType.RANGE,
      workedDate: workedDateFor(startAt),
      startAt,
      endAt,
      hoursWorked: new Prisma.Decimal(hoursBetween(startAt, endAt)),
      notes: dto.notes?.trim() || null,
      createdById: supervisorId,
      adjustedAt: now,
      adjustedById: supervisorId,
      adjustReason: dto.reason.trim(),
    });
  }

  // ---------------------------------------------------------------------------
  // Cierre automático (lo llama el scheduler)
  // ---------------------------------------------------------------------------

  /**
   * Cierra las tareas que siguen en curso. Al fin de la jornada solo las que no
   * se extendieron; en el tope (23:59), todas. Quedan marcadas como cerradas
   * por el sistema para que un supervisor las revise.
   */
  async closeRunningTasks(includeExtended: boolean): Promise<number> {
    const running = await this.repository.findRunningToClose(includeExtended);
    const now = new Date();
    return this.closeBySystem(running, (startAt) => systemCloseTime(startAt, now));
  }

  /**
   * Red de seguridad para cuando el backend no estaba vivo a las 18:00 o a las
   * 23:59 (un deploy, una caída). Sin esto la tarea queda «en curso» hasta el
   * siguiente cierre, y mientras tanto «Planta hoy» la cuenta como trabajo
   * actual e infla la ocupación.
   *
   * - Las de días anteriores se cierran al final de su propio día, como el tope.
   * - Si ya pasó el fin de la jornada de hoy, las de hoy que no se extendieron
   *   se cierran a la hora del fin de jornada, no a la hora en que se detectan.
   */
  async closeMissedTasks(now: Date = new Date()): Promise<number> {
    const today = businessDate(now);
    const todayStart = startOfDay(today)!;

    const stale = await this.repository.findRunningStartedBefore(todayStart, true);
    let closed = await this.closeBySystem(stale, (startAt) => systemCloseTime(startAt, now));

    const workdayEnd = workdayEndInstant(today, this.getSchedule().workdayEnd);
    if (now.getTime() >= workdayEnd.getTime()) {
      const missed = await this.repository.findRunningStartedBefore(workdayEnd, false);
      closed += await this.closeBySystem(missed, () => workdayEnd);
    }
    return closed;
  }

  private async closeBySystem(
    entries: { id: string; startAt: Date | null }[],
    closeAt: (startAt: Date) => Date,
  ): Promise<number> {
    let closed = 0;
    for (const entry of entries) {
      if (!entry.startAt) continue;
      const endAt = closeAt(entry.startAt);
      try {
        closed += await this.repository.closeIfRunning(entry.id, {
          endAt,
          hoursWorked: new Prisma.Decimal(hoursBetween(entry.startAt, endAt)),
          closedBySystem: true,
        });
      } catch (error) {
        this.logger.error(`[Temporizador] No se pudo cerrar la tarea ${entry.id}`, error);
      }
    }
    return closed;
  }

  // ---------------------------------------------------------------------------
  // Validaciones
  // ---------------------------------------------------------------------------

  private async findEntryOrFail(entryId: string) {
    const entry = await this.repository.findById(entryId);
    if (!entry) {
      throw new NotFoundException(`Registro de tiempo con id ${entryId} no encontrado`);
    }
    return entry;
  }

  private async assertWorkOrderTrackable(workOrderId: string, allowed: WorkOrderStatus[]) {
    const workOrder = await this.repository.findWorkOrder(workOrderId);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${workOrderId} no encontrada`);
    }
    if (workOrder.order?.status === 'ANULADO') {
      throw new BadRequestException('La OP de esta OT está anulada: no se registra tiempo.');
    }
    if (!allowed.includes(workOrder.status)) {
      throw new BadRequestException(
        'Solo se registra tiempo en OT confirmadas, en producción o listas para entrega.',
      );
    }
  }

  private async assertItemInWorkOrder(workOrderId: string, itemId: string) {
    const item = await this.repository.findWorkOrderItem(workOrderId, itemId);
    if (!item) {
      throw new NotFoundException('El ítem no pertenece a esta OT.');
    }
  }

  private async assertMachineUsable(machineId: string) {
    const machine = await this.repository.findMachine(machineId);
    if (!machine || !machine.isActive) {
      throw new BadRequestException('La máquina no existe o está desactivada.');
    }
  }

  private assertValidRange(startAt: Date, endAt: Date | null) {
    const limit = Date.now() + FUTURE_TOLERANCE_MS;
    if (startAt.getTime() > limit || (endAt && endAt.getTime() > limit)) {
      throw new BadRequestException('No puedes poner una hora que todavía no ha pasado.');
    }
    if (!endAt) return;
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('El fin tiene que ser después del inicio.');
    }
    if (hoursBetween(startAt, endAt) > MAX_ENTRY_HOURS) {
      throw new BadRequestException(`Un registro no puede durar más de ${MAX_ENTRY_HOURS} horas.`);
    }
  }

  /** Quien corrige horas no puede corregir las suyas, salvo el admin. */
  private async assertNotOwnEntry(operatorId: string, supervisorId: string) {
    if (
      await isForbiddenSelfReview(this.prisma, {
        requestedById: operatorId,
        reviewerId: supervisorId,
      })
    ) {
      throw new ForbiddenException(SELF_ADJUST_MESSAGE);
    }
  }
}

function sameInstant(a: Date | null, b: Date | null) {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}
