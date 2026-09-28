import { runWithAuditContext } from './audit-context';
import {
  CONSULTA_AUDIT_ACTION,
  findForView,
  LOOKUP_ROWS_PER_LOCATION,
  lookupInOtherLocations,
} from './location-consulta';
import { getLocationScope, RequestLocation } from './location-context';

describe('findForView', () => {
  const doc = { id: 'op-119', locationId: 'l-119' };
  const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };

  const asesor125 = (readOther: boolean): RequestLocation => ({
    locationId: 'l-125',
    all: false,
    permittedIds: ['l-125'],
    readOther,
  });

  /** La consulta del detalle: encuentra el documento solo sin el filtro de sede. */
  const findOnlyWithoutScope = jest.fn(async () => (getLocationScope() === null ? doc : null));

  beforeEach(() => jest.clearAllMocks());

  it('un documento de la sede activa se abre completo y no deja registro', async () => {
    const find = jest.fn(async () => doc);

    const result = await runWithAuditContext({ location: asesor125(true) }, () =>
      findForView(prisma, 'Order', find),
    );

    expect(result).toEqual({ ...doc, accessMode: 'full' });
    expect(find).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('con read_other_locations, uno de otra sede se abre en modo consulta y queda en audit_logs', async () => {
    const result = await runWithAuditContext(
      { userId: 'u-1', ipAddress: '1.2.3.4', location: asesor125(true) },
      () => findForView(prisma, 'Order', findOnlyWithoutScope),
    );

    expect(result).toEqual({ ...doc, accessMode: 'consulta' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: CONSULTA_AUDIT_ACTION,
        model: 'Order',
        recordId: 'op-119',
        userId: 'u-1',
        ipAddress: '1.2.3.4',
        metadata: { locationId: 'l-119', activeLocationId: 'l-125' },
      }),
    });
  });

  it('sin read_other_locations, uno de otra sede no existe', async () => {
    const result = await runWithAuditContext({ location: asesor125(false) }, () =>
      findForView(prisma, 'Order', findOnlyWithoutScope),
    );

    expect(result).toBeNull();
    expect(findOnlyWithoutScope).toHaveBeenCalledTimes(1);
  });

  it('si no existe en ninguna sede devuelve null', async () => {
    const result = await runWithAuditContext({ location: asesor125(true) }, () =>
      findForView(prisma, 'Order', async () => null),
    );

    expect(result).toBeNull();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('un fallo al auditar no impide la consulta', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('db caída'));

    const result = await runWithAuditContext({ location: asesor125(true) }, () =>
      findForView(prisma, 'Order', findOnlyWithoutScope),
    );

    expect(result?.accessMode).toBe('consulta');
  });
});

describe('lookupInOtherLocations', () => {
  const loc = (code: string) => ({ id: `l-${code}`, code, name: `Local ${code}`, color: '#000' });
  const row = (n: number, code: string) => ({ id: `op-${code}-${n}`, locationId: `l-${code}`, location: loc(code) });

  it('busca fuera de la sede activa, sin el filtro de sede, y agrupa por sede con su total', async () => {
    const scopes: unknown[] = [];
    const count = jest.fn(async () => {
      scopes.push(getLocationScope());
      return [
        { locationId: 'l-125', _count: { _all: 1 } },
        { locationId: 'l-119', _count: { _all: 14 } },
      ];
    });
    const find = jest.fn(async (where: any, take: number) => {
      scopes.push(getLocationScope());
      const code = where.AND[1].locationId.replace('l-', '');
      return Array.from({ length: Math.min(take, code === '119' ? 14 : 1) }, (_, i) => row(i, code));
    });

    const groups = await runWithAuditContext(
      { location: { locationId: 'l-104', all: false, permittedIds: ['l-104'], readOther: true } },
      () => lookupInOtherLocations({ status: 'X' }, { count, find }),
    );

    expect(count).toHaveBeenCalledWith({ AND: [{ status: 'X' }, { locationId: { not: 'l-104' } }] });
    expect(scopes.every((s) => s === null)).toBe(true);
    expect(groups.map((g) => [g.location.code, g.total, g.items.length])).toEqual([
      ['119', 14, LOOKUP_ROWS_PER_LOCATION],
      ['125', 1, 1],
    ]);
    expect(groups[0].items[0]).toEqual({ id: 'op-119-0' });
  });

  it('sin coincidencias no consulta filas', async () => {
    const find = jest.fn();
    const groups = await lookupInOtherLocations({}, { count: async () => [], find });
    expect(groups).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
