import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMachineDto {
  @ApiProperty({
    description: 'Nombre de la máquina',
    example: 'Plotter Mimaki CJV150',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name: string;

  @ApiProperty({
    description: 'Descripción de la máquina',
    example: 'Impresión y corte de vinilo',
    required: false,
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'La descripción no puede exceder 500 caracteres' })
  description?: string;

  @ApiProperty({
    description: 'Área de producción donde está la máquina',
    required: false,
  })
  @IsUUID('all', { message: 'El área de producción no es válida' })
  @IsOptional()
  productionAreaId?: string;
}
