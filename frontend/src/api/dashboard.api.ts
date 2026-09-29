import axiosInstance from './axios';
import { FinancialDashboardResponse, FinancialQueryParams, SedesDashboardResponse } from '../types/dashboard.types';

export const dashboardApi = {
  getFinancial: async (params?: FinancialQueryParams): Promise<FinancialDashboardResponse> => {
    const { data } = await axiosInstance.get('/dashboard/financial', { params });
    return data;
  },

  /** Dashboard consolidado por sede (docs/PLAN_SEDES.md §7). Cubre todas las sedes. */
  getSedes: async (params?: FinancialQueryParams): Promise<SedesDashboardResponse> => {
    const { data } = await axiosInstance.get('/dashboard/sedes', { params });
    return data;
  },
};
