import type { LocatedDocument } from './sede.types';

export enum WorkOrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
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
  orderItem: {
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
  };
  productionAreas: WorkOrderItemProductionArea[];
  supplies: WorkOrderItemSupply[];
}

export enum WorkOrderTimeEntryType {
  HOURS = 'HOURS',
  RANGE = 'RANGE',
}

export interface WorkOrderTimeEntry {
  id: string;
  entryType: WorkOrderTimeEntryType;
  workedDate: string;
  hoursWorked: string;
  startAt?: string | null;
  endAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
  workOrderItem?: {
    id: string;
    productDescription: string;
  } | null;
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

export interface CreateWorkOrderTimeEntryDto {
  entryType: WorkOrderTimeEntryType;
  workOrderItemId?: string;
  workedDate: string;
  hoursWorked?: number;
  startAt?: string;
  endAt?: string;
  notes?: string;
}

export interface UpdateWorkOrderTimeEntryDto {
  entryType?: WorkOrderTimeEntryType;
  workOrderItemId?: string;
  workedDate?: string;
  hoursWorked?: number;
  startAt?: string;
  endAt?: string;
  notes?: string;
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
