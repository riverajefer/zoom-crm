import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { machinesApi } from '../../../api/machines.api';
import type { CreateMachineDto, UpdateMachineDto } from '../../../types/machine.types';

export const machinesKeys = {
  all: ['machines'] as const,
  list: (includeInactive: boolean) => [...machinesKeys.all, { includeInactive }] as const,
};

const apiErrorMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message;
  return (Array.isArray(message) ? message[0] : message) || fallback;
};

export const useMachines = (includeInactive = true) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: machinesKeys.all });
    // Las opciones del temporizador también salen de este catálogo.
    queryClient.invalidateQueries({ queryKey: ['work-order-time', 'machines'] });
  };

  const machinesQuery = useQuery({
    queryKey: machinesKeys.list(includeInactive),
    queryFn: () => machinesApi.getAll({ includeInactive }),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateMachineDto) => machinesApi.create(dto),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar('Máquina creada', { variant: 'success' });
    },
    onError: (error) =>
      enqueueSnackbar(apiErrorMessage(error, 'No se pudo crear la máquina'), { variant: 'error' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateMachineDto }) => machinesApi.update(id, dto),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar('Máquina actualizada', { variant: 'success' });
    },
    onError: (error) =>
      enqueueSnackbar(apiErrorMessage(error, 'No se pudo actualizar la máquina'), { variant: 'error' }),
  });

  return { machinesQuery, createMutation, updateMutation };
};
