import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { workOrderTimeApi } from '../../../api/work-order-time.api';
import type { WorkOrderTimeEntry } from '../../../types/work-order.types';
import type {
  AdjustTimeEntryDto,
  CreateManualTimeEntryDto,
  StartTimeEntryDto,
} from '../../../types/work-order-time.types';
import { workOrdersKeys } from './useWorkOrders';
import { formatDuration, entryDurationSeconds } from '../utils/timeline';

export const workOrderTimeKeys = {
  all: ['work-order-time'] as const,
  myRunning: () => [...workOrderTimeKeys.all, 'my-running'] as const,
  machines: () => [...workOrderTimeKeys.all, 'machines'] as const,
  pendingReview: () => [...workOrderTimeKeys.all, 'pending-review'] as const,
  operators: () => [...workOrderTimeKeys.all, 'operators'] as const,
  plantAll: () => [...workOrderTimeKeys.all, 'plant'] as const,
  plant: (date: string) => [...workOrderTimeKeys.plantAll(), date] as const,
};

/** Tareas en curso del usuario y el horario de la jornada. */
export const useMyRunningTasks = (enabled = true) =>
  useQuery({
    queryKey: workOrderTimeKeys.myRunning(),
    queryFn: () => workOrderTimeApi.getMyRunning(),
    enabled,
    // El cierre automático ocurre en el servidor: sin refresco, el chip seguiría
    // mostrando como en curso una tarea que el sistema ya cerró.
    refetchInterval: 60_000,
  });

export const useTimeMachines = (enabled = true) =>
  useQuery({
    queryKey: workOrderTimeKeys.machines(),
    queryFn: () => workOrderTimeApi.getMachines(),
    enabled,
    staleTime: 5 * 60_000,
  });

export const usePendingReview = (enabled = true) =>
  useQuery({
    queryKey: workOrderTimeKeys.pendingReview(),
    queryFn: () => workOrderTimeApi.getPendingReview(),
    enabled,
    refetchInterval: 5 * 60_000,
  });

export const useTimeOperators = (enabled = true) =>
  useQuery({
    queryKey: workOrderTimeKeys.operators(),
    queryFn: () => workOrderTimeApi.getOperators(),
    enabled,
    staleTime: 5 * 60_000,
  });

/** «Planta hoy»: asistencia y tareas del día; el de hoy se refresca solo. */
export const usePlantDay = (date: string, isToday: boolean) =>
  useQuery({
    queryKey: workOrderTimeKeys.plant(date),
    queryFn: () => workOrderTimeApi.getPlant(date),
    refetchInterval: isToday ? 60_000 : false,
    placeholderData: keepPreviousData,
  });

/** Mensaje del backend; class-validator lo manda como arreglo. */
const apiErrorMessage = (error: unknown): string => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message;
  if (Array.isArray(message)) return message[0];
  return message || 'No se pudo completar la acción. Intenta de nuevo.';
};

const taskName = (entry: WorkOrderTimeEntry) =>
  entry.notes || entry.workOrderItem?.productDescription || 'la tarea';

/** Acciones del temporizador; todas refrescan la OT, el chip y la bandeja de revisión. */
export const useWorkOrderTimeMutations = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const refresh = (entry?: WorkOrderTimeEntry) => {
    queryClient.invalidateQueries({ queryKey: workOrderTimeKeys.myRunning() });
    queryClient.invalidateQueries({ queryKey: workOrderTimeKeys.pendingReview() });
    queryClient.invalidateQueries({ queryKey: workOrderTimeKeys.plantAll() });
    if (entry?.workOrderId) {
      queryClient.invalidateQueries({ queryKey: workOrdersKeys.detail(entry.workOrderId) });
    }
  };
  const onError = (error: unknown) =>
    enqueueSnackbar(apiErrorMessage(error), { variant: 'error' });

  const startMutation = useMutation({
    mutationFn: (dto: StartTimeEntryDto) => workOrderTimeApi.start(dto),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar(`Iniciaste ${taskName(entry)}`, { variant: 'success' });
    },
    onError,
  });

  const stopMutation = useMutation({
    mutationFn: (entryId: string) => workOrderTimeApi.stop(entryId),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar(
        `Finalizaste ${taskName(entry)} · ${formatDuration(entryDurationSeconds(entry))}`,
        { variant: 'success' },
      );
    },
    onError,
  });

  const extendMutation = useMutation({
    mutationFn: (entryId: string) => workOrderTimeApi.extend(entryId),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar('Listo: la tarea sigue corriendo después del cierre de la jornada', {
        variant: 'success',
      });
    },
    onError,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ entryId, dto }: { entryId: string; dto: AdjustTimeEntryDto }) =>
      workOrderTimeApi.adjust(entryId, dto),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar('Ajuste guardado. La hora original queda registrada.', { variant: 'success' });
    },
    onError,
  });

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      workOrderTimeApi.void(entryId, reason),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar('Registro anulado', { variant: 'success' });
    },
    onError,
  });

  const reviewMutation = useMutation({
    mutationFn: (entryId: string) => workOrderTimeApi.markReviewed(entryId),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar('Marcada como revisada', { variant: 'success' });
    },
    onError,
  });

  const createManualMutation = useMutation({
    mutationFn: (dto: CreateManualTimeEntryDto) => workOrderTimeApi.createManual(dto),
    onSuccess: (entry) => {
      refresh(entry);
      enqueueSnackbar('Registro agregado', { variant: 'success' });
    },
    onError,
  });

  return {
    startMutation,
    stopMutation,
    extendMutation,
    adjustMutation,
    voidMutation,
    reviewMutation,
    createManualMutation,
  };
};
