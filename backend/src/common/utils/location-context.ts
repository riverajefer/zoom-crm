import { getRequestStore, RequestLocation } from './audit-context';

export type { RequestLocation };

/**
 * Header con el que el frontend dice en qué sede está trabajando: el id de una
 * sede, o `all` para la vista "Todas las sedes". Ver docs/PLAN_SEDES.md §15.1.
 */
export const LOCATION_HEADER = 'x-location-id';
export const ALL_LOCATIONS = 'all';

/** Permiso que habilita cualquier sede y la vista "Todas". */
export const VIEW_ALL_LOCATIONS_PERMISSION = 'view_all_locations';

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
