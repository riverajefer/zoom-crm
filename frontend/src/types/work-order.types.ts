import type { LocatedDocument } from './sede.types';

export enum WorkOrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface WorkOrderStatusConfig {
  label: string;
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

export const WORK_ORDER_STATUS_CONFIG: Record<WorkOrderStatus, WorkOrderStatusConfig> = {
  [WorkOrderStatus.DRAFT]: { label: 'Borrador', color: 'default' },
  [WorkOrderStatus.CONFIRMED]: { label: 'Confirmada', color: 'info' },
  [WorkOrderStatus.IN_PRODUCTION]: { label: 'En Producción', color: 'warning' },
  [WorkOrderStatus.READY]: { label: 'Lista para entrega', color: 'primary' },
  [WorkOrderStatus.COMPLETED]: { label: 'Completada', color: 'success' },
  [WorkOrderStatus.CANCELLED]: { label: 'Cancelada', color: 'error' },
};

export interface WorkOrderItemSupply {
  id: string;
  quantity?: string | null;
  notes?: string | null;
  supply: {
    id: string;
    name: string;
    sku?: string | null;
  };
}

export interface WorkOrderItemProductionArea {
  productionArea: {
    id: string;
    name: string;
  };
}

export interface WorkOrderItem {
  id: string;
  productDescription: string;
  observations?: string | null;
  /** Si es posterior a la creación de la OT, el ítem llegó después desde la OP. */
  createdAt?: string;
  orderItem: {
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
    /** Cantidad anulada en la OP por una anulación parcial. '0' si no hay. */
    annulledQuantity?: string;
  };
  productionAreas: WorkOrderItemProductionArea[];
  supplies: WorkOrderItemSupply[];
}

export enum WorkOrderTimeEntryType {
  /** Heredado: cantidad de horas escrita a mano. */
  HOURS = 'HOURS',
  /** Rango inicio–fin (heredado, o agregado por un supervisor). */
  RANGE = 'RANGE',
  /** Temporizador: inicio y fin los pone el servidor. */
  TIMER = 'TIMER',
}

export interface TimeEntryUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface WorkOrderTimeEntry {
  id: string;
  workOrderId: string;
  entryType: WorkOrderTimeEntryType;
  workedDate: string;
  /** Nulo mientras la tarea sigue en curso. */
  hoursWorked: string | null;
  startAt?: string | null;
  /** Nulo en una tarea del temporizador = en curso. */
  endAt?: string | null;
  notes?: string | null;
  extendedAt?: string | null;
  closedBySystem: boolean;
  reviewedAt?: string | null;
  adjustedAt?: string | null;
  adjustReason?: string | null;
  originalStartAt?: string | null;
  originalEndAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  updatedAt: string;
  user: TimeEntryUser;
  createdBy?: TimeEntryUser | null;
  reviewedBy?: TimeEntryUser | null;
  adjustedBy?: TimeEntryUser | null;
  voidedBy?: TimeEntryUser | null;
  workOrderItem?: {
    id: string;
    productDescription: string;
  } | null;
  machine?: { id: string; name: string } | null;
  /** Solo en listas que mezclan varias OT (tareas en curso, por revisar). */
  workOrder?: { id: string; workOrderNumber: string };
}

export interface PendingOrderItem {
  id: string;
  description: string;
  quantity: string;
  annulledQuantity: string;
  productionAreas: Array<{ productionArea: { id: string; name: string } }>;
}

export interface WorkOrder extends LocatedDocument {
  id: string;
  workOrderNumber: string;
  status: WorkOrderStatus;
  fileName?: string | null;
  attachment?: {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
  } | null;
  attachment2?: {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
  } | null;
  observations?: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate?: string | null;
    total: string;
    client: {
      id: string;
      name: string;
    };
    createdBy: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    };
  };
  advisor: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
  designer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  expenseOrders?: Array<{
    id: string;
    ogNumber: string;
    status: string;
    createdAt: string;
    expenseType: {
      name: string;
    };
    expenseSubcategory: {
      name: string;
    };
  }>;
  timeEntries?: WorkOrderTimeEntry[];
  items: WorkOrderItem[];
  /**
   * Ítems de la OP que no están en esta OT (se agregaron a la OP después de
   * crearla). Solo llega en el detalle (GET /work-orders/:id).
   */
  pendingOrderItems?: PendingOrderItem[];
  createdAt: string;
  updatedAt: string;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────

export interface SupplyInputDto {
  supplyId: string;
  quantity?: number;
  notes?: string;
}

export interface CreateWorkOrderItemDto {
  orderItemId: string;
  productDescription?: string;
  productionAreaIds?: string[];
  supplies?: SupplyInputDto[];
  observations?: string;
}

export interface CreateWorkOrderDto {
  orderId: string;
  designerId?: string;
  fileName?: string;
  attachmentId?: string;
  attachment2Id?: string;
  observations?: string;
  items: CreateWorkOrderItemDto[];
}

export interface UpdateWorkOrderItemDto {
  orderItemId: string;
  productDescription?: string;
  productionAreaIds?: string[];
  supplies?: SupplyInputDto[];
  observations?: string;
}

export interface UpdateWorkOrderDto {
  designerId?: string | null;
  fileName?: string | null;
  attachmentId?: string | null;
  attachment2Id?: string | null;
  observations?: string | null;
  items?: UpdateWorkOrderItemDto[];
}

export interface UpdateWorkOrderStatusDto {
  status: WorkOrderStatus;
}

export interface AddSupplyToItemDto {
  supplyId: string;
  quantity?: number;
  notes?: string;
}

export interface FilterWorkOrdersDto {
  status?: WorkOrderStatus;
  orderId?: string;
  search?: string;
  /** Fecha de creación desde (ISO 8601). */
  createdAtFrom?: string;
  /** Fecha de creación hasta (ISO 8601). */
  createdAtTo?: string;
  page?: number;
  limit?: number;
}

export interface WorkOrdersListResponse {
  data: WorkOrder[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Suma de `total` de todo lo filtrado (OP y COT), para el subtotal por sede. */
    sumTotal?: string;
  };
}

/** OT de otra sede en `GET /work-orders/lookup` (docs/PLAN_SEDES.md §8). */
export interface WorkOrderLookupItem {
  id: string;
  workOrderNumber: string;
  status: WorkOrderStatus;
  createdAt: string;
  order: { id: string; orderNumber: string; client: { id: string; name: string } };
}
