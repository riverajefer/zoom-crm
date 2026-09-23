import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { quotesApi } from '../../../api/quotes.api';
import { FilterQuotesDto, CreateQuoteDto, UpdateQuoteDto } from '../../../types/quote.types';
import { enqueueSnackbar } from 'notistack';

export const useQuotes = (filters?: FilterQuotesDto) => {
  const queryClient = useQueryClient();

  const quotesQuery = useQuery({
    queryKey: ['quotes', filters],
    queryFn: () => quotesApi.findAll(filters),
    // Sin esto `data` queda undefined al cambiar de página, `rowCount` cae a 0
    // y la grilla rebota a la página 1.
    placeholderData: keepPreviousData,
  });

  const quoteQuery = (id: string) =>
    useQuery({
      queryKey: ['quote', id],
      queryFn: () => quotesApi.findOne(id),
      enabled: !!id,
    });

  const createQuoteMutation = useMutation({
    mutationFn: (data: CreateQuoteDto) => quotesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      enqueueSnackbar('Cotización creada exitosamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al crear la cotización', { variant: 'error' });
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQuoteDto }) =>
      quotesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote'] });
      enqueueSnackbar('Cotización actualizada exitosamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al actualizar la cotización', { variant: 'error' });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: (id: string) => quotesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      enqueueSnackbar('Cotización eliminada exitosamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al eliminar la cotización', { variant: 'error' });
    },
  });

  const convertToOrderMutation = useMutation({
    mutationFn: (id: string) => quotesApi.convertToOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Cotización convertida a orden exitosamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al convertir la cotización', { variant: 'error' });
    },
  });

  return {
    quotesQuery,
    quoteQuery,
    createQuoteMutation,
    updateQuoteMutation,
    deleteQuoteMutation,
    convertToOrderMutation,
  };
};
