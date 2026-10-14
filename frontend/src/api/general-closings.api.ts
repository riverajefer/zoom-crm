import axiosInstance from './axios';
import type {
  GeneralClosingByLocation,
  GeneralClosingDay,
  GeneralClosingHistoryResponse,
  GeneralClosingPendingDay,
  GeneralClosingReviewStatus,
} from '../types/general-closing.types';

const BASE_URL = '/general-closings';

/** Cierre general diario de las cajas (solo Zoom). */
export const generalClosingsApi = {
  getHistory: async (page: number, limit: number) => {
    const { data } = await axiosInstance.get<GeneralClosingHistoryResponse>(BASE_URL, {
      params: { page, limit },
    });
    return data;
  },

  getPendingDays: async () => {
    const { data } = await axiosInstance.get<GeneralClosingPendingDay[]>(`${BASE_URL}/pending-days`);
    return data;
  },

  getByLocation: async (from: string, to: string) => {
    const { data } = await axiosInstance.get<GeneralClosingByLocation>(`${BASE_URL}/by-location`, {
      params: { from, to },
    });
    return data;
  },

  getDay: async (date: string) => {
    const { data } = await axiosInstance.get<GeneralClosingDay>(`${BASE_URL}/day/${date}`);
    return data;
  },

  reviewRegister: async (
    date: string,
    cashRegisterId: string,
    status: GeneralClosingReviewStatus,
    notes?: string,
  ) => {
    const { data } = await axiosInstance.put<GeneralClosingDay>(
      `${BASE_URL}/day/${date}/reviews/${cashRegisterId}`,
      { status, notes: notes || undefined },
    );
    return data;
  },

  receiveHandover: async (date: string, cashRegisterId: string, baseLeft: number) => {
    const { data } = await axiosInstance.post<GeneralClosingDay>(
      `${BASE_URL}/day/${date}/handovers/${cashRegisterId}`,
      { baseLeft },
    );
    return data;
  },

  closeDay: async (date: string, notes?: string) => {
    const { data } = await axiosInstance.post<GeneralClosingDay>(`${BASE_URL}/day/${date}/close`, {
      notes: notes || undefined,
    });
    return data;
  },

  reopen: async (id: string, reason: string) => {
    const { data } = await axiosInstance.post<GeneralClosingDay>(`${BASE_URL}/${id}/reopen`, {
      reason,
    });
    return data;
  },
};
