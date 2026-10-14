import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class ReceiveHandoverDto {
  @ApiProperty({ description: 'Efectivo que se le deja al local como base para el día siguiente' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseLeft: number;
}
