import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReopenGeneralClosingDto {
  @ApiProperty({ description: 'Por qué se reabre el día' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la reapertura es obligatorio' })
  @MaxLength(500)
  reason: string;
}
