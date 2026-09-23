import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { ordersApi } from '../../../api/orders.api';
import type {
  FilterOrdersDto,
  CreateOrderDto,
  UpdateOrderDto,
  OrderStatus,
  CreatePaymentDto,
  UpdatePaymentDto,
  FilterProfitabilityDto,
  SalesSummary,
  AdvisorTracking,
  UpsertSalesGoalDto,
  OrdersDashboardQuery,
  OrdersDashboardSummary,
} from '../../../types/order.types';

// ============================================================
// QUERY KEYS
// ============================================================

export const ordersKeys = {
  all: ['orders'] as const,
  lists: () => [...ordersKeys.all, 'list'] as const,
  list: (filters?: FilterOrdersDto) =>
    [...ordersKeys.lists(), filters] as const,
  details: () => [...ordersKeys.all, 'detail'] as const,
  detail: (id: string) => [...ordersKeys.details(), id] as const,
  payments: (orderId: string) =>
    [...ordersKeys.detail(orderId), 'payments'] as const,
  profitability: (orderId: string) =>
    [...ordersKeys.detail(orderId), 'profitability'] as const,
  profitabilityList: (filters?: FilterProfitabilityDto) =>
    [...ordersKeys.all, 'profitability', 'list', filters] as const,
  dashboardSummaries: () => [...ordersKeys.all, 'dashboard-summary'] as const,
  dashboardSummary: (params?: OrdersDashboardQuery) =>
    [...ordersKeys.dashboardSummaries(), params] as const,
};

// ============================================================
// HOOK: useOrdersDashboardSummary — Mini dashboard de la lista
// ============================================================

