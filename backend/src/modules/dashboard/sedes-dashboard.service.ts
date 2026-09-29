import { Injectable } from '@nestjs/common';
import { withoutLocationScope } from '../../common/utils/location-context';
import { ByLocation, SedesDashboardRepository, WeeklyRow } from './sedes-dashboard.repository';
import { resolvePeriod } from './dashboard-period.util';
import { FinancialQueryDto } from './dto/financial-query.dto';

/** Columna de los totales de la empresa en `metrics` y `previous`. */
export const TOTAL_KEY = 'total';

/** Horas que Bogotá está detrás de UTC (sin horario de verano). */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface SedeMetrics {
  ventas: number;
  ordenes: number;
  ticketPromedio: number | null;
  cotizaciones: number;
  cotizacionesConvertidas: number;
  /** De 0 a 1; `null` sin cotizaciones en el periodo. */
  conversion: number | null;
  recaudo: number;
  saldoAFavorAplicado: number;
  gastosOg: number;
  gastosCp: number;
  gastos: number;
  resultado: number;
  cartera: number;
  carteraOrdenes: number;
}

export interface PeriodTotals {
  ventas: number;
  recaudo: number;
  gastos: number;
  resultado: number;
}

const get = (map: ByLocation, id: string) => map.get(id) ?? 0;

/** Lunes (en hora de Bogotá) de cada semana que toca el periodo, como `YYYY-MM-DD`. */
export function weeksBetween(gte: Date, lte: Date): string[] {
  const local = (d: Date) => new Date(d.getTime() - BOGOTA_OFFSET_MS);
  const start = local(gte);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = local(lte);
  const weeks: string[] = [];
  for (const d = start; d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    weeks.push(d.toISOString().slice(0, 10));
  }
  return weeks;
}

/**
 * Dashboard consolidado por sede del admin (docs/PLAN_SEDES.md §7): lo que
 * vendió, cobró y gastó cada sede en un periodo, con la Matriz como una sede
 * más (solo gasta) y el total de la empresa. Cubre todas las sedes sin
 * importar la activa; el controlador exige `view_all_locations`.
 */
@Injectable()
export class SedesDashboardService {
  constructor(private readonly repository: SedesDashboardRepository) {}

  async getDashboard(query: FinancialQueryDto) {
    const { gte, lte, prevGte, prevLte } = resolvePeriod(query);

    return withoutLocationScope(async () => {
      const [locations, current, previous, receivables, quotes, trend, byType, supplies] = await Promise.all([
        this.repository.activeLocations(),
        this.periodFigures(gte, lte),
        this.periodFigures(prevGte, prevLte),
        this.repository.receivables(),
        this.repository.quotes(gte, lte),
        this.repository.weeklyTrend(gte, lte),
        this.repository.expensesByType(gte, lte),
        this.repository.suppliesConsumption(gte, lte),
      ]);

      const ids = locations.map((l) => l.id);
      const metrics: Record<string, SedeMetrics> = {};
      const previousTotals: Record<string, PeriodTotals> = {};

      for (const id of ids) {
        const ventas = get(current.sales.amount, id);
        const ordenes = get(current.sales.count, id);
        const cotizaciones = get(quotes.total, id);
        const cotizacionesConvertidas = get(quotes.converted, id);
        const recaudo = get(current.collections.cash, id);
        const gastosOg = get(current.og, id);
        const gastosCp = get(current.cp, id);
        metrics[id] = {
          ventas,
          ordenes,
          ticketPromedio: ordenes ? ventas / ordenes : null,
          cotizaciones,
          cotizacionesConvertidas,
          conversion: cotizaciones ? cotizacionesConvertidas / cotizaciones : null,
          recaudo,
          saldoAFavorAplicado: get(current.collections.credit, id),
          gastosOg,
          gastosCp,
          gastos: gastosOg + gastosCp,
          resultado: recaudo - gastosOg - gastosCp,
          cartera: get(receivables.amount, id),
          carteraOrdenes: get(receivables.count, id),
        };
        previousTotals[id] = this.totalsOf(previous, id);
      }

      metrics[TOTAL_KEY] = this.sumMetrics(ids.map((id) => metrics[id]));
      previousTotals[TOTAL_KEY] = this.sumTotals(ids.map((id) => previousTotals[id]));

      return {
        period: { from: gte, to: lte, previousFrom: prevGte, previousTo: prevLte },
        locations,
        metrics,
        previous: previousTotals,
        trend: this.buildTrend(weeksBetween(gte, lte), ids, trend),
        expensesByType: this.buildExpensesByType(byType),
        supplies: this.buildSupplies(supplies),
      };
    });
  }

