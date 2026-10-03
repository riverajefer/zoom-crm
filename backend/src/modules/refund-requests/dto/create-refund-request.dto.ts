import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, RefundReason } from '../../../generated/prisma';

export class RefundRequestItemDto {
  @ApiProperty({ description: 'ID del ítem de la orden que se anula' })
  @IsUUID()
  orderItemId: string;

  @ApiProperty({
    description: 'Cantidad que se anula (hasta lo que le queda vivo al ítem)',
    example: 150,
  })
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class CreateRefundRequestDto {
  @ApiProperty({ description: 'ID de la orden' })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'Dinero que sale de la caja hacia el cliente (COP)',
    example: 50000,
  })
  @IsNumber()
  @Min(0)
  refundAmount: number;

  @ApiPropertyOptional({
    description:
      'Ítems de la orden que se anulan. Con ítems, el valor de venta anulado ' +
      'lo calcula el servidor (`reversedAmount` se ignora) y `refundAmount` ' +
      'puede ser 0: la anulación solo baja el saldo de la orden.',
    type: () => [RefundRequestItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundRequestItemDto)
  @IsOptional()
  items?: RefundRequestItemDto[];

  @ApiPropertyOptional({
    description:
      'De lo que valían los ítems anulados, lo que retiene la empresa (COP). ' +
      'Solo aplica cuando vienen ítems.',
    example: 100000,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  retainedAmount?: number;

  @ApiPropertyOptional({
    description:
      'Valor de la venta que se anula (COP). Cero o ausente = devolución de ' +
      'saldo a favor, que no toca el valor de la orden. Mayor que cero = el ' +
      'trabajo no se entregó o no cumplió, y esa parte de la venta deja de existir.',
    example: 200000,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  reversedAmount?: number;

  @ApiPropertyOptional({
    description: 'Motivo de la devolución',
    enum: RefundReason,
    default: RefundReason.CREDIT_BALANCE,
  })
  @IsEnum(RefundReason)
  @IsOptional()
  refundReason?: RefundReason;

  @ApiPropertyOptional({
    description:
      'Método de pago por el que saldrá el dinero de caja. Obligatorio cuando ' +
      '`refundAmount` es mayor que cero.',
    enum: PaymentMethod,
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Entidad bancaria de origen (solo aplica a transferencias)',
    example: 'Bancolombia',
  })
  @IsString()
  @IsOptional()
  bankEntity?: string;

  @ApiPropertyOptional({
    description:
      'Id del archivo de comprobante (solo aplica a transferencias). Una ' +
      'devolución en efectivo ya queda soportada por el recibo de caja.',
  })
  @IsString()
  @IsOptional()
  receiptFileId?: string;

  @ApiProperty({
    description: 'Observación obligatoria (mínimo 5 caracteres)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  observation: string;
}
