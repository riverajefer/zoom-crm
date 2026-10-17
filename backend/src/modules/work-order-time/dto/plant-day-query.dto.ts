import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class PlantDayQueryDto {
  @ApiPropertyOptional({
    description: 'Día en calendario de Colombia (YYYY-MM-DD); por defecto, hoy',
    example: '2026-10-17',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD' })
  date?: string;
}
