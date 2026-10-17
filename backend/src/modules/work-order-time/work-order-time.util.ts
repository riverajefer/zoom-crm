import { BUSINESS_TIMEZONE, BUSINESS_UTC_OFFSET } from '../../common/utils/date-range.util';
import { parseWorkdayEnd, WorkdayEnd } from '../attendance/attendance-schedule.util';

/** Fin de la jornada de producción por defecto (hora Colombia). */
export const DEFAULT_PRODUCTION_WORKDAY_END = '18:00';

/** Tope de las tareas extendidas con «Sigo trabajando»: 23:59 hora Colombia. */
export const PRODUCTION_OVERTIME_CAP = '23:59';

/** Desde cuántos minutos antes del cierre se le avisa al operario. */
export const WORKDAY_END_WARNING_MINUTES = 30;

/** Tareas en curso a la vez por operario (la máquina imprime mientras él arma). */
export const MAX_RUNNING_TASKS = 3;

/** Un registro más largo que esto es un error de digitación, no una tarea. */
export const MAX_ENTRY_HOURS = 24;

/** Margen para el reloj del navegador del supervisor al validar «no en el futuro». */
export const FUTURE_TOLERANCE_MS = 60 * 1000;

/** Lee `PRODUCTION_WORKDAY_END` (`HH:mm`); sin valor, 18:00. */
export function parseProductionWorkdayEnd(value: string | null | undefined): WorkdayEnd {
  return parseWorkdayEnd(value, DEFAULT_PRODUCTION_WORKDAY_END);
}

/** Horas entre dos instantes, redondeadas a 2 decimales. */
export function hoursBetween(start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Number(hours.toFixed(2)));
}

/** Fecha (`YYYY-MM-DD`) de un instante en el calendario de Colombia. */
export function businessDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(instant);
}

/**
 * `workedDate` de un registro: medianoche UTC del día en Colombia, igual que
 * guardaba el formulario manual (`new Date('YYYY-MM-DD')`).
 */
export function workedDateFor(startAt: Date): Date {
  return new Date(`${businessDate(startAt)}T00:00:00.000Z`);
}

/** 23:59:59 hora Colombia del día en que empezó la tarea. */
export function endOfBusinessDay(instant: Date): Date {
  return new Date(`${businessDate(instant)}T23:59:59.000${BUSINESS_UTC_OFFSET}`);
}

/**
 * Hora con la que el sistema cierra una tarea olvidada: ahora, salvo que la
 * tarea sea de un día anterior (el servidor estuvo caído en el tope), en cuyo
 * caso se cierra al final de su propio día y no al día siguiente.
 */
export function systemCloseTime(startAt: Date, now: Date): Date {
  const cap = endOfBusinessDay(startAt);
  return now.getTime() > cap.getTime() ? cap : now;
}
