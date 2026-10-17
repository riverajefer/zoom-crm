import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { workOrdersApi } from '../../../api/work-orders.api';
import type {
  FilterWorkOrdersDto,
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
  AddSupplyToItemDto,
} from '../../../types/work-order.types';

// ============================================================
// QUERY KEYS
// ============================================================

export const workOrdersKeys = {
  all: ['work-orders'] as const,
  lists: () => [...workOrdersKeys.all, 'list'] as const,
  list: (filters?: FilterWorkOrdersDto) => [...workOrdersKeys.lists(), filters] as const,
  details: () => [...workOrdersKeys.all, 'detail'] as const,
  detail: (id: string) => [...workOrdersKeys.details(), id] as const,
};

// ============================================================
// HOOK: useWorkOrders - Lista de OTs con filtros
// ============================================================

export const useWorkOrders = (filters?: FilterWorkOrdersDto) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const workOrdersQuery = useQuery({
    queryKey: workOrdersKeys.list(filters),
    queryFn: () => workOrdersApi.getAll(filters),
    // Sin esto `data` queda en undefined al cambiar de página, el `rowCount`
    // cae a 0 y la grilla rebota a la página 1.
    placeholderData: keepPreviousData,
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: ({ dto, confirmed }: { dto: CreateWorkOrderDto; confirmed?: boolean }) =>
      workOrdersApi.create(dto, confirmed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      enqueueSnackbar('Orden de trabajo creada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al crear la orden de trabajo';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  const deleteWorkOrderMutation = useMutation({
    mutationFn: (id: string) => workOrdersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      enqueueSnackbar('Orden de trabajo eliminada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al eliminar la orden de trabajo';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  return {
    workOrdersQuery,
    createWorkOrderMutation,
    deleteWorkOrderMutation,
  };
};

// ============================================================
// HOOK: useWorkOrder - Detalle de una OT
// ============================================================

export const useWorkOrder = (id?: string) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const workOrderQuery = useQuery({
    queryKey: workOrdersKeys.detail(id || ''),
    queryFn: () => workOrdersApi.getById(id!),
    enabled: !!id,
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: ({ id: woId, dto }: { id: string; dto: UpdateWorkOrderDto }) =>
      workOrdersApi.update(woId, dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.detail(variables.id) });
      enqueueSnackbar('Orden de trabajo actualizada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al actualizar la orden de trabajo';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id: woId, dto }: { id: string; dto: UpdateWorkOrderStatusDto }) =>
      workOrdersApi.updateStatus(woId, dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.detail(variables.id) });
      enqueueSnackbar('Estado actualizado correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al cambiar el estado';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  const addSupplyMutation = useMutation({
    mutationFn: ({
      workOrderId,
      itemId,
      dto,
    }: {
      workOrderId: string;
      itemId: string;
      dto: AddSupplyToItemDto;
    }) => workOrdersApi.addSupplyToItem(workOrderId, itemId, dto),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: workOrdersKeys.detail(id) });
      enqueueSnackbar('Insumo agregado correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al agregar el insumo';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  const removeSupplyMutation = useMutation({
    mutationFn: ({
      workOrderId,
      itemId,
      supplyId,
    }: {
      workOrderId: string;
      itemId: string;
      supplyId: string;
    }) => workOrdersApi.removeSupplyFromItem(workOrderId, itemId, supplyId),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: workOrdersKeys.detail(id) });
      enqueueSnackbar('Insumo eliminado correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error al eliminar el insumo';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });

  return {
    workOrderQuery,
    updateWorkOrderMutation,
    updateStatusMutation,
    addSupplyMutation,
    removeSupplyMutation,
  };
};
