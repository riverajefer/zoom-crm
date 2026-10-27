import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
  IsNumber,
  IsPositive,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
  ArrayUnique,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../generated/prisma';

export class CreateExpenseItemDto {
  @ApiProperty({ example: 2, description: 'Cantidad' })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 'Resma de papel', description: 'Nombre del gasto' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción del gasto' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'ID del proveedor' })
  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ example: 15000, description: 'Precio unitario' })
  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @ApiProperty({ enum: PaymentMethod, description: 'Método de pago' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Entidad bancaria de origen (solo aplica a transferencias)',
    example: 'Bancolombia',
  })
  @IsString()
  @IsOptional()
  bankEntity?: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs de áreas de producción del ítem' })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  productionAreaIds?: string[];

  @ApiPropertyOptional({ description: 'ID del archivo comprobante de pago (UploadedFile)' })
  @IsUUID()
  @IsOptional()
  receiptFileId?: string;

  @ApiPropertyOptional({ description: 'ID del archivo imagen de referencia (UploadedFile)' })
  @IsUUID()
  @IsOptional()
  referenceFileId?: string;
}

export class CreateExpenseOrderDto {
  @ApiProperty({ description: 'ID del tipo de gasto' })
  @IsUUID()
  @IsNotEmpty()
  expenseTypeId: string;

  @ApiProperty({ description: 'ID de la subcategoría de gasto' })
  @IsUUID()
  @IsNotEmpty()
  expenseSubcategoryId: string;

  @ApiPropertyOptional({ description: 'ID de la OT asociada (opcional)' })
  @IsUUID()
  @IsOptional()
  workOrderId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'IDs de los ítems de la OT a los que aplica el gasto. Vacío = toda la OT. Requiere workOrderId',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  @IsOptional()
  workOrderItemIds?: string[];

  @ApiPropertyOptional({ description: 'ID del usuario al que se autoriza (opcional)' })
  @IsUUID()
  @IsOptional()
  authorizedToId?: string;

  @ApiPropertyOptional({ description: 'ID del usuario responsable (opcional)' })
  @IsUUID()
  @IsOptional()
  responsibleId?: string;

  @ApiPropertyOptional({ description: 'Observaciones generales' })
  @IsString()
  @IsOptional()
  observations?: string;

  @ApiPropertyOptional({ description: 'Área encargada o máquina' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  areaOrMachine?: string;

  @ApiPropertyOptional({ description: 'Aplicar IVA a la orden' })
  @IsBoolean()
  @IsOptional()
  applyIva?: boolean;

  @ApiPropertyOptional({ description: 'Tasa de IVA en decimal (0.19 = 19%)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  ivaRate?: number;

  @ApiPropertyOptional({ description: 'Retefuente en decimal (0.025 = 2.5%), sobre el subtotal' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  retefuenteRate?: number;

  @ApiPropertyOptional({ description: 'ReteICA en decimal (0.00414 = 0.414%), sobre el subtotal' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  reteICARate?: number;

  @ApiPropertyOptional({ description: 'ReteIVA en decimal (0.15 = 15%), sobre el IVA' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  reteIVARate?: number;

  @ApiProperty({ type: [CreateExpenseItemDto], description: 'Ítems de gasto (mínimo 1)' })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateExpenseItemDto)
  items: CreateExpenseItemDto[];

  @ApiPropertyOptional({
    description:
      'Llave de idempotencia generada por el formulario. Si llegan dos peticiones con la misma llave (doble clic, reintento de red), la segunda devuelve la OG ya creada en vez de crear otra.',
  })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;
}
