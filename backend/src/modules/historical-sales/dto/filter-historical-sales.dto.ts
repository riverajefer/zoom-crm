import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { HistoricalSaleStatus } from '../../../generated/prisma';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class FilterHistoricalSalesDto {
  @ApiPropertyOptional({ description: 'Número de OP, cliente, NIT o producto' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Año de la planilla' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Fecha de la venta desde (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'dateFrom debe tener el formato YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fecha de la venta hasta (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'dateTo debe tener el formato YYYY-MM-DD' })
  dateTo?: string;

  @ApiPropertyOptional({ enum: HistoricalSaleStatus })
  @IsOptional()
  @IsEnum(HistoricalSaleStatus)
  status?: HistoricalSaleStatus;

  @ApiPropertyOptional({ description: 'Vendedor, tal como aparece en la planilla' })
  @IsOptional()
  @IsString()
  sellerName?: string;

  @ApiPropertyOptional({ description: 'Sede (dentro de las que el usuario puede ver)' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
