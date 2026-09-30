import { useEffect, useRef } from 'react';
import { useSnackbar } from 'notistack';
import { useAuthStore } from '../../../store/authStore';
import { selectActiveSede, useLocationStore } from '../../../store/locationStore';
import { createSocket } from '../../../lib/socket';
import { useRefreshSedes } from './useLocationSupports';

/** Evento del backend (`WS_EVENTS.LOCATION_SUPPORT_CHANGED`). */
const LOCATION_SUPPORT_CHANGED = 'location_support_changed';

/**
 * Mantiene la sede al día con los apoyos en otra sede (docs/PLAN_SEDES.md §16):
 * cuando Gerencia aprueba, rechaza, programa o termina un apoyo del usuario, el
 * backend avisa por su sala personal y la pantalla cambia de sede sola.
 *
 * Si la pestaña no estaba conectada, el cambio llega igual con la siguiente
 * petición: el 403 `LOCATION_NOT_ALLOWED` recarga las sedes (`api/axios.ts`).
 */
export function useLocationSupportSync() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshSedes = useRefreshSedes();
  const { enqueueSnackbar } = useSnackbar();
  // El handler vive lo que vive el socket: con refs no hay que reconectar cuando cambian.
  const refreshRef = useRef(refreshSedes);
  const snackbarRef = useRef(enqueueSnackbar);
  refreshRef.current = refreshSedes;
  snackbarRef.current = enqueueSnackbar;

  useEffect(() => {
    if (!accessToken) return;
    const socket = createSocket(accessToken);

    socket.on(LOCATION_SUPPORT_CHANGED, async () => {
      try {
        const changed = await refreshRef.current();
        if (!changed) return;
        const { activeSupport } = useLocationStore.getState();
        const sede = selectActiveSede(useLocationStore.getState());
        snackbarRef.current(
          activeSupport
            ? `Ahora estás de apoyo en ${sede?.name ?? 'otra sede'}`
            : `Volviste a tu sede: ${sede?.name ?? ''}`,
          { variant: 'info' },
        );
      } catch {
        // Sin conexión al backend: el siguiente 403 de sede hace la misma recarga.
      }
    });

    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [accessToken]);
}
