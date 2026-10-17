import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VoidTimeEntryDto {
  @ApiProperty({ description: 'Motivo de la anulación (obligatorio)', example: 'Se inició en la OT equivocada' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(8, { message: 'El motivo debe tener al menos 8 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres' })
  reason: string;
}
