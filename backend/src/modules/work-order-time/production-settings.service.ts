import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateProductionSettingsDto } from './dto';
import { WorkOrderTimeRepository } from './work-order-time.repository';

/** Horas al mes para el valor hora: jornada de 42 h semanales (julio de 2026) × 30 ÷ 6. */
export const DEFAULT_HOURLY_DIVISOR = 210;

/** Recargo de la hora extra diurna. */
export const DEFAULT_OVERTIME_FACTOR = 1.25;

/** Mano de obra / venta de una OT desde la que se marca en naranja y en rojo (%). */
export const DEFAULT_LABOR_SHARE_WARNING_PCT = 15;
export const DEFAULT_LABOR_SHARE_CRITICAL_PCT = 30;

/** Lo que usa el cálculo del reporte; los umbrales van como fracción (0,15). */
export interface CostSettings {
  hourlyDivisor: number;
  overtimeFactor: number;
  laborShareWarning: number;
  laborShareCritical: number;
}

/**
 * Parámetros del reporte de productividad que gerencia edita desde el CRM:
 * divisor del valor hora, recargo de la hora extra y umbrales del semáforo de
 * mano de obra frente a la venta. Viven en una sola fila; si faltara, rigen los
 * valores con que arrancó el reporte.
 */
@Injectable()
export class ProductionSettingsService {
  constructor(private readonly repository: WorkOrderTimeRepository) {}

  async get() {
    const row = await this.repository.findProductionSettings();
    return {
      hourlyDivisor: row ? Number(row.hourlyDivisor) : DEFAULT_HOURLY_DIVISOR,
      overtimeFactor: row ? Number(row.overtimeFactor) : DEFAULT_OVERTIME_FACTOR,
      laborShareWarningPct: row ? Number(row.laborShareWarningPct) : DEFAULT_LABOR_SHARE_WARNING_PCT,
      laborShareCriticalPct: row ? Number(row.laborShareCriticalPct) : DEFAULT_LABOR_SHARE_CRITICAL_PCT,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async getCostSettings(): Promise<CostSettings> {
    const s = await this.get();
    return {
      hourlyDivisor: s.hourlyDivisor,
      overtimeFactor: s.overtimeFactor,
      laborShareWarning: s.laborShareWarningPct / 100,
      laborShareCritical: s.laborShareCriticalPct / 100,
    };
  }

  async update(dto: UpdateProductionSettingsDto, userId: string) {
    if (dto.laborShareWarningPct >= dto.laborShareCriticalPct) {
      throw new BadRequestException('El umbral de atención debe ser menor que el de alerta.');
    }
    await this.repository.saveProductionSettings({ ...dto, updatedById: userId });
    return this.get();
  }
}