export const useOrdersDashboardSummary = (params?: OrdersDashboardQuery) => {
  return useQuery<OrdersDashboardSummary>({
    queryKey: ordersKeys.dashboardSummary(params),
    queryFn: () => ordersApi.getDashboardSummary(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
};

// ============================================================
// HOOK: useOrders - Lista de órdenes con filtros
// ============================================================

export const useOrders = (filters?: FilterOrdersDto) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Query: Obtener lista de órdenes
  const ordersQuery = useQuery({
    queryKey: ordersKeys.list(filters),
    queryFn: () => ordersApi.getAll(filters),
    placeholderData: keepPreviousData,
  });

  // Mutation: Crear orden
  const createOrderMutation = useMutation({
    mutationFn: (data: CreateOrderDto) => ordersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      enqueueSnackbar('Orden creada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al crear la orden';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  // Mutation: Actualizar orden
  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOrderDto }) =>
      ordersApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      queryClient.invalidateQueries({
        queryKey: ordersKeys.detail(variables.id),
      });
      enqueueSnackbar('Orden actualizada correctamente', {
        variant: 'success',
      });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al actualizar la orden';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  // Mutation: Cambiar estado
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      ordersApi.updateStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      queryClient.invalidateQueries({
        queryKey: ordersKeys.detail(variables.id),
      });
      enqueueSnackbar('Estado actualizado correctamente', {
        variant: 'success',
      });
    },
    onError: (error: any) => {
      // Si es error 403 (Forbidden), NO mostrar snackbar
      // Dejar que el componente lo maneje y muestre el dialog de autorización
      if (error?.response?.status === 403) {
        return;
      }

      // Para otros errores, mostrar snackbar normalmente
      const message =
        error?.response?.data?.message || 'Error al cambiar el estado';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  // Mutation: Eliminar orden
  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => ordersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      enqueueSnackbar('Orden eliminada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al eliminar la orden';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  return {
    // Query
    ordersQuery,

    // Mutations
    createOrderMutation,
    updateOrderMutation,
    updateStatusMutation,
    deleteOrderMutation,
  };
};

// ============================================================
// HOOK: useOrder - Orden individual
// ============================================================

export const useOrder = (id: string) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Query: Obtener orden por ID
  const orderQuery = useQuery({
    queryKey: ordersKeys.detail(id),
    queryFn: () => ordersApi.getById(id),
    enabled: !!id,
  });

  // Mutation: Actualizar orden
  const updateOrderMutation = useMutation({
    mutationFn: (data: UpdateOrderDto) => ordersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      enqueueSnackbar('Orden actualizada correctamente', {
        variant: 'success',
      });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al actualizar la orden';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  // Mutation: Cambiar estado
  const updateStatusMutation = useMutation({
    // Al anular, `retainedAmount` es lo que se queda la empresa de lo pagado.
    mutationFn: (
      change: OrderStatus | { status: OrderStatus; retainedAmount?: number },
    ) =>
      typeof change === 'string'
        ? ordersApi.updateStatus(id, change)
        : ordersApi.updateStatus(id, change.status, {
            retainedAmount: change.retainedAmount,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      enqueueSnackbar('Estado actualizado correctamente', {
        variant: 'success',
      });
    },
    onError: (error: any) => {
      // Si es error 403 (Forbidden), NO mostrar snackbar
      // Dejar que el componente lo maneje y muestre el dialog de autorización
      if (error?.response?.status === 403) {
        return;
      }

      // Para otros errores, mostrar snackbar normalmente
      const message =
        error?.response?.data?.message || 'Error al cambiar el estado';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  // Mutation: Eliminar orden
  const deleteOrderMutation = useMutation({
    mutationFn: () => ordersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      enqueueSnackbar('Orden eliminada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al eliminar la orden';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  return {
    // Query
    orderQuery,

    // Mutations
    updateOrderMutation,
    updateStatusMutation,
    deleteOrderMutation,
  };
};

// ============================================================
// HOOK: useOrderPayments - Pagos de una orden
// ============================================================

export const useOrderPayments = (orderId: string) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Query: Obtener pagos de la orden
  const paymentsQuery = useQuery({
    queryKey: ordersKeys.payments(orderId),
    queryFn: () => ordersApi.getPayments(orderId),
    enabled: !!orderId,
  });

  // Mutation: Agregar pago
  const addPaymentMutation = useMutation({
    mutationFn: (data: CreatePaymentDto) => ordersApi.addPayment(orderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ordersKeys.payments(orderId),
      });
      queryClient.invalidateQueries({
        queryKey: ordersKeys.detail(orderId),
      });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      enqueueSnackbar('Pago registrado correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al registrar el pago';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  // Mutation: Editar pago (puede quedar pendiente de aprobación del admin)
  const updatePaymentMutation = useMutation({
    mutationFn: ({
      paymentId,
      data,
      file,
    }: {
      paymentId: string;
      data: UpdatePaymentDto;
      file?: File;
    }) => ordersApi.updatePayment(orderId, paymentId, data, file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ordersKeys.payments(orderId),
      });
      queryClient.invalidateQueries({
        queryKey: ordersKeys.detail(orderId),
      });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });
      if (result && 'status' in result && result.status === 'PENDING_APPROVAL') {
        enqueueSnackbar(
          result.message ||
            'La edición fue enviada para aprobación del administrador',
          { variant: 'info' },
        );
      } else {
        enqueueSnackbar('Pago actualizado correctamente', {
          variant: 'success',
        });
      }
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al actualizar el pago';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  const voidPaymentMutation = useMutation({
    mutationFn: ({
      paymentId,
      voidReason,
    }: {
      paymentId: string;
      voidReason: string;
      /**
       * El usuario puede anular sin aprobación. Cambia el PORQUÉ de que algo
       * quede pendiente: para él es que la caja cerró; para quien no lo tiene,
       * es que su rol siempre pasa por el admin. Decirle a un comercial que "la
       * caja está cerrada" es falso cuando el pago ni siquiera pasó por caja.
       */
      voidsDirectly?: boolean;
    }) => ordersApi.voidPayment(orderId, paymentId, voidReason),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ordersKeys.payments(orderId),
      });
      queryClient.invalidateQueries({ queryKey: ordersKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.dashboardSummaries() });

      // Los dos desenlaces son legítimos y se sienten distintos: uno ya movió el
      // dinero, el otro deja al usuario esperando al admin. Decirlo igual haría
      // creer que el saldo ya cambió cuando no.
      if (result.requiresApproval) {
        enqueueSnackbar(
          variables.voidsDirectly
            ? 'La caja de este pago ya está cerrada, así que la anulación quedó pendiente de autorización del administrador.'
            : 'Tu solicitud de anulación quedó pendiente de autorización del administrador. El saldo de la orden no cambia hasta que la apruebe.',
          { variant: 'info' },
        );
      } else {
        enqueueSnackbar('Pago anulado. El saldo de la orden ya fue recalculado.', {
          variant: 'success',
        });
      }
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al anular el pago';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  return {
    // Query
    paymentsQuery,

    // Mutations
    addPaymentMutation,
    updatePaymentMutation,
    voidPaymentMutation,
  };
};

// ============================================================
// HOOK: useOrderProfitability - Rentabilidad de una orden
// ============================================================

export const useOrderProfitability = (orderId: string) => {
  return useQuery({
    queryKey: ordersKeys.profitability(orderId),
    queryFn: () => ordersApi.getProfitability(orderId),
    enabled: !!orderId,
  });
};

// ============================================================
// HOOK: useProfitabilityList - Lista de rentabilidad paginada
// ============================================================

export const useProfitabilityList = (filters?: FilterProfitabilityDto) => {
  return useQuery({
    queryKey: ordersKeys.profitabilityList(filters),
    queryFn: () => ordersApi.getProfitabilityList(filters),
    // Sin esto `data` queda en undefined al cambiar de página, el `rowCount`
    // cae a 0 y la grilla rebota a la página 1.
    placeholderData: keepPreviousData,
  });
};

// ============================================================
// HOOK: useSalesSummary - Resumen de ventas por asesor
// ============================================================

export const salesSummaryKeys = {
  all: ['sales-summary'] as const,
  summary: (filters?: FilterOrdersDto) => [...salesSummaryKeys.all, filters] as const,
};

export const useSalesSummary = (filters?: FilterOrdersDto) => {
  return useQuery<SalesSummary>({
    queryKey: salesSummaryKeys.summary(filters),
    queryFn: () => ordersApi.getSalesSummary(filters),
  });
};

// ============================================================
// HOOK: useAdvisorTracking — Seguimiento de OP por asesor y estado
// ============================================================

export interface AdvisorTrackingParams {
  month: number;
  year: number;
  /** Acota a un asesor; requiere `read_all_advisors_tracking` si no es el propio. */
  advisorId?: string;
}

export const advisorTrackingKeys = {
  all: ['advisor-tracking'] as const,
  list: (params: AdvisorTrackingParams) => [...advisorTrackingKeys.all, params] as const,
};

export const useAdvisorTracking = (params: AdvisorTrackingParams) => {
  return useQuery<AdvisorTracking>({
    queryKey: advisorTrackingKeys.list(params),
    queryFn: () => ordersApi.getAdvisorTracking(params),
  });
};

// ============================================================
// HOOK: useSalesGoals — Metas de ventas mensuales
// ============================================================

export const salesGoalsKeys = {
  all: ['sales-goals'] as const,
  list: (params?: { month?: number; year?: number; advisorId?: string }) =>
    [...salesGoalsKeys.all, params] as const,
};

export const useSalesGoals = (params?: { month?: number; year?: number; advisorId?: string }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const goalsQuery = useQuery({
    queryKey: salesGoalsKeys.list(params),
    queryFn: () => ordersApi.getSalesGoals(params),
    enabled: !!(params?.month && params?.year),
  });

  const upsertMutation = useMutation({
    mutationFn: (dto: UpsertSalesGoalDto) => ordersApi.upsertSalesGoal(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesGoalsKeys.all });
      enqueueSnackbar('Meta guardada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al guardar la meta';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (goalId: string) => ordersApi.deleteSalesGoal(goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesGoalsKeys.all });
      enqueueSnackbar('Meta eliminada', { variant: 'info' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al eliminar la meta';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  return { goalsQuery, upsertMutation, deleteMutation };
};
