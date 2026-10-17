import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Registro olvidado: lo agrega un supervisor cuando el operario no usó el temporizador. */
export class CreateManualTimeEntryDto {
  @ApiProperty({ description: 'ID de la OT' })
  @IsUUID('all', { message: 'La OT no es válida' })
  workOrderId: string;

  @ApiProperty({ description: 'Operario que hizo el trabajo' })
  @IsUUID('all', { message: 'El operario no es válido' })
  userId: string;

  @ApiProperty({ description: 'Ítem de la OT; vacío = tarea general', required: false })
  @IsUUID('all', { message: 'El ítem no es válido' })
  @IsOptional()
  workOrderItemId?: string;

  @ApiProperty({ description: 'Máquina (opcional)', required: false })
  @IsUUID('all', { message: 'La máquina no es válida' })
  @IsOptional()
  machineId?: string;

  @ApiProperty({ description: 'Inicio (ISO)' })
  @IsDateString({}, { message: 'El inicio no es una fecha válida' })
  startAt: string;

  @ApiProperty({ description: 'Fin (ISO)' })
  @IsDateString({}, { message: 'El fin no es una fecha válida' })
  endAt: string;

  @ApiProperty({ description: 'Qué se hizo', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(120, { message: 'La nota no puede exceder 120 caracteres' })
  notes?: string;

  @ApiProperty({ description: 'Por qué se agrega a mano (obligatorio)' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(8, { message: 'El motivo debe tener al menos 8 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres' })
  reason: string;
}
