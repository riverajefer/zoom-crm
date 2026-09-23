import axiosInstance from './axios';
import type {
  Order,
  OrdersListResponse,
  CreateOrderDto,
  UpdateOrderDto,
  FilterOrdersDto,
  CreatePaymentDto,
  UpdatePaymentDto,
  UpdatePaymentResponse,
  VoidPaymentResponse,
  Payment,
  OrderStatus,
  ApplyDiscountDto,
  OrderDiscount,
  OrderProfitability,
  PaginatedProfitability,
  FilterProfitabilityDto,
  SalesSummary,
  SalesGoal,
  AdvisorTracking,
  UpsertSalesGoalDto,
  OrdersDashboardQuery,
  OrdersDashboardSummary,
  PendingPaymentSummary,
  OrderAdvisor,
} from '../types/order.types';
import type { OrderAuthHistoryEvent } from '../types/order-authorization-history.types';

const BASE_URL = '/orders';

export const ordersApi = {
  /**
   * Obtener todas las órdenes con filtros y paginación
   */
  getAll: async (params?: FilterOrdersDto): Promise<OrdersListResponse> => {
    const { data } = await axiosInstance.get<OrdersListResponse>(BASE_URL, {
      params,
    });
    return data;
  },

  /**
   * Totales de la cartera pendiente.
   *
   * Va aparte del listado porque el listado se pagina: sumar los saldos de la
   * página visible daría una cifra que cambia al pasar de página.
   */
  getPendingPaymentSummary: async (
    params?: Pick<FilterOrdersDto, 'clientId'>,
  ): Promise<PendingPaymentSummary> => {
    const { data } = await axiosInstance.get<PendingPaymentSummary>(
      `${BASE_URL}/pending-payment-summary`,
      { params },
    );
    return data;
  },

  /** Asesores que han creado al menos una orden. */
  getAdvisors: async (): Promise<OrderAdvisor[]> => {
    const { data } = await axiosInstance.get<OrderAdvisor[]>(
      `${BASE_URL}/advisors`,
    );
    return data;
  },

  /**
   * Obtener una orden por ID
   */
  getById: async (id: string): Promise<Order> => {
    const { data } = await axiosInstance.get<Order>(`${BASE_URL}/${id}`);
    return data;
  },

  /**
   * Crear nueva orden
   */
  create: async (createOrderDto: CreateOrderDto): Promise<Order> => {
    const { data } = await axiosInstance.post<Order>(BASE_URL, createOrderDto);
    return data;
  },

  /**
   * Actualizar orden (solo DRAFT)
   */
  update: async (id: string, updateOrderDto: UpdateOrderDto): Promise<Order> => {
    const { data } = await axiosInstance.put<Order>(
      `${BASE_URL}/${id}`,
      updateOrderDto
    );
    return data;
  },

  /**
   * Cambiar estado de la orden
   */
  updateStatus: async (
    id: string,
    status: OrderStatus,
    options: { retainedAmount?: number } = {},
  ): Promise<Order> => {
    const { data } = await axiosInstance.put<Order>(`${BASE_URL}/${id}/status`, {
      status,
      ...options,
    });
    return data;
  },

  /**
   * Eliminar orden (solo DRAFT/CANCELLED)
   */
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await axiosInstance.delete<{ message: string }>(
      `${BASE_URL}/${id}`
    );
    return data;
  },

  /**
   * Agregar pago a una orden (solo CONFIRMED+)
   */
  addPayment: async (
    orderId: string,
    createPaymentDto: CreatePaymentDto
  ): Promise<Payment> => {
    const { data } = await axiosInstance.post<Payment>(
      `${BASE_URL}/${orderId}/payments`,
      createPaymentDto
    );
    return data;
  },

  /**
   * Editar un pago existente. Si el usuario no tiene permiso para aplicar el
   * cambio directamente, la respuesta indica que quedó pendiente de aprobación.
   */
  updatePayment: async (
    orderId: string,
    paymentId: string,
    updatePaymentDto: UpdatePaymentDto,
    receiptFile?: File
  ): Promise<UpdatePaymentResponse> => {
    // Siempre se envía como multipart porque el comprobante (imagen/PDF)
    // es opcional y, cuando existe, debe viajar junto con la edición.
    const formData = new FormData();
    Object.entries(updatePaymentDto).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    if (receiptFile) {
      formData.append('file', receiptFile);
    }

    const { data } = await axiosInstance.patch<UpdatePaymentResponse>(
      `${BASE_URL}/${orderId}/payments/${paymentId}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return data;
  },

  /**
   * Obtener todos los pagos de una orden
   */
  getPayments: async (orderId: string): Promise<Payment[]> => {
    const { data } = await axiosInstance.get<Payment[]>(
      `${BASE_URL}/${orderId}/payments`
    );
    return data;
  },

  /**
   * Subir comprobante de pago
   */
  uploadPaymentReceipt: async (
    orderId: string,
    paymentId: string,
    file: File
  ): Promise<{ message: string; file: any }> => {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await axiosInstance.post(
      `${BASE_URL}/${orderId}/payments/${paymentId}/receipt`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return data;
  },

  /**
   * Eliminar comprobante de pago
   */
  /**
   * Anula un pago de la orden. El backend decide si se anula de inmediato (caja
   * abierta) o si queda como solicitud para el admin (caja ya cerrada).
   */
  voidPayment: async (
    orderId: string,
    paymentId: string,
    voidReason: string
  ): Promise<VoidPaymentResponse> => {
    const { data } = await axiosInstance.post<VoidPaymentResponse>(
      `${BASE_URL}/${orderId}/payments/${paymentId}/void`,
      { voidReason }
    );
    return data;
  },

  deletePaymentReceipt: async (
    orderId: string,
    paymentId: string
  ): Promise<{ message: string }> => {
    const { data} = await axiosInstance.delete(
      `${BASE_URL}/${orderId}/payments/${paymentId}/receipt`
    );
    return data;
  },

  /**
   * Aplicar descuento a una orden (solo CONFIRMED+)
   */
  applyDiscount: async (
    orderId: string,
    applyDiscountDto: ApplyDiscountDto
  ): Promise<OrderDiscount> => {
    const { data } = await axiosInstance.post<OrderDiscount>(
      `${BASE_URL}/${orderId}/discounts`,
      applyDiscountDto
    );
    return data;
  },

  /**
   * Obtener todos los descuentos de una orden
   */
  getDiscounts: async (orderId: string): Promise<OrderDiscount[]> => {
    const { data } = await axiosInstance.get<OrderDiscount[]>(
      `${BASE_URL}/${orderId}/discounts`
    );
    return data;
  },

  /**
   * Historial unificado de aprobaciones y solicitudes de autorización de la OP
   */
  getAuthorizationHistory: async (
    orderId: string
  ): Promise<OrderAuthHistoryEvent[]> => {
    const { data } = await axiosInstance.get<OrderAuthHistoryEvent[]>(
      `${BASE_URL}/${orderId}/authorization-history`
    );
    return data;
  },

  /**
   * Eliminar un descuento de una orden (admin only)
   */
  removeDiscount: async (
    orderId: string,
    discountId: string
  ): Promise<Order> => {
    const { data } = await axiosInstance.delete<Order>(
      `${BASE_URL}/${orderId}/discounts/${discountId}`
    );
    return data;
  },

  /**
   * Registrar número de factura electrónica (solo si tiene IVA y no está en DRAFT)
   */
  registerElectronicInvoice: async (
    orderId: string,
    electronicInvoiceNumber: string
  ): Promise<Order> => {
    const { data } = await axiosInstance.patch<Order>(
      `${BASE_URL}/${orderId}/electronic-invoice`,
      { electronicInvoiceNumber }
    );
    return data;
  },

  /**
   * Obtener rentabilidad de una orden específica
   */
  getProfitability: async (orderId: string): Promise<OrderProfitability> => {
    const { data } = await axiosInstance.get<OrderProfitability>(
      `${BASE_URL}/${orderId}/profitability`
    );
    return data;
  },

  /**
   * Obtener lista paginada de rentabilidad de todas las órdenes
   */
  getProfitabilityList: async (
    params?: FilterProfitabilityDto
  ): Promise<PaginatedProfitability> => {
    const { data } = await axiosInstance.get<PaginatedProfitability>(
      `${BASE_URL}/profitability`,
      { params }
    );
    return data;
  },

  /**
   * Obtener resumen de ventas por asesor
   */
  getSalesSummary: async (params?: FilterOrdersDto): Promise<SalesSummary> => {
    const { data } = await axiosInstance.get<SalesSummary>(`${BASE_URL}/sales-summary`, { params });
    return data;
  },

  /**
   * Obtener el resumen del mini dashboard de la lista de órdenes
   */
  getDashboardSummary: async (
    params?: OrdersDashboardQuery,
  ): Promise<OrdersDashboardSummary> => {
    const { data } = await axiosInstance.get<OrdersDashboardSummary>(
      `${BASE_URL}/dashboard-summary`,
      { params },
    );
    return data;
  },

  // ── Sales Goals ─────────────────────────────────────────────

  /**
   * Seguimiento de OP del mes: matriz asesor × estado × pago.
   * El backend recorta el alcance a las OP propias cuando el usuario no tiene
   * `read_all_advisors_tracking`, y lo avisa con `scopedToOwn`.
   */
  getAdvisorTracking: async (params?: { month?: number; year?: number; advisorId?: string }): Promise<AdvisorTracking> => {
    const { data } = await axiosInstance.get<AdvisorTracking>(`${BASE_URL}/advisor-tracking`, { params });
    return data;
  },

  getSalesGoals: async (params?: { month?: number; year?: number; advisorId?: string }): Promise<SalesGoal[]> => {
    const { data } = await axiosInstance.get<SalesGoal[]>(`${BASE_URL}/sales-goals`, { params });
    return data;
  },

  upsertSalesGoal: async (dto: UpsertSalesGoalDto): Promise<SalesGoal> => {
    const { data } = await axiosInstance.post<SalesGoal>(`${BASE_URL}/sales-goals`, dto);
    return data;
  },

  deleteSalesGoal: async (goalId: string): Promise<void> => {
    await axiosInstance.delete(`${BASE_URL}/sales-goals/${goalId}`);
  },

  /**
   * Subir imagen de muestra para un item de la orden
   */
  uploadItemSampleImage: async (orderId: string, itemId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await axiosInstance.post(
      `${BASE_URL}/${orderId}/items/${itemId}/sample-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  /**
   * Eliminar imagen de muestra de un item de la orden
   */
  deleteItemSampleImage: async (orderId: string, itemId: string) => {
    const { data } = await axiosInstance.delete(
      `${BASE_URL}/${orderId}/items/${itemId}/sample-image`
    );
    return data;
  },
};
