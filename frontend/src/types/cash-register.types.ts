import type { SedeSummary } from './sede.types';

// ============================================================
// Módulo de Caja Registradora (POS) — TypeScript Types
// ============================================================

export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT';
export type DenominationCountType = 'OPENING' | 'CLOSING';
export type DenominationType = 'BILL' | 'COIN';

// Colombian denomination constants
export const COLOMBIAN_BILLS = [100000, 50000, 20000, 10000, 5000, 2000] as const;
export const COLOMBIAN_COINS = [1000, 500, 200, 100, 50] as const;
export const ALL_DENOMINATIONS = [...COLOMBIAN_BILLS, ...COLOMBIAN_COINS] as const;
export type ColombianDenomination = (typeof ALL_DENOMINATIONS)[number];

export interface UserSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface CashRegister {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    sessions: number;
  };
}

export interface DenominationCount {
  id: string;
  cashSessionId: string;
  countType: DenominationCountType;
  denomType: DenominationType;
  denomination: number;
  quantity: number;
  subtotal: string;
}

export interface CashSession {
  id: string;
  cashRegisterId: string;
  openedById: string;
  closedById?: string;
  status: CashSessionStatus;
  openingAmount: string;
  closingAmount?: string;
  systemBalance?: string;
  discrepancy?: string;
  notes?: string;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  cashRegister: Pick<CashRegister, 'id' | 'name' | 'description'> & { location?: SedeSummary };
  openedBy: UserSummary;
  closedBy?: UserSummary;
  denominations: DenominationCount[];
  movements?: CashMovement[];
}

export interface ExpenseOrderRef {
  id: string;
  ogNumber: string;
  status: string;
  expenseType: { name: string };
}

export interface OrderRef {
  id: string;
  orderNumber: string;
  status: string;
  client: { name: string };
}

export interface CashMovement {
  id: string;
  cashSessionId: string;
  receiptNumber: string;
  movementType: CashMovementType;
  paymentMethod: string;
  amount: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  isVoided: boolean;
  voidedById?: string;
  voidedAt?: string;
  voidReason?: string;
  counterMovementId?: string;
  performedById: string;
  createdAt: string;
  updatedAt: string;
  performedBy: UserSummary;
  voidedBy?: UserSummary;
  linkedPayment?: {
    id: string;
    orderId: string;
    amount: string;
    paymentMethod: string;
    advancePaymentApproval?: {
      id: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
    } | null;
  };
  expenseOrderRef?: ExpenseOrderRef | null;
  orderRef?: OrderRef | null;
}

export interface BalancePreview {
  sessionId: string;
  status: CashSessionStatus;
  openingAmount: string;
  systemBalance: string;
  totalIncome: string;
  totalExpense: string;
  totalWithdrawals: string;
  totalDeposits: string;
  movementCount: number;
}

// Paginated list responses
export interface CashSessionsListResponse {
  data: CashSession[];
  total: number;
  page: number;
  limit: number;
}

export interface CashMovementsListResponse {
  data: CashMovement[];
  total: number;
  page: number;
  limit: number;
}

// DTOs for API calls
export interface DenominationCountItemDto {
  denomination: ColombianDenomination;
  quantity: number;
}

export interface CreateCashRegisterDto {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCashRegisterDto extends Partial<CreateCashRegisterDto> {}

export interface OpenCashSessionDto {
  cashRegisterId: string;
  denominations: DenominationCountItemDto[];
  notes?: string;
}

export interface CloseCashSessionDto {
  denominations: DenominationCountItemDto[];
  notes?: string;
}

export interface CreateCashMovementDto {
  cashSessionId: string;
  movementType: CashMovementType;
  amount: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
}

export interface VoidCashMovementDto {
  voidReason: string;
}

export interface FilterCashSessionsDto {
  cashRegisterId?: string;
  status?: CashSessionStatus;
  openedById?: string;
  openedFrom?: string;
  openedTo?: string;
  page?: number;
  limit?: number;
}

export interface FilterCashMovementsDto {
  cashSessionId?: string;
  movementType?: CashMovementType;
  includeVoided?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// ── Cola de abonos pendientes de ingresar a caja ─────────────────────────────

/**
 * Abono cobrado sin caja abierta. Existe en la OP pero todavía no en el arqueo:
 * entra automáticamente al abrir la próxima sesión.
 */
export interface PendingCashEntry {
  id: string;
  amount: string;
  /** Coincide con `PaymentMethod` de Prisma; se tipa como string igual que el
   *  resto de este archivo para no acoplar los tipos de caja a los de órdenes. */
  paymentMethod: string;
  paymentDate: string;
  reference: string | null;
  order: {
    id: string;
    orderNumber: string;
  } | null;
  receivedBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface PendingCashEntriesSummary {
  count: number;
  /** Decimal serializado. */
  totalAmount: string;
  payments: PendingCashEntry[];
}
