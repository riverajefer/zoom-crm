import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { LOCATION_NOT_ALLOWED, LocationContextInterceptor } from './location-context.interceptor';
import { runWithAuditContext } from '../utils/audit-context';
import { getRequestLocation } from '../utils/location-context';

/**
 * Sedes de prueba: 104, 119, 125 activas y MAT.
 * - `u-apoyo`: permitido en 125 y 119, predeterminada 125, con `read_other_locations`.
 * - `u-sin-sede`: sin sedes.
 * - `u-admin`: con `view_all_locations`.
 */
const ACTIVE = ['l-104', 'l-119', 'l-125', 'l-mat'];
const USERS: Record<string, any> = {
  'u-apoyo': {
    defaultLocationId: 'l-125',
    locations: [{ locationId: 'l-119', location: { type: 'STORE' } }, { locationId: 'l-125', location: { type: 'STORE' } }],
    role: { permissions: [{ permission: { name: 'read_other_locations' } }] },
  },
  'u-sin-sede': { defaultLocationId: null, locations: [], role: { permissions: [] } },
  'u-admin': { defaultLocationId: null, locations: [], role: { permissions: [{ permission: { name: 'view_all_locations' } }] } },
  'u-pred-vieja': {
    defaultLocationId: 'l-104',
    locations: [{ locationId: 'l-119', location: { type: 'STORE' } }],
    role: { permissions: [] },
  },
};

describe('LocationContextInterceptor', () => {
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }: any) => USERS[where.id] ?? null) },
    location: {
      findMany: jest.fn(async () => ACTIVE.map((id) => ({ id, type: id === 'l-mat' ? 'HEADQUARTERS' : 'STORE' }))),
    },
    // Sin apoyos en otra sede, salvo en las pruebas del final
    locationSupport: { findFirst: jest.fn(async (): Promise<any> => null) },
    cashSession: { findFirst: jest.fn(async (): Promise<any> => null) },
  };
  const interceptor = new LocationContextInterceptor(prisma as any);

  /** Corre el interceptor dentro de un contexto de request, como en la app. */
  async function run(userId: string | undefined, header?: string) {
    const request: any = { headers: header ? { 'x-location-id': header } : {}, user: userId ? { id: userId } : undefined };
    const context: any = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return runWithAuditContext({}, async () => {
      await interceptor.intercept(context, { handle: () => of(null) });
      return { request, stored: getRequestLocation() };
    });
  }

  afterEach(() => jest.clearAllMocks());

  it('sin header usa la sede predeterminada y la deja en el contexto del request', async () => {
    const { request, stored } = await run('u-apoyo');

    expect(stored).toEqual({
      locationId: 'l-125',
      all: false,
      permittedIds: ['l-119', 'l-125'],
      viewAll: false,
      readOther: true,
      locationType: 'STORE',
      supportId: null,
    });
    expect(request.location).toEqual(stored);
  });

  it('con header acepta una sede permitida', async () => {
    const { stored } = await run('u-apoyo', 'l-119');

    expect(stored?.locationId).toBe('l-119');
  });

  it('una sede no permitida es 403 con código, nunca un cambio silencioso', async () => {
    await expect(run('u-apoyo', 'l-104')).rejects.toThrow(ForbiddenException);
    await expect(run('u-apoyo', 'l-104')).rejects.toMatchObject({
      response: { code: LOCATION_NOT_ALLOWED },
    });
  });

  it('la vista "Todas" exige view_all_locations', async () => {
    await expect(run('u-apoyo', 'all')).rejects.toThrow(ForbiddenException);

    const { stored } = await run('u-admin', 'all');
    expect(stored).toEqual({
      locationId: null,
      all: true,
      permittedIds: ACTIVE,
      viewAll: true,
      readOther: false,
      locationType: null,
    });
  });

  it('con view_all_locations cualquier sede activa está permitida', async () => {
    const { stored } = await run('u-admin', 'l-mat');

    expect(stored?.locationId).toBe('l-mat');
  });

  it('deja el tipo de la sede activa: la Matriz no es un local', async () => {
    const { stored } = await run('u-admin', 'l-mat');
    expect(stored?.locationType).toBe('HEADQUARTERS');
  });

  it('sin sede predeterminada válida toma la primera permitida', async () => {
    const { stored } = await run('u-pred-vieja');

    expect(stored?.locationId).toBe('l-119');
  });

  it('un usuario sin sedes queda sin sede activa (la fase 2 decidirá qué puede hacer)', async () => {
    const { stored } = await run('u-sin-sede');

    expect(stored).toEqual({
      locationId: null,
      all: false,
      permittedIds: [],
      viewAll: false,
      readOther: false,
      locationType: null,
      supportId: null,
    });
  });

  it('sin usuario (ruta pública) no consulta nada', async () => {
    const { stored } = await run(undefined, 'l-104');

    expect(stored).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // Solo Zoom: apoyo en otra sede (docs/PLAN_SEDES.md §16)
  describe('con un apoyo en otra sede vigente', () => {
    const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())}T00:00:00.000Z`);
    const support = (endDate: Date) => ({
      id: 's-1',
      locationId: 'l-104',
      endDate,
      location: { id: 'l-104', name: 'Local 104', type: 'STORE' },
    });

    it('la sede del apoyo es la única permitida y la de entrada', async () => {
      prisma.locationSupport.findFirst.mockResolvedValueOnce(support(today));

      const { stored } = await run('u-apoyo');

      expect(stored).toMatchObject({ locationId: 'l-104', permittedIds: ['l-104'], supportId: 's-1' });
    });

    it('sus sedes fijas quedan bloqueadas mientras dura: 403 que nombra la sede del apoyo', async () => {
      prisma.locationSupport.findFirst.mockResolvedValue(support(today));

      await expect(run('u-apoyo', 'l-125')).rejects.toMatchObject({
        response: { code: LOCATION_NOT_ALLOWED, message: 'Estás de apoyo en Local 104' },
      });
      prisma.locationSupport.findFirst.mockResolvedValue(null);
    });

    it('vencido con su caja abierta en esa sede, sigue vigente para que pueda cerrarla', async () => {
      prisma.locationSupport.findFirst.mockResolvedValueOnce(support(new Date(today.getTime() - 86_400_000)));
      prisma.cashSession.findFirst.mockResolvedValueOnce({ id: 'cs-1' });

      const { stored } = await run('u-apoyo');

      expect(stored).toMatchObject({ locationId: 'l-104', permittedIds: ['l-104'] });
    });

    it('vencido sin caja abierta en esa sede, vuelve a sus sedes fijas', async () => {
      prisma.locationSupport.findFirst.mockResolvedValueOnce(support(new Date(today.getTime() - 86_400_000)));

      const { stored } = await run('u-apoyo');

      expect(stored).toMatchObject({ locationId: 'l-125', permittedIds: ['l-119', 'l-125'], supportId: null });
    });

    it('quien ve todas las sedes no tiene apoyos: ni se consultan', async () => {
      await run('u-admin');

      expect(prisma.locationSupport.findFirst).not.toHaveBeenCalled();
    });
  });
});
