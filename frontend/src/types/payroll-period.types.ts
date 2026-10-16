import type { PayrollItem } from './payroll-item.types';

export type PayrollPeriodType = 'BIWEEKLY' | 'MONTHLY';
export type PayrollPeriodStatus = 'DRAFT' | 'IN_PROGRESS' | 'CALCULATED' | 'PAID';

export interface PayrollPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  periodType: PayrollPeriodType;
  status: PayrollPeriodStatus;
  overtimeDaytimeRate: string | null;
  overtimeNighttimeRate: string | null;
  overtimeDaytimeFestiveRate: string | null;
  overtimeNighttimeFestiveRate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payrollItems?: PayrollItem[];
}

export interface CreatePayrollPeriodDto {
  name: string;
  startDate: string;
  endDate: string;
  periodType: PayrollPeriodType;
  overtimeDaytimeRate?: number;
  overtimeNighttimeRate?: number;
  overtimeDaytimeFestiveRate?: number;
  overtimeNighttimeFestiveRate?: number;
  notes?: string;
}

export interface UpdatePayrollPeriodDto {
  name?: string;
  startDate?: string;
  endDate?: string;
  periodType?: PayrollPeriodType;
  status?: PayrollPeriodStatus;
  overtimeDaytimeRate?: number;
  overtimeNighttimeRate?: number;
  overtimeDaytimeFestiveRate?: number;
  overtimeNighttimeFestiveRate?: number;
  notes?: string;
}

/**
 * Datos del periodo destino al clonar. El tipo de periodo, las tarifas de horas
 * extra y las notas se heredan del periodo origen.
 */
export interface ClonePayrollPeriodDto {
  name: string;
  startDate: string;
  endDate: string;
}

/** Periodo creado por la clonación + cuántos empleados se copiaron. */
export interface ClonePayrollPeriodResult extends PayrollPeriod {
  clonedItemsCount: number;
}

export interface PayrollPeriodSummary {
  employeeCount: number;
  totalBaseSalary: number;
  totalPayment: number;
  totalEpsAndPension: number;
  totalEmployeeFundSavings: number;
  totalPayrollCost: number;
  /** Control de pagos uno a uno (solo pagos no anulados). */
  totalPaidCash: number;
  totalPaidTransfer: number;
  totalPaid: number;
  totalPending: number;
  paymentStatusCount: { PENDING: number; PARTIAL: number; PAID: number };
}

/**
 * Anticipo (Cuenta por Pagar tipo Personal/Anticipos) vinculado a un periodo de
 * nómina. `beneficiaryUser.id` es el userId del empleado; se agrupan por ese id.
 */
export interface PayrollAdvanceUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/** Desembolso del anticipo con la doble firma que lo autorizó. */
export interface PayrollAdvancePayment {
  id: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
  isReversed: boolean;
  reversedAt?: string | null;
  createdAt: string;
  registeredBy: PayrollAdvanceUser;
  paymentAuthRequest: {
    id: string;
    reason?: string | null;
    createdAt: string;
    requestedBy: PayrollAdvanceUser;
    adminReviewedBy: PayrollAdvanceUser | null;
    adminReviewedAt: string | null;
    adminNotes?: string | null;
    cajaReviewedBy: PayrollAdvanceUser | null;
    cajaReviewedAt: string | null;
  } | null;
}

/** Solicitud de pago que no terminó en desembolso (pendiente, rechazada o vencida). */
export interface PayrollAdvancePendingRequest {
  id: string;
  status: 'PENDING' | 'ADMIN_APPROVED' | 'COMPLETED' | 'ADMIN_REJECTED' | 'CAJA_REJECTED' | 'EXPIRED';
  amount: string;
  paymentMethod: string;
  reason?: string | null;
  createdAt: string;
  requestedBy: PayrollAdvanceUser;
  adminReviewedBy: PayrollAdvanceUser | null;
  adminReviewedAt: string | null;
  adminNotes?: string | null;
  cajaReviewedBy: PayrollAdvanceUser | null;
  cajaReviewedAt: string | null;
  cajaRejectionReason?: string | null;
}

export interface PayrollAdvance {
  id: string;
  apNumber: string;
  description: string;
  observations?: string | null;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: string;
  dueDate: string;
  createdAt: string;
  createdBy: PayrollAdvanceUser;
  beneficiaryUser: PayrollAdvanceUser | null;
  payments: PayrollAdvancePayment[];
  paymentAuthRequests: PayrollAdvancePendingRequest[];
}
