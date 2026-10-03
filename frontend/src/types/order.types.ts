import type { LocatedDocument } from './sede.types';

// ============================================================
// ENUMS
// ============================================================

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'DELIVERED'
  | 'DELIVERED_ON_CREDIT'
  | 'WARRANTY'
  | 'PAID'
  // Terminal, lo pone el sistema al pagarse una devolución que anula la venta
  // completa. No aparece en ALLOWED_TRANSITIONS: no se elige desde el selector.
  | 'RETURNED'
  | 'ANULADO';

/**
 * Métodos con los que se puede registrar un pago de una OP.
 *
 * `CHECK` y `OTHER` existen en la base pero no se ofrecen acá: nunca se usaron
 * desde el módulo de órdenes. Los nombres para mostrar viven en
 * `utils/paymentMethods`, que sí cubre el enum completo — un pago viejo con uno
 * de esos métodos se sigue viendo bien.
 */
export type PaymentMethod =
  | 'CASH'
  | 'TRANSFER'
  | 'CARD'
  | 'CREDIT'
  | 'CREDIT_BALANCE'
  // El cliente es un empleado y el trabajo se le descuenta de la quincena. No
  // mueve caja y se registra en $0: el abono real lo genera nómina al aplicarlo.
  | 'PAYROLL_DEDUCTION';

// ============================================================
// ENTITIES
// ============================================================

export interface AdvancePaymentApproval {
  id: string;
  orderId: string;
  /** null cuando el pago fue eliminado al rechazar la solicitud */
  paymentId: string | null;
  /** Snapshot del pago: sobrevive aunque el pago se elimine */
  paymentAmount: string | null;
  paymentMethod: PaymentMethod | null;
  requestedById: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: {
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
  } | null;
}

export interface Order extends LocatedDocument {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;

  // Auditoría de cambios de fecha de entrega
  previousDeliveryDate?: string | null;
  deliveryDateReason?: string | null;
  deliveryDateChangedAt?: string | null;
  deliveryDateChangedBy?: string | null;
  deliveryDateChangedByUser?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;

  requiresColorProof: boolean;
  colorProofPrice: string; // Decimal viene como string del backend

  subtotal: string; // Decimal viene como string del backend
  taxRate: string;
  tax: string;
  retefuenteRate: string; // Tasa de Retefuente (e.g., "0.025" = 2.5%)
  reteICARate: string;    // Tasa de ReteICA (e.g., "0.00414" = 0.414%)
  reteIVARate: string;    // Tasa de ReteIVA sobre IVA (e.g., "0.15" = 15%)
  discountAmount: string; // Total de descuentos aplicados
  total: string;
  paidAmount: string;
  /** Saldo a favor de esta orden ya aplicado como pago de otras órdenes */
  appliedCreditAmount?: string;
  /** Valor de venta anulado por devoluciones ya pagadas. */
  reversedAmount?: string;
  balance: string;
  advancePaymentStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  advancePaymentRejectedReason: string | null;
  discountApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  advancePaymentApprovals?: AdvancePaymentApproval[];
  refundRequests?: Array<{
    id: string;
    refundAmount: string;
    /** Venta anulada por esta devolución. '0' si solo se devolvió un excedente. */
    reversedAmount?: string;
    /** Anulación por ítems: lo que retiene la empresa y qué ítems se caen. */
    retainedAmount?: string;
    items?: Array<{
      id: string;
      orderItemId: string | null;
      description: string;
      quantity: string;
      amount: string;
    }>;
    paymentMethod: 'CASH' | 'TRANSFER' | 'CARD';
    bankEntity?: string | null;
    observation: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    /** Null mientras Caja no haya pagado: autorizada pero sin mover dinero. */
    executedAt?: string | null;
    requestedAt: string;
    requestedBy?: {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    };
  }>;
  clientOwnershipAuthStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  status: OrderStatus;
  notes: string | null;
  notesImageId: string | null;
  electronicInvoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    personType?: 'NATURAL' | 'EMPRESA' | null;
    nit?: string | null;
    cedula?: string | null;
    advisorId?: string | null;
    advisor?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  };
  createdBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  commercialChannelId: string | null;
  commercialChannel: {
    id: string;
    name: string;
  } | null;
  items: OrderItem[];
  payments: Payment[];
  discounts: OrderDiscount[];
  /** COT de la que salió; solo llega en modo consulta (docs/PLAN_SEDES.md §8). */
  quote?: { id: string; quoteNumber: string; status: string } | null;
  /** OT activa (no cancelada) vinculada a esta orden, si existe */
  workOrders?: {
    id: string;
    workOrderNumber: string;
    status: string;
  }[];
}

