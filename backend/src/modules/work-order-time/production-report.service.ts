import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { endOfDay, startOfDay } from '../../common/utils/date-range.util';
import { ProductionReportQueryDto } from './dto';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import {
  businessDate,
  parseProductionWorkdayEnd,
  workdayEndInstant,
} from './work-order-time.util';
import {
  Interval,
  daysBetween,
  intersectIntervals,
  intervalsTotal,
  mergeIntervals,
  ratio,
  shiftDay,
} from './production-report.util';

/** Un reporte más largo se vuelve lento de leer y de calcular; para eso está el Excel. */
export const MAX_REPORT_DAYS = 92;

type Operator = Awaited<ReturnType<WorkOrderTimeRepository['findReportOperators']>>[number];
type Entry = Awaited<ReturnType<WorkOrderTimeRepository['findEntriesInRange']>>[number];
type Attendance = Awaited<ReturnType<WorkOrderTimeRepository['findAttendanceInRange']>>[number];

interface Filters {
  areaId?: string;
  userId?: string;
  machineId?: string;
}

export interface ReportTotals {
  plantMs: number;
  busyMs: number;
  taskMs: number;
  extraMs: number;
  occupancy: number | null;
  workOrders: number;
  entries: number;
  closedBySystem: number;
}

/**
 * Reporte de productividad (fase 1, sin costos). Por operario y periodo:
 * tiempo en planta, tiempo en tareas, ocupación, paralelo, horas extra, en qué
 * OT y máquinas trabajó y qué tan confiable es su registro.
 *
 * Las reglas son las de «Planta hoy»: dos tareas a la vez cuentan una sola vez,
 * y solo cuenta lo que cae dentro de la asistencia.
 */
@Injectable()
export class ProductionReportService {
  constructor(
    private readonly repository: WorkOrderTimeRepository,
    private readonly configService: ConfigService,
  ) {}

  async getReport(query: ProductionReportQueryDto, now: Date = new Date()) {
    const { from, to } = query;
    if (!startOfDay(from) || !startOfDay(to)) {
      throw new BadRequestException('Las fechas no son válidas.');
    }
    if (from > to) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
    }
    const length = daysBetween(from, to).length;
    if (length > MAX_REPORT_DAYS) {
      throw new BadRequestException(`El periodo no puede pasar de ${MAX_REPORT_DAYS} días.`);
    }

    const filters: Filters = { areaId: query.areaId, userId: query.userId, machineId: query.machineId };
    const previousFrom = shiftDay(from, -length);
    const previousTo = shiftDay(from, -1);
    const [current, previous] = await Promise.all([
      this.compute(from, to, filters, now),
      this.compute(previousFrom, previousTo, filters, now),
    ]);

