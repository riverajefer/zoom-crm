import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FilterOrdersDto } from './filter-orders.dto';

/** Filtros del resumen de ventas por asesor. */
export class SalesSummaryQueryDto extends FilterOrdersDto {
  @ApiPropertyOptional({
    description:
      'Sumar las ventas de todas las sedes, no solo de la activa: el avance de la meta de un asesor ' +
      'cuenta todo lo que vendió (docs/PLAN_SEDES.md §10). Solo se atiende para quien ve todas las ' +
      'sedes o para las ventas propias; si no, se ignora.',
    example: true,
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  acrossLocations?: boolean;
}
