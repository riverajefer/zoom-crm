import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';

/** Un total por sede. */
export type ByLocation = Map<string, number>;

/** Semana (lunes, en hora de Bogotá) y sede de una cifra de la tendencia. */
export interface WeeklyRow {
  week: string;
  locationId: string;
  amount: number;
}

/** Fecha y hora UTC guardadas en la base, llevadas a la hora del negocio. */
const bogota = (column: Prisma.Sql) => Prisma.sql`((${column}) AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota'`;

const toMap = (rows: { locationId: string; amount: unknown }[]): ByLocation =>
  new Map(rows.map((r) => [r.locationId, Number(r.amount ?? 0)]));

/**
 * Consultas del dashboard consolidado por sede (docs/PLAN_SEDES.md §7). Todas
 * agrupan por sede y cubren todas las sedes: quien llama las corre sin el
 * filtro del request (`withoutLocationScope`) y exige `view_all_locations`.
 * El SQL crudo no pasa por la extensión de sede, así que tampoco la necesita.
 *
 * Las definiciones de cada cifra están en el plan (§7, "Definiciones") y son
 * las mismas del mini dashboard del listado de OP, para que cuadren con él.
 */
@Injectable()
export class SedesDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async activeLocations() {
    return this.prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true, color: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Ventas: valor de las OP creadas en el periodo (por fecha de la OP), sin las anuladas. */
  async sales(gte: Date, lte: Date) {
    const rows = await this.prisma.order.groupBy({
      by: ['locationId'],
      where: { orderDate: { gte, lte }, status: { not: 'ANULADO' } },
      _sum: { total: true },
      _count: { _all: true },
    });
    return {
      amount: toMap(rows.map((r) => ({ locationId: r.locationId, amount: r._sum.total }))),
      count: toMap(rows.map((r) => ({ locationId: r.locationId, amount: r._count._all }))),
    };
  }

