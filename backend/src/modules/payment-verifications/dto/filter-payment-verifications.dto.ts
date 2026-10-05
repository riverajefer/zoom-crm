import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PaymentAccountingStatus, PaymentMethod } from '../../../generated/prisma';

export class FilterPaymentVerificationsDto {
  @ApiPropertyOptional({ enum: PaymentAccountingStatus, default: PaymentAccountingStatus.PENDING })
  @IsOptional()
  @IsEnum(PaymentAccountingStatus)
  status?: PaymentAccountingStatus = PaymentAccountingStatus.PENDING;

  @ApiPropertyOptional({ description: 'Fecha del pago desde (YYYY-MM-DD, hora Colombia)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fecha del pago hasta (YYYY-MM-DD, hora Colombia)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Usuario que recibió el pago' })
  @IsOptional()
  @IsUUID()
  receivedById?: string;

  @ApiPropertyOptional({ description: 'Sede de la orden (dentro de las que el usuario puede ver)' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Número de OP, cliente o referencia del pago' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
