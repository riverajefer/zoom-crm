import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_LOCATIONS, selectActiveSede, useLocationStore } from './locationStore';
import type { Sede } from '../types';

const sede = (id: string, code: string): Sede => ({
  id,
  code,
  name: `Local ${code}`,
  type: 'STORE',
  color: '#123456',
  address: null,
  phone: null,
});
const L104 = sede('l-104', '104');
const L119 = sede('l-119', '119');
const L125 = sede('l-125', '125');

describe('locationStore', () => {
  beforeEach(() => useLocationStore.getState().clear());

  it('al entrar toma la sede predeterminada', () => {
    useLocationStore.getState().setFromAuth({
      locations: [L119, L125],
      defaultLocationId: 'l-125',
      canViewAllLocations: false,
    });

    expect(useLocationStore.getState().activeLocationId).toBe('l-125');
    expect(selectActiveSede(useLocationStore.getState())?.code).toBe('125');
  });

  it('sin predeterminada válida toma la primera permitida', () => {
    useLocationStore.getState().setFromAuth({
      locations: [L119],
      defaultLocationId: 'l-104',
      canViewAllLocations: false,
    });

    expect(useLocationStore.getState().activeLocationId).toBe('l-119');
  });

  it('conserva la sede activa al recargar las sedes si sigue permitida', () => {
    const store = useLocationStore.getState();
    store.setFromAuth({ locations: [L119, L125], defaultLocationId: 'l-125', canViewAllLocations: false });
    store.setActive('l-119');
    store.setFromAuth({ locations: [L119, L125], defaultLocationId: 'l-125', canViewAllLocations: false });

    expect(useLocationStore.getState().activeLocationId).toBe('l-119');
  });

  it('si le quitan la sede activa vuelve a la predeterminada', () => {
    const store = useLocationStore.getState();
    store.setFromAuth({ locations: [L119, L125], defaultLocationId: 'l-125', canViewAllLocations: false });
    store.setActive('l-119');
    store.setFromAuth({ locations: [L125], defaultLocationId: 'l-125', canViewAllLocations: false });

    expect(useLocationStore.getState().activeLocationId).toBe('l-125');
  });

  it('no acepta una sede no permitida ni "Todas" sin view_all_locations', () => {
    const store = useLocationStore.getState();
    store.setFromAuth({ locations: [L125], defaultLocationId: 'l-125', canViewAllLocations: false });
    store.setActive('l-104');
    store.setActive(ALL_LOCATIONS);

    expect(useLocationStore.getState().activeLocationId).toBe('l-125');
  });

  it('con view_all_locations acepta "Todas"', () => {
    const store = useLocationStore.getState();
    store.setFromAuth({ locations: [L104, L119, L125], defaultLocationId: null, canViewAllLocations: true });
    store.setActive(ALL_LOCATIONS);

    expect(useLocationStore.getState().activeLocationId).toBe(ALL_LOCATIONS);
    expect(selectActiveSede(useLocationStore.getState())).toBeNull();
  });

  it('una respuesta sin sedes (backend anterior) no borra lo que hay', () => {
    const store = useLocationStore.getState();
    store.setFromAuth({ locations: [L125], defaultLocationId: 'l-125', canViewAllLocations: false });
    store.setFromAuth({});

    expect(useLocationStore.getState().locations).toHaveLength(1);
  });

  // Solo Zoom: apoyo en otra sede (docs/PLAN_SEDES.md §16)
  describe('apoyo en otra sede', () => {
    const support = {
      id: 's-1',
      locationId: 'l-125',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      reason: 'Vacaciones de Laura',
      authorizedBy: 'Oscar Herrera',
      overdue: false,
      homeLocationIds: ['l-104'],
    };

    it('al aprobarse, la sede activa pasa sola a la del apoyo', () => {
      const store = useLocationStore.getState();
      store.setFromAuth({ locations: [L104], defaultLocationId: 'l-104', canViewAllLocations: false });

      store.setFromAuth({
        locations: [L125],
        defaultLocationId: 'l-125',
        canViewAllLocations: false,
        activeLocationSupport: support,
      });

      expect(useLocationStore.getState().activeLocationId).toBe('l-125');
      expect(useLocationStore.getState().activeSupport?.authorizedBy).toBe('Oscar Herrera');
    });

    it('mientras dura no puede volver a su sede desde el selector', () => {
      const store = useLocationStore.getState();
      store.setFromAuth({ locations: [L125], defaultLocationId: 'l-125', canViewAllLocations: false, activeLocationSupport: support });

      store.setActive('l-104');

      expect(useLocationStore.getState().activeLocationId).toBe('l-125');
    });

    it('al terminar vuelve a su sede y se olvida el apoyo', () => {
      const store = useLocationStore.getState();
      store.setFromAuth({ locations: [L125], defaultLocationId: 'l-125', canViewAllLocations: false, activeLocationSupport: support });

      store.setFromAuth({ locations: [L104], defaultLocationId: 'l-104', canViewAllLocations: false, activeLocationSupport: null });

      expect(useLocationStore.getState().activeLocationId).toBe('l-104');
      expect(useLocationStore.getState().activeSupport).toBeNull();
    });
  });
});
