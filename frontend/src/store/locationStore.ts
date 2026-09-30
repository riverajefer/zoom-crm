import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveLocationSupport, Sede, UserSedes } from '../types';

/** Valor del header para la vista "Todas las sedes". */
export const ALL_LOCATIONS = 'all';

interface LocationState {
  /** Sedes en las que el usuario puede operar. */
  locations: Sede[];
  defaultLocationId: string | null;
  /** Puede elegir cualquier sede y la vista "Todas" (`view_all_locations`). */
  canViewAll: boolean;
  /** Sede activa: su id, `ALL_LOCATIONS`, o `null` si el usuario no tiene sede. */
  activeLocationId: string | null;
  /**
   * Apoyo en otra sede vigente (docs/PLAN_SEDES.md §16). Mientras dura, su sede
   * es la única de `locations` y cambiar de sede pide autorización a Gerencia.
   */
  activeSupport: ActiveLocationSupport | null;

  /** Guarda lo que llega con el login o con `/auth/me`, sin perder la sede activa si sigue valiendo. */
  setFromAuth: (data: Partial<UserSedes>) => void;
  setActive: (locationId: string) => void;
  /** Vuelve a la sede predeterminada (o la primera permitida). */
  resetToDefault: () => void;
  clear: () => void;
}

function fallbackLocation(locations: Sede[], defaultLocationId: string | null): string | null {
  if (defaultLocationId && locations.some((l) => l.id === defaultLocationId)) {
    return defaultLocationId;
  }
  return locations[0]?.id ?? null;
}

function isValid(active: string | null, locations: Sede[], canViewAll: boolean): boolean {
  if (!active) return false;
  if (active === ALL_LOCATIONS) return canViewAll;
  return locations.some((l) => l.id === active);
}

/**
 * Sede activa del usuario. El interceptor de axios la manda en el header
 * `X-Location-Id` y el backend la valida en cada request. Ver
 * docs/PLAN_SEDES.md §5 y §15.1.
 *
 * Vive aparte de `authStore` para no mezclar lo propio de Zoom con el store
 * que se comparte con High.
 */
export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      locations: [],
      defaultLocationId: null,
      canViewAll: false,
      activeLocationId: null,
      activeSupport: null,

      setFromAuth: (data) => {
        if (data.locations === undefined) return;
        const locations = data.locations;
        const defaultLocationId = data.defaultLocationId ?? null;
        const canViewAll = data.canViewAllLocations ?? false;
        const current = get().activeLocationId;
        set({
          locations,
          defaultLocationId,
          canViewAll,
          activeSupport: data.activeLocationSupport ?? null,
          activeLocationId: isValid(current, locations, canViewAll)
            ? current
            : fallbackLocation(locations, defaultLocationId),
        });
      },

      setActive: (locationId) => {
        const { locations, canViewAll } = get();
        if (isValid(locationId, locations, canViewAll)) {
          set({ activeLocationId: locationId });
        }
      },

      resetToDefault: () => {
        const { locations, defaultLocationId } = get();
        set({ activeLocationId: fallbackLocation(locations, defaultLocationId) });
      },

      clear: () =>
        set({ locations: [], defaultLocationId: null, canViewAll: false, activeLocationId: null, activeSupport: null }),
    }),
    { name: 'location-storage' },
  ),
);

/** La sede activa como objeto (`null` en "Todas" o sin sede). */
export function selectActiveSede(state: LocationState): Sede | null {
  return state.locations.find((l) => l.id === state.activeLocationId) ?? null;
}
