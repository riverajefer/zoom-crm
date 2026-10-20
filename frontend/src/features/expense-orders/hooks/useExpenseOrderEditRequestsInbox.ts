import { useQuery } from '@tanstack/react-query';
import { expenseOrderEditRequestsApi } from '../../../api/expense-order-edit-requests.api';

type ViewMode = 'pending' | 'history';

const editRequestsKey = (viewMode: ViewMode) => ['ogEditRequests', viewMode] as const;

/**
 * Solicitudes de edición de OG pagada para la bandeja del admin. La página de
 * solicitudes lo usa también para el contador de la pestaña; React Query
 * comparte la consulta entre los dos.
 */
export const useExpenseOrderEditRequestsInbox = (viewMode: ViewMode, enabled: boolean) => {
  const query = useQuery({
    queryKey: editRequestsKey(viewMode),
    queryFn: () =>
      viewMode === 'pending'
        ? expenseOrderEditRequestsApi.findPending()
        : expenseOrderEditRequestsApi.findAll(),
    enabled,
  });
  const rows =
    viewMode === 'history' ? query.data?.filter((r) => r.status !== 'PENDING') : query.data;
  return { rows: rows ?? [], isLoading: query.isLoading };
};
