import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { CommentEntityType } from '../../../generated/prisma';

export class FilterCommentsDto {
  @ApiProperty({ enum: CommentEntityType, description: 'Tipo de entidad (QUOTE, ORDER, WORK_ORDER, EXPENSE_ORDER)' })
  @IsEnum(CommentEntityType, { message: 'entityType debe ser QUOTE, ORDER, WORK_ORDER o EXPENSE_ORDER' })
  entityType: CommentEntityType;

  @ApiProperty({ description: 'ID de la entidad' })
  @IsUUID('4', { message: 'entityId debe ser un UUID válido' })
  entityId: string;
}
