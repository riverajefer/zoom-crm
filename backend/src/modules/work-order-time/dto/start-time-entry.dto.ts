import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartTimeEntryDto {
  @ApiProperty({ description: 'ID de la OT' })
  @IsUUID('all', { message: 'La OT no es válida' })
  workOrderId: string;

  @ApiProperty({ description: 'Ítem de la OT; vacío = tarea general de la OT', required: false })
  @IsUUID('all', { message: 'El ítem no es válido' })
  @IsOptional()
  workOrderItemId?: string;

  @ApiProperty({ description: 'Máquina en la que se hace la tarea (opcional)', required: false })
  @IsUUID('all', { message: 'La máquina no es válida' })
  @IsOptional()
  machineId?: string;

  @ApiProperty({ description: 'Qué va a hacer (opcional)', required: false, example: 'Laminado' })
  @IsString()
  @IsOptional()
  @MaxLength(120, { message: 'La nota no puede exceder 120 caracteres' })
  notes?: string;
}