export interface CommercialChannel {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string; // Decimal
  total: string; // Decimal
  /**
   * Cantidad anulada por anulaciones parciales ya aplicadas. El ítem conserva
   * su cantidad y su total: la venta anulada vive en `Order.reversedAmount`.
   */
  annulledQuantity?: string; // Decimal
  specifications: Record<string, any> | null;
  sampleImageId?: string;
  sortOrder: number;
  product: {
    id: string;
    name: string;
    slug: string;
  } | null;
  productionAreas: {
    productionArea: {
      id: string;
      name: string;
    };
  }[];
  /**
   * OTs que ya incluyen este ítem. Solo viene en el detalle (GET /orders/:id).
   * Eliminar el ítem de la OP lo elimina también de estas OTs.
   */
  workOrders?: {
    id: string;
    workOrderNumber: string;
    status: string;
  }[];
}

export interface Payment {
  id: string;
  amount: string; // Decimal
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  bankEntity: string | null;
  receiptFileId: string | null;
  createdAt: string;
  /** Verificación contable: segunda revisión de contabilidad (no frena la OP). */
  accountingStatus?: 'PENDING' | 'VERIFIED' | 'OBSERVED';
  accountingNotes?: string | null;
  accountingReviewedAt?: string | null;
  /**
   * Un pago anulado sobrevive en el historial en vez de desaparecer: deja de
   * sumar al saldo, pero la fila sigue contando qué pasó y quién lo autorizó.
   */
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  receivedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  /**
   * Movimiento de caja asociado. Es `null` cuando el abono se registró sin una
   * sesión de caja abierta: el pago existe en la OP pero nunca llegó al
   * historial de caja. La exportación lo marca para la conciliación bancaria.
   */
  cashMovement: {
    receiptNumber: string;
    isVoided: boolean;
  } | null;
  /**
   * URL prefirmada del comprobante. No viene del backend: la rellena la
   * exportación a Excel antes de construir la hoja de abonos.
   */
  receiptUrl?: string;
}

