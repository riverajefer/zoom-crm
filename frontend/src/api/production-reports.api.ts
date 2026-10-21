import axiosInstance from './axios';
import type {
  ProductionSettings,
  ProductivityReport,
  ProductivityReportQuery,
  UpdateProductionSettingsDto,
} from '../types/work-order-time.types';

export const productionReportsApi = {
  getProductivity: async (query: ProductivityReportQuery): Promise<ProductivityReport> => {
    const { data } = await axiosInstance.get<ProductivityReport>('/production-reports/productivity', {
      params: query,
    });
    return data;
  },

  getSettings: async (): Promise<ProductionSettings> => {
    const { data } = await axiosInstance.get<ProductionSettings>('/production-settings');
    return data;
  },

  updateSettings: async (dto: UpdateProductionSettingsDto): Promise<ProductionSettings> => {
    const { data } = await axiosInstance.put<ProductionSettings>('/production-settings', dto);
    return data;
  },
};
