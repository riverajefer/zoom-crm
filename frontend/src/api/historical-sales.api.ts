import axiosInstance from './axios';
import type {
  FilterHistoricalSalesDto,
  HistoricalSale,
  HistoricalSalesFilterOptions,
  HistoricalSalesResponse,
  HistoricalSalesSummary,
} from '../types/historical-sale.types';

const BASE_URL = '/historical-sales';

type Filters = Omit<FilterHistoricalSalesDto, 'page' | 'limit'>;

/** Histórico de ventas (permisos `read_historical_sales` y `export_historical_sales`). */
export const historicalSalesApi = {
  findAll: async (filters: FilterHistoricalSalesDto) => {
    const { data } = await axiosInstance.get<HistoricalSalesResponse>(BASE_URL, { params: filters });
    return data;
  },

  getSummary: async (filters: Filters) => {
    const { data } = await axiosInstance.get<HistoricalSalesSummary>(`${BASE_URL}/summary`, {
      params: filters,
    });
    return data;
  },

  getFilterOptions: async () => {
    const { data } = await axiosInstance.get<HistoricalSalesFilterOptions>(
      `${BASE_URL}/filter-options`,
    );
    return data;
  },

  findOne: async (id: string) => {
    const { data } = await axiosInstance.get<HistoricalSale>(`${BASE_URL}/${id}`);
    return data;
  },

  findForExport: async (filters: Filters) => {
    const { data } = await axiosInstance.get<HistoricalSale[]>(`${BASE_URL}/export`, {
      params: filters,
    });
    return data;
  },
};
