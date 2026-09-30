import { BadRequestException } from '@nestjs/common';
import { runWithAuditContext } from './audit-context';
import {
  getLocationScope,
  LOCATION_NOT_A_STORE,
  LOCATION_REQUIRED,
  queueLocationFilter,
  requireActiveLocationId,
  requireStoreLocationId,
  withoutLocationScope,
} from './location-context';

describe('location-context', () => {
  describe('requireActiveLocationId', () => {
    it('devuelve la sede activa', () => {
      runWithAuditContext({ location: { locationId: 'l-125', all: false, permittedIds: ['l-125'] } }, () => {
        expect(requireActiveLocationId()).toBe('l-125');
      });
    });

    it('en "Todas" o sin sede pide elegir una, con código', () => {
      runWithAuditContext({ location: { locationId: null, all: true, permittedIds: [] } }, () => {
        expect(() => requireActiveLocationId()).toThrow(BadRequestException);
        try {
          requireActiveLocationId();
        } catch (e: any) {
          expect(e.getResponse().code).toBe(LOCATION_REQUIRED);
        }
      });
    });

    it('fuera de un request también falla: quien crea sin request pasa la sede explícita', () => {
      expect(() => requireActiveLocationId()).toThrow(BadRequestException);
    });
  });

  describe('requireStoreLocationId', () => {
    it('en un local devuelve la sede activa', () => {
      runWithAuditContext(
        { location: { locationId: 'l-125', all: false, permittedIds: ['l-125'], locationType: 'STORE' } },
        () => expect(requireStoreLocationId()).toBe('l-125'),
      );
    });

    it('en la Matriz no se crean documentos de venta: 400 con código', () => {
      runWithAuditContext(
        { location: { locationId: 'l-mat', all: false, permittedIds: ['l-mat'], locationType: 'HEADQUARTERS' } },
        () => {
          try {
            requireStoreLocationId();
            fail('debía fallar');
          } catch (e: any) {
            expect(e).toBeInstanceOf(BadRequestException);
            expect(e.getResponse().code).toBe(LOCATION_NOT_A_STORE);
          }
        },
      );
    });
  });

  describe('queueLocationFilter', () => {
    it('un cajero ve solo las solicitudes de su sede activa', () => {
      runWithAuditContext({ location: { locationId: 'l-104', all: false, permittedIds: ['l-104'] } }, () => {
        expect(queueLocationFilter()).toEqual({ locationId: { in: ['l-104'] } });
      });
    });

    it('el admin ve las de todas las sedes aunque tenga una activa', () => {
      runWithAuditContext(
        { location: { locationId: 'l-104', all: false, permittedIds: ['l-104', 'l-119'], viewAll: true } },
        () => expect(queueLocationFilter()).toEqual({}),
      );
    });

    it('en "Todas" o fuera de un request no filtra', () => {
      runWithAuditContext({ location: { locationId: null, all: true, permittedIds: [] } }, () => {
        expect(queueLocationFilter()).toEqual({});
      });
      expect(queueLocationFilter()).toEqual({});
    });
  });

  describe('withoutLocationScope', () => {
    it('quita el filtro solo dentro, y lo restituye al salir', async () => {
      await runWithAuditContext(
        { location: { locationId: 'l-125', all: false, permittedIds: ['l-125'] } },
        async () => {
          await withoutLocationScope(async () => {
            await Promise.resolve();
            expect(getLocationScope()).toBeNull();
          });
          expect(getLocationScope()).toEqual({ locationIds: ['l-125'], listsOnly: false });
        },
      );
    });
  });

  it('withoutLocationScope ejecuta adentro una consulta perezosa (como las de Prisma)', async () => {
    // Un thenable que, como PrismaPromise, lee el contexto recién cuando se espera.
    const lazyQuery = { then: (resolve: (v: unknown) => void) => resolve(getLocationScope()) };

    await runWithAuditContext(
      { location: { locationId: 'l-125', all: false, permittedIds: ['l-125'] } },
      async () => {
        await expect(withoutLocationScope(() => lazyQuery)).resolves.toBeNull();
      },
    );
  });
});
