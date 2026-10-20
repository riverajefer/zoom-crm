import axiosInstance from './axios';
import type { ProductivityReport, ProductivityReportQuery } from '../types/work-order-time.types';

export const productionReportsApi = {
  getProductivity: async (query: ProductivityReportQuery): Promise<ProductivityReport> => {
    const { data } = await axiosInstance.get<ProductivityReport>('/production-reports/productivity', {
      params: query,
    });
    return data;
  },
};
