import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GeneralClosingReviewStatus } from '../../../generated/prisma';

export class ReviewRegisterDto {
  @ApiProperty({ enum: GeneralClosingReviewStatus })
  @IsEnum(GeneralClosingReviewStatus)
  status: GeneralClosingReviewStatus;

  @ApiPropertyOptional({ description: 'Obligatoria si la caja queda observada' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