export interface OrderDiscount {
  id: string;
  amount: string; // Decimal
  reason: string; // Motivo del descuento (obligatorio)
  appliedAt: string; // Fecha de aplicación
  appliedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

// ============================================================
// DTOs - CREATE
// ============================================================

export interface InitialPaymentDto {
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  bankEntity?: string | null;
}

export interface CreateOrderItemDto {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  specifications?: Record<string, any>;
  productionAreaIds?: string[];
}

export interface CreateOrderDto {
  clientId: string;
  deliveryDate?: string; // ISO date string
  notes?: string;
  notesImageId?: string | null;
  requiresColorProof?: boolean;
  colorProofPrice?: number;
  taxRate?: number;
  retefuenteRate?: number;
  reteICARate?: number;
  reteIVARate?: number;
  items: CreateOrderItemDto[];
  initialPayment?: InitialPaymentDto;
  initialPayments?: InitialPaymentDto[];
  commercialChannelId?: string;
  /**
   * Llave de idempotencia del formulario. Si un doble clic manda dos POST, el
   * backend devuelve la OP ya creada en vez de quemar otro consecutivo.
   */
  idempotencyKey?: string;
}

// ============================================================
// DTOs - UPDATE
// ============================================================

export interface UpdateOrderDto {
  clientId?: string;
  deliveryDate?: string;
  notes?: string;
  notesImageId?: string | null;
  requiresColorProof?: boolean;
  colorProofPrice?: number;
  taxRate?: number;
  retefuenteRate?: number;
  reteICARate?: number;
  reteIVARate?: number;
  items?: CreateOrderItemDto[];
  initialPayment?: InitialPaymentDto;
  commercialChannelId?: string;
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
}

export interface AddOrderItemDto {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  specifications?: Record<string, any>;
  productionAreaIds?: string[];
}

export interface UpdateOrderItemDto {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  specifications?: Record<string, any>;
  productId?: string;
  productionAreaIds?: string[];
}

export interface CreatePaymentDto {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string; // ISO date string
  reference?: string;
  notes?: string;
  bankEntity?: string | null;
  receiptFileId?: string;
  /**
   * Llave de idempotencia del diálogo de abono. Si un doble clic manda dos POST,
   * el backend devuelve el pago ya registrado en vez de inflar el saldo pagado
   * y el arqueo de caja.
   */
  idempotencyKey?: string;
}

export interface UpdatePaymentDto {
  amount?: number;
  paymentMethod?: PaymentMethod;
  paymentDate?: string; // ISO date string
  reference?: string;
  notes?: string;
  bankEntity?: string | null;
  reason?: string; // Motivo de la edición (para la solicitud de aprobación)
}

/**
 * Respuesta del endpoint de edición de pago cuando el usuario NO tiene
 * permiso para aplicar el cambio directamente: queda pendiente de aprobación.
 */
/**
 * Resultado de anular un pago. Si la caja del pago ya estaba cerrada no se anula
 * de una: queda como solicitud para que el admin la autorice.
 */
export interface VoidPaymentResponse {
  voided: boolean;
  requiresApproval: boolean;
  requestId?: string;
}

export interface PaymentEditPendingResponse {
  status: 'PENDING_APPROVAL';
  approvalId?: string;
  message: string;
}

export type UpdatePaymentResponse = Payment | PaymentEditPendingResponse;

export interface PaymentEditApproval {
  id: string;
  orderId: string;
  paymentId: string;
  reason: string | null;
  oldAmount: string;
  oldPaymentMethod: PaymentMethod;
  oldPaymentDate: string;
  oldReference: string | null;
  oldNotes: string | null;
  oldReceiptFileId: string | null;
  newAmount: string | null;
  newPaymentMethod: PaymentMethod | null;
  newPaymentDate: string | null;
  newReference: string | null;
  newNotes: string | null;
  newReceiptFileId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
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
  } | null;
  order?: {
    id: string;
    orderNumber: string;
    status?: OrderStatus;
  };
}

export interface ApplyDiscountDto {
  amount: number;
  reason: string; // Motivo del descuento (obligatorio)
}

// ============================================================
// DTOs - FILTER
// ============================================================

export interface FilterOrdersDto {
  status?: OrderStatus;
  /**
   * Varios estados a la vez. Un `status` explícito manda sobre esta lista.
   * Axios lo serializa como `?statuses=A&statuses=B`.
   */
  statuses?: OrderStatus[];
  search?: string;
  clientId?: string;
  orderDateFrom?: string; // ISO date string
  orderDateTo?: string; // ISO date string
  /**
   * Rango por fecha de abono: trae las órdenes con al menos un pago dentro del
   * rango, sin importar su fecha de orden. Lo usa la exportación para
   * conciliación bancaria, donde interesa el dinero que entró en el período
   * aunque la OP sea de meses anteriores.
   */
  paymentDateFrom?: string; // ISO date string
  paymentDateTo?: string; // ISO date string
  page?: number;
  limit?: number;
  /** Si true, excluye órdenes que ya tienen una OT activa (no cancelada) */
  excludeWithWorkOrder?: boolean;
  productionAreaId?: string;
  createdById?: string;
  /** Si true, solo órdenes con saldo pendiente por cobrar (balance > 0) */
  hasBalance?: boolean;
  /**
   * Solo el resumen de ventas: sumar todas las sedes. El avance de la meta de
   * un asesor cuenta todo lo que vendió (docs/PLAN_SEDES.md §10).
   */
  acrossLocations?: boolean;
  /** PAID = pagadas al 100%; PENDING = con saldo pendiente */
  paymentStatus?: 'PAID' | 'PENDING';
  /** DELIVERED = ya entregadas; PENDING = aún sin entregar (sin contar anuladas) */
  deliveryStatus?: 'PENDING' | 'DELIVERED';
  advancePaymentStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  /**
   * Si true, excluye las órdenes ANULADAS: una orden anulada no es una venta.
   * Lo usan las pantallas de ventas para que la tarjeta de totales, la tabla y
   * el Excel cuenten lo mismo. Se ignora si se filtra explícitamente por
   * `status`, así que elegir "Anulada" en el filtro sigue mostrándolas.
   */
  excludeAnulado?: boolean;
}

// ── Mini dashboard de la lista de órdenes ────────────────────────

