import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';
import {
  RUNNING_WHERE,
  TIME_ENTRY_SELECT,
  TIME_ENTRY_WITH_WORK_ORDER_SELECT,
} from './work-order-time.select';

/** Usuarios activos cuyo rol usa el temporizador. */
const OPERATOR_WHERE = {
  isActive: true,
  role: {
    permissions: { some: { permission: { name: 'track_work_order_time' } } },
  },
} satisfies Prisma.UserWhereInput;

@Injectable()
export class WorkOrderTimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findWorkOrder(id: string) {
    return this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        order: { select: { status: true } },
      },
    });
  }

  findWorkOrderItem(workOrderId: string, itemId: string) {
    return this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
      select: { id: true },
    });
  }

  findMachine(id: string) {
    return this.prisma.machine.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
  }

  findUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
  }

  findById(id: string) {
    return this.prisma.workOrderTimeEntry.findUnique({
      where: { id },
      select: {
        ...TIME_ENTRY_SELECT,
        userId: true,
        workOrderItemId: true,
        machineId: true,
      },
    });
  }

  findRunningByUser(userId: string) {
    return this.prisma.workOrderTimeEntry.findMany({
      where: { userId, ...RUNNING_WHERE },
      select: TIME_ENTRY_WITH_WORK_ORDER_SELECT,
      orderBy: { startAt: 'asc' },
    });
  }

  countRunningByUser(userId: string) {
    return this.prisma.workOrderTimeEntry.count({
      where: { userId, ...RUNNING_WHERE },
    });
  }

  findRunningTask(userId: string, workOrderId: string, workOrderItemId: string | null) {
    return this.prisma.workOrderTimeEntry.findFirst({
      where: { userId, workOrderId, workOrderItemId, ...RUNNING_WHERE },
      select: { id: true },
    });
  }

  /** Tareas en curso que cierra el sistema; sin `includeExtended`, solo las no extendidas. */
  findRunningToClose(includeExtended: boolean) {
    return this.prisma.workOrderTimeEntry.findMany({
      where: {
        ...RUNNING_WHERE,
        ...(includeExtended ? {} : { extendedAt: null }),
      },
      select: { id: true, startAt: true },
    });
  }

  findPendingReview() {
    return this.prisma.workOrderTimeEntry.findMany({
      where: { closedBySystem: true, reviewedAt: null, voidedAt: null },
      select: TIME_ENTRY_WITH_WORK_ORDER_SELECT,
      orderBy: { startAt: 'desc' },
    });
  }

  /** Usuarios que pueden usar el temporizador (para el registro olvidado). */
  findOperators() {
    return this.prisma.user.findMany({
      where: OPERATOR_WHERE,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  /** Operarios de la vista «Planta hoy», con su cargo para la etiqueta de la fila. */
  findPlantOperators() {
    return this.prisma.user.findMany({
      where: OPERATOR_WHERE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        cargo: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  /** Marcas de asistencia cuya entrada cae dentro del día. */
  findAttendanceForDay(userIds: string[], dayStart: Date, dayEnd: Date) {
    return this.prisma.attendanceRecord.findMany({
      where: { userId: { in: userIds }, clockIn: { gte: dayStart, lte: dayEnd } },
      select: { id: true, userId: true, clockIn: true, clockOut: true },
      orderBy: { clockIn: 'asc' },
    });
  }

  /**
   * Registros con hora que tocan el día, en todas las OT. Los anulados no
   * cuentan y los heredados por cantidad de horas no se pueden ubicar.
   */
  findEntriesForDay(userIds: string[], dayStart: Date, dayEnd: Date) {
    return this.prisma.workOrderTimeEntry.findMany({
      where: {
        userId: { in: userIds },
        voidedAt: null,
        startAt: { not: null, lte: dayEnd },
        OR: [{ endAt: null }, { endAt: { gte: dayStart } }],
      },
      select: TIME_ENTRY_WITH_WORK_ORDER_SELECT,
      orderBy: { startAt: 'asc' },
    });
  }

  findActiveMachines() {
    return this.prisma.machine.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        productionArea: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  create(data: Prisma.WorkOrderTimeEntryUncheckedCreateInput) {
    return this.prisma.workOrderTimeEntry.create({
      data,
      select: TIME_ENTRY_WITH_WORK_ORDER_SELECT,
    });
  }

  update(id: string, data: Prisma.WorkOrderTimeEntryUncheckedUpdateInput) {
    return this.prisma.workOrderTimeEntry.update({
      where: { id },
      data,
      select: TIME_ENTRY_WITH_WORK_ORDER_SELECT,
    });
  }

  /**
   * Cierra la tarea solo si sigue en curso. Devuelve cuántas filas cambió: 0
   * significa que otra petición (un doble toque, el cierre automático) ya la
   * cerró.
   */
  async closeIfRunning(
    id: string,
    data: Pick<Prisma.WorkOrderTimeEntryUncheckedUpdateInput, 'endAt' | 'hoursWorked' | 'closedBySystem'>,
  ) {
    const result = await this.prisma.workOrderTimeEntry.updateMany({
      where: { id, ...RUNNING_WHERE },
      data,
    });
    return result.count;
  }

  async extendIfRunning(id: string, extendedAt: Date) {
    const result = await this.prisma.workOrderTimeEntry.updateMany({
      where: { id, ...RUNNING_WHERE, extendedAt: null },
      data: { extendedAt },
    });
    return result.count;
  }
}
