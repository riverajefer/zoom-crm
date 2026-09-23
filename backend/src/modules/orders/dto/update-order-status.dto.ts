import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Nuevo estado de la orden',
    enum: OrderStatus,
    example: OrderStatus.CONFIRMED,
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({
    description:
      'Solo al anular, y solo lo toma en cuenta un admin: valor de lo pagado ' +
      'que retiene la empresa (COP). Quien anula con autorización usa el valor ' +
      'aprobado en su solicitud. Ausente = 0.',
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  retainedAmount?: number;
}