export interface OrdersDashboardQuery {
  /** YYYY-MM-DD; por defecto, hoy */
  dateFrom?: string;
  /** YYYY-MM-DD; por defecto, hoy */
  dateTo?: string;
}

export interface OrdersDashboardSummary {
  salesAmount: string;
  salesCount: number;
  collectedAmount: string;
  paymentsCount: number;
  receivableAmount: string;
  receivableCount: number;
  pendingAdvancesCount: number;
}

// ============================================================
// RESPONSES
// ============================================================

export interface OrdersListResponse {
  data: Order[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Suma de `total` de todo lo filtrado (OP y COT), para el subtotal por sede. */
    sumTotal?: string;
  };
}

// ============================================================
// UI HELPERS
// ============================================================

export interface OrderItemRow {
  id: string; // UUID temporal para manejo en UI
  description: string;
  quantity: string; // String en UI para inputs controlados
  unitPrice: string; // String en UI
  total: number; // Calculado
  productId?: string;
  specifications?: Record<string, any>;
  sampleImageId?: string | null;
  productionAreaIds: string[];
  /**
   * Números de OT que ya incluyen este ítem (vacío en ítems nuevos). Se usa para
   * advertir antes de eliminarlo: el borrado se propaga a la OT.
   */
  workOrderNumbers?: string[];
}

export interface InitialPaymentData {
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  bankEntity?: string | null;
  receiptFile?: File | null;
  receiptFileUrl?: string | null;
  existingReceiptFileId?: string | null;
}

// ============================================================
// STATUS CONFIG
// ============================================================

export interface OrderStatusConfig {
  label: string;
  color:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'error'
    | 'info'
    | 'success'
    | 'warning';
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, OrderStatusConfig> = {
  DRAFT: { label: 'Borrador', color: 'default' },
  CONFIRMED: { label: 'Confirmada', color: 'info' },
  IN_PRODUCTION: { label: 'En Producción', color: 'warning' },
  READY: { label: 'Lista para entrega', color: 'success' },
  DELIVERED: { label: 'Entregada', color: 'primary' },
  DELIVERED_ON_CREDIT: { label: 'Entregado a Crédito', color: 'warning' },
  WARRANTY: { label: 'Garantía', color: 'secondary' },
  PAID: { label: 'Pagada', color: 'success' },
  RETURNED: { label: 'Devolución de dinero', color: 'error' },
  ANULADO: { label: 'Anulada', color: 'error' },
};

/**
 * Opciones del filtro de estado, derivadas de `ORDER_STATUS_CONFIG`.
 *
 * Se deriva y no se escribe a mano porque antes eran dos listas copiadas —una en
 * Órdenes y otra en Ventas por Asesor— que había que acordarse de actualizar:
 * al agregar «Devolución de dinero» ninguna de las dos lo mostró. Con esto, un
 * estado nuevo aparece en los filtros por el solo hecho de existir.
 */
export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] =
  (Object.keys(ORDER_STATUS_CONFIG) as OrderStatus[]).map((value) => ({
    value,
    label: ORDER_STATUS_CONFIG[value].label,
  }));

