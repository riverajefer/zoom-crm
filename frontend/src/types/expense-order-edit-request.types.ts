export type ExpenseOrderEditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface RequestUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** Solicitud para editar una OG ya pagada. La aprobación sirve para una edición. */
export interface ExpenseOrderEditRequest {
  id: string;
  expenseOrderId: string;
  reason: string;
  status: ExpenseOrderEditRequestStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  createdAt: string;
  requestedBy: RequestUser;
  reviewedBy?: RequestUser | null;
  expenseOrder?: {
    id: string;
    ogNumber: string;
    status: string;
  };
}

export interface CreateExpenseOrderEditRequestDto {
  expenseOrderId: string;
  reason: string;
}

/** Lo que el usuario actual tiene pedido o aprobado sobre una OG. */
export interface MyExpenseOrderEditStatus {
  pending: { id: string; reason: string; createdAt: string } | null;
  activeApproval: { id: string; expiresAt: string } | null;
}
