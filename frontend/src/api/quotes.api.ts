import axios, { sedeRequestConfig } from './axios';
import { 
  Quote, 
  CreateQuoteDto, 
  UpdateQuoteDto, 
  FilterQuotesDto,
  QuoteLookupItem,
} from '../types/quote.types';
import type { SedeLookupGroup } from '../types/sede.types';
import { ApiResponse, PaginatedMetaResponse } from '../types/api.types';
import { Order } from '../types/order.types';

export const quotesApi = {
  /** @param locationId Sede en la que se pide, si no es la activa (vista "Todas"). */
  findAll: async (params?: FilterQuotesDto, locationId?: string) => {
    const { data } = await axios.get<PaginatedMetaResponse<Quote>>('/quotes', {
      params,
      ...sedeRequestConfig(locationId),
    });
    return data;
  },

  /** COT de las otras sedes que coinciden con la búsqueda (modo consulta). */
  lookup: async (q: string) => {
    const { data } = await axios.get<SedeLookupGroup<QuoteLookupItem>[]>('/quotes/lookup', { params: { q } });
    return data;
  },

  findOne: async (id: string) => {
    const { data } = await axios.get<Quote>(`/quotes/${id}`);
    return data;
  },

  create: async (quote: CreateQuoteDto) => {
    const { data } = await axios.post<Quote>('/quotes', quote);
    return data;
  },

  update: async (id: string, quote: UpdateQuoteDto) => {
    const { data } = await axios.patch<Quote>(`/quotes/${id}`, quote);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await axios.delete<ApiResponse<null>>(`/quotes/${id}`);
    return data;
  },

  convertToOrder: async (id: string) => {
    const { data } = await axios.post<Order>(`/quotes/${id}/convert`);
    return data;
  },

  uploadItemSampleImage: async (quoteId: string, itemId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await axios.post(
      `/quotes/${quoteId}/items/${itemId}/sample-image`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return data;
  },

  deleteItemSampleImage: async (quoteId: string, itemId: string) => {
    const { data } = await axios.delete(
      `/quotes/${quoteId}/items/${itemId}/sample-image`
    );
    return data;
  },
};
