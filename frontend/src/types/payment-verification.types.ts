import type { PaymentMethod } from './order.types';

/** Segunda revisión de contabilidad sobre un pago que Caja ya aprobó. */
export type PaymentAccountingStatus = 'PENDING' | 'VERIFIED' | 'OBSERVED';

export const PAYMENT_ACCOUNTING_STATUS_LABELS: Record<PaymentAccountingStatus, string> = {
  PENDING: 'Por verificar',
  VERIFIED: 'Verificado',
  OBSERVED: 'Observado',
};

export const PAYMENT_ACCOUNTING_STATUS_COLORS: Record<
  PaymentAccountingStatus,
  'default' | 'success' | 'warning'
> = {
  PENDING: 'default',
  VERIFIED: 'success',
  OBSERVED: 'warning',
};

interface VerificationUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface PaymentVerification {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  bankEntity: string | null;
  receiptFileId: string | null;
  createdAt: string;
  accountingStatus: PaymentAccountingStatus;
  accountingReviewedAt: string | null;
  accountingNotes: string | null;
  accountingReviewedBy: VerificationUser | null;
  receivedBy: VerificationUser;
  /** Aprobación de Caja. `null` en los pagos anteriores a las solicitudes de anticipo. */
  advancePaymentApproval: {
    reviewedAt: string | null;
    reviewedBy: VerificationUser | null;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    client: { id: string; name: string };
    location: { id: string; code: string; name: string; color: string };
  };
}

export interface FilterPaymentVerificationsDto {
  status?: PaymentAccountingStatus;
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: PaymentMethod;
  receivedById?: string;
  locationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaymentVerificationsResponse {
  data: PaymentVerification[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    totalAmount: number;
  };
}

export type PaymentVerificationSummary = Record<
  PaymentAccountingStatus,
  { count: number; amount: number }
>;

export interface PaymentAccountingReview {
  id: string;
  status: PaymentAccountingStatus;
  notes: string | null;
  createdAt: string;
  reviewedBy: VerificationUser;
}
