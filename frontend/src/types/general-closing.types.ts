import type { Sede } from './sede.types';

/** Cierre general diario: revisión de contabilidad sobre las cajas de todas las sedes. */
export type GeneralClosingStatus = 'OPEN' | 'CLOSED';
export type GeneralClosingReviewStatus = 'VERIFIED' | 'OBSERVED' | 'NO_OPERATION';
export type RegisterDayStatus = 'CLOSED' | 'OPEN' | 'NO_SESSION';

export const REGISTER_DAY_STATUS_LABELS: Record<RegisterDayStatus, string> = {
  CLOSED: 'Cerrada',
  OPEN: 'Abierta',
  NO_SESSION: 'Sin sesión',
};

export const REVIEW_STATUS_LABELS: Record<GeneralClosingReviewStatus, string> = {
  VERIFIED: 'Verificada',
  OBSERVED: 'Observada',
  NO_OPERATION: 'Sin operación',
};

export const REVIEW_STATUS_COLORS: Record<
  GeneralClosingReviewStatus,
  'default' | 'success' | 'warning'
> = {
  VERIFIED: 'success',
  OBSERVED: 'warning',
  NO_OPERATION: 'default',
};

interface ClosingUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface RegisterDayTotals {
  openingAmount: number;
  incomeCash: number;
  incomeTransfer: number;
  incomeCard: number;
  incomeOther: number;
  deposits: number;
  /** Efectivo recibido de los locales (solo la Matriz). */
  handoversIn: number;
  cashExpenses: number;
  otherExpenses: number;
  withdrawals: number;
  expected: number | null;
  counted: number | null;
  discrepancy: number | null;
}

/** Columnas de dinero, en el orden de la tabla y del Excel. */
export const TOTAL_COLUMNS: { field: keyof RegisterDayTotals; label: string }[] = [
  { field: 'openingAmount', label: 'Base' },
  { field: 'incomeCash', label: 'Efectivo' },
  { field: 'incomeTransfer', label: 'Transferencia' },
  { field: 'incomeCard', label: 'Tarjeta' },
  { field: 'incomeOther', label: 'Otros' },
  { field: 'deposits', label: 'Retiros del banco' },
  { field: 'handoversIn', label: 'Recibido de locales' },
  { field: 'cashExpenses', label: 'Egresos' },
  { field: 'otherExpenses', label: 'Egresos no efectivo' },
  { field: 'withdrawals', label: 'Consignaciones' },
  { field: 'expected', label: 'Esperado' },
  { field: 'counted', label: 'Contado' },
  { field: 'discrepancy', label: 'Diferencia' },
];

export interface RegisterDaySession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingAmount: string;
  closingAmount: string | null;
  systemBalance: string | null;
  discrepancy: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: ClosingUser | null;
  closedBy: ClosingUser | null;
}

export interface RegisterDayReview {
  status: GeneralClosingReviewStatus;
  notes: string | null;
  reviewedAt: string;
  reviewedBy: ClosingUser | null;
}

export interface RegisterDayRow {
  cashRegister: { id: string; name: string; isActive: boolean; location: Sede };
  status: RegisterDayStatus;
  sessions: RegisterDaySession[];
  totals: RegisterDayTotals;
  review: RegisterDayReview | null;
  /** Los pagos del día en la sede de la caja y cuántos revisó contabilidad. */
  payments: { total: number; pending: number; observed: number; verified: number; pendingAmount: number };
  /** El efectivo que la Matriz recogió de esta caja después de su cierre. */
  handover: {
    amount: number;
    baseLeft: number | null;
    receiptNumber: string;
    receivedAt: string;
    receivedBy: ClosingUser | null;
  } | null;
}

export interface ConsolidatedLine {
  location: Pick<Sede, 'code' | 'name' | 'color'>;
  reference: string;
  detail: string;
  amount: number;
}

/** El consolidado de caja: todas las cajas como una sola, solo en efectivo. */
export interface ClosingConsolidated {
  base: number;
  cashDeposits: number;
  cashSales: number;
  expenseGroups: { label: string; amount: number }[];
  cashWithdrawals: number;
  total: number;
  counted: number | null;
  difference: number | null;
  cashReceived: ConsolidatedLine[];
  cashExpenses: (ConsolidatedLine & { group: string })[];
}

export interface GeneralClosingEvent {
  id: string;
  type: 'CLOSED' | 'REOPENED';
  notes: string | null;
  createdAt: string;
  user: ClosingUser | null;
}

export interface ClosingBlocker {
  cashRegisterId: string;
  cashRegisterName: string;
  /** Lo que falta, dicho como acción: «Verificar 4 pagos». */
  action: string;
}

export interface ClosingDrift {
  cashRegisterId: string;
  cashRegisterName: string;
  field: keyof RegisterDayTotals;
  signed: number | null;
  current: number | null;
}

export interface GeneralClosingDay {
  date: string;
  closing: {
    id: string;
    status: GeneralClosingStatus;
    notes: string | null;
    closedAt: string | null;
    closedBy: ClosingUser | null;
    events: GeneralClosingEvent[];
  } | null;
  /** Firmado: la foto de lo que se firmó. En revisión: los números en vivo. */
  registers: RegisterDayRow[];
  totals: RegisterDayTotals;
  consolidated: ClosingConsolidated;
  /** Lo que falta para poder firmar, caja por caja. */
  blockers: ClosingBlocker[];
  /** Lo que cambió después de firmar. */
  drift: ClosingDrift[];
}

export interface GeneralClosingHistoryItem {
  id: string;
  date: string;
  status: GeneralClosingStatus;
  notes: string | null;
  closedAt: string | null;
  closedBy: ClosingUser | null;
  totals: RegisterDayTotals | null;
  observedCount: number;
}

export interface GeneralClosingHistoryResponse {
  data: GeneralClosingHistoryItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Una caja en un periodo, para comparar sedes desde el control de caja. */
export interface LocationPeriodRow {
  cashRegister: RegisterDayRow['cashRegister'];
  daysWithCash: number;
  daysBalanced: number;
  daysShort: number;
  shortTotal: number;
  daysOver: number;
  overTotal: number;
  openSessions: number;
  incomeCash: number;
  incomeTransfer: number;
  incomeCard: number;
  incomeOther: number;
  cashExpenses: number;
  handedOver: number;
  handoversIn: number;
  payments: RegisterDayRow['payments'];
}

export interface GeneralClosingByLocation {
  from: string;
  to: string;
  rows: LocationPeriodRow[];
  totals: Omit<
    LocationPeriodRow,
    'cashRegister' | 'daysWithCash' | 'daysBalanced' | 'handoversIn'
  >;
}

export interface GeneralClosingPendingDay {
  date: string;
  sessions: number;
  openSessions: number;
}