  /** Cotizaciones del periodo y cuántas ya se convirtieron en OP. */
  async quotes(gte: Date, lte: Date) {
    const where: Prisma.QuoteWhereInput = { quoteDate: { gte, lte } };
    const [all, converted] = await Promise.all([
      this.prisma.quote.groupBy({ by: ['locationId'], where, _count: { _all: true } }),
      this.prisma.quote.groupBy({
        by: ['locationId'],
        where: { ...where, orderId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    return {
      total: toMap(all.map((r) => ({ locationId: r.locationId, amount: r._count._all }))),
      converted: toMap(converted.map((r) => ({ locationId: r.locationId, amount: r._count._all }))),
    };
  }

  /**
   * Recaudo: pagos vivos del periodo a OP no anuladas, en la sede de la OP. El
   * saldo a favor aplicado va aparte: esa plata ya se había cobrado en la OP
   * que lo generó, y sumarlo contaría dos veces lo mismo en el total.
   */
  async collections(gte: Date, lte: Date) {
    const rows = await this.prisma.$queryRaw<{ locationId: string; credit: boolean; amount: string }[]>`
      SELECT o.location_id AS "locationId",
             (p.payment_method = 'CREDIT_BALANCE') AS credit,
             COALESCE(SUM(p.amount), 0)::text AS amount
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.is_voided = false
        AND o.status <> 'ANULADO'
        AND p.payment_date >= ${gte} AND p.payment_date <= ${lte}
      GROUP BY 1, 2
    `;
    return {
      cash: toMap(rows.filter((r) => !r.credit)),
      credit: toMap(rows.filter((r) => r.credit)),
    };
  }

  /** Gasto de OG: las que Caja pagó en el periodo, por el total de sus ítems. */
  async paidExpenseOrders(gte: Date, lte: Date): Promise<ByLocation> {
    const rows = await this.prisma.$queryRaw<{ locationId: string; amount: string }[]>`
      SELECT eo.location_id AS "locationId", COALESCE(SUM(eoi.total), 0)::text AS amount
      FROM expense_order_items eoi
      JOIN expense_orders eo ON eo.id = eoi.expense_order_id
      WHERE eo.status = 'PAID'
        AND eo.caja_authorized_at >= ${gte} AND eo.caja_authorized_at <= ${lte}
      GROUP BY 1
    `;
    return toMap(rows);
  }

  /**
   * Gasto de CP: abonos vivos del periodo, **solo de las CP que no salen de una
   * OG**. Toda OG crea su CP al nacer, y el pago de la OG ya se contó arriba.
   */
  async paidAccountsPayable(gte: Date, lte: Date): Promise<ByLocation> {
    const rows = await this.prisma.$queryRaw<{ locationId: string; amount: string }[]>`
      SELECT ap.location_id AS "locationId", COALESCE(SUM(p.amount), 0)::text AS amount
      FROM account_payable_payments p
      JOIN accounts_payable ap ON ap.id = p.account_payable_id
      WHERE p.is_reversed = false
        AND ap.expense_order_id IS NULL
        AND p.payment_date >= ${gte} AND p.payment_date <= ${lte}
      GROUP BY 1
    `;
    return toMap(rows);
  }

  /** Cartera por cobrar hoy: saldo de las OP no anuladas que deben algo (no depende del periodo). */
  async receivables() {
    const rows = await this.prisma.order.groupBy({
      by: ['locationId'],
      where: { status: { not: 'ANULADO' }, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: { _all: true },
    });
    return {
      amount: toMap(rows.map((r) => ({ locationId: r.locationId, amount: r._sum.balance }))),
      count: toMap(rows.map((r) => ({ locationId: r.locationId, amount: r._count._all }))),
    };
  }

  /** Ventas y gastos por semana y sede, con las mismas reglas de arriba. */
  async weeklyTrend(gte: Date, lte: Date): Promise<{ sales: WeeklyRow[]; expenses: WeeklyRow[] }> {
    const week = (column: Prisma.Sql) => Prisma.sql`TO_CHAR(DATE_TRUNC('week', ${bogota(column)}), 'YYYY-MM-DD')`;
    const [sales, expenses] = await Promise.all([
      this.prisma.$queryRaw<{ week: string; locationId: string; amount: string }[]>`
        SELECT ${week(Prisma.sql`o.order_date`)} AS week, o.location_id AS "locationId",
               COALESCE(SUM(o.total), 0)::text AS amount
        FROM orders o
        WHERE o.status <> 'ANULADO' AND o.order_date >= ${gte} AND o.order_date <= ${lte}
        GROUP BY 1, 2
      `,
      this.prisma.$queryRaw<{ week: string; locationId: string; amount: string }[]>`
        SELECT week, "locationId", COALESCE(SUM(amount), 0)::text AS amount FROM (
          SELECT ${week(Prisma.sql`eo.caja_authorized_at`)} AS week, eo.location_id AS "locationId", eoi.total AS amount
          FROM expense_order_items eoi
          JOIN expense_orders eo ON eo.id = eoi.expense_order_id
          WHERE eo.status = 'PAID' AND eo.caja_authorized_at >= ${gte} AND eo.caja_authorized_at <= ${lte}
          UNION ALL
          SELECT ${week(Prisma.sql`p.payment_date`)}, ap.location_id, p.amount
          FROM account_payable_payments p
          JOIN accounts_payable ap ON ap.id = p.account_payable_id
          WHERE p.is_reversed = false AND ap.expense_order_id IS NULL
            AND p.payment_date >= ${gte} AND p.payment_date <= ${lte}
        ) gastos
        GROUP BY 1, 2
      `,
    ]);
    const parse = (rows: { week: string; locationId: string; amount: string }[]) =>
      rows.map((r) => ({ week: r.week, locationId: r.locationId, amount: Number(r.amount) }));
    return { sales: parse(sales), expenses: parse(expenses) };
  }

  /** Gastos pagados del periodo por tipo de gasto y sede (OG y CP, sin contar dos veces). */
  async expensesByType(gte: Date, lte: Date) {
    const rows = await this.prisma.$queryRaw<{ type: string; locationId: string; amount: string }[]>`
      SELECT et.name AS type, g."locationId", COALESCE(SUM(g.amount), 0)::text AS amount FROM (
        SELECT eo.expense_type_id AS type_id, eo.location_id AS "locationId", eoi.total AS amount
        FROM expense_order_items eoi
        JOIN expense_orders eo ON eo.id = eoi.expense_order_id
        WHERE eo.status = 'PAID' AND eo.caja_authorized_at >= ${gte} AND eo.caja_authorized_at <= ${lte}
        UNION ALL
        SELECT ap.expense_type_id, ap.location_id, p.amount
        FROM account_payable_payments p
        JOIN accounts_payable ap ON ap.id = p.account_payable_id
        WHERE p.is_reversed = false AND ap.expense_order_id IS NULL
          AND p.payment_date >= ${gte} AND p.payment_date <= ${lte}
      ) g
      JOIN expense_types et ON et.id = g.type_id
      GROUP BY 1, 2
    `;
    return rows.map((r) => ({ type: r.type, locationId: r.locationId, amount: Number(r.amount) }));
  }

  /**
   * Consumo de insumos del periodo por sede: salidas de inventario (consumo en
   * OT), valoradas al costo del movimiento. Las salidas sin sede (anteriores a
   * la fase 2) no entran.
   */
  async suppliesConsumption(gte: Date, lte: Date) {
    const rows = await this.prisma.$queryRaw<
      { supplyId: string; name: string; unit: string | null; locationId: string; quantity: string; value: string }[]
    >`
      SELECT m.supply_id AS "supplyId", s.name, u.abbreviation AS unit, m.location_id AS "locationId",
             COALESCE(SUM(m.quantity), 0)::text AS quantity,
             COALESCE(SUM(m.quantity * COALESCE(m.unit_cost, 0)), 0)::text AS value
      FROM inventory_movements m
      JOIN supplies s ON s.id = m.supply_id
      LEFT JOIN units_of_measure u ON u.id = s.consumption_unit_id
      WHERE m.type = 'EXIT' AND m.location_id IS NOT NULL
        AND m.created_at >= ${gte} AND m.created_at <= ${lte}
      GROUP BY 1, 2, 3, 4
    `;
    return rows.map((r) => ({
      supplyId: r.supplyId,
      name: r.name,
      unit: r.unit,
      locationId: r.locationId,
      quantity: Number(r.quantity),
      value: Number(r.value),
    }));
  }
}
