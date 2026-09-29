import { getLocationScope } from '../../common/utils/location-context';
import { runWithAuditContext } from '../../common/utils/audit-context';
import { SedesDashboardService, TOTAL_KEY, weeksBetween } from './sedes-dashboard.service';

const map = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('SedesDashboardService', () => {
  const locations = [
    { id: 'l-104', code: '104', name: 'Local 104', type: 'STORE', color: '#1' },
    { id: 'l-119', code: '119', name: 'Local 119', type: 'STORE', color: '#2' },
    { id: 'l-mat', code: 'MAT', name: 'Matriz', type: 'HEADQUARTERS', color: '#3' },
  ];

  const makeRepository = () => {
    const scopes: unknown[] = [];
    const track =
      <T>(value: T) =>
      async () => {
        scopes.push(getLocationScope());
        return value;
      };
    return {
      scopes,
      activeLocations: jest.fn(track(locations)),
      sales: jest.fn(async (gte: Date, _lte: Date) => {
        scopes.push(getLocationScope());
        // El periodo anterior (el que empieza antes) vendió la mitad.
        const previous = gte < new Date('2026-09-01T05:00:00.000Z');
        return {
          amount: map(previous ? { 'l-104': 500 } : { 'l-104': 1000, 'l-119': 3000 }),
          count: map(previous ? { 'l-104': 1 } : { 'l-104': 2, 'l-119': 1 }),
        };
      }),
      collections: jest.fn(track({ cash: map({ 'l-104': 800, 'l-119': 1000 }), credit: map({ 'l-119': 200 }) })),
      paidExpenseOrders: jest.fn(track(map({ 'l-104': 300, 'l-mat': 900 }))),
      paidAccountsPayable: jest.fn(track(map({ 'l-mat': 100 }))),
      receivables: jest.fn(track({ amount: map({ 'l-119': 2000 }), count: map({ 'l-119': 1 }) })),
      quotes: jest.fn(track({ total: map({ 'l-104': 4 }), converted: map({ 'l-104': 1 }) })),
      weeklyTrend: jest.fn(
        track({
          sales: [{ week: '2026-09-07', locationId: 'l-104', amount: 1000 }],
          expenses: [{ week: '2026-09-14', locationId: 'l-mat', amount: 900 }],
        }),
      ),
      expensesByType: jest.fn(
        track([
          { type: 'Nómina', locationId: 'l-mat', amount: 900 },
          { type: 'Operativos', locationId: 'l-104', amount: 300 },
          { type: 'Operativos', locationId: 'l-mat', amount: 100 },
        ]),
      ),
      suppliesConsumption: jest.fn(
        track([
          { supplyId: 's-1', name: 'Vinilo', unit: 'm', locationId: 'l-104', quantity: 2, value: 50 },
          { supplyId: 's-1', name: 'Vinilo', unit: 'm', locationId: 'l-119', quantity: 1, value: 25 },
          { supplyId: 's-2', name: 'Tinta', unit: 'ml', locationId: 'l-119', quantity: 10, value: 100 },
        ]),
      ),
    };
  };

  const run = async (repository = makeRepository()) => {
    const service = new SedesDashboardService(repository as any);
    // El admin con el 104 activo: el dashboard igual cubre todas las sedes.
    const result = await runWithAuditContext(
      { location: { locationId: 'l-104', all: false, permittedIds: ['l-104'], viewAll: true } },
      () => service.getDashboard({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }),
    );
    return { result, repository };
  };

  it('consulta todas las sedes sin el filtro de la sede activa', async () => {
    const { repository } = await run();
    expect(repository.scopes.length).toBeGreaterThan(0);
    expect(repository.scopes.every((s) => s === null)).toBe(true);
  });

  it('arma las cifras de cada sede con las definiciones del plan', async () => {
    const { result } = await run();
    const m104 = result.metrics['l-104'];

    expect(m104).toMatchObject({
      ventas: 1000,
      ordenes: 2,
      ticketPromedio: 500,
      cotizaciones: 4,
      cotizacionesConvertidas: 1,
      conversion: 0.25,
      recaudo: 800,
      gastosOg: 300,
      gastos: 300,
      resultado: 500,
    });
    // El saldo a favor aplicado va aparte: no suma al recaudo ni al resultado.
    expect(result.metrics['l-119']).toMatchObject({ recaudo: 1000, saldoAFavorAplicado: 200, resultado: 1000 });
    // La Matriz solo gasta, y sus gastos no se reparten.
    expect(result.metrics['l-mat']).toMatchObject({ ventas: 0, gastos: 1000, resultado: -1000, ticketPromedio: null, conversion: null });
  });

  it('el total de la empresa es la suma de las sedes, Matriz incluida', async () => {
    const { result } = await run();
    expect(result.metrics[TOTAL_KEY]).toMatchObject({
      ventas: 4000,
      ordenes: 3,
      recaudo: 1800,
      saldoAFavorAplicado: 200,
      gastos: 1300,
      resultado: 500,
      cartera: 2000,
    });
  });

  it('compara contra el periodo anterior de la misma duración', async () => {
    const { result, repository } = await run();
    expect(result.previous[TOTAL_KEY].ventas).toBe(500);
    expect(result.previous['l-104'].ventas).toBe(500);
    const [[prevFrom, prevTo]] = repository.sales.mock.calls.filter(([gte]) => gte < result.period.from);
    expect(prevTo.getTime()).toBe(result.period.from.getTime() - 1);
    expect(prevTo.getTime() - prevFrom.getTime()).toBe(result.period.to.getTime() - result.period.from.getTime());
  });

  it('la tendencia tiene una serie por sede con un valor por semana', async () => {
    const { result } = await run();
    const i = result.trend.weeks.indexOf('2026-09-07');
    expect(result.trend.series['l-104'].ventas[i]).toBe(1000);
    expect(result.trend.series['l-119'].ventas.every((v) => v === 0)).toBe(true);
    expect(result.trend.series['l-mat'].gastos[result.trend.weeks.indexOf('2026-09-14')]).toBe(900);
  });

  it('agrupa gastos por tipo e insumos por sede, de mayor a menor', async () => {
    const { result } = await run();
    expect(result.expensesByType.map((t) => [t.type, t.total])).toEqual([
      ['Nómina', 900],
      ['Operativos', 400],
    ]);
    expect(result.supplies.byLocation).toEqual({ 'l-104': 50, 'l-119': 125 });
    expect(result.supplies.top.map((s) => [s.name, s.value])).toEqual([
      ['Tinta', 100],
      ['Vinilo', 75],
    ]);
  });
});

describe('weeksBetween', () => {
  it('devuelve el lunes de cada semana, en hora de Bogotá', () => {
    // Septiembre de 2026 empieza un martes; el 1 a las 00:00 de Bogotá son las 05:00 UTC.
    const weeks = weeksBetween(new Date('2026-09-01T05:00:00.000Z'), new Date('2026-10-01T04:59:59.999Z'));
    expect(weeks).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('un domingo por la noche en Bogotá sigue siendo de esa semana', () => {
    // Domingo 13 a las 23:00 de Bogotá = lunes 14 a las 04:00 UTC.
    expect(weeksBetween(new Date('2026-09-14T04:00:00.000Z'), new Date('2026-09-14T04:00:00.000Z'))).toEqual([
      '2026-09-07',
    ]);
  });
});
