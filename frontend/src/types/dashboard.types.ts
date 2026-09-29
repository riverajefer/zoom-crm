export interface FinancialSummary {
  totalVentas: number;
  totalVentasPrev: number;
  totalGastos: number;
  totalGastosPrev: number;
  utilidad: number;
  utilidadPrev: number;
  cuentasPorPagar: number;
  cuentasPorCobrar: number;
}

export interface MonthlyDataPoint {
  month: string;
  ventas: number;
  gastos: number;
  utilidad: number;
}

export interface FinancialIndicators {
  totalClients: number;
  totalProducts: number;
  totalSuppliers: number;
  totalOP: number;
  totalOT: number;
  totalOG: number;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  clientName: string;
  total: number;
  status: string;
  createdAt: string;
}

export interface PendingOrder {
  id: string;
  orderNumber: string;
  clientName: string;
  balance: number;
  status: string;
}

export interface TopClient {
  clientId: string;
  clientName: string;
  totalCompras: number;
  orderCount: number;
}

export interface FinancialDashboardResponse {
  summary: FinancialSummary;
  monthlyData: MonthlyDataPoint[];
  indicators: FinancialIndicators;
  recentOrders: RecentOrder[];
  pendingOrders: PendingOrder[];
  topClients: TopClient[];
}

export interface FinancialQueryParams {
  dateFrom?: string;
  dateTo?: string;
}

// ─── Dashboard consolidado por sede (solo Zoom, docs/PLAN_SEDES.md §7) ────────

/** Cifras de una sede (o del total, bajo la llave `total`) en el periodo. */
export interface SedeDashboardMetrics {
  ventas: number;
  ordenes: number;
  ticketPromedio: number | null;
  cotizaciones: number;
  cotizacionesConvertidas: number;
  /** De 0 a 1; `null` sin cotizaciones. */
  conversion: number | null;
  recaudo: number;
  saldoAFavorAplicado: number;
  gastosOg: number;
  gastosCp: number;
  gastos: number;
  resultado: number;
  cartera: number;
  carteraOrdenes: number;
}

export interface SedeDashboardPeriodTotals {
  ventas: number;
  recaudo: number;
  gastos: number;
  resultado: number;
}

export interface SedesDashboardResponse {
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  locations: { id: string; code: string; name: string; type: 'STORE' | 'HEADQUARTERS'; color: string }[];
  /** Por id de sede, más `total`. */
  metrics: Record<string, SedeDashboardMetrics>;
  previous: Record<string, SedeDashboardPeriodTotals>;
  trend: { weeks: string[]; series: Record<string, { ventas: number[]; gastos: number[] }> };
  expensesByType: { type: string; total: number; byLocation: Record<string, number> }[];
  supplies: {
    byLocation: Record<string, number>;
    top: { supplyId: string; name: string; unit: string | null; quantity: number; value: number; byLocation: Record<string, number> }[];
  };
}
