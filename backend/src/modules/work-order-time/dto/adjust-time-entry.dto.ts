import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdjustTimeEntryDto {
  @ApiProperty({ description: 'Nuevo inicio (ISO)', required: false })
  @IsDateString({}, { message: 'El inicio no es una fecha válida' })
  @IsOptional()
  startAt?: string;

  @ApiProperty({
    description: 'Nuevo fin (ISO). Omitirlo deja el fin como está; en una tarea en curso, la sigue dejando en curso.',
    required: false,
  })
  @IsDateString({}, { message: 'El fin no es una fecha válida' })
  @IsOptional()
  endAt?: string;

  @ApiProperty({ description: 'Ítem de la OT; null = tarea general', required: false, nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'El ítem no es válido' })
  @IsOptional()
  workOrderItemId?: string | null;

  @ApiProperty({ description: 'Máquina; null = sin máquina', required: false, nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'La máquina no es válida' })
  @IsOptional()
  machineId?: string | null;

  @ApiProperty({ description: 'Nota de la tarea', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(120, { message: 'La nota no puede exceder 120 caracteres' })
  notes?: string;

  @ApiProperty({ description: 'Motivo del ajuste (obligatorio)', example: 'Olvidó finalizar; terminó a las 17:30' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(8, { message: 'El motivo debe tener al menos 8 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres' })
  reason: string;
}
