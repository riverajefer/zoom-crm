import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, type AxiosAdapter } from 'axios';

// El módulo de axios arrastra el store de auth y el de mantenimiento; aquí solo
// interesa la capa que evita el doble envío, así que se sustituyen por mínimos.
vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: null, refreshAccessToken: vi.fn() }) },
}));
vi.mock('../hooks/useMaintenanceMode', () => ({
  useMaintenanceModeStore: {
    getState: () => ({ isMaintenanceMode: false, deactivateMaintenance: vi.fn(), activateMaintenance: vi.fn() }),
  },
}));
vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }));
vi.mock('../utils/error-messages', () => ({ getFriendlyErrorMessage: (m: string) => m }));

const { default: axiosInstance } = await import('./axios');

/**
 * Axios encadena sus interceptores con promesas, así que el adaptador no se
 * invoca en el mismo tick que la llamada. Este respiro deja que lleguen.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Adaptador que no responde hasta que el test lo suelte. */
const pendingAdapter = () => {
  const releases: Array<() => void> = [];
  let calls = 0;
  const adapter: AxiosAdapter = (config) =>
    new Promise((resolve) => {
      calls++;
      releases.push(() =>
        resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }),
      );
    });
  return { adapter, releaseAll: () => releases.forEach((r) => r()), get calls() { return calls; } };
};

describe('axios · una sola petición en vuelo por acción', () => {
  beforeEach(() => {
    axiosInstance.defaults.adapter = undefined;
  });

  it('el doble clic manda un solo POST y ambos reciben la misma respuesta', async () => {
    const http = pendingAdapter();
    axiosInstance.defaults.adapter = http.adapter;

    const body = { name: 'Gasto de prueba', unitPrice: 600000 };
    const first = axiosInstance.post('/expense-orders', body);
    const second = axiosInstance.post('/expense-orders', body);

    await tick();
    expect(http.calls).toBe(1);

    http.releaseAll();
    const [a, b] = await Promise.all([first, second]);
    expect(a.data).toEqual(b.data);
  });

  it('no confunde dos acciones distintas contra la misma URL', async () => {
    const http = pendingAdapter();
    axiosInstance.defaults.adapter = http.adapter;

    const a = axiosInstance.post('/expense-orders', { name: 'Tintas' });
    const b = axiosInstance.post('/expense-orders', { name: 'Papel' });

    await tick();
    expect(http.calls).toBe(2);

    http.releaseAll();
    await Promise.all([a, b]);
  });

  it('permite repetir la misma acción una vez terminó la anterior', async () => {
    const http = pendingAdapter();
    axiosInstance.defaults.adapter = http.adapter;

    const body = { name: 'Tintas' };
    const first = axiosInstance.post('/expense-orders', body);
    await tick();
    http.releaseAll();
    await first;

    const second = axiosInstance.post('/expense-orders', body);
    await tick();
    http.releaseAll();
    await second;

    expect(http.calls).toBe(2);
  });

  it('vuelve a salir a la red si la primera petición falló', async () => {
    let calls = 0;
    axiosInstance.defaults.adapter = (() => {
      calls++;
      return Promise.reject(Object.assign(new Error('caída'), { isAxiosError: true }));
    }) as AxiosAdapter;

    const body = { name: 'Tintas' };
    await expect(axiosInstance.post('/expense-orders', body)).rejects.toThrow();
    await expect(axiosInstance.post('/expense-orders', body)).rejects.toThrow();

    expect(calls).toBe(2);
  });

  it('deduplica también PATCH, PUT y DELETE', async () => {
    const http = pendingAdapter();
    axiosInstance.defaults.adapter = http.adapter;

    const patch = [axiosInstance.patch('/orders/1/status', { status: 'PAID' }), axiosInstance.patch('/orders/1/status', { status: 'PAID' })];
    const put = [axiosInstance.put('/roles/1', { name: 'admin' }), axiosInstance.put('/roles/1', { name: 'admin' })];
    const del = [axiosInstance.delete('/expense-orders/1'), axiosInstance.delete('/expense-orders/1')];

    // Tres acciones distintas, una petición cada una.
    await tick();
    expect(http.calls).toBe(3);

    http.releaseAll();
    await Promise.all([...patch, ...put, ...del]);
  });

  it('no deduplica subidas de archivos: dos adjuntos distintos serializan igual', async () => {
    const http = pendingAdapter();
    axiosInstance.defaults.adapter = http.adapter;

    const a = new FormData();
    a.append('file', new Blob(['uno']), 'comprobante-1.png');
    const b = new FormData();
    b.append('file', new Blob(['dos']), 'comprobante-2.png');

    const uploads = [axiosInstance.post('/storage/upload', a), axiosInstance.post('/storage/upload', b)];

    await tick();
    expect(http.calls).toBe(2);

    http.releaseAll();
    await Promise.all(uploads);
  });
});

// Solo Zoom: recuperación de la sede activa (docs/PLAN_SEDES.md §5 y §16)
describe('axios · sede activa que ya no vale', () => {
  it('recupera aunque la que falla sea POST /auth/me: no se bloquea con su propia promesa', async () => {
    const { useLocationStore } = await import('../store/locationStore');
    const calls: string[] = [];
    axiosInstance.defaults.adapter = ((config) => {
      calls.push(`${config.method} ${config.url}`);
      if (calls.length === 1) {
        // La sede del header ya no está permitida (empezó o terminó un apoyo).
        return Promise.reject(
          new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, null, {
            status: 403,
            statusText: 'Forbidden',
            headers: {},
            config,
            data: { code: 'LOCATION_NOT_ALLOWED', message: 'Estás de apoyo en Local 125' },
          }),
        );
      }
      const sedes = { locations: [{ id: 'l-125', code: '125', name: 'Local 125' }], defaultLocationId: 'l-125' };
      return Promise.resolve({ data: sedes, status: 200, statusText: 'OK', headers: {}, config });
    }) as AxiosAdapter;

    const result = await Promise.race([
      axiosInstance.post('/auth/me'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('bloqueada')), 1000)),
    ]);

    expect((result as { status: number }).status).toBe(200);
    expect(calls).toEqual(['post /auth/me', 'post /auth/me', 'post /auth/me']);
    expect(useLocationStore.getState().activeLocationId).toBe('l-125');
  });
});
