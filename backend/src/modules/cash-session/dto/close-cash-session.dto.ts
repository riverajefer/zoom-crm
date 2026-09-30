import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DenominationCountItemDto } from './denomination-count-item.dto';

export class CloseCashSessionDto {
  @ApiProperty({
    description: 'Conteo de denominaciones al cierre (conteo ciego)',
    type: [DenominationCountItemDto],
  })
  // Puede ir vacío: una caja cierra en $0 si todo el efectivo se retiró
  // (decisión de Zoom del 2026-09-29; en High era obligatorio al menos un billete).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationCountItemDto)
  denominations: DenominationCountItemDto[];

  @ApiPropertyOptional({ description: 'Observaciones del cierre / motivo de descuadre' })
  @IsOptional()
  @IsString()
  notes?: string;
}
