import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReturnExpenseOrderForCorrectionDto {
  @ApiProperty({
    description: 'Qué hay que corregir',
    example: 'El ítem 3 no coincide con el valor de la factura',
  })
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  reason: string;
}
