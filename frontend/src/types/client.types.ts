/**
 * Types for Clients module
 */

import type { SedeSummary } from './sede.types';

export type PersonType = 'NATURAL' | 'EMPRESA';

export interface ClientAdvisorUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** Fila de la tabla de unión cliente↔asesor. */
export interface ClientAdvisor {
  advisor: ClientAdvisorUser;
}

export interface Client {
  id: string;
  name: string;
  manager?: string;
  encargado?: string;
  phone: string;
  landlinePhone?: string;
  address?: string;
  email?: string | null;
  departmentId: string;
  cityId: string;
  personType: PersonType;
  nit?: string;
  cedula?: string;
  specialCondition?: string | null;
  /**
   * Ficha de nómina cuando el cliente es a la vez empleado de la empresa.
   * Su presencia es lo que habilita el método de pago "Descuento por nómina".
   */
  employeeId?: string | null;
  employee?: {
    id: string;
    status: string;
    firstName?: string | null;
    firstLastName?: string | null;
  } | null;
  isActive: boolean;
  /** Asesores dueños del cliente (co-propiedad). */
  advisors?: ClientAdvisor[];
  createdAt: string;
  updatedAt: string;
  department?: {
    id: string;
    name: string;
    code: string;
  };
  city?: {
    id: string;
    name: string;
  };
  saldoAFavor?: number;
}

export interface CreateClientDto {
  name: string;
  manager?: string;
  encargado?: string;
  phone: string;
  landlinePhone?: string;
  address?: string;
  email?: string;
  departmentId: string;
  cityId: string;
  personType: PersonType;
  nit?: string;
  cedula?: string;
  specialCondition?: string;
  /** Ficha de nómina, si el cliente es empleado. */
  employeeId?: string | null;
  /** IDs de asesores dueños (solo aplicable para administradores). */
  advisorIds?: string[];
}

export interface UpdateClientDto {
  name?: string;
  manager?: string;
  encargado?: string;
  phone?: string;
  landlinePhone?: string;
  address?: string;
  email?: string;
  departmentId?: string;
  cityId?: string;
  personType?: PersonType;
  nit?: string;
  cedula?: string;
  isActive?: boolean;
  specialCondition?: string;
  /** IDs de asesores dueños (reemplaza el conjunto completo; solo admin). */
  advisorIds?: string[];
}

export interface UpdateClientSpecialConditionDto {
  specialCondition?: string | null;
}

export interface ClientQueryParams {
  includeInactive?: boolean;
  /** Fecha de creación desde (ISO 8601). */
  createdAtFrom?: string;
  /** Fecha de creación hasta (ISO 8601). */
  createdAtTo?: string;
}

export type ClientListResponse = Client[];

export interface ClientOrderHistory {
  id: string;
  /** Sede de la OP: la ficha agrupa por sede (docs/PLAN_SEDES.md §8). */
  location?: SedeSummary;
  orderNumber: string;
  orderDate: string;
  total: number;
  paidAmount: number;
  balance: number;
  status: string;
  advisor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface ClientStats {
  totalPurchased: number;
  pendingBalance: number;
  pendingOrdersCount: number;
  saldoAFavor: number;
  lastOrderDate: string | null;
  orders: ClientOrderHistory[];
  quotes?: ClientQuoteHistory[];
}

export interface ClientQuoteHistory {
  id: string;
  quoteNumber: string;
  quoteDate: string;
  total: number;
  status: string;
  location?: SedeSummary;
}

export interface UploadClientRowError {
  row: number;
  error: string;
}

export interface UploadClientsResponse {
  total: number;
  successful: number;
  failed: number;
  errors: UploadClientRowError[];
}

/**
 * Posible duplicado devuelto por el backend al crear un cliente (409) o al
 * consultar `/clients/check-duplicate`.
 *
 * `tier` indica qué tan fuerte es la coincidencia: ALTA = mismo documento y
 * mismo nombre; MEDIA = solo el documento (puede ser una persona distinta que
 * comparte el dato); BAJA = solo el nombre.
 */
export interface ClientDuplicateMatch {
  id: string;
  name: string;
  document: string | null;
  tier: 'ALTA' | 'MEDIA' | 'BAJA';
  /** `sede`: la predeterminada del asesor (solo Zoom). */
  advisors: {
    id: string;
    name: string;
    sede?: { code: string; name: string; color: string } | null;
  }[];
}

/** Cuerpo del 409 que devuelve `POST /clients` cuando detecta un posible duplicado. */
export interface PossibleDuplicateError {
  code: 'POSSIBLE_DUPLICATE';
  message: string;
  matches: ClientDuplicateMatch[];
}
