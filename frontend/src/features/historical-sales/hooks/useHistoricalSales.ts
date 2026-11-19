import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { historicalSalesApi } from '../../../api/historical-sales.api';
import type { FilterHistoricalSalesDto } from '../../../types/historical-sale.types';

export const HISTORICAL_SALES_KEY = ['historical-sales'] as const;

/** Lo que es solo de los filtros: sin paginación, para el resumen y la exportación. */
export const withoutPaging = (filters: FilterHistoricalSalesDto) => {
  const rest = { ...filters };
  delete rest.page;
  delete rest.limit;
  return rest;
};

// El histórico no cambia mientras se consulta: se carga con un script.
const STALE_TIME = 5 * 60 * 1000;

export const useHistoricalSales = (filters: FilterHistoricalSalesDto) =>
  useQuery({
    queryKey: [...HISTORICAL_SALES_KEY, 'list', filters],
    queryFn: () => historicalSalesApi.findAll(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });

export const useHistoricalSalesSummary = (filters: FilterHistoricalSalesDto) => {
  const params = withoutPaging(filters);
  return useQuery({
    queryKey: [...HISTORICAL_SALES_KEY, 'summary', params],
    queryFn: () => historicalSalesApi.getSummary(params),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
};

export const useHistoricalSalesFilterOptions = () =>
  useQuery({
    queryKey: [...HISTORICAL_SALES_KEY, 'filter-options'],
    queryFn: () => historicalSalesApi.getFilterOptions(),
    staleTime: STALE_TIME,
  });

export const useHistoricalSale = (id: string | null) =>
  useQuery({
    queryKey: [...HISTORICAL_SALES_KEY, 'detail', id],
    queryFn: () => historicalSalesApi.findOne(id!),
    enabled: !!id,
    staleTime: STALE_TIME,
  });
