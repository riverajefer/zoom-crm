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

export const personName = (person: LocationSupportPerson | null | undefined) =>
  (person && ([person.firstName, person.lastName].filter(Boolean).join(' ') || person.username)) || '—';

/** Qué es la solicitud: un apoyo, un cambio a mitad de otro apoyo, o una vuelta a su sede. */
export const supportKindLabel = (support: Pick<LocationSupport, 'kind' | 'replacesId'>) =>
  support.kind === 'RETURN' ? 'Vuelta a su sede' : support.replacesId ? 'Cambio de sede' : 'Apoyo';

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
