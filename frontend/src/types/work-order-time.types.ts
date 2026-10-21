import type { WorkOrderTimeEntry, TimeEntryUser } from './work-order.types';

/** Horario de la jornada de producción, para avisar antes del cierre. */
export interface ProductionSchedule {
  /** `HH:mm` hora Colombia. */
  workdayEnd: string;
  overtimeCap: string;
  warningMinutes: number;
  maxRunningTasks: number;
}

export interface MyRunningTasksResponse {
  entries: WorkOrderTimeEntry[];
  schedule: ProductionSchedule;
}

export interface MachineOption {
  id: string;
  name: string;
  productionArea?: { id: string; name: string } | null;
}

export type OperatorOption = TimeEntryUser;

export interface StartTimeEntryDto {
  workOrderId: string;
  workOrderItemId?: string;
  machineId?: string;
  notes?: string;
}

export interface AdjustTimeEntryDto {
  startAt?: string;
  endAt?: string;
  workOrderItemId?: string | null;
  machineId?: string | null;
  notes?: string;
  reason: string;
}

export interface CreateManualTimeEntryDto {
  workOrderId: string;
  userId: string;
  workOrderItemId?: string;
  machineId?: string;
  startAt: string;
  endAt: string;
  notes?: string;
  reason: string;
}

/** Marca de asistencia del día (entrada y salida). */
export interface PlantAttendance {
  id: string;
  clockIn: string;
  /** Nula mientras sigue en planta. */
  clockOut: string | null;
}

export interface PlantOperator {
  user: TimeEntryUser & {
    cargo?: { name: string; productionArea?: { id: string; name: string } | null } | null;
  };
  attendance: PlantAttendance[];
  /** Registros del día en todas las OT (sin anulados). */
  entries: WorkOrderTimeEntry[];
}

/** «Planta hoy»: lo que hizo cada operario en un día. */
export interface PlantDayResponse {
  /** `YYYY-MM-DD`, calendario de Colombia. */
  date: string;
  schedule: ProductionSchedule;
  operators: PlantOperator[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporte de productividad
// ─────────────────────────────────────────────────────────────────────────────

/** Intervalo `[inicio, fin)` en milisegundos epoch. */
export type ReportInterval = [number, number];

export interface ProductivityTotals {
  plantMs: number;
  busyMs: number;
  /** Suma de todas las tareas: con dos a la vez cuenta las dos. */
  taskMs: number;
  extraMs: number;
  occupancy: number | null;
  workOrders: number;
  entries: number;
  closedBySystem: number;
  /** Solo con el permiso de costos. */
  cost?: {
    periodCost: number;
    laborCost: number;
    costPerProductiveHour: number | null;
    operatorsWithoutSalary: number;
  };
}

/** Costos de un operario; `null` si no tiene salario registrado. */
export interface ProductivityOperatorCost {
  hourlyRate: number;
  periodCost: number;
  overtimeCost: number;
  costPerProductiveHour: number | null;
}

export interface ProductivityWorkOrderRow {
  id: string;
  workOrderNumber: string;
  client: string | null;
  /** Horas-persona prorrateadas: dos tareas a la vez se reparten el tramo. */
  personMs: number;
  people: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Lo siguiente solo con el permiso de costos. Venta sin IVA de la OP. */
  saleValue?: number | null;
  /** `null` si nadie de la OT tiene salario en nómina. */
  laborCost?: number | null;
  laborShare?: number | null;
  /** Algún operario de la OT no tiene salario: la mano de obra se queda corta. */
  costIncomplete?: boolean;
}

export interface ProductivityMachineRow {
  id: string;
  name: string;
  area: { id: string; name: string } | null;
  /** Tiempo con al menos una tarea abierta en la máquina. */
  useMs: number;
  /** Uso ÷ (días hábiles × horas por día). */
  utilization: number | null;
  workOrders: number;
  operators: number;
  /** Uso por hora del día (0–23), en ms, sumado en todo el periodo. */
  hourly: number[];
}

export interface ProductivityMachines {
  dailyHours: number;
  workingDays: number;
  rows: ProductivityMachineRow[];
  withoutMachineMs: number;
}

export interface ProductivityOperatorRow {
  user: PlantOperator['user'];
  daysWorked: number;
  plantMs: number;
  busyMs: number;
  taskMs: number;
  extraMs: number;
  occupancy: number | null;
  parallel: number | null;
  workOrders: { id: string; workOrderNumber: string; ms: number }[];
  machines: { id: string; name: string; ms: number }[];
  /** Solo con el permiso de costos (`undefined` sin permiso, `null` sin salario). */
  cost?: ProductivityOperatorCost | null;
  quality: {
    entries: number;
    closedBySystem: number;
    adjusted: number;
    added: number;
    voided: number;
    unregisteredMs: number;
    outsideAttendanceMs: number;
  };
  days: {
    date: string;
    plantMs: number;
    busyMs: number;
    attendance: ReportInterval[];
    busy: ReportInterval[];
  }[];
}

export interface ProductivityCostSettings {
  hourlyDivisor: number;
  overtimeFactor: number;
  laborShareWarning: number;
  laborShareCritical: number;
}

/** Parámetros del reporte tal como se editan (umbrales en %). */
export interface ProductionSettings {
  hourlyDivisor: number;
  overtimeFactor: number;
  laborShareWarningPct: number;
  laborShareCriticalPct: number;
  updatedAt: string | null;
  updatedBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

export type UpdateProductionSettingsDto = Pick<
  ProductionSettings,
  'hourlyDivisor' | 'overtimeFactor' | 'laborShareWarningPct' | 'laborShareCriticalPct'
>;

export interface ProductivityReport {
  from: string;
  to: string;
  workdayEnd: string;
  /**
   * Parámetros del costo, editables desde el CRM; `null` si quien consulta no
   * puede ver costos. Los umbrales de mano de obra / venta van como fracción (0,15).
   */
  costs: ProductivityCostSettings | null;
  totals: ProductivityTotals;
  daily: { date: string; plantMs: number; busyMs: number }[];
  areas: { id: string | null; name: string; plantMs: number; busyMs: number }[];
  operators: ProductivityOperatorRow[];
  workOrders: ProductivityWorkOrderRow[];
  machines: ProductivityMachines;
  previous: { from: string; to: string; totals: ProductivityTotals };
}

export interface ProductivityReportQuery {
  from: string;
  to: string;
  areaId?: string;
  userId?: string;
  machineId?: string;
}
