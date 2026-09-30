import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DenominationCountItemDto } from './denomination-count-item.dto';

export class OpenCashSessionDto {
  @ApiProperty({ description: 'ID de la caja registradora a abrir' })
  @IsString()
  @IsNotEmpty()
  cashRegisterId: string;

  @ApiProperty({
    description: 'Conteo de denominaciones del fondo de apertura',
    type: [DenominationCountItemDto],
  })
  // Puede ir vacío: una caja abre sin fondo
  // (decisión de Zoom del 2026-09-29; en High era obligatorio al menos un billete).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationCountItemDto)
  denominations: DenominationCountItemDto[];

  @ApiPropertyOptional({ description: 'Observaciones de apertura' })
  @IsOptional()
  @IsString()
  notes?: string;
}
