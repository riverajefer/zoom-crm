// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AccountPayableStatus {
  PENDING = 'PENDING',
  ADMIN_AUTHORIZED = 'ADMIN_AUTHORIZED',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum AccountPayableType {
  RENT = 'RENT',
  PUBLIC_SERVICES = 'PUBLIC_SERVICES',
  BANK_CREDIT = 'BANK_CREDIT',
  SUPPLIER = 'SUPPLIER',
  THIRD_PARTY_SERVICE = 'THIRD_PARTY_SERVICE',
  PAYROLL = 'PAYROLL',
  TAX = 'TAX',
  MAINTENANCE = 'MAINTENANCE',
  SUBSCRIPTION = 'SUBSCRIPTION',
  TRANSPORT = 'TRANSPORT',
  OTHER = 'OTHER',
}

// ─── Status Config ────────────────────────────────────────────────────────────

export interface AccountPayableStatusConfig {
  label: string;
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

export const ACCOUNT_PAYABLE_STATUS_CONFIG: Record<AccountPayableStatus, AccountPayableStatusConfig> = {
  [AccountPayableStatus.PENDING]:          { label: 'Pendiente de pago', color: 'warning' },
  [AccountPayableStatus.ADMIN_AUTHORIZED]: { label: 'Autorizada (legado)', color: 'info' },
  [AccountPayableStatus.PARTIAL]:          { label: 'Abonada',                    color: 'info' },
  [AccountPayableStatus.PAID]:             { label: 'Pagada',                     color: 'success' },
  [AccountPayableStatus.OVERDUE]:          { label: 'Vencida',                    color: 'error' },
  [AccountPayableStatus.CANCELLED]:        { label: 'Anulada',                    color: 'default' },
};

export const ACCOUNT_PAYABLE_TYPE_LABELS: Record<AccountPayableType, string> = {
  [AccountPayableType.RENT]:                'Arriendo',
  [AccountPayableType.PUBLIC_SERVICES]:     'Servicios Públicos',
  [AccountPayableType.BANK_CREDIT]:         'Crédito Bancario',
  [AccountPayableType.SUPPLIER]:            'Proveedor',
  [AccountPayableType.THIRD_PARTY_SERVICE]: 'Servicio de Terceros',
  [AccountPayableType.PAYROLL]:             'Nómina / Honorarios',
  [AccountPayableType.TAX]:                 'Impuestos',
  [AccountPayableType.MAINTENANCE]:         'Mantenimiento',
  [AccountPayableType.SUBSCRIPTION]:        'Suscripción',
  [AccountPayableType.TRANSPORT]:           'Transporte / Logística',
  [AccountPayableType.OTHER]:               'Otros',
};

// ─── Core entities ────────────────────────────────────────────────────────────

export interface AccountPayablePayment {
  id: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
  bankEntity?: string | null;
  receiptFileId?: string | null;
  receiptFileId2?: string | null;
  cashMovementId?: string | null;
  paymentAuthRequestId?: string | null;
  isReversed?: boolean;
  reversedAt?: string | null;
  createdAt: string;
  registeredBy: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
}

export interface AccountPayableInstallment {
  id: string;
  installmentNumber: number;
  amount: string;
  dueDate: string;
  isPaid: boolean;
  paidAt?: string | null;
  notes?: string | null;
  paidBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface AccountPayableAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  createdAt: string;
  uploadedBy: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export interface AccountPayable {
  id: string;
  apNumber: string;
  expenseType?: { id: string; name: string };
  expenseSubcategory?: { id: string; name: string };
  status: AccountPayableStatus;
  description: string;
  observations?: string | null;
  subtotalAmount: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  applyIva: boolean;
  ivaRate: string;
  retefuenteRate: string;
  reteICARate: string;
  reteIVARate: string;
  dueDate: string;
  isRecurring: boolean;
  recurringDay?: number | null;
  recurringFrequency?: 'BIWEEKLY' | 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL' | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  supplier?: {
    id: string;
    name: string;
    email?: string;
    nit?: string | null;
  } | null;
  expenseOrder?: {
    id: string;
    ogNumber: string;
    status?: string;
    observations?: string | null;
    areaOrMachine?: string | null;
    createdAt?: string;
    expenseType?: { id: string; name: string };
    expenseSubcategory?: { id: string; name: string };
    createdBy?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null };
    items?: Array<{
      id: string;
      name: string;
      description?: string | null;
      quantity: string;
      unitPrice: string;
      total: string;
      paymentMethod?: string | null;
      /** Pago mixto. Vacío = todo por `paymentMethod`. */
      payments?: Array<{ id: string; paymentMethod: string; amount: string }>;
    }>;
  } | null;
  createdBy: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
  cancelledBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  authorizedBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  authorizedAt?: string | null;
  beneficiaryUser?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  payrollPeriod?: {
    id: string;
    name: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  payments?: AccountPayablePayment[];
  attachments?: AccountPayableAttachment[];
  installments?: AccountPayableInstallment[];
}

export interface AccountPayableBeneficiary {
  id: string;
  userId: string;
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
}

export interface AccountPayableSummary {
  totalPending: number;
  totalOverdue: number;
  totalPartial: number;
  totalPaid: number;
  upcomingCount: number;
  totalAmountPending: string;
  totalAmountOverdue: string;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateAccountPayableDto {
  expenseTypeId: string;
  expenseSubcategoryId: string;
  description: string;
  observations?: string;
  totalAmount: number;
  subtotalAmount?: number;
  applyIva?: boolean;
  ivaRate?: number;
  retefuenteRate?: number;
  reteICARate?: number;
  reteIVARate?: number;
  dueDate: string;
  supplierId?: string;
  expenseOrderId?: string;
  beneficiaryUserId?: string;
  isRecurring?: boolean;
  recurringDay?: number;
  recurringFrequency?: 'BIWEEKLY' | 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';
}

export interface UpdateAccountPayableDto {
  expenseTypeId?: string;
  expenseSubcategoryId?: string;
  description?: string;
  observations?: string;
  totalAmount?: number;
  subtotalAmount?: number;
  applyIva?: boolean;
  ivaRate?: number;
  retefuenteRate?: number;
  reteICARate?: number;
  reteIVARate?: number;
  dueDate?: string;
  supplierId?: string;
  beneficiaryUserId?: string;
  isRecurring?: boolean;
  recurringDay?: number;
  recurringFrequency?: 'BIWEEKLY' | 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';
}

export interface FilterAccountPayableDto {
  status?: AccountPayableStatus;
  expenseTypeId?: string;
  expenseSubcategoryId?: string;
  supplierId?: string;
  search?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  hasExpenseOrder?: boolean;
  page?: number;
  limit?: number;
  orderBy?: 'dueDate' | 'totalAmount' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

export interface RegisterPaymentDto {
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  bankEntity?: string | null;
  receiptFileId?: string;
  receiptFileId2?: string;
  cashSessionId?: string;
}

export interface CancelAccountPayableDto {
  cancelReason: string;
}

export interface CreateAttachmentDto {
  storageFileId: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
}

export interface InstallmentItemDto {
  amount: number;
  dueDate: string;
  notes?: string;
}

export interface SetInstallmentsDto {
  installments: InstallmentItemDto[];
}

export interface UpdateInstallmentDto {
  isPaid: boolean;
}

export interface AccountPayableListResponse {
  data: AccountPayable[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Auth Request ─────────────────────────────────────────────────────────────

export interface AccountPayableAuthRequest {
  id: string;
  accountPayableId: string;
  requestedById: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
  reviewedBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  accountPayable: {
    id: string;
    apNumber: string;
    status: AccountPayableStatus;
    totalAmount?: string;
    description?: string;
  };
}

export interface CreateApAuthRequestDto {
  accountPayableId: string;
  reason?: string;
}

// ─── Payment Auth Request (doble firma) ──────────────────────────────────────

export type ApPaymentAuthRequestStatus =
  | 'PENDING'
  | 'ADMIN_APPROVED'
  | 'COMPLETED'
  | 'ADMIN_REJECTED'
  | 'CAJA_REJECTED';

export interface ApPaymentAuthRequestStatusConfig {
  label: string;
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

export const AP_PAYMENT_AUTH_STATUS_CONFIG: Record<ApPaymentAuthRequestStatus, ApPaymentAuthRequestStatusConfig> = {
  PENDING:        { label: 'Pendiente de Admin',    color: 'warning' },
  ADMIN_APPROVED: { label: 'Aprobado — esperando Caja', color: 'info' },
  COMPLETED:      { label: 'Pago completado',       color: 'success' },
  ADMIN_REJECTED: { label: 'Rechazado por Admin',   color: 'error' },
  CAJA_REJECTED:  { label: 'Rechazado por Caja',    color: 'error' },
};

export interface AccountPayablePaymentAuthRequest {
  id: string;
  accountPayableId: string;
  requestedById: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
  bankEntity?: string | null;
  receiptFileId?: string | null;
  receiptFileId2?: string | null;
  reason?: string | null;
  status: ApPaymentAuthRequestStatus;
  adminReviewedById?: string | null;
  adminReviewedAt?: string | null;
  adminNotes?: string | null;
  cajaReviewedById?: string | null;
  cajaReviewedAt?: string | null;
  cajaRejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: { id: string; firstName?: string | null; lastName?: string | null; email: string };
  adminReviewedBy?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  cajaReviewedBy?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  accountPayable?: { id: string; apNumber: string; totalAmount?: string; balance?: string };
  reversalRequest?: {
    id: string;
    status: string;
    reason: string;
    createdAt: string;
  } | null;
}

export interface CreateApPaymentAuthRequestDto {
  accountPayableId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  bankEntity?: string | null;
  receiptFileId?: string;
  receiptFileId2?: string;
  reason?: string;
}

export interface AdminApproveApPaymentAuthRequestDto {
  adminNotes?: string;
}

export interface AdminRejectApPaymentAuthRequestDto {
  adminNotes?: string;
}

export interface CajaRejectApPaymentAuthRequestDto {
  reason?: string;
}
