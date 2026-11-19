import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HistoricalSaleStatus } from '../../generated/prisma';
import { FilterHistoricalSalesDto } from './dto';
import { HistoricalSaleFilters, HistoricalSalesRepository } from './historical-sales.repository';

/** Tope de la exportación: el histórico completo son ~5.500 OP. */
export const HISTORICAL_EXPORT_MAX = 20_000;

/** `saleDate` es una columna DATE: se compara con la medianoche UTC del día. */
const toDateOnly = (value?: string) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined);

/**
 * Histórico de ventas (solo Zoom): las OP de las planillas de Excel de
 * 2023-2025, cargadas con `prisma/import-historical-sales.ts`. Es solo de
 * consulta; no toca cartera, caja, comisiones ni verificación de pagos.
 */
@Injectable()
export class HistoricalSalesService {
  constructor(private readonly repository: HistoricalSalesRepository) {}

  private toFilters(dto: FilterHistoricalSalesDto): HistoricalSaleFilters {
    return {
      search: dto.search?.trim() || undefined,
      year: dto.year,
      dateFrom: toDateOnly(dto.dateFrom),
      dateTo: toDateOnly(dto.dateTo),
      status: dto.status,
      sellerName: dto.sellerName?.trim() || undefined,
      locationId: dto.locationId,
    };
  }

  async findAll(dto: FilterHistoricalSalesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const { data, total } = await this.repository.findMany(this.toFilters(dto), page, limit);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSummary(dto: FilterHistoricalSalesDto) {
    const { sales, byStatus, byYear } = await this.repository.summarize(this.toFilters(dto));
    const statuses = Object.fromEntries(
      Object.values(HistoricalSaleStatus).map((s) => [s, { count: 0, total: 0, balance: 0 }]),
    ) as Record<HistoricalSaleStatus, { count: number; total: number; balance: number }>;
    for (const group of byStatus) {
      statuses[group.status] = {
        count: group._count._all,
        total: Number(group._sum.total ?? 0),
        balance: Number(group._sum.balance ?? 0),
      };
    }
    return {
      salesCount: sales._count._all,
      salesTotal: Number(sales._sum.total ?? 0),
      receivedTotal: Number(sales._sum.receivedAmount ?? 0),
      // Solo lo que la planilla dejó "con saldo": en las demás el saldo es ruido
      // de redondeo o de abonos repartidos entre líneas.
      pendingBalance: statuses[HistoricalSaleStatus.WITH_BALANCE].balance,
      byStatus: statuses,
      byYear: byYear.map((y) => ({
        year: y.year,
        count: y._count._all,
        total: Number(y._sum.total ?? 0),
      })),
    };
  }

  getFilterOptions() {
    return this.repository.findFilterOptions();
  }

  async findOne(id: string) {
    const sale = await this.repository.findById(id);
    if (!sale) throw new NotFoundException('La venta histórica no existe o es de otra sede');
    return sale;
  }

  async findForExport(dto: FilterHistoricalSalesDto) {
    const filters = this.toFilters(dto);
    const count = await this.repository.count(filters);
    if (count > HISTORICAL_EXPORT_MAX) {
      throw new BadRequestException(
        `Son ${count} ventas; el máximo para exportar es ${HISTORICAL_EXPORT_MAX}. Acota los filtros.`,
      );
    }
    return this.repository.findForExport(filters, HISTORICAL_EXPORT_MAX);
  }
}
