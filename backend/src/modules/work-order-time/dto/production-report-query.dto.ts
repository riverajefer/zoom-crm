import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ProductionReportQueryDto {
  @ApiProperty({ description: 'Primer día (YYYY-MM-DD, calendario de Colombia)', example: '2026-10-01' })
  @Matches(DAY, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD' })
  from: string;

  @ApiProperty({ description: 'Último día, incluido (YYYY-MM-DD)', example: '2026-10-15' })
  @Matches(DAY, { message: 'La fecha final debe tener el formato AAAA-MM-DD' })
  to: string;

  @ApiProperty({ description: 'Área de producción del cargo del operario', required: false })
  @IsUUID('all', { message: 'El área no es válida' })
  @IsOptional()
  areaId?: string;

  @ApiProperty({ description: 'Operario', required: false })
  @IsUUID('all', { message: 'El operario no es válido' })
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: 'Solo tareas hechas en esta máquina', required: false })
  @IsUUID('all', { message: 'La máquina no es válida' })
  @IsOptional()
  machineId?: string;
}
