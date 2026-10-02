import type { LocationSupport, LocationSupportPerson } from '../../../types';

/**
 * Formatos del apoyo en otra sede (docs/PLAN_SEDES.md §16). Las fechas del
 * apoyo son días de Bogotá sin hora: llegan como `2026-10-05` o como
 * `2026-10-05T00:00:00.000Z` y se muestran sin convertir de zona.
 */

/** `2026-10-05T00:00:00.000Z` → `2026-10-05`. */
export const supportDay = (value: string) => value.slice(0, 10);

/** Hoy en Bogotá, `YYYY-MM-DD`. */
export const bogotaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/** `2026-10-05` → `5 oct.` */
export const formatSupportDay = (value: string) =>
  new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${supportDay(value)}T00:00:00.000Z`),
  );

/** `el 5 oct.` o `del 1 oct. al 5 oct.` */
export const formatSupportRange = (start: string, end: string) =>
  supportDay(start) === supportDay(end)
    ? `el ${formatSupportDay(start)}`
    : `del ${formatSupportDay(start)} al ${formatSupportDay(end)}`;

const utcDay = (value: string) => new Date(`${supportDay(value)}T00:00:00.000Z`);

/** `2026-10-01` + 2 → `2026-10-03`. */
export const addSupportDays = (value: string, days: number) => {
  const date = utcDay(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** El primer sábado desde ese día (el mismo día si ya es sábado): el fin de la semana de trabajo. */
export const nextSaturday = (value: string) => addSupportDays(value, (6 - utcDay(value).getUTCDay() + 7) % 7);

/** Días del periodo, contando el primero y el último. */
export const supportDayCount = (start: string, end: string) =>
  Math.round((utcDay(end).getTime() - utcDay(start).getTime()) / 86_400_000) + 1;

/** `2026-10-01` → `jueves, 1 de oct`. */
export const formatSupportWeekday = (value: string) =>
  new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    utcDay(value),
  );

/** Para leer de corrido: `hoy`, `mañana` o `el jueves, 1 de oct`. */
export const relativeSupportDay = (value: string, today = bogotaToday()) => {
  const day = supportDay(value);
  if (day === today) return 'hoy';
  if (day === addSupportDays(today, 1)) return 'mañana';
  return `el ${formatSupportWeekday(day)}`;
};

/** `Solo hoy` o `Desde hoy hasta el sábado, 3 de oct · 3 días`. */
export const describeSupportPeriod = (start: string, end: string, today = bogotaToday()) =>
  supportDay(start) === supportDay(end)
    ? `Solo ${relativeSupportDay(start, today)}`
    : `Desde ${relativeSupportDay(start, today)} hasta ${relativeSupportDay(end, today)} · ${supportDayCount(start, end)} días`;

/** `2026-09-30T14:15:00.000Z` → `30 sept., 9:15 a. m.`, en hora de Bogotá. */
export const formatSupportMoment = (value: string) =>
  new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(value));

export const personName = (person: LocationSupportPerson | null | undefined) =>
  (person && ([person.firstName, person.lastName].filter(Boolean).join(' ') || person.username)) || '—';

/** Qué es la solicitud: un apoyo, un cambio a mitad de otro apoyo, o una vuelta a su sede. */
export const supportKindLabel = (support: Pick<LocationSupport, 'kind' | 'replacesId'>) =>
  support.kind === 'RETURN' ? 'Vuelta a su sede' : support.replacesId ? 'Cambio de sede' : 'Apoyo';

/**
 * Cuándo se pidió y cuándo se respondió, con quién respondió si no fue quien
 * pidió. Lo que programa Gerencia nace aprobado: una sola línea.
 */
export function supportMoments(
  support: Pick<LocationSupport, 'status' | 'createdAt' | 'reviewedAt' | 'requestedBy' | 'reviewedBy'>,
): string[] {
  const { status, reviewedAt, reviewedBy, requestedBy } = support;
  const sameReviewer = reviewedBy?.id === requestedBy.id;
  if (status === 'APPROVED' && sameReviewer) return [`Programado el ${formatSupportMoment(support.createdAt)}`];

  const lines = [`Solicitada el ${formatSupportMoment(support.createdAt)}`];
  if (reviewedAt && (status === 'APPROVED' || status === 'REJECTED')) {
    const by = reviewedBy && !sameReviewer ? ` por ${personName(reviewedBy)}` : '';
    lines.push(`${status === 'APPROVED' ? 'Aprobada' : 'Rechazada'} el ${formatSupportMoment(reviewedAt)}${by}`);
  }
  return lines;
}

type ChipColor = 'default' | 'warning' | 'success' | 'error' | 'info';

/** Estado para mostrar: además del de la base, si ya terminó o está programado. */
export function supportStatus(support: LocationSupport, today = bogotaToday()): { label: string; color: ChipColor } {
  switch (support.status) {
    case 'PENDING':
      return { label: 'Pendiente', color: 'warning' };
    case 'REJECTED':
      return { label: 'Rechazada', color: 'error' };
    case 'CANCELLED':
      return { label: 'Cancelada', color: 'default' };
  }
  if (support.kind === 'RETURN') return { label: 'Aprobada', color: 'success' };
  if (support.endedAt) return { label: 'Terminado antes', color: 'default' };
  if (support.overdue) return { label: 'Vencido, caja abierta', color: 'error' };
  if (supportDay(support.startDate) > today) return { label: 'Programado', color: 'info' };
  if (supportDay(support.endDate) < today) return { label: 'Terminado', color: 'default' };
  return { label: 'Vigente', color: 'success' };
}

/** Mensaje de un error del backend (los 400 de apoyos traen uno claro). */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) return message[0] ?? fallback;
  return message || fallback;
}
