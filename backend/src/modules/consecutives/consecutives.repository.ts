import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Contadores de numeración. En Zoom hay uno por tipo, **global para todas las
 * sedes**, y no se reinicia por año: `104-OP-0011`, `119-OP-0012`… El número
 * lleva el código de la sede que lo emite, pero la secuencia es una sola
 * (docs/PLAN_SEDES.md §3). La columna `year` se conserva por el esquema
 * heredado de High y queda en 0.
 */
@Injectable()
export class ConsecutivesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera el siguiente número consecutivo de un tipo, con el código de la sede
   * que lo emite. Usa INSERT ... ON CONFLICT atómico para evitar race conditions.
   *
   * Con `source` (tabla y columna donde vive el número), el incremento se toma
   * contra el máximo real de esa tabla, no solo contra el contador. Es lo que
   * hace que el contador no pueda quedar por detrás de los datos: si alguien
   * sembró registros o los insertó a mano, `generateNumber` igual devuelve un
   * número libre en vez de uno ya usado (P2002 al crear).
   *
   * La corrección va aquí y no en cada servicio porque varios de los puntos de
   * creación generan el número dentro de una transacción, donde reintentar no
   * es posible: el primer error aborta la transacción completa.
   */
  async getNextNumber(
    type: string,
    prefix: string,
    locationCode: string,
    source?: { table: string; column: string },
  ): Promise<string> {
    const result = source
      ? await this.getNextNumberFromSource(type, prefix, source)
      : await this.getNextNumberFromCounter(type, prefix);

    if (!result || result.length === 0) {
      throw new Error(`Failed to generate next number for ${type}`);
    }

    return formatNumber(locationCode, prefix, Number(result[0].last_number));
  }

  /**
   * Incremento atómico contra el contador únicamente.
   * Es correcto mientras nadie inserte registros por fuera del contador.
   */
  private async getNextNumberFromCounter(
    type: string,
    prefix: string,
  ): Promise<Array<{ last_number: number }>> {
    return this.prisma.$queryRaw<Array<{ last_number: number }>>`
      INSERT INTO consecutives (id, type, prefix, year, last_number, created_at, updated_at)
      VALUES (gen_random_uuid(), ${type}, ${prefix}, 0, 1, NOW(), NOW())
      ON CONFLICT (type) DO UPDATE SET
        last_number = consecutives.last_number + 1,
        updated_at = NOW()
      RETURNING last_number
    `;
  }

  /**
   * Incremento atómico contra el mayor entre el contador y el máximo real de la
   * tabla destino, **en todas las sedes**. Una sola sentencia: el GREATEST se
   * evalúa con la fila del contador ya bloqueada, así que dos peticiones
   * concurrentes (de la misma sede o de sedes distintas) siguen sin poder
   * obtener el mismo número.
   *
   * El máximo sale de los dígitos finales convertidos a número, no del texto:
   * la numeración crece sin tope y como texto `125-OP-10000` < `125-OP-9999`.
   */
  private async getNextNumberFromSource(
    type: string,
    prefix: string,
    source: { table: string; column: string },
  ): Promise<Array<{ last_number: number }>> {
    const safeTable = source.table.replace(/[^a-z0-9_]/gi, '');
    const safeColumn = source.column.replace(/[^a-z0-9_]/gi, '');

    const maxInTable = `
      SELECT COALESCE(
        MAX(CAST(SUBSTRING("${safeColumn}" FROM '([0-9]+)$') AS INTEGER)), 0
      )
      FROM "${safeTable}"
      WHERE "${safeColumn}" ~ $3
    `;

    return this.prisma.$queryRawUnsafe<Array<{ last_number: number }>>(
      `
      INSERT INTO consecutives (id, type, prefix, year, last_number, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, 0, (${maxInTable}) + 1, NOW(), NOW())
      ON CONFLICT (type) DO UPDATE SET
        last_number = GREATEST(consecutives.last_number, (${maxInTable})) + 1,
        updated_at = NOW()
      RETURNING last_number
      `,
      type,
      prefix,
      numberPattern(prefix),
    );
  }

  /**
   * Obtiene el valor actual de un consecutivo sin incrementarlo.
   */
  async getCurrentNumber(type: string): Promise<number> {
    const consecutive = await this.prisma.consecutive.findUnique({
      where: { type },
    });
    return consecutive ? consecutive.lastNumber : 0;
  }

  async findAll() {
    return this.prisma.consecutive.findMany({
      orderBy: { type: 'asc' },
    });
  }

  async reset(type: string) {
    return this.prisma.consecutive.update({
      where: { type },
      data: { lastNumber: 0 },
    });
  }

  async findLocationCode(locationId: string): Promise<string | null> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { code: true },
    });
    return location?.code ?? null;
  }

  /**
   * Sincroniza el contador de un tipo con el máximo existente en una tabla, en todas las sedes.
   * Útil para recuperar de desincronización entre el consecutivo y los registros reales.
   */
  async syncCounterFromTable(
    type: string,
    tableName: string,
    columnName: string,
    prefix: string,
  ): Promise<void> {
    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');
    const safeColumn = columnName.replace(/[^a-z0-9_]/gi, '');

    // Extrae los dígitos finales del consecutivo (el número), en vez de una posición
    // fija por guiones — así funciona aun con prefijos que contienen guión (ej. "DTF-TEXTIL").
    const maxResult = await this.prisma.$queryRawUnsafe<
      Array<{ max_num: number | null }>
    >(
      `SELECT MAX(CAST(SUBSTRING("${safeColumn}" FROM '([0-9]+)$') AS INTEGER)) as max_num
       FROM "${safeTable}"
       WHERE "${safeColumn}" ~ $1`,
      numberPattern(prefix),
    );

    const maxNum = Number(maxResult[0]?.max_num ?? 0);

    await this.prisma.consecutive.upsert({
      where: { type },
      create: { type, prefix, year: 0, lastNumber: maxNum },
      update: { lastNumber: maxNum },
    });
  }
}

/** `125-OP-0001`: el número se rellena a 4 dígitos y sigue creciendo sin tope. */
export function formatNumber(locationCode: string, prefix: string, n: number): string {
  return `${locationCode}-${prefix}-${n.toString().padStart(4, '0')}`;
}

/**
 * Expresión regular de los números de un prefijo en cualquier sede
 * (`{sede}-{prefijo}-{número}`). Los códigos de sede son `[A-Z0-9]`, así que los
 * números con formato de High (`OP-2026-0001`) que conviven en staging quedan fuera.
 */
function numberPattern(prefix: string): string {
  return `^[A-Z0-9]+-${prefix}-[0-9]+$`;
}