/**
 * Transiciones válidas de estado de orden.
 * Flujo: DRAFT → CONFIRMED → IN_PRODUCTION → READY → PAID → DELIVERED | DELIVERED_ON_CREDIT → WARRANTY
 *
 * "Entregada a Crédito" es la excepción: se entrega sin pago completo.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'ANULADO'],
  CONFIRMED: ['IN_PRODUCTION', 'ANULADO'],
  IN_PRODUCTION: ['READY', 'ANULADO'],
  READY: ['PAID', 'DELIVERED_ON_CREDIT', 'ANULADO'],
  PAID: ['DELIVERED'],
  DELIVERED: ['WARRANTY'],
  DELIVERED_ON_CREDIT: ['WARRANTY', 'ANULADO'],
  WARRANTY: ['DELIVERED'],
  // `RETURNED` no se elige: lo pone el sistema cuando Caja paga una devolución
  // que anula la venta completa. Terminal, igual que ANULADO.
  RETURNED: [],
  ANULADO: [],
};

/**
 * Nombres de los métodos dentro del módulo de órdenes.
 *
 * Se conserva aparte de `utils/paymentMethods` porque acá el saldo a favor se
 * llama "Saldo a favor (Cliente)", que solo tiene sentido frente a una OP.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CREDIT: 'Crédito',
  CREDIT_BALANCE: 'Saldo a favor (Cliente)',
  PAYROLL_DEDUCTION: 'Descuento por nómina',
};

// ============================================================
// PROFITABILITY TYPES
// ============================================================

export interface ExpenseOrderSummary {
  id: string;
  ogNumber: string;
  status: string;
  workOrderNumber: string | null;
  itemsTotal: number;
}

export interface OrderProfitability {
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  expenseOrders: ExpenseOrderSummary[];
  totalExpenses: number;
  utility: number;
  utilityPercentage: number;
}

export interface OrderProfitabilityListItem {
  orderId: string;
  orderNumber: string;
  clientName: string;
  orderTotal: number;
  totalExpenses: number;
  utility: number;
  utilityPercentage: number;
  status: string;
  orderDate: string;
}

export interface PaginatedProfitability {
  data: OrderProfitabilityListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface FilterProfitabilityDto {
  search?: string;
  status?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  page?: number;
  limit?: number;
}

// ============================================================
// VENTAS POR ASESOR
// ============================================================

export interface AdvisorBreakdown {
  advisorId: string;
  advisorName: string;
  /** Total facturado (incluye IVA, retenciones y prueba de color) */
  totalRevenue: number;
  /** Suma de los subtotales de las órdenes, antes de descuentos */
  totalSubtotal: number;
  /** Descuentos aplicados a las órdenes */
  totalDiscounts: number;
  /** Venta neta sin IVA (subtotal − descuentos) */
  totalNetSubtotal: number;
  totalOrders: number;
  /** Venta neta de las OP entregadas y sin saldo: la que cuenta para la meta */
  commissionableNetSubtotal: number;
  commissionableOrders: number;
  /** OP pagadas al 100% que aún no están marcadas como entregadas */
  gapNetSubtotal: number;
  gapOrders: number;
}

export interface SalesSummary {
  totalRevenue: number;
  /** Suma de los subtotales de las órdenes, antes de descuentos */
  totalSubtotal: number;
  /** Descuentos aplicados a las órdenes */
  totalDiscounts: number;
  /** Venta neta sin IVA (subtotal − descuentos) — es la cifra que cuenta para las metas */
  totalNetSubtotal: number;
  totalOrders: number;
  averageOrderValue: number;
  commissionableNetSubtotal: number;
  commissionableOrders: number;
  gapNetSubtotal: number;
  gapOrders: number;
  advisorBreakdown: AdvisorBreakdown[];
}

// ── Sales Goals ──────────────────────────────────────────────────

export interface SalesGoal {
  id: string;
  advisorId: string;
  month: number;
  year: number;
  targetAmount: number;
  advisor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSalesGoalDto {
  advisorId: string;
  month: number;
  year: number;
  targetAmount: number;
}

// ── Seguimiento de OP (matriz asesor × estado × pago) ────────────

/**
 * Una celda de la matriz: las OP de un asesor, en un estado, que ya están
 * pagadas al 100% (`paid: true`) o que todavía tienen saldo (`paid: false`).
 */
export interface AdvisorTrackingRow {
  advisorId: string;
  advisorName: string;
  status: OrderStatus;
  paid: boolean;
  count: number;
  /** Venta neta sin IVA (subtotal − descuentos) */
  netAmount: number;
  /** Saldo pendiente; negativo cuando hay sobrepagos o saldo a favor */
  pendingBalance: number;
}

export interface AdvisorTracking {
  month: number;
  year: number;
  /** true cuando el usuario no tiene `read_all_advisors_tracking` y solo ve lo suyo */
  scopedToOwn: boolean;
  rows: AdvisorTrackingRow[];
}

/** Totales de la cartera pendiente, calculados en el backend sobre el conjunto completo. */
export interface PendingPaymentSummary {
  count: number;
  /** Suma de saldos, como cadena para no perder precisión. */
  totalBalance: string;
}

/** Asesor que ha creado al menos una orden. */
export interface OrderAdvisor {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
}

/** OP de otra sede en `GET /orders/lookup` (docs/PLAN_SEDES.md §8). */
export interface OrderLookupItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderDate: string;
  total: string;
  balance: string;
  client: { id: string; name: string };
}
