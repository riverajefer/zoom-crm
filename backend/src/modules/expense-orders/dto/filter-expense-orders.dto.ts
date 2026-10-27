import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseOrderStatus } from '../../../generated/prisma';
import { MAX_PAGE_SIZE } from '../../../common/dto/pagination.dto';

export class FilterExpenseOrdersDto {
  @ApiPropertyOptional({ enum: ExpenseOrderStatus, description: 'Filtrar por estado' })
  @IsEnum(ExpenseOrderStatus)
  @IsOptional()
  status?: ExpenseOrderStatus;

  @ApiPropertyOptional({ description: 'Filtrar por ID de OT asociada' })
  @IsUUID()
  @IsOptional()
  workOrderId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de ítem de OT asociado' })
  @IsUUID()
  @IsOptional()
  workOrderItemId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de tipo de gasto' })
  @IsUUID()
  @IsOptional()
  expenseTypeId?: string;

  @ApiPropertyOptional({ description: 'Búsqueda por número OG o nombre de usuario' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Fecha de creación desde (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  createdAtFrom?: string;

  @ApiPropertyOptional({ description: 'Fecha de creación hasta (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  createdAtTo?: string;

  @ApiPropertyOptional({ default: 1, description: 'Página' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Resultados por página' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number = 20;
}
