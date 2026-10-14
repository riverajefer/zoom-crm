import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutos
    },
  },
});

/**
 * La caché es de quien hizo las consultas: cuando cambia el usuario se borra.
 *
 * Sin esto, quien entraba sin recargar la página heredaba hasta 5 minutos los
 * datos del anterior. Caso real: `caja.104` entró después de `caja.119`,
 * «Sesión Activa» tomó de la caché la caja abierta del 119 y el cierre falló
 * con un 404 que la pantalla mostraba como error genérico.
 *
 * Se escucha el store y no el `logout()` porque la sesión también se cierra
 * sin pasar por él: desde otra pestaña o cuando falla el refresh del token.
 */
let cachedUserId = useAuthStore.getState().user?.id ?? null;
useAuthStore.subscribe((state) => {
  const userId = state.user?.id ?? null;
  if (userId === cachedUserId) return;
  cachedUserId = userId;
  queryClient.clear();
});
