import axiosInstance from './axios';
import {
  OrderEditRequest,
  CreateEditRequestDto,
  ReviewEditRequestDto,
} from '../types/edit-request.types';

export const editRequestsApi = {
  /**
   * Crear solicitud de edición
   */
  create: async (orderId: string, dto: CreateEditRequestDto) => {
    const { data } = await axiosInstance.post<OrderEditRequest>(
      `/orders/${orderId}/edit-requests`,
      dto,
    );
    return data;
  },

  /**
   * Obtener todas las solicitudes de una orden
   */
  getByOrder: async (orderId: string) => {
    const { data } = await axiosInstance.get<OrderEditRequest[]>(
      `/orders/${orderId}/edit-requests`,
    );
    return data;
  },

  /**
   * Obtener solicitud específica
   */
  getOne: async (orderId: string, requestId: string) => {
    const { data } = await axiosInstance.get<OrderEditRequest>(
      `/orders/${orderId}/edit-requests/${requestId}`,
    );
    return data;
  },

  /**
   * Aprobar solicitud (solo admin)
   */
  approve: async (
    orderId: string,
    requestId: string,
    dto: ReviewEditRequestDto,
  ) => {
    const { data } = await axiosInstance.put<OrderEditRequest>(
      `/orders/${orderId}/edit-requests/${requestId}/approve`,
      dto,
    );
    return data;
  },

  /**
   * Rechazar solicitud (solo admin)
   */
  reject: async (
    orderId: string,
    requestId: string,
    dto: ReviewEditRequestDto,
  ) => {
    const { data } = await axiosInstance.put<OrderEditRequest>(
      `/orders/${orderId}/edit-requests/${requestId}/reject`,
      dto,
    );
    return data;
  },

  /**
   * El admin abre la edición de una orden bloqueada con un motivo. Queda como
   * solicitud aprobada directamente (docs/PLAN_SEDES.md §6.3).
   */
  createDirect: async (orderId: string, observations: string) => {
    const { data } = await axiosInstance.post<OrderEditRequest>(
      `/orders/${orderId}/edit-requests/direct`,
      { observations },
    );
    return data;
  },

  /**
   * Obtener permiso activo del usuario actual
   */
  getActivePermission: async (orderId: string) => {
    const { data } = await axiosInstance.get<OrderEditRequest | null>(
      `/orders/${orderId}/edit-requests/active-permission`,
    );
    return data;
  },

  /**
   * Obtener todas las solicitudes pendientes (solo admins)
   */
  findAllPending: async () => {
    const { data } = await axiosInstance.get<OrderEditRequest[]>(
      '/order-edit-requests/pending',
    );
    return data;
  },

  /**
   * Obtener todas las solicitudes (solo admins)
   */
  findAll: async () => {
    const { data } = await axiosInstance.get<OrderEditRequest[]>(
      '/order-edit-requests/all',
    );
    return data;
  },

  /**
   * Aprobar solicitud por ID global (solo admin)
   */
  approveGlobal: async (requestId: string, dto: ReviewEditRequestDto) => {
    const { data } = await axiosInstance.put<OrderEditRequest>(
      `/order-edit-requests/${requestId}/approve`,
      dto,
    );
    return data;
  },

  /**
   * Rechazar solicitud por ID global (solo admin)
   */
  rejectGlobal: async (requestId: string, dto: ReviewEditRequestDto) => {
    const { data } = await axiosInstance.put<OrderEditRequest>(
      `/order-edit-requests/${requestId}/reject`,
      dto,
    );
    return data;
  },
};
