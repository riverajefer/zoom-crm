import { useQuery, keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { productionApi } from '../../../api/production.api';
import type { ProductionOrderStatus, UpdateFieldSchemaPayload, CreateStepDefinitionDto } from '../../../types/production.types';

export const QUERY_KEYS = {
  STEP_DEFINITIONS: ['step-definitions'],
  STEP_DEFINITION: (id: string) => ['step-definitions', id],
  TEMPLATES: (filters?: object) => ['product-templates', filters],
  TEMPLATE: (id: string) => ['product-templates', id],
  ORDERS: (filters?: object) => ['production-orders', filters],
  ORDER: (id: string) => ['production-orders', id],
};

export function useStepDefinitions() {
  return useQuery({
    queryKey: QUERY_KEYS.STEP_DEFINITIONS,
    queryFn: productionApi.getStepDefinitions,
  });
}

export function useStepDefinition(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.STEP_DEFINITION(id),
    queryFn: () => productionApi.getStepDefinitionById(id),
    enabled: !!id,
  });
}

export function useCreateStepDefinition() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: (dto: CreateStepDefinitionDto) => productionApi.createStepDefinition(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STEP_DEFINITIONS });
      enqueueSnackbar('Definición de paso creada exitosamente', { variant: 'success' });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Error al crear la definición de paso';
      enqueueSnackbar(message, { variant: 'error' });
    },
  });
}

export function useUpdateStepDefinitionSchema(id: string) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: (payload: UpdateFieldSchemaPayload) =>
      productionApi.updateStepDefinitionSchema(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STEP_DEFINITIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STEP_DEFINITION(id) });
      if (data.warning) {
        enqueueSnackbar(data.warning, { variant: 'warning', autoHideDuration: 8000 });
      } else {
        enqueueSnackbar('Esquema de campos actualizado exitosamente', { variant: 'success' });
      }
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al actualizar el esquema de campos',
        { variant: 'error' },
      );
    },
  });
}

export function useProductTemplates(filters?: { category?: string; isActive?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.TEMPLATES(filters),
    queryFn: () => productionApi.getTemplates(filters),
  });
}

export function useProductTemplate(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.TEMPLATE(id),
    queryFn: () => productionApi.getTemplateById(id),
    enabled: !!id,
  });
}

export function useProductionOrders(filters?: {
  status?: ProductionOrderStatus;
  search?: string;
  workOrderId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: QUERY_KEYS.ORDERS(filters),
    queryFn: () => productionApi.getOrders(filters),
    // Sin esto `data` queda undefined al cambiar de página, `rowCount` cae a 0
    // y la grilla rebota a la página 1.
    placeholderData: keepPreviousData,
  });
}

export function useProductionOrder(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.ORDER(id),
    queryFn: () => productionApi.getOrderById(id),
    enabled: !!id,
    refetchInterval: 30000, // Refresh every 30s during active production
  });
}

export function useCreateProductTemplate() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: productionApi.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-templates'] });
      enqueueSnackbar('Plantilla creada exitosamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al crear la plantilla', {
        variant: 'error',
      });
    },
  });
}

export function useUpdateProductTemplate(id: string) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: (dto: { 
      name?: string; 
      category?: string; 
      description?: string; 
      isActive?: boolean;
      components?: any[];
    }) =>
      productionApi.updateTemplate(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-templates'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEMPLATE(id) });
      enqueueSnackbar('Plantilla actualizada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al actualizar', { variant: 'error' });
    },
  });
}

export function useDeleteProductTemplate() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: productionApi.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-templates'] });
      enqueueSnackbar('Plantilla desactivada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al desactivar', { variant: 'error' });
    },
  });
}

export function useCreateProductionOrder() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: productionApi.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      enqueueSnackbar('Orden de producción creada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al crear la OT', { variant: 'error' });
    },
  });
}

export function useUpdateStepSpecification(orderId: string, stepId: string) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: (specData: Record<string, any>) =>
      productionApi.updateSpecification(orderId, stepId, specData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDER(orderId) });
      enqueueSnackbar('Especificación guardada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al guardar', { variant: 'error' });
    },
  });
}

export function useUpdateStepExecution(orderId: string, stepId: string) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: (execData: Record<string, any>) =>
      productionApi.updateExecution(orderId, stepId, execData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDER(orderId) });
      enqueueSnackbar('Ejecución guardada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al guardar', { variant: 'error' });
    },
  });
}

export function useCompleteStep(orderId: string) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  return useMutation({
    mutationFn: (stepId: string) => productionApi.completeStep(orderId, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDER(orderId) });
      enqueueSnackbar('Paso marcado como completado', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al completar el paso',
        { variant: 'error' },
      );
    },
  });
}
