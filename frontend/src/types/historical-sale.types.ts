/** Histórico de ventas (solo Zoom): OP de las planillas de Excel de 2023-2025. */
export type HistoricalSaleStatus = 'PAID' | 'WITH_BALANCE' | 'ANNULLED' | 'QUOTE' | 'RETURNED';

export const HISTORICAL_STATUS_LABELS: Record<HistoricalSaleStatus, string> = {
  PAID: 'Pagada',
  WITH_BALANCE: 'Con saldo',
  ANNULLED: 'Anulada',
  QUOTE: 'Cotización',
  RETURNED: 'Devolución',
};

export const HISTORICAL_STATUS_COLORS: Record<
  HistoricalSaleStatus,
  'success' | 'warning' | 'default' | 'info' | 'error'
> = {
  PAID: 'success',
  WITH_BALANCE: 'warning',
  ANNULLED: 'default',
  QUOTE: 'info',
  RETURNED: 'error',
};

export interface HistoricalSaleLocation {
  id: string;
  code: string;
  name: string;
  color: string;
}

export interface HistoricalSaleListItem {
  id: string;
  year: number;
  originalNumber: number;
  saleDate: string | null;
  clientName: string;
  clientNit: string | null;
  sellerName: string | null;
  status: HistoricalSaleStatus;
  total: string;
  receivedAmount: string;
  balance: string;
  invoiceStatus: string | null;
  location: HistoricalSaleLocation;
  _count: { items: number };
}

export interface HistoricalSaleItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  tax: string;
  total: string;
  sortOrder: number;
}

export interface HistoricalSale extends Omit<HistoricalSaleListItem, '_count'> {
  clientPhone: string | null;
  tax: string;
  paymentsByMethod: Record<string, number> | null;
  electronicInvoiceNumber: string | null;
  notes: string | null;
  sourceFile: string;
  sourceSheet: string;
  sourceRows: string;
  importedAt: string;
  items: HistoricalSaleItem[];
}

export interface FilterHistoricalSalesDto {
  search?: string;
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: HistoricalSaleStatus;
  sellerName?: string;
  locationId?: string;
  page?: number;
  limit?: number;
}

export interface HistoricalSalesResponse {
  data: HistoricalSaleListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface HistoricalSalesSummary {
  salesCount: number;
  salesTotal: number;
  receivedTotal: number;
  pendingBalance: number;
  byStatus: Record<HistoricalSaleStatus, { count: number; total: number; balance: number }>;
  byYear: { year: number; count: number; total: number }[];
}

export interface HistoricalSalesFilterOptions {
  sellers: string[];
  years: number[];
}
