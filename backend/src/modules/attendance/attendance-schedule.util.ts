/** Hora de cierre de la jornada por defecto, en hora Colombia. */
export const DEFAULT_WORKDAY_END = '19:00';

/**
 * Tope de los registros de horas extra: a las 23:59 (hora Colombia) se cierra lo
 * que siga abierto. Sin él, una hora extra marcada después del cierre de jornada
 * quedaba abierta hasta el cierre del día siguiente.
 */
export const OVERTIME_CAP_CRON = '0 59 23 * * *';

export interface WorkdayEnd {
  hour: number;
  minute: number;
  /** `HH:mm`, para los logs. */
  label: string;
  /** Falso solo si vino un valor y no se pudo leer (se usa el de por defecto). */
  valid: boolean;
}

/**
 * Lee la hora de cierre de la jornada (`ATTENDANCE_WORKDAY_END`, `HH:mm` en hora
 * Colombia). Sin valor usa `fallback` (19:00 por defecto); con un valor mal
 * escrito también, pero lo marca como no válido para que el arranque lo avise.
 */
export function parseWorkdayEnd(
  value: string | null | undefined,
  fallback: string = DEFAULT_WORKDAY_END,
): WorkdayEnd {
  const raw = value?.trim() ?? '';
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw || fallback);

  if (!match) {
    return { ...parseWorkdayEnd(fallback), valid: false };
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    valid: true,
  };
}

/** Expresión cron (con segundos) para el cierre de jornada. */
export function workdayEndCron({ hour, minute }: Pick<WorkdayEnd, 'hour' | 'minute'>): string {
  return `0 ${minute} ${hour} * * *`;
}
