import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VoidPayrollPaymentDto {
  @ApiProperty({ example: 'Se registró en efectivo pero fue transferencia' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la anulación es obligatorio' })
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  @MaxLength(500)
  reason: string;
}
