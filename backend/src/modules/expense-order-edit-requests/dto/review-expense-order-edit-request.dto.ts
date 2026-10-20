import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewExpenseOrderEditRequestDto {
  @ApiPropertyOptional({ description: 'Notas del revisor (motivo, si se rechaza)' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
