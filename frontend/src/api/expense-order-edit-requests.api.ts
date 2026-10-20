import axiosInstance from './axios';
import type {
  CreateExpenseOrderEditRequestDto,
  ExpenseOrderEditRequest,
  MyExpenseOrderEditStatus,
} from '../types/expense-order-edit-request.types';

export const expenseOrderEditRequestsApi = {
  /**
   * Solicitar autorización para editar una OG pagada
   */
  create: async (dto: CreateExpenseOrderEditRequestDto) => {
    const { data } = await axiosInstance.post<ExpenseOrderEditRequest>(
      '/expense-order-edit-requests',
      dto,
    );
    return data;
  },

  /**
   * Obtener solicitudes pendientes (solo admins)
   */
  findPending: async () => {
    const { data } = await axiosInstance.get<ExpenseOrderEditRequest[]>(
      '/expense-order-edit-requests/pending',
    );
    return data;
  },

  /**
   * Obtener todas las solicitudes (solo admins)
   */
  findAll: async () => {
    const { data } = await axiosInstance.get<ExpenseOrderEditRequest[]>(
      '/expense-order-edit-requests/all',
    );
    return data;
  },

  /**
   * Historial de solicitudes de edición de una OG
   */
  findByExpenseOrder: async (expenseOrderId: string) => {
    const { data } = await axiosInstance.get<ExpenseOrderEditRequest[]>(
      `/expense-order-edit-requests/expense-order/${expenseOrderId}`,
    );
    return data;
  },

  /**
   * Solicitud pendiente y edición aprobada del usuario actual para una OG
   */
  findMyStatus: async (expenseOrderId: string) => {
    const { data } = await axiosInstance.get<MyExpenseOrderEditStatus>(
      `/expense-order-edit-requests/expense-order/${expenseOrderId}/my-status`,
    );
    return data;
  },

  /**
   * Aprobar solicitud (solo admins)
   */
  approve: async (requestId: string, reviewNotes?: string) => {
    const { data } = await axiosInstance.put<ExpenseOrderEditRequest>(
      `/expense-order-edit-requests/${requestId}/approve`,
      { reviewNotes },
    );
    return data;
  },

  /**
   * Rechazar solicitud (solo admins)
   */
  reject: async (requestId: string, reviewNotes?: string) => {
    const { data } = await axiosInstance.put<ExpenseOrderEditRequest>(
      `/expense-order-edit-requests/${requestId}/reject`,
      { reviewNotes },
    );
    return data;
  },
};
