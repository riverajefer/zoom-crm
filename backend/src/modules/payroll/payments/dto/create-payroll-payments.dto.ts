import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** La nómina se paga en efectivo o por transferencia; nada más. */
export const PAYROLL_PAYMENT_METHODS = ['CASH', 'TRANSFER'] as const;
export type PayrollPaymentMethod = (typeof PAYROLL_PAYMENT_METHODS)[number];

export class PayrollPaymentLineDto {
  @ApiProperty({ example: 612000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El monto de cada pago debe ser mayor a 0' })
  amount: number;

  @ApiProperty({ enum: PAYROLL_PAYMENT_METHODS, example: 'CASH' })
  @IsIn(PAYROLL_PAYMENT_METHODS, {
    message: 'El método de pago debe ser efectivo o transferencia',
  })
  paymentMethod: PayrollPaymentMethod;

  @ApiPropertyOptional({ description: 'Número de comprobante de la transferencia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ example: 'Bancolombia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankEntity?: string;
}

export class CreatePayrollPaymentsDto {
  @ApiProperty({ description: 'Fecha en que se entregó el dinero', example: '2026-10-15' })
  @IsDateString()
  paidAt: string;

  @ApiProperty({
    type: [PayrollPaymentLineDto],
    description:
      'Una línea por método. Un pago mixto (efectivo + transferencia) son dos líneas.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe registrar al menos un pago' })
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PayrollPaymentLineDto)
  lines: PayrollPaymentLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
