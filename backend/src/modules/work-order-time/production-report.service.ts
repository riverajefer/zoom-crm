import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { endOfDay, startOfDay } from '../../common/utils/date-range.util';
import { EmployeeType } from '../../generated/prisma';
import { ProductionReportQueryDto } from './dto';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import { CostSettings, ProductionSettingsService } from './production-settings.service';
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

/** Horas al día que una máquina podría trabajar, para la utilización (8:00–18:00). */
export const DEFAULT_MACHINE_DAILY_HOURS = 10;

/** Permiso que deja ver salarios y costos dentro del reporte. */
export const COSTS_PERMISSION = 'read_production_costs';

const HOUR = 3_600_000;

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
  /** Solo con permiso de costos. */
  cost?: {
    periodCost: number;
    laborCost: number;
    costPerProductiveHour: number | null;
    operatorsWithoutSalary: number;
  };
}

/** Lo que una OT acumula de un operario: tiempo prorrateado normal y extra. */
interface OtShare {
  normalMs: number;
  extraMs: number;
  days: Set<string>;
}

/** Lee un número positivo de la configuración; si falta o no sirve, usa el de por defecto. */
function positiveNumber(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Reporte de productividad. Por operario y periodo: tiempo en planta, tiempo en
 * tareas, ocupación, paralelo, horas extra, OT y máquinas, y qué tan confiable
 * es su registro. Con el permiso `read_production_costs`, además, costos:
 *
 * - **Valor hora** = salario mensual ÷ divisor (parámetro editable, 210 al
 *   arrancar; ver `ProductionSettingsService`); un temporal,
 *   tarifa diaria ÷ (divisor ÷ 30).
 * - **Costo del periodo** = salario × días del periodo ÷ 30 (temporal: tarifa
 *   diaria × días trabajados) + horas extra × valor hora × recargo.
 * - **Costo por hora productiva** = costo del periodo ÷ horas en tareas.
 * - **Mano de obra de una OT** = horas prorrateadas × valor hora: si había *k*
 *   tareas abiertas, cada una recibe 1/*k* de ese tramo, así el total cuadra con
 *   la nómina y no se cobra dos veces la misma hora.
 *
 * Las reglas de tiempo son las de «Planta hoy»: dos tareas a la vez cuentan una
 * sola vez y solo cuenta lo que cae dentro de la asistencia.
 */
@Injectable()
export class ProductionReportService {
  constructor(
    private readonly repository: WorkOrderTimeRepository,
    private readonly settingsService: ProductionSettingsService,
    private readonly configService: ConfigService,
  ) {}

  async getReport(query: ProductionReportQueryDto, roleId: string, now: Date = new Date()) {
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

    const [withCosts, settings] = await Promise.all([
      this.repository.roleHasPermission(roleId, COSTS_PERMISSION),
      this.settingsService.getCostSettings(),
    ]);
    const filters: Filters = { areaId: query.areaId, userId: query.userId, machineId: query.machineId };
    const previousFrom = shiftDay(from, -length);
    const previousTo = shiftDay(from, -1);
    const [current, previous] = await Promise.all([
      this.compute(from, to, filters, now, withCosts, settings),
      this.compute(previousFrom, previousTo, filters, now, withCosts, settings),
    ]);

    return {
      from,
      to,
      workdayEnd: this.workdayEndLabel(),
      costs: withCosts ? settings : null,
      ...current,
      previous: { from: previousFrom, to: previousTo, totals: previous.totals },
    };
  }

  private workdayEndLabel() {
    return parseProductionWorkdayEnd(this.configService.get<string>('PRODUCTION_WORKDAY_END')).label;
  }

  private async compute(
    from: string,
    to: string,
    filters: Filters,
    now: Date,
    withCosts: boolean,
    settings: CostSettings,
  ) {
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
    const ctx = { today: businessDate(now), now: now.getTime(), workdayEnd: this.workdayEndLabel() };
    const catalog = await this.repository.findActiveMachines();

    const computed = operators.map((operator) =>
      this.operatorRow(
        operator,
        days,
        attendance.filter((a) => a.userId === operator.id),
        entries.filter((e) => e.userId === operator.id),
        ctx,
      ),
    );

    // Costos por operario
    const calendarDays = days.length;
    const costRows = computed.map(({ row, otShares }) => {
      const employee = row.user.payrollEmployee;
      const rate = this.hourlyRate(employee, settings);
      if (rate === null) return { row, otShares, rate, cost: null };
      const base =
        employee!.employeeType === EmployeeType.TEMPORARY
          ? Number(employee!.dailyRate) * row.daysWorked
          : (Number(employee!.monthlySalary) * calendarDays) / 30;
      const overtimeCost = (row.extraMs / HOUR) * rate * settings.overtimeFactor;
      const periodCost = base + overtimeCost;
      return {
        row,
        otShares,
        rate,
        cost: {
          hourlyRate: rate,
          periodCost,
          overtimeCost,
          costPerProductiveHour: row.busyMs > 0 ? periodCost / (row.busyMs / HOUR) : null,
        },
      };
    });

    // OTs: tiempo prorrateado y mano de obra
    const valid = entries.filter((e) => !e.voidedAt);
    const otInfo = new Map(valid.map((e) => [e.workOrderId, e.workOrder]));
    const otAgg = new Map<
      string,
      {
        personMs: number;
        laborCost: number;
        incomplete: boolean;
        anyRated: boolean;
        people: Set<string>;
        days: Set<string>;
      }
    >();
    for (const { row, otShares, rate } of costRows) {
      for (const [otId, share] of otShares) {
        const agg = otAgg.get(otId) ?? {
          personMs: 0,
          laborCost: 0,
          incomplete: false,
          anyRated: false,
          people: new Set<string>(),
          days: new Set<string>(),
        };
        agg.personMs += share.normalMs + share.extraMs;
        agg.people.add(row.user.id);
        share.days.forEach((d) => agg.days.add(d));
        if (rate === null) agg.incomplete = true;
        else agg.anyRated = true;
        if (rate !== null) agg.laborCost += (share.normalMs / HOUR) * rate + (share.extraMs / HOUR) * rate * settings.overtimeFactor;
        otAgg.set(otId, agg);
      }
    }
    const workOrders = [...otAgg].map(([id, agg]) => {
      const wo = otInfo.get(id)!;
      const value = wo.order ? Number(wo.order.subtotal) - Number(wo.order.discountAmount) : null;
      const sortedDays = [...agg.days].sort();
      return {
        id,
        workOrderNumber: wo.workOrderNumber,
        client: wo.order?.client?.name ?? null,
        personMs: agg.personMs,
        people: agg.people.size,
        days: agg.days.size,
        firstDay: sortedDays[0] ?? null,
        lastDay: sortedDays[sortedDays.length - 1] ?? null,
        // Si nadie de la OT tiene salario no hay costo que mostrar: `null`, no $0.
        ...(withCosts && {
          saleValue: value,
          laborCost: agg.anyRated ? agg.laborCost : null,
          laborShare: agg.anyRated && value && value > 0 ? agg.laborCost / value : null,
          costIncomplete: agg.incomplete,
        }),
      };
    });

    // Totales, serie diaria y áreas
    const rows = costRows.map(({ row, cost }) => {
      // El salario no viaja: sin permiso, ni el costo; con permiso, solo los números calculados.
      const { payrollEmployee, ...user } = row.user;
      void payrollEmployee;
      return { ...row, user, ...(withCosts && { cost }) };
    });
    const sum = (key: 'plantMs' | 'busyMs' | 'taskMs' | 'extraMs') => rows.reduce((t, r) => t + r[key], 0);
    const withSalary = costRows.filter((c) => c.cost);
    const periodCost = withSalary.reduce((t, c) => t + c.cost!.periodCost, 0);
    const busyWithSalary = withSalary.reduce((t, c) => t + c.row.busyMs, 0);
    const totals: ReportTotals = {
      plantMs: sum('plantMs'),
      busyMs: sum('busyMs'),
      taskMs: sum('taskMs'),
      extraMs: sum('extraMs'),
      occupancy: ratio(sum('busyMs'), sum('plantMs')),
      workOrders: new Set(valid.map((e) => e.workOrderId)).size,
      entries: entries.length,
      closedBySystem: valid.filter((e) => e.closedBySystem).length,
      ...(withCosts && {
        cost: {
          periodCost,
          laborCost: workOrders.reduce((t, w) => t + (w.laborCost ?? 0), 0),
          costPerProductiveHour: busyWithSalary > 0 ? periodCost / (busyWithSalary / HOUR) : null,
          operatorsWithoutSalary: costRows.filter((c) => !c.cost && c.row.plantMs > 0).length,
        },
      }),
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
      workOrders: workOrders.sort((a, b) => b.personMs - a.personMs),
      machines: this.machineRows(catalog, valid, days, filters, ctx),
    };
  }

  /**
   * Uso de cada máquina: tiempo con al menos una tarea abierta en ella (dos
   * operarios a la vez no la usan el doble), su utilización frente a la jornada
   * de los días hábiles del periodo y en qué horas del día se usa.
   *
   * Aparecen también las activas que nadie usó: una máquina ociosa es un hallazgo.
   */
  private machineRows(
    catalog: { id: string; name: string; productionArea: { id: string; name: string } | null }[],
    valid: Entry[],
    days: string[],
    filters: Filters,
    ctx: { today: string; now: number },
  ) {
    const dailyHours = positiveNumber(
      this.configService.get<string>('PRODUCTION_MACHINE_DAILY_HOURS'),
      DEFAULT_MACHINE_DAILY_HOURS,
    );
    // Días hábiles (lunes a sábado) que ya ocurrieron.
    const workingDays = days.filter((d) => d <= ctx.today && new Date(`${d}T12:00:00Z`).getUTCDay() !== 0).length;
    const capacityMs = workingDays * dailyHours * HOUR;

    const used = new Map<string, { id: string; name: string }>();
    valid.forEach((e) => e.machine && used.set(e.machine.id, e.machine));
    const shown = new Map<string, { id: string; name: string; area: { id: string; name: string } | null }>();
    for (const m of catalog) {
      const inScope = filters.machineId
        ? m.id === filters.machineId
        : !filters.areaId || m.productionArea?.id === filters.areaId || used.has(m.id);
      if (inScope) shown.set(m.id, { id: m.id, name: m.name, area: m.productionArea });
    }
    // Una máquina desactivada que sí se usó en el periodo también va.
    for (const m of used.values()) if (!shown.has(m.id)) shown.set(m.id, { ...m, area: null });

    const rows = [...shown.values()].map((m) => {
      const tasks = valid.filter((e) => e.machine?.id === m.id);
      let useMs = 0;
      const hourly = new Array<number>(24).fill(0);
      for (const date of days) {
        const dayStart = startOfDay(date)!.getTime();
        const dayEnd = endOfDay(date)!.getTime() + 1;
        const cap = Math.min(dayEnd, date === ctx.today ? ctx.now : dayEnd);
        const intervals = mergeIntervals(
          tasks
            .filter((e) => businessDate(e.startAt!) === date)
            .map((e) => [e.startAt!.getTime(), Math.min(e.endAt ? e.endAt.getTime() : cap, cap)] as Interval),
        );
        for (const [s, e] of intervals) {
          useMs += e - s;
          for (let t = s; t < e; ) {
            const hour = Math.floor((t - dayStart) / HOUR);
            const next = Math.min(e, dayStart + (hour + 1) * HOUR);
            if (hour >= 0 && hour < 24) hourly[hour] += next - t;
            t = next;
          }
        }
      }
      return {
        id: m.id,
        name: m.name,
        area: m.area,
        useMs,
        utilization: ratio(useMs, capacityMs),
        workOrders: new Set(tasks.map((e) => e.workOrderId)).size,
        operators: new Set(tasks.map((e) => e.userId)).size,
        hourly,
      };
    });

    return {
      dailyHours,
      workingDays,
      rows: rows.sort((a, b) => b.useMs - a.useMs || a.name.localeCompare(b.name, 'es')),
      // Tiempo de tareas que no dijeron en qué máquina se hicieron.
      withoutMachineMs: valid
        .filter((e) => !e.machine)
        .reduce((t, e) => {
          const date = businessDate(e.startAt!);
          const dayEnd = endOfDay(date)!.getTime() + 1;
          const end = e.endAt ? e.endAt.getTime() : Math.min(dayEnd, date === ctx.today ? ctx.now : dayEnd);
          return t + Math.max(0, end - e.startAt!.getTime());
        }, 0),
    };
  }

  /** Valor hora del empleado, o `null` si no tiene salario registrado. */
  private hourlyRate(employee: Operator['payrollEmployee'], settings: CostSettings): number | null {
    if (!employee) return null;
    if (employee.employeeType === EmployeeType.TEMPORARY) {
      const daily = Number(employee.dailyRate ?? 0);
      return daily > 0 ? daily / (settings.hourlyDivisor / 30) : null;
    }
    const monthly = Number(employee.monthlySalary ?? 0);
    return monthly > 0 ? monthly / settings.hourlyDivisor : null;
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
    const otShares = new Map<string, OtShare>();
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
      const dayEntries = valid.filter((e) => businessDate(e.startAt!) === date);
      const tasks: Interval[] = dayEntries.map((e) => [
        e.startAt!.getTime(),
        cap(e.endAt ? e.endAt.getTime() : dayEnd),
      ]);
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

      this.prorate(dayEntries, tasks, present, workdayEndMs, date, otShares);

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
      otShares,
      row: {
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
      },
    };
  }

  /**
   * Reparte el tiempo pagado de un día entre las OT: solo cuenta lo que cae en
   * la asistencia, y en cada tramo con *k* tareas abiertas cada una recibe 1/*k*.
   * Lo que pasa después del cierre de la jornada va aparte, como hora extra.
   */
  private prorate(
    dayEntries: Entry[],
    tasks: Interval[],
    present: Interval[],
    workdayEndMs: number,
    date: string,
    otShares: Map<string, OtShare>,
  ) {
    const pieces: { ot: string; s: number; e: number }[] = [];
    dayEntries.forEach((entry, i) => {
      for (const [s, e] of intersectIntervals([tasks[i]], present)) pieces.push({ ot: entry.workOrderId, s, e });
    });
    if (!pieces.length) return;

    const cuts = [...new Set(pieces.flatMap((p) => [p.s, p.e]).concat(workdayEndMs))].sort((a, b) => a - b);
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k];
      const b = cuts[k + 1];
      const open = pieces.filter((p) => p.s <= a && p.e >= b);
      if (!open.length) continue;
      const each = (b - a) / open.length;
      for (const p of open) {
        const share = otShares.get(p.ot) ?? { normalMs: 0, extraMs: 0, days: new Set<string>() };
        if (a >= workdayEndMs) share.extraMs += each;
        else share.normalMs += each;
        share.days.add(date);
        otShares.set(p.ot, share);
      }
    }
  }
}
