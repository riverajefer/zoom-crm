import { scopeLocationQuery, scopeWhere, LOCATION_SCOPED_MODELS } from './location-scope.extension';
import { runWithAuditContext } from '../common/utils/audit-context';
import { withoutLocationScope } from '../common/utils/location-context';

/**
 * Filtro de sede de la extensión de Prisma (solo Zoom, docs/PLAN_SEDES.md §15.1).
 * Se prueba el hook `$allOperations` directamente.
 */
const run = (model: string, operation: string, args: any) => {
  const query = jest.fn(async (a: any) => a);
  return scopeLocationQuery({ model, operation, args, query }).then(() => query.mock.calls[0][0]);
};

const asUser = <T>(location: any, fn: () => Promise<T>) => runWithAuditContext({ location }, fn);
const SEDE_125 = { locationId: 'l-125', all: false, permittedIds: ['l-125'], viewAll: false };

describe('location-scope extension', () => {
  it('filtra por la sede activa los documentos con sede', async () => {
    const args = await asUser(SEDE_125, () => run('Order', 'findMany', { where: { status: 'CONFIRMED' } }));

    expect(args.where).toEqual({ status: 'CONFIRMED', locationId: { in: ['l-125'] } });
  });

  it('un documento de otra sede no existe también por id y al escribir', async () => {
    for (const operation of ['findUnique', 'update', 'delete', 'updateMany']) {
      const args = await asUser(SEDE_125, () => run('Quote', operation, { where: { id: 'q1' } }));
      expect(args.where).toEqual({ id: 'q1', locationId: { in: ['l-125'] } });
    }
  });

  it('no toca modelos sin sede ni los create', async () => {
    const payment = await asUser(SEDE_125, () => run('Payment', 'findMany', { where: {} }));
    const create = await asUser(SEDE_125, () => run('Order', 'create', { data: { x: 1 } }));

    expect(payment.where).toEqual({});
    expect(create).toEqual({ data: { x: 1 } });
  });

  it('un usuario sin sede no ve documentos de ninguna', async () => {
    const args = await asUser({ locationId: null, all: false, permittedIds: [] }, () =>
      run('Order', 'findMany', {}),
    );

    expect(args.where).toEqual({ locationId: { in: [] } });
  });

  it('en "Todas", fuera de un request o dentro de withoutLocationScope no filtra', async () => {
    const all = await asUser({ locationId: null, all: true, permittedIds: [] }, () => run('Order', 'findMany', {}));
    const cron = await run('Order', 'findMany', {});
    const bypass = await asUser(SEDE_125, () => withoutLocationScope(() => run('Order', 'findMany', {})));

    expect(all.where).toBeUndefined();
    expect(cron.where).toBeUndefined();
    expect(bypass.where).toBeUndefined();
  });

  it('a quien opera en todas las sedes solo le filtra los listados', async () => {
    const admin = { ...SEDE_125, viewAll: true };
    const list = await asUser(admin, () => run('Order', 'findMany', {}));
    const count = await asUser(admin, () => run('Order', 'count', {}));
    const byId = await asUser(admin, () => run('Order', 'findUnique', { where: { id: 'o-119' } }));
    const write = await asUser(admin, () => run('Order', 'update', { where: { id: 'o-119' }, data: {} }));

    expect(list.where).toEqual({ locationId: { in: ['l-125'] } });
    expect(count.where).toEqual({ locationId: { in: ['l-125'] } });
    expect(byId.where).toEqual({ id: 'o-119' });
    expect(write.where).toEqual({ id: 'o-119' });
  });

  it('respeta una sede explícita en el where', () => {
    expect(scopeWhere({ locationId: 'l-119' }, ['l-125'])).toEqual({ locationId: 'l-119' });
  });

  it('cubre los 8 documentos del plan', () => {
    expect([...LOCATION_SCOPED_MODELS].sort()).toEqual(
      ['AccountPayable', 'CashRegister', 'DtfRecord', 'ExpenseOrder', 'Order', 'ProductionOrder', 'Quote', 'WorkOrder'],
    );
  });
});
