import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HistoricalSaleStatus, Prisma } from '../../generated/prisma';
import { queueLocationFilter } from '../../common/utils/location-context';

export interface HistoricalSaleFilters {
  search?: string;
  year?: number;
  dateFrom?: Date;
  dateTo?: Date;
  status?: HistoricalSaleStatus;
  sellerName?: string;
  locationId?: string;
}

/** Lo que no fue venta: no suma en los totales del resumen. */
export const NOT_A_SALE: HistoricalSaleStatus[] = [
  HistoricalSaleStatus.ANNULLED,
  HistoricalSaleStatus.QUOTE,
];

const LOCATION_SELECT = { id: true, code: true, name: true, color: true } as const;

const LIST_SELECT = {
  id: true,
  year: true,
  originalNumber: true,
  saleDate: true,
  clientName: true,
  clientNit: true,
  sellerName: true,
  status: true,
  total: true,
  receivedAmount: true,
  balance: true,
  invoiceStatus: true,
  location: { select: LOCATION_SELECT },
  _count: { select: { items: true } },
} as const;

@Injectable()
export class HistoricalSalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `HistoricalSale` no está en `LOCATION_SCOPED_MODELS`: es un reporte, y se
   * filtra como las bandejas (`queueLocationFilter`). Quien ve todas las sedes
   * recibe el histórico de todas aunque tenga una activa (contabilidad trabaja
   * desde la Matriz, que no tenía planilla); el resto, solo el de su sede.
   */
  buildWhere(filters: HistoricalSaleFilters): Prisma.HistoricalSaleWhereInput {
    const and: Prisma.HistoricalSaleWhereInput[] = [{ ...queueLocationFilter() }];

    if (filters.locationId) and.push({ locationId: filters.locationId });
    if (filters.year) and.push({ year: filters.year });
    if (filters.status) and.push({ status: filters.status });
    if (filters.sellerName) {
      and.push({ sellerName: { equals: filters.sellerName, mode: 'insensitive' } });
    }
    if (filters.dateFrom || filters.dateTo) {
      and.push({
        saleDate: {
          ...(filters.dateFrom && { gte: filters.dateFrom }),
          ...(filters.dateTo && { lte: filters.dateTo }),
        },
      });
    }
    if (filters.search) {
      const contains = { contains: filters.search, mode: 'insensitive' as const };
      const number = /^\d+$/.test(filters.search) ? Number(filters.search) : undefined;
      and.push({
        OR: [
          ...(number !== undefined && number <= 2_147_483_647 ? [{ originalNumber: number }] : []),
          { clientName: contains },
          { clientNit: contains },
          { items: { some: { description: contains } } },
        ],
      });
    }
    return { AND: and };
  }

  async findMany(filters: HistoricalSaleFilters, page: number, limit: number) {
    const where = this.buildWhere(filters);
    const [data, total] = await Promise.all([
      this.prisma.historicalSale.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ saleDate: { sort: 'desc', nulls: 'last' } }, { originalNumber: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.historicalSale.count({ where }),
    ]);
    return { data, total };
  }

  /** Totales de lo que sí fue venta, más el conteo por estado. */
  async summarize(filters: HistoricalSaleFilters) {
    const where = this.buildWhere(filters);
    const [sales, byStatus, byYear] = await Promise.all([
      this.prisma.historicalSale.aggregate({
        where: { AND: [where, { status: { notIn: NOT_A_SALE } }] },
        _count: { _all: true },
        _sum: { total: true, receivedAmount: true },
      }),
      this.prisma.historicalSale.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { total: true, balance: true },
      }),
      this.prisma.historicalSale.groupBy({
        by: ['year'],
        where: { AND: [where, { status: { notIn: NOT_A_SALE } }] },
        _count: { _all: true },
        _sum: { total: true },
        orderBy: { year: 'asc' },
      }),
    ]);
    return { sales, byStatus, byYear };
  }

  /** Vendedores y años que hay en el histórico visible, para los filtros. */
  async findFilterOptions() {
    const where = this.buildWhere({});
    const [sellers, years] = await Promise.all([
      this.prisma.historicalSale.findMany({
        where: { AND: [where, { sellerName: { not: null } }] },
        distinct: ['sellerName'],
        select: { sellerName: true },
        orderBy: { sellerName: 'asc' },
      }),
      this.prisma.historicalSale.findMany({
        where,
        distinct: ['year'],
        select: { year: true },
        orderBy: { year: 'desc' },
      }),
    ]);
    return {
      sellers: sellers.map((s) => s.sellerName as string),
      years: years.map((y) => y.year),
    };
  }

  findById(id: string) {
    return this.prisma.historicalSale.findFirst({
      where: { AND: [{ id }, { ...queueLocationFilter() }] },
      include: {
        location: { select: LOCATION_SELECT },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  /** Todo lo filtrado, con sus líneas, para exportar a Excel. */
  findForExport(filters: HistoricalSaleFilters, max: number) {
    return this.prisma.historicalSale.findMany({
      where: this.buildWhere(filters),
      include: {
        location: { select: LOCATION_SELECT },
        items: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ saleDate: { sort: 'desc', nulls: 'last' } }, { originalNumber: 'desc' }],
      take: max,
    });
  }

  count(filters: HistoricalSaleFilters) {
    return this.prisma.historicalSale.count({ where: this.buildWhere(filters) });
  }
}
