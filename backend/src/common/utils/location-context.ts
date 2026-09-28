import { BadRequestException } from '@nestjs/common';
import { getRequestStore, RequestLocation, runWithAuditContext } from './audit-context';

export type { RequestLocation };

/**
 * Header con el que el frontend dice en qué sede está trabajando: el id de una
 * sede, o `all` para la vista "Todas las sedes". Ver docs/PLAN_SEDES.md §15.1.
 */
export const LOCATION_HEADER = 'x-location-id';
export const ALL_LOCATIONS = 'all';

/** Permiso que habilita cualquier sede y la vista "Todas". */
export const VIEW_ALL_LOCATIONS_PERMISSION = 'view_all_locations';

/** Permiso que habilita el modo consulta de documentos de otra sede. */
export const READ_OTHER_LOCATIONS_PERMISSION = 'read_other_locations';

/** Código que el frontend reconoce para pedir que se elija una sede. */
export const LOCATION_REQUIRED = 'LOCATION_REQUIRED';

/**
 * Sede activa del request en curso. Fuera de un request (crons, listeners,
 * gateways) no hay sede: `undefined`, y quien la necesite la pasa explícita.
 */
export function getRequestLocation(): RequestLocation | undefined {
  return getRequestStore()?.location;
}

/** La fija `LocationContextInterceptor`. Sin contexto activo no hace nada. */
export function setRequestLocation(location: RequestLocation): void {
  const store = getRequestStore();
  if (store) {
    store.location = location;
  }
}

/**
 * Sede en la que nace un documento nuevo: la sede activa del request. En la
 * vista "Todas", o sin sede, no hay dónde crearlo y es un 400 con código
 * `LOCATION_REQUIRED`. Los documentos hijos no la usan: heredan la del padre.
 */
export function requireActiveLocationId(): string {
  const locationId = getRequestLocation()?.locationId;
  if (!locationId) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Elige una sede para crear el documento: en "Todas las sedes" no se puede crear.',
      code: LOCATION_REQUIRED,
    });
  }
  return locationId;
}

/**
 * Filtro de sede de la consulta en curso, para `location-scope.extension`.
 * `null` es sin filtro: fuera de un request (crons, listeners), antes de que
 * el interceptor resuelva la sede (guards), en la vista "Todas" o dentro de
 * `withoutLocationScope`. Si no:
 *
 * - `locationIds`: `[id]` con la sede activa; `[]` para un usuario sin sede,
 *   que no ve documentos de ninguna.
 * - `listsOnly`: quien tiene `view_all_locations` opera en cualquier sede (el
 *   admin aprueba solicitudes de todas desde su bandeja), así que la sede
 *   activa solo le filtra los listados, no el acceso por id ni las escrituras.
 */
export function getLocationScope(): { locationIds: string[]; listsOnly: boolean } | null {
  const store = getRequestStore();
  if (!store || store.locationBypass) return null;
  const location = store.location;
  if (!location || location.all) return null;
  return {
    locationIds: location.locationId ? [location.locationId] : [],
    listsOnly: !!location.viewAll,
  };
}

/**
 * Corre `fn` sin el filtro de sede. Es la salida explícita, y con nombre, para
 * lo poco que debe cruzar sedes: el saldo a favor (que se usa en cualquier
 * sede) y el modo consulta de la fase 4. Ver docs/PLAN_SEDES.md §15.1.
 */
export async function withoutLocationScope<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  const store = getRequestStore();
  if (!store) return fn();
  // El `await` va adentro: las consultas de Prisma son perezosas y se ejecutan
  // cuando alguien las espera. Devolver la consulta sin esperarla haría que se
  // ejecutara afuera, con el filtro puesto.
  return runWithAuditContext({ ...store, locationBypass: true }, async () => await fn());
}
