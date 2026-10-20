import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** El supervisor finaliza la tarea en curso de otro operario. */
export class CloseTimeEntryDto {
  @ApiProperty({
    description: 'Por qué la finaliza el supervisor (obligatorio)',
    example: 'El operario salió sin finalizar; la máquina terminó a esta hora',
  })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(8, { message: 'El motivo debe tener al menos 8 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres' })
  reason: string;
}
