import type { Sede } from './sede.types';

/**
 * Apoyo en otra sede autorizado por Gerencia (solo Zoom, docs/PLAN_SEDES.md §16).
 * Mientras está vigente, su sede es la única que el empleado puede operar.
 */
export type LocationSupportStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** `RETURN`: volver a sus sedes fijas antes de que termine el apoyo. */
export type LocationSupportKind = 'SUPPORT' | 'RETURN';

export type LocationSupportView = 'pending' | 'active' | 'scheduled' | 'history' | 'all';

export interface LocationSupportPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

type SupportSede = Pick<Sede, 'id' | 'code' | 'name' | 'color' | 'type'>;

export interface LocationSupport {
  id: string;
  userId: string;
  locationId: string;
  kind: LocationSupportKind;
  status: LocationSupportStatus;
  /** Días de Bogotá (`2026-10-01T00:00:00.000Z`): usar `supportDay()`. */
  startDate: string;
  endDate: string;
  reason: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  endedAt: string | null;
  endReason: string | null;
  replacesId: string | null;
  createdAt: string;
  user: LocationSupportPerson;
  location: SupportSede;
  requestedBy: LocationSupportPerson;
  reviewedBy: LocationSupportPerson | null;
  endedBy: LocationSupportPerson | null;
  replaces: { id: string; locationId: string; endDate: string; location: SupportSede } | null;
  /** Solo en la vista de vigentes: venció, pero sigue hasta que cierre su caja. */
  overdue?: boolean;
}

/** El apoyo vigente, tal como llega con el login y con `/auth/me`. */
export interface ActiveLocationSupport {
  id: string;
  locationId: string;
  /** `YYYY-MM-DD` */
  startDate: string;
  endDate: string;
  reason: string;
  authorizedBy: string | null;
  overdue: boolean;
  /** Sus sedes fijas: pedir una de ellas es volver antes de tiempo. */
  homeLocationIds: string[];
}

export interface RequestLocationSupportDto {
  locationId: string;
  startDate?: string;
  endDate?: string;
  reason: string;
}

export interface ScheduleLocationSupportDto {
  userId: string;
  locationId: string;
  startDate: string;
  endDate?: string;
  reason: string;
}
