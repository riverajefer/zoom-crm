import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpenseOrderEditRequestDto {
  @ApiProperty({ description: 'ID de la orden de gasto pagada' })
  @IsUUID()
  expenseOrderId: string;

  @ApiProperty({
    description: 'Qué hay que corregir y por qué (ej. "Se olvidó incluir el IVA")',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo de la edición' })
  @MaxLength(500)
  reason: string;
}
