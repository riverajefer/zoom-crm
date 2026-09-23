import { OrderStatus } from './order.types';

export type EditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface OrderStatusChangeRequest {
  id: string;
  orderId: string;
  requestedById: string;
  currentStatus: OrderStatus;
  requestedStatus: OrderStatus;
  reason?: string | null;
  /** Solo en anulaciones: lo que retiene la empresa de lo pagado (COP). */
  retainedAmount?: string | null;
  status: EditRequestStatus;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;

  // Relations
  order?: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
  };
  requestedBy?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  reviewedBy?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface CreateStatusChangeRequestDto {
  orderId: string;
  currentStatus: OrderStatus;
  requestedStatus: OrderStatus;
  reason?: string;
  /** Solo al pedir ANULADO: lo que retiene la empresa de lo pagado (COP). */
  retainedAmount?: number;
}

export interface ApproveStatusChangeRequestDto {
  reviewNotes?: string;
}

export interface RejectStatusChangeRequestDto {
  reviewNotes: string;
}
