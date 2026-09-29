import { Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { FinancialQueryDto } from './dto/financial-query.dto';
import { resolvePeriod } from './dashboard-period.util';

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getFinancialDashboard(query: FinancialQueryDto) {
    const { gte, lte, prevGte, prevLte } = this.resolveDateRange(query);

    const [
      totalVentas,
      totalVentasPrev,
      totalGastos,
      totalGastosPrev,
      cuentasPorPagar,
      cuentasPorCobrar,
      monthlyData,
      indicators,
      recentOrders,
      pendingOrders,
      topClients,
    ] = await Promise.all([
      this.repository.getTotalVentas(gte, lte),
      this.repository.getTotalVentas(prevGte, prevLte),
      this.repository.getTotalGastos(gte, lte),
      this.repository.getTotalGastos(prevGte, prevLte),
      this.repository.getCuentasPorPagar(),
      this.repository.getCuentasPorCobrar(),
      this.repository.getMonthlyData(),
      this.repository.getIndicators(),
      this.repository.getRecentOrders(10),
      this.repository.getPendingOrders(10),
      this.repository.getTopClients(5, gte, lte),
    ]);

    const utilidad = totalVentas - totalGastos;
    const utilidadPrev = totalVentasPrev - totalGastosPrev;

    return {
      summary: {
        totalVentas,
        totalVentasPrev,
        totalGastos,
        totalGastosPrev,
        utilidad,
        utilidadPrev,
        cuentasPorPagar,
        cuentasPorCobrar,
      },
      monthlyData: monthlyData.map((m) => ({
        ...m,
        utilidad: m.ventas - m.gastos,
      })),
      indicators: {
        totalClients: indicators.clients,
        totalProducts: indicators.products,
        totalSuppliers: indicators.suppliers,
        totalOP: indicators.orders,
        totalOT: indicators.workOrders,
        totalOG: indicators.expenseOrders,
      },
      recentOrders,
      pendingOrders,
      topClients,
    };
  }

  /**
   * Convierte el filtro de fechas del dashboard en un rango de instantes.
   *
   * Todo se resuelve en hora Colombia, no en la del servidor. Antes usaba
   * `lte.setHours(23, 59, 59, 999)`, que trabaja en la zona del proceso: en
   * Railway el servidor corre en UTC, así que el rango terminaba a las 6:59 p. m.
   * de Colombia y el mes por defecto arrancaba a las 7:00 p. m. del día
   * anterior. El mes por defecto además se calculaba con el calendario del
   * servidor: la última tarde de cada mes, a partir de las 7:00 p. m., el
   * dashboard ya mostraba el mes siguiente en blanco.
   */

  private resolveDateRange(query: FinancialQueryDto) {
    return resolvePeriod(query);
  }
}
