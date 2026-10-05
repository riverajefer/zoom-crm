import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class VerifyPaymentsDto {
  @ApiProperty({ type: [String], description: 'Pagos que se dan por verificados' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Selecciona al menos un pago' })
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  paymentIds: string[];

  @ApiPropertyOptional({ description: 'Nota de contabilidad' })
  @IsOptional()
  @IsString()
  notes?: string;
}
