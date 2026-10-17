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
  user: TimeEntryUser & { cargo?: { name: string } | null };
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
