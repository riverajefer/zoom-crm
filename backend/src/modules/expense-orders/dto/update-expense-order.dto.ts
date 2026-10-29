import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
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
  ArrayUnique,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../generated/prisma';

export class UpdateExpenseItemDto {
  @ApiPropertyOptional({ description: 'ID del ítem (para actualizar existente)' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ example: 2, description: 'Cantidad' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ example: 'Resma de papel', description: 'Nombre del gasto' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Descripción del gasto' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'ID del proveedor' })
  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ example: 15000, description: 'Precio unitario' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ enum: PaymentMethod, description: 'Método de pago' })
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

  @ApiPropertyOptional({ type: [String], description: 'IDs de áreas de producción' })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  productionAreaIds?: string[];

  @ApiPropertyOptional({
    description: 'ID del ítem de la OT al que pertenece la línea (null = toda la OT)',
  })
  @IsUUID()
  @IsOptional()
  workOrderItemId?: string | null;

  @ApiPropertyOptional({ description: 'ID del archivo comprobante de pago' })
  @IsUUID()
  @IsOptional()
  receiptFileId?: string;

  @ApiPropertyOptional({ description: 'ID del archivo imagen de referencia' })
  @IsUUID()
  @IsOptional()
  referenceFileId?: string;
}

export class UpdateExpenseOrderDto {
  @ApiPropertyOptional({ description: 'ID del tipo de gasto' })
  @IsUUID()
  @IsOptional()
  expenseTypeId?: string;

  @ApiPropertyOptional({ description: 'ID de la subcategoría de gasto' })
  @IsUUID()
  @IsOptional()
  expenseSubcategoryId?: string;

  @ApiPropertyOptional({ description: 'ID de la OT asociada (null para quitar)' })
  @IsUUID()
  @IsOptional()
  workOrderId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description:
      'IDs de los ítems de la OT a los que aplica el gasto (reemplaza los actuales). Vacío = toda la OT',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  @IsOptional()
  workOrderItemIds?: string[];

  @ApiPropertyOptional({ description: 'ID del usuario al que se autoriza' })
  @IsUUID()
  @IsOptional()
  authorizedToId?: string;

  @ApiPropertyOptional({ description: 'ID del usuario responsable (null para quitar)' })
  @IsUUID()
  @IsOptional()
  responsibleId?: string | null;

  @ApiPropertyOptional({ description: 'Observaciones generales' })
  @IsString()
  @IsOptional()
  observations?: string;

  @ApiPropertyOptional({ description: 'Comentarios sobre la OG' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comments?: string;

  @ApiPropertyOptional({ description: 'Área encargada o máquina' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  areaOrMachine?: string;

  @ApiPropertyOptional({ description: 'ID de la máquina, del área encargada (null para quitar)' })
  @IsUUID()
  @IsOptional()
  machineId?: string | null;

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

  @ApiPropertyOptional({ type: [UpdateExpenseItemDto], description: 'Ítems de gasto (reemplaza todos)' })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => UpdateExpenseItemDto)
  items?: UpdateExpenseItemDto[];
}
