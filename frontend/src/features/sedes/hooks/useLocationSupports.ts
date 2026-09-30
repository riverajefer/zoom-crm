import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { locationSupportsApi } from '../../../api';
import { fetchUserSedes } from '../../../api/axios';
import { useLocationStore } from '../../../store/locationStore';
import type { LocationSupportView, RequestLocationSupportDto, ScheduleLocationSupportDto } from '../../../types';

export const LOCATION_SUPPORTS_KEY = ['location-supports'] as const;

/** Apoyos de Gerencia por vista (pendientes, vigentes, programados, historial). */
export const useLocationSupportsList = (view: LocationSupportView, options?: { enabled?: boolean; userId?: string }) =>
  useQuery({
    queryKey: [...LOCATION_SUPPORTS_KEY, 'list', view, options?.userId ?? null],
    queryFn: () => locationSupportsApi.list(view, options?.userId),
    enabled: options?.enabled ?? true,
  });

/** Mis apoyos y solicitudes de sede. */
export const useMyLocationSupports = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: [...LOCATION_SUPPORTS_KEY, 'mine'],
    queryFn: () => locationSupportsApi.mine(),
    enabled: options?.enabled ?? true,
  });

/**
 * Recarga las sedes del usuario (`/auth/me`). Si con eso cambió la sede activa
 * —se aprobó, programó o terminó un apoyo—, vuelve a pedir todo: lo que está
 * en pantalla es de la sede anterior. Devuelve si cambió.
 */
export function useRefreshSedes() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const before = useLocationStore.getState().activeLocationId;
    const data = await fetchUserSedes();
    useLocationStore.getState().setFromAuth(data);
    const changed = useLocationStore.getState().activeLocationId !== before;
    if (changed) queryClient.invalidateQueries();
    else queryClient.invalidateQueries({ queryKey: LOCATION_SUPPORTS_KEY });
    return changed;
  }, [queryClient]);
}

export function useLocationSupportMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: LOCATION_SUPPORTS_KEY });

  return {
    request: useMutation({
      mutationFn: (dto: RequestLocationSupportDto) => locationSupportsApi.request(dto),
      onSuccess: invalidate,
    }),
    cancel: useMutation({ mutationFn: (id: string) => locationSupportsApi.cancel(id), onSuccess: invalidate }),
    schedule: useMutation({
      mutationFn: (dto: ScheduleLocationSupportDto) => locationSupportsApi.schedule(dto),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: ({ id, notes }: { id: string; notes?: string }) => locationSupportsApi.approve(id, notes),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: ({ id, notes }: { id: string; notes?: string }) => locationSupportsApi.reject(id, notes),
      onSuccess: invalidate,
    }),
    end: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => locationSupportsApi.end(id, reason),
      onSuccess: invalidate,
    }),
  };
}
