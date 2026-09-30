import type { ActiveLocationSupport } from './location-support.types';

/**
 * Sedes de Zoom: los locales 104, 119 y 125, y la Matriz.
 * En el backend el modelo es `Location`; en el frontend se llaman sedes para
 * no confundirlas con `location.types.ts` (departamentos y ciudades, de High).
 * Ver docs/PLAN_SEDES.md.
 */
export type SedeType = 'STORE' | 'HEADQUARTERS';

export interface Sede {
  id: string;
  code: string;
  name: string;
  type: SedeType;
  color: string;
  address: string | null;
  phone: string | null;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** La sede que viaja con cada documento (OP, COT, OT…). */
export type SedeSummary = Pick<Sede, 'id' | 'code' | 'name' | 'type' | 'color' | 'address' | 'phone'>;

/**
 * Cómo llega un documento a su detalle: completo, o en modo consulta (solo
 * lectura) porque es de otra sede. Ver docs/PLAN_SEDES.md §8.
 */
export type AccessMode = 'full' | 'consulta';

/** Sede y modo de acceso que traen los detalles de OP, COT y OT. */
export interface LocatedDocument {
  locationId?: string;
  location?: SedeSummary;
  accessMode?: AccessMode;
}

/** Resultados de `GET …/lookup`: documentos de otra sede, agrupados por sede. */
export interface SedeLookupGroup<T> {
  location: Pick<Sede, 'id' | 'code' | 'name' | 'color' | 'phone'>;
  /** Cuántos coinciden en esa sede; `items` trae solo las primeras filas. */
  total: number;
  items: T[];
}

/** Sedes del usuario que llegan con el login y con `/auth/me`. */
export interface UserSedes {
  locations: Sede[];
  defaultLocationId: string | null;
  canViewAllLocations: boolean;
  /** Apoyo en otra sede vigente: su sede es la única de `locations` (§16). */
  activeLocationSupport?: ActiveLocationSupport | null;
}

export interface CreateSedeDto {
  code: string;
  name: string;
  type?: SedeType;
  address?: string | null;
  phone?: string | null;
  color: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateSedeDto = Partial<Omit<CreateSedeDto, 'code'>>;

export interface SetUserLocationsDto {
  locationIds: string[];
  defaultLocationId?: string | null;
}
