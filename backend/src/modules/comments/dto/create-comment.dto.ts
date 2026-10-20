import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CommentEntityType } from '../../../generated/prisma';

export class CreateCommentDto {
  @ApiProperty({ description: 'Contenido del comentario', maxLength: 2000 })
  @IsString()
  @IsNotEmpty({ message: 'El contenido del comentario no puede estar vacío' })
  @MaxLength(2000, { message: 'El comentario no puede superar los 2000 caracteres' })
  content: string;

  @ApiProperty({ enum: CommentEntityType, description: 'Tipo de entidad (QUOTE, ORDER, WORK_ORDER, EXPENSE_ORDER)' })
  @IsEnum(CommentEntityType, { message: 'entityType debe ser QUOTE, ORDER, WORK_ORDER o EXPENSE_ORDER' })
  entityType: CommentEntityType;

  @ApiProperty({ description: 'ID de la entidad (cotización, orden, orden de trabajo u orden de gasto)' })
  @IsUUID('4', { message: 'entityId debe ser un UUID válido' })
  entityId: string;

  @ApiPropertyOptional({ description: 'ID del comentario padre (para respuestas en hilo)' })
  @IsOptional()
  @IsUUID('4', { message: 'parentId debe ser un UUID válido' })
  parentId?: string;
}
