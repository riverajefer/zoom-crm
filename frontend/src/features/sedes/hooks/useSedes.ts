import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sedesApi } from '../../../api';
import { CreateSedeDto, SetUserLocationsDto, UpdateSedeDto } from '../../../types';

export const SEDES_KEY = ['sedes'] as const;

/** Sedes activas, para selectores y chips. */
export const useActiveSedes = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: [...SEDES_KEY, 'active'],
    queryFn: () => sedesApi.getActive(),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });

/** Administración de sedes: solo soporte. */
export const useManageSedes = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: SEDES_KEY });

  const sedesQuery = useQuery({
    queryKey: [...SEDES_KEY, 'manage'],
    queryFn: () => sedesApi.getAllForManagement(),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSedeDto) => sedesApi.create(data),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSedeDto }) => sedesApi.update(id, data),
    onSuccess: invalidate,
  });

  return { sedesQuery, createMutation, updateMutation };
};

export const useSetUserLocations = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: SetUserLocationsDto }) =>
      sedesApi.setUserLocations(userId, data),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
};