    return {
      from,
      to,
      workdayEnd: this.workdayEndLabel(),
      ...current,
      previous: { from: previousFrom, to: previousTo, totals: previous.totals },
    };
  }

  private workdayEndLabel() {
    return parseProductionWorkdayEnd(this.configService.get<string>('PRODUCTION_WORKDAY_END')).label;
  }

  private async compute(from: string, to: string, filters: Filters, now: Date) {
    const rangeStart = startOfDay(from)!;
    const rangeEnd = endOfDay(to)!;
    const operators = await this.repository.findReportOperators({
      from: rangeStart,
      to: rangeEnd,
      areaId: filters.areaId,
      userId: filters.userId,
    });
    const userIds = operators.map((o) => o.id);
    const [attendance, entries] = userIds.length
      ? await Promise.all([
          this.repository.findAttendanceInRange(userIds, rangeStart, rangeEnd),
          this.repository.findEntriesInRange(userIds, rangeStart, rangeEnd, filters.machineId),
        ])
      : [[] as Attendance[], [] as Entry[]];

    const days = daysBetween(from, to);
    const workdayEnd = this.workdayEndLabel();
    const today = businessDate(now);

    const rows = operators.map((operator) =>
      this.operatorRow(
        operator,
        days,
        attendance.filter((a) => a.userId === operator.id),
        entries.filter((e) => e.userId === operator.id),
        { today, now: now.getTime(), workdayEnd },
      ),
    );

    // Totales, serie diaria y áreas
    const sum = (key: 'plantMs' | 'busyMs' | 'taskMs' | 'extraMs') => rows.reduce((t, r) => t + r[key], 0);
    const valid = entries.filter((e) => !e.voidedAt);
    const totals: ReportTotals = {
      plantMs: sum('plantMs'),
      busyMs: sum('busyMs'),
      taskMs: sum('taskMs'),
      extraMs: sum('extraMs'),
      occupancy: ratio(sum('busyMs'), sum('plantMs')),
      workOrders: new Set(valid.map((e) => e.workOrderId)).size,
      entries: entries.length,
      closedBySystem: entries.filter((e) => e.closedBySystem && !e.voidedAt).length,
    };

    const daily = days
      .map((date) => {
        let plantMs = 0;
        let busyMs = 0;
        for (const r of rows) {
          const d = r.days.find((x) => x.date === date);
          if (d) {
            plantMs += d.plantMs;
            busyMs += d.busyMs;
          }
        }
        return { date, plantMs, busyMs };
      })
      .filter((d) => d.plantMs > 0 || d.busyMs > 0);

    const areaMap = new Map<string, { id: string | null; name: string; plantMs: number; busyMs: number }>();
    for (const r of rows) {
      const area = r.user.cargo?.productionArea;
      const key = area?.id ?? 'none';
      const agg = areaMap.get(key) ?? { id: area?.id ?? null, name: area?.name ?? 'Sin área', plantMs: 0, busyMs: 0 };
      agg.plantMs += r.plantMs;
      agg.busyMs += r.busyMs;
      areaMap.set(key, agg);
    }

    return {
      totals,
      daily,
      areas: [...areaMap.values()].filter((a) => a.plantMs > 0 || a.busyMs > 0),
      operators: rows,
    };
  }

  private operatorRow(
    user: Operator,
    days: string[],
    attendance: Attendance[],
    entries: Entry[],
    ctx: { today: string; now: number; workdayEnd: string },
  ) {
    const valid = entries.filter((e) => !e.voidedAt);
    let plantMs = 0;
    let busyMs = 0;
    let taskMs = 0;
    let extraMs = 0;
    let outsideMs = 0;
    const workOrders = new Map<string, { id: string; workOrderNumber: string; ms: number }>();
    const machines = new Map<string, { id: string; name: string; ms: number }>();
    const dayRows: {
      date: string;
      plantMs: number;
      busyMs: number;
      attendance: Interval[];
      busy: Interval[];
    }[] = [];

    for (const date of days) {
      const dayStart = startOfDay(date)!.getTime();
      const dayEnd = endOfDay(date)!.getTime() + 1;
      const isToday = date === ctx.today;
      const cap = (t: number) => Math.min(t, dayEnd, isToday ? ctx.now : dayEnd);

      // Una tarea que sigue en curso llega hasta ahora (o al final de su día si es vieja).
      const tasks: Interval[] = valid
        .filter((e) => businessDate(e.startAt!) === date)
        .map((e) => [e.startAt!.getTime(), cap(e.endAt ? e.endAt.getTime() : dayEnd)]);
      const lastTaskEnd = Math.max(0, ...tasks.map(([, end]) => end));

      // Una marca sin salida llega hasta ahora; en un día pasado, hasta el cierre o la última tarea.
      const workdayEndMs = workdayEndInstant(date, ctx.workdayEnd).getTime();
      const present: Interval[] = attendance
        .filter((a) => businessDate(a.clockIn) === date)
        .map((a) => [
          Math.max(a.clockIn.getTime(), dayStart),
          a.clockOut
            ? Math.min(a.clockOut.getTime(), dayEnd)
            : isToday
              ? ctx.now
              : Math.min(dayEnd, Math.max(workdayEndMs, lastTaskEnd)),
        ]);

      const busy = intersectIntervals(present, tasks);
      const dayPlant = intervalsTotal(present);
      const dayBusy = intervalsTotal(busy);
      plantMs += dayPlant;
      busyMs += dayBusy;
      taskMs += tasks.reduce((t, task) => t + intervalsTotal(intersectIntervals([task], present)), 0);
      extraMs += intervalsTotal(intersectIntervals(busy, [[workdayEndMs, dayEnd]]));
      outsideMs += intervalsTotal(tasks) - dayBusy;

      if (dayPlant > 0 || tasks.length) {
        dayRows.push({
          date,
          plantMs: dayPlant,
          busyMs: dayBusy,
          attendance: mergeIntervals(present),
          busy: mergeIntervals(busy),
        });
      }
    }

    // Horas por OT y por máquina: suma de sus tareas (dos a la vez suman las dos).
    for (const e of valid) {
      const date = businessDate(e.startAt!);
      const dayEnd = endOfDay(date)!.getTime() + 1;
      const end = e.endAt ? e.endAt.getTime() : Math.min(dayEnd, date === ctx.today ? ctx.now : dayEnd);
      const ms = Math.max(0, end - e.startAt!.getTime());
      const ot = workOrders.get(e.workOrderId) ?? {
        id: e.workOrderId,
        workOrderNumber: e.workOrder.workOrderNumber,
        ms: 0,
      };
      ot.ms += ms;
      workOrders.set(e.workOrderId, ot);
      if (e.machine) {
        const m = machines.get(e.machine.id) ?? { ...e.machine, ms: 0 };
        m.ms += ms;
        machines.set(e.machine.id, m);
      }
    }

    return {
      user,
      daysWorked: dayRows.filter((d) => d.plantMs > 0).length,
      plantMs,
      busyMs,
      taskMs,
      extraMs,
      occupancy: ratio(busyMs, plantMs),
      parallel: ratio(taskMs, busyMs),
      workOrders: [...workOrders.values()].sort((a, b) => b.ms - a.ms),
      machines: [...machines.values()].sort((a, b) => b.ms - a.ms),
      quality: {
        entries: entries.length,
        closedBySystem: valid.filter((e) => e.closedBySystem).length,
        adjusted: valid.filter((e) => e.adjustedAt && !e.createdById).length,
        added: valid.filter((e) => e.createdById).length,
        voided: entries.length - valid.length,
        unregisteredMs: plantMs - busyMs,
        outsideAttendanceMs: outsideMs,
      },
      days: dayRows,
    };
  }
}
