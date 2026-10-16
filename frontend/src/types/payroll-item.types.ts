export interface PayrollExtraShift {
  id: string;
  shiftDate: string; // ISO
  description: string | null;
  amount: string; // Decimal como string
}

export interface PayrollExtraShiftInput {
  shiftDate: string; // ISO
  description?: string;
  amount: number;
}

/** La nómina se paga en efectivo o por transferencia; nada más. */
export type PayrollPaymentMethod = 'CASH' | 'TRANSFER';

export type PayrollPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';

interface PayrollPaymentUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

/** Pago (o abono) de la nómina de un empleado. Solo registro: no toca Caja. */
export interface PayrollPayment {
  id: string;
  payrollItemId: string;
  amount: string; // Decimal como string
  paymentMethod: PayrollPaymentMethod;
  paidAt: string;
  reference: string | null;
  bankEntity: string | null;
  notes: string | null;
  createdAt: string;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: PayrollPaymentUser;
  voidedBy: PayrollPaymentUser | null;
}

/** Pagos vigentes que vienen con el registro (los anulados no). */
export type PayrollItemPayment = Pick<
  PayrollPayment,
  'id' | 'amount' | 'paymentMethod' | 'paidAt' | 'bankEntity' | 'reference'
>;

export interface CreatePayrollPaymentsDto {
  paidAt: string;
  lines: {
    amount: number;
    paymentMethod: PayrollPaymentMethod;
    reference?: string;
    bankEntity?: string;
  }[];
  notes?: string;
}

export interface PayrollItem {
  id: string;
  periodId: string;
  employeeId: string;
  daysWorked: string | null;
  baseSalary: string;
  overtimeDaytimeHours: string | null;
  overtimeNighttimeHours: string | null;
  overtimeDaytimeValue: string | null;
  overtimeNighttimeValue: string | null;
  commissions: string | null;
  restDayValue: string | null;
  transportAllowance: string | null;
  workdayDiscount: string | null;
  loans: string | null;
  advances: string | null;
  nonPaidDays: string | null;
  epsAndPensionDiscount: string | null;
  employeeFundSavings: string | null;
  /** Suma de las OP del empleado descontadas en este periodo. La mantiene el
   *  módulo de descuentos por nómina; no se digita a mano. */
  orderDeductions: string | null;
  totalPayment: string;
  observations: string | null;
  extraShifts?: PayrollExtraShift[];
  /** Pagos no anulados. Opcional: los endpoints de historial no los traen. */
  payments?: PayrollItemPayment[];
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeType: 'REGULAR' | 'TEMPORARY';
    monthlySalary: string | null;
    dailyRate: string | null;
    // Datos usados por el desprendible de nómina. Opcionales porque los
    // endpoints de historial no los devuelven (allí el empleado se carga aparte).
    identificationType?: 'CC' | 'CE' | 'TI' | 'PA' | 'PPT' | 'NIT' | null;
    identificationNumber?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    firstLastName?: string | null;
    secondLastName?: string | null;
    startDate?: string | null;
    contractType?:
      | 'FIXED_TERM'
      | 'INDEFINITE'
      | 'SERVICE_CONTRACT'
      | 'INTERNSHIP'
      | null;
    eps?: string | null;
    pensionFund?: string | null;
    cargo: { name: string } | null;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
  };
  period?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    periodType: string;
    status: string;
  };
}

export interface CreatePayrollItemDto {
  employeeId: string;
  daysWorked?: number;
  baseSalary: number;
  overtimeDaytimeHours?: number;
  overtimeNighttimeHours?: number;
  overtimeDaytimeValue?: number;
  overtimeNighttimeValue?: number;
  commissions?: number;
  restDayValue?: number;
  transportAllowance?: number;
  workdayDiscount?: number;
  loans?: number;
  advances?: number;
  nonPaidDays?: number;
  epsAndPensionDiscount?: number;
  employeeFundSavings?: number;
  orderDeductions?: number;
  totalPayment: number;
  observations?: string;
  extraShifts?: PayrollExtraShiftInput[];
}

export interface UpdatePayrollItemDto {
  daysWorked?: number;
  baseSalary?: number;
  overtimeDaytimeHours?: number;
  overtimeNighttimeHours?: number;
  overtimeDaytimeValue?: number;
  overtimeNighttimeValue?: number;
  commissions?: number;
  restDayValue?: number;
  transportAllowance?: number;
  workdayDiscount?: number;
  loans?: number;
  advances?: number;
  nonPaidDays?: number;
  epsAndPensionDiscount?: number;
  employeeFundSavings?: number;
  orderDeductions?: number;
  totalPayment?: number;
  observations?: string;
  extraShifts?: PayrollExtraShiftInput[];
}
