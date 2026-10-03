import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsecutivesRepository } from './consecutives.repository';

type ConsecutiveType =
  | 'ORDER'
  | 'PRODUCTION'
  | 'EXPENSE'
  | 'QUOTE'
  | 'WORK_ORDER'
  | 'PRODUCTION_ORDER'
  | 'CASH_RECEIPT'
  | 'DTF_TEXTIL'
  | 'DTF_UV'
  | 'ACCOUNT_PAYABLE';

/**
 * Dónde vive realmente cada consecutivo. Es la fuente de verdad del número:
 * el contador de `consecutives` es solo una caché que puede quedar atrás
 * (datos sembrados, inserciones manuales, restauración de un backup).
 *
 * `PRODUCTION` no tiene tabla: es un tipo heredado que ya nadie genera. Se deja
 * en `null` explícito para que no se confunda con un olvido.
 */
const CONSECUTIVE_SOURCES: Record<
  ConsecutiveType,
  { table: string; column: string } | null
> = {
  ORDER: { table: 'orders', column: 'order_number' },
  PRODUCTION: null,
  EXPENSE: { table: 'expense_orders', column: 'og_number' },
  QUOTE: { table: 'quotes', column: 'quote_number' },
  WORK_ORDER: { table: 'work_orders', column: 'work_order_number' },
  PRODUCTION_ORDER: { table: 'production_orders', column: 'oprod_number' },
  CASH_RECEIPT: { table: 'cash_movements', column: 'receipt_number' },
  DTF_TEXTIL: { table: 'dtf_records', column: 'consecutive' },
  DTF_UV: { table: 'dtf_records', column: 'consecutive' },
  ACCOUNT_PAYABLE: { table: 'accounts_payable', column: 'ap_number' },
};

/**
 * Mapeo de tipos a prefijos. Centraliza la lógica de prefijos.
 */
const PREFIXES: Record<ConsecutiveType, string> = {
  ORDER: 'OP',
  PRODUCTION: 'PROD',
  EXPENSE: 'OG',
  QUOTE: 'COT',
  WORK_ORDER: 'OT',
  PRODUCTION_ORDER: 'OPROD',
  CASH_RECEIPT: 'RC',
  DTF_TEXTIL: 'DTF-TEXTIL',
  DTF_UV: 'DTF-UV',
  ACCOUNT_PAYABLE: 'CP',
};

/**
 * Numeración de documentos: `{sede}-{prefijo}-{número}`, por ejemplo
 * `125-OP-0001`. En Zoom el número es **global por tipo de documento**, no por
 * sede: después de `104-OP-0011`, la siguiente OP del 119 es `119-OP-0012`. No
 * se reinicia por año (docs/PLAN_SEDES.md §3). Quien genera un número pasa la
 * sede del documento, que solo aporta el código.
 */
@Injectable()
export class ConsecutivesService {
  /** Los códigos de sede no cambian: se cachean. */
  private readonly locationCodes = new Map<string, string>();

  constructor(
    private readonly consecutivesRepository: ConsecutivesRepository,
  ) {}

  /**
   * Genera el siguiente número consecutivo de un tipo, con el código de la
   * sede que lo emite. La secuencia es una sola para todas las sedes.
   *
   * El número se calcula contra el máximo real de la tabla destino, así que no
   * puede devolver uno ya usado aunque el contador esté desincronizado. Sin
   * eso, la creación revienta con P2002 y varios de los puntos de creación
   * (abonos, movimientos de caja, órdenes de producción) generan el número
   * dentro de una transacción, donde no hay forma de reintentar.
   *
   * @returns Número formateado (ej: "104-OP-0011", "119-OP-0012")
   */
  async generateNumber(type: ConsecutiveType, locationId: string): Promise<string> {
    return this.consecutivesRepository.getNextNumber(
      type,
      PREFIXES[type],
      await this.resolveLocationCode(locationId),
      CONSECUTIVE_SOURCES[type] ?? undefined,
    );
  }

  /**
   * Sincroniza el contador con los datos reales de la tabla correspondiente.
   * Se usa para recuperarse de desincronizaciones cuando falla la creación por número duplicado.
   */
  async syncCounter(type: ConsecutiveType): Promise<void> {
    const config = CONSECUTIVE_SOURCES[type];
    if (!config) return;

    return this.consecutivesRepository.syncCounterFromTable(
      type,
      config.table,
      config.column,
      PREFIXES[type],
    );
  }

  /**
   * Obtiene todos los consecutivos
   */
  async findAll() {
    return this.consecutivesRepository.findAll();
  }

  /**
   * Reinicia el contador de un tipo
   */
  async reset(type: ConsecutiveType) {
    return this.consecutivesRepository.reset(type);
  }

  /**
   * Sincroniza el contador de OT con los datos reales de la tabla.
   */
  async syncWorkOrderCounter(): Promise<void> {
    return this.syncCounter('WORK_ORDER');
  }

  private async resolveLocationCode(locationId: string): Promise<string> {
    let code = this.locationCodes.get(locationId);
    if (!code) {
      const found = await this.consecutivesRepository.findLocationCode(locationId);
      if (!found) {
        throw new NotFoundException(`Sede ${locationId} no encontrada`);
      }
      code = found;
      this.locationCodes.set(locationId, code);
    }
    return code;
  }
}
