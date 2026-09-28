import { Client } from './client.types';
import type { User } from './user.types';
import { CommercialChannel } from './commercialChannel.types';
import { Product } from './product.types';
import type { LocatedDocument } from './sede.types';

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  FOLLOW_UP_1 = 'FOLLOW_UP_1',
  FOLLOW_UP_2 = 'FOLLOW_UP_2',
  FOLLOW_UP_3 = 'FOLLOW_UP_3',
  ACCEPTED = 'ACCEPTED',
  NO_RESPONSE = 'NO_RESPONSE',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED',
}

export const QUOTE_STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' | 'gradient' }
> = {
  [QuoteStatus.DRAFT]:       { label: 'Borrador',      color: 'default' },
  [QuoteStatus.SENT]:        { label: 'Enviada',        color: 'info' },
  [QuoteStatus.FOLLOW_UP_1]: { label: 'Seguimiento 1',  color: 'secondary' },
  [QuoteStatus.FOLLOW_UP_2]: { label: 'Seguimiento 2',  color: 'secondary' },
  [QuoteStatus.FOLLOW_UP_3]: { label: 'Seguimiento 3',  color: 'secondary' },
  [QuoteStatus.ACCEPTED]:    { label: 'Aceptada',       color: 'success' },
  [QuoteStatus.NO_RESPONSE]: { label: 'Sin respuesta',  color: 'warning' },
  [QuoteStatus.REJECTED]:    { label: 'Rechazada',      color: 'error' },
  [QuoteStatus.CONVERTED]:   { label: 'Convertida',     color: 'gradient' },
};

/**
 * Transiciones válidas de estado de cotización.
 * Flujo: DRAFT → SENT → FOLLOW_UP_1 → FOLLOW_UP_2 → FOLLOW_UP_3 → NO_RESPONSE
 *                                                              ↘ ACCEPTED → CONVERTED
 *                                                              ↘ REJECTED (requiere motivo)
 *
 * Los seguimientos avanzan de uno en uno, y desde Enviada o cualquiera de ellos
 * se puede aceptar, rechazar o marcar sin respuesta.
 * Debe reflejar exactamente quote-status-transitions.ts del backend.
 */
export const ALLOWED_QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.DRAFT]:       [QuoteStatus.SENT],
  [QuoteStatus.SENT]:        [QuoteStatus.FOLLOW_UP_1, QuoteStatus.ACCEPTED, QuoteStatus.NO_RESPONSE, QuoteStatus.REJECTED],
  [QuoteStatus.FOLLOW_UP_1]: [QuoteStatus.FOLLOW_UP_2, QuoteStatus.ACCEPTED, QuoteStatus.NO_RESPONSE, QuoteStatus.REJECTED],
  [QuoteStatus.FOLLOW_UP_2]: [QuoteStatus.FOLLOW_UP_3, QuoteStatus.ACCEPTED, QuoteStatus.NO_RESPONSE, QuoteStatus.REJECTED],
  [QuoteStatus.FOLLOW_UP_3]: [QuoteStatus.ACCEPTED, QuoteStatus.NO_RESPONSE, QuoteStatus.REJECTED],
  [QuoteStatus.ACCEPTED]:    [QuoteStatus.CONVERTED, QuoteStatus.REJECTED],
  [QuoteStatus.NO_RESPONSE]: [QuoteStatus.REJECTED],
  [QuoteStatus.REJECTED]:    [],
  [QuoteStatus.CONVERTED]:   [],
};

export interface QuoteItem {
  id: string;
  quoteId: string;
  productId?: string;
  product?: Product;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  total: number | string;
  specifications?: any;
  sampleImageId?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Quote extends LocatedDocument {
  id: string;
  quoteNumber: string;
  clientId: string;
  quoteDate: string;
  validUntil?: string;
  subtotal: number | string;
  taxRate: number | string;
  tax: number | string;
  total: number | string;
  status: QuoteStatus;
  notes?: string;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  /** Estado desde el que se rechazó: destino si se restaura */
  rejectedFromStatus?: QuoteStatus | null;
  createdById: string;
  commercialChannelId?: string;
  createdAt: string;
  updatedAt: string;
  
  // Relations
  client?: Client;
  createdBy?: User;
  commercialChannel?: CommercialChannel;
  items?: QuoteItem[];
  orderId?: string;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
  };
}

export interface CreateQuoteItemDto {
  id?: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  specifications?: any;
  sampleImageId?: string | null;
}

export interface CreateQuoteDto {
  clientId: string;
  validUntil?: string;
  notes?: string;
  taxRate?: number;
  items: CreateQuoteItemDto[];
  commercialChannelId?: string;
}

export interface UpdateQuoteDto extends Partial<CreateQuoteDto> {
  status?: QuoteStatus;
  /** Obligatorio al pasar la cotización a REJECTED. */
  rejectionReason?: string;
}

export interface FilterQuotesDto {
  status?: QuoteStatus;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  createdById?: string;
  search?: string;
}

/** COT de otra sede en `GET /quotes/lookup` (docs/PLAN_SEDES.md §8). */
export interface QuoteLookupItem {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  quoteDate: string;
  total: string;
  client: { id: string; name: string };
}