  /** Lo que se compara contra el periodo anterior. */
  private async periodFigures(gte: Date, lte: Date) {
    const [sales, collections, og, cp] = await Promise.all([
      this.repository.sales(gte, lte),
      this.repository.collections(gte, lte),
      this.repository.paidExpenseOrders(gte, lte),
      this.repository.paidAccountsPayable(gte, lte),
    ]);
    return { sales, collections, og, cp };
  }

  private totalsOf(figures: Awaited<ReturnType<SedesDashboardService['periodFigures']>>, id: string): PeriodTotals {
    const recaudo = get(figures.collections.cash, id);
    const gastos = get(figures.og, id) + get(figures.cp, id);
    return { ventas: get(figures.sales.amount, id), recaudo, gastos, resultado: recaudo - gastos };
  }

  private sumTotals(rows: PeriodTotals[]): PeriodTotals {
    return rows.reduce(
      (acc, r) => ({
        ventas: acc.ventas + r.ventas,
        recaudo: acc.recaudo + r.recaudo,
        gastos: acc.gastos + r.gastos,
        resultado: acc.resultado + r.resultado,
      }),
      { ventas: 0, recaudo: 0, gastos: 0, resultado: 0 },
    );
  }

  private sumMetrics(rows: SedeMetrics[]): SedeMetrics {
    const sum = (key: keyof SedeMetrics) => rows.reduce((acc, r) => acc + ((r[key] as number | null) ?? 0), 0);
    const ventas = sum('ventas');
    const ordenes = sum('ordenes');
    const cotizaciones = sum('cotizaciones');
    const cotizacionesConvertidas = sum('cotizacionesConvertidas');
    return {
      ventas,
      ordenes,
      ticketPromedio: ordenes ? ventas / ordenes : null,
      cotizaciones,
      cotizacionesConvertidas,
      conversion: cotizaciones ? cotizacionesConvertidas / cotizaciones : null,
      recaudo: sum('recaudo'),
      saldoAFavorAplicado: sum('saldoAFavorAplicado'),
      gastosOg: sum('gastosOg'),
      gastosCp: sum('gastosCp'),
      gastos: sum('gastos'),
      resultado: sum('resultado'),
      cartera: sum('cartera'),
      carteraOrdenes: sum('carteraOrdenes'),
    };
  }

  /** Una serie por sede con un valor por semana (0 en las semanas sin movimiento). */
  private buildTrend(weeks: string[], ids: string[], rows: { sales: WeeklyRow[]; expenses: WeeklyRow[] }) {
    const series: Record<string, { ventas: number[]; gastos: number[] }> = {};
    for (const id of ids) series[id] = { ventas: weeks.map(() => 0), gastos: weeks.map(() => 0) };
    const place = (list: WeeklyRow[], key: 'ventas' | 'gastos') => {
      for (const row of list) {
        const i = weeks.indexOf(row.week);
        if (i >= 0 && series[row.locationId]) series[row.locationId][key][i] += row.amount;
      }
    };
    place(rows.sales, 'ventas');
    place(rows.expenses, 'gastos');
    return { weeks, series };
  }

  private buildExpensesByType(rows: { type: string; locationId: string; amount: number }[]) {
    const byType = new Map<string, { type: string; total: number; byLocation: Record<string, number> }>();
    for (const row of rows) {
      const entry = byType.get(row.type) ?? { type: row.type, total: 0, byLocation: {} };
      entry.total += row.amount;
      entry.byLocation[row.locationId] = (entry.byLocation[row.locationId] ?? 0) + row.amount;
      byType.set(row.type, entry);
    }
    return [...byType.values()].sort((a, b) => b.total - a.total);
  }

  /** Valor consumido por sede y los 10 insumos de más valor, con su reparto por sede. */
  private buildSupplies(
    rows: { supplyId: string; name: string; unit: string | null; locationId: string; quantity: number; value: number }[],
  ) {
    const byLocation: Record<string, number> = {};
    const bySupply = new Map<
      string,
      { supplyId: string; name: string; unit: string | null; quantity: number; value: number; byLocation: Record<string, number> }
    >();
    for (const row of rows) {
      byLocation[row.locationId] = (byLocation[row.locationId] ?? 0) + row.value;
      const entry = bySupply.get(row.supplyId) ?? {
        supplyId: row.supplyId,
        name: row.name,
        unit: row.unit,
        quantity: 0,
        value: 0,
        byLocation: {},
      };
      entry.quantity += row.quantity;
      entry.value += row.value;
      entry.byLocation[row.locationId] = (entry.byLocation[row.locationId] ?? 0) + row.value;
      bySupply.set(row.supplyId, entry);
    }
    const top = [...bySupply.values()].sort((a, b) => b.value - a.value).slice(0, 10);
    return { byLocation, top };
  }
}
