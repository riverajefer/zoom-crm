import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { quotesApi } from '../../../api/quotes.api';
import { BoardFilters } from '../../../types/quoteKanban.types';
import { QuoteStatus } from '../../../types/quote.types';

const PAGE_SIZE = 20;

/**
 * @param locationId Sede del carril en la vista "Todas" (docs/PLAN_SEDES.md
 *   §6.2). Sin ella, la sede activa.
 */
export const useQuotesBoardColumn = (
  status: QuoteStatus,
  baseFilters: BoardFilters,
  locationId?: string,
) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['quotes-board', status, baseFilters, locationId],
    queryFn: ({ pageParam = 1 }) =>
      quotesApi.findAll(
        {
          ...baseFilters,
          status,
          page: pageParam as number,
          limit: PAGE_SIZE,
        },
        locationId,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const quotes = infiniteQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const total = infiniteQuery.data?.pages[0]?.meta.total ?? 0;

  const moveQuoteMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: QuoteStatus }) =>
      quotesApi.update(id, { status: newStatus }),
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['quotes-board', status] });
      queryClient.invalidateQueries({ queryKey: ['quotes-board', newStatus] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'No se pudo cambiar el estado de la cotización',
        { variant: 'error' },
      );
    },
  });

  return {
    infiniteQuery,
    quotes,
    total,
    moveQuoteMutation,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    isFetching: infiniteQuery.isFetching,
    fetchNextPage: infiniteQuery.fetchNextPage,
  };
};
