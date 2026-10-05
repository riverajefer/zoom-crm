import axiosInstance from './axios';
import type {
  FilterPaymentVerificationsDto,
  PaymentAccountingReview,
  PaymentVerificationSummary,
  PaymentVerificationsResponse,
} from '../types/payment-verification.types';

const BASE_URL = '/payment-verifications';

/** Verificación contable de pagos (permiso `verify_payments`). */
export const paymentVerificationsApi = {
  findAll: async (filters: FilterPaymentVerificationsDto) => {
    const { data } = await axiosInstance.get<PaymentVerificationsResponse>(BASE_URL, {
      params: filters,
    });
    return data;
  },

  getSummary: async () => {
    const { data } = await axiosInstance.get<PaymentVerificationSummary>(`${BASE_URL}/summary`);
    return data;
  },

  getHistory: async (paymentId: string) => {
    const { data } = await axiosInstance.get<PaymentAccountingReview[]>(
      `${BASE_URL}/${paymentId}/history`,
    );
    return data;
  },

  verify: async (paymentIds: string[], notes?: string) => {
    const { data } = await axiosInstance.post<{ verified: number; skipped: number }>(
      `${BASE_URL}/verify`,
      { paymentIds, notes: notes || undefined },
    );
    return data;
  },

  observe: async (paymentId: string, notes: string) => {
    const { data } = await axiosInstance.post(`${BASE_URL}/${paymentId}/observe`, { notes });
    return data;
  },
};
