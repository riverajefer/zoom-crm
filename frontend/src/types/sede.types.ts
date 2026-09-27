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

/** Sedes del usuario que llegan con el login y con `/auth/me`. */
export interface UserSedes {
  locations: Sede[];
  defaultLocationId: string | null;
  canViewAllLocations: boolean;
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
