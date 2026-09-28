import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocationStore } from '../../../store/locationStore';

/**
 * Cambia la sede activa y vuelve a pedir todo, igual que el selector del
 * Topbar: lo que está en pantalla es de la sede anterior.
 */
export function useSwitchSede() {
  const queryClient = useQueryClient();
  const setActive = useLocationStore((s) => s.setActive);
  return useCallback(
    (locationId: string) => {
      setActive(locationId);
      queryClient.invalidateQueries();
    },
    [setActive, queryClient],
  );
}
