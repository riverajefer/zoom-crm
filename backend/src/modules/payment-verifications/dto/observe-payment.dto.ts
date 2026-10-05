import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ObservePaymentDto {
  @ApiProperty({ description: 'Qué encontró contabilidad en el pago' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la observación es obligatorio' })
  @MaxLength(500)
  notes: string;
}
