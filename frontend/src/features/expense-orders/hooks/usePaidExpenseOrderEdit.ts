import { useQuery } from '@tanstack/react-query';
import { expenseOrderEditRequestsApi } from '../../../api/expense-order-edit-requests.api';
import { useAuthStore } from '../../../store/authStore';
import { ExpenseOrderStatus } from '../../../types/expense-order.types';
import { PERMISSIONS } from '../../../utils/constants';

export const paidEditStatusKey = (expenseOrderId: string) =>
  ['og-edit-request-my-status', expenseOrderId] as const;

/**
 * ¿Puede el usuario editar esta OG pagada ahora mismo?
 *
 * El admin edita directo. Los demás necesitan una solicitud aprobada, vigente y
 * sin usar (el backend vuelve a verificarlo al guardar). La consulta solo corre
 * para una OG pagada y un usuario que no es admin.
 */
export const usePaidExpenseOrderEdit = (
  expenseOrder: { id: string; status: ExpenseOrderStatus } | undefined,
) => {
  const { user, hasPermission } = useAuthStore();
  const isAdmin = user?.role?.name === 'admin';
  const isPaid = expenseOrder?.status === ExpenseOrderStatus.PAID;
  const canUpdate = hasPermission(PERMISSIONS.UPDATE_EXPENSE_ORDERS);

  const myStatusQuery = useQuery({
    queryKey: paidEditStatusKey(expenseOrder?.id ?? ''),
    queryFn: () => expenseOrderEditRequestsApi.findMyStatus(expenseOrder!.id),
    enabled: !!expenseOrder && isPaid && canUpdate && !isAdmin,
  });

  const activeApproval = myStatusQuery.data?.activeApproval ?? null;
  const pending = myStatusQuery.data?.pending ?? null;

  return {
    isPaid,
    isAdmin,
    canUpdate,
    pending,
    activeApproval,
    isLoading: myStatusQuery.isLoading,
    /** Puede entrar al formulario de edición de la OG pagada. */
    canEditPaidNow: isPaid && canUpdate && (isAdmin || !!activeApproval),
  };
};
