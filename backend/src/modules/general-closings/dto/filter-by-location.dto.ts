import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class FilterByLocationDto {
  @ApiProperty({ description: 'Primer día del periodo, YYYY-MM-DD' })
  @Matches(DAY, { message: 'La fecha inicial debe tener el formato YYYY-MM-DD' })
  from: string;

  @ApiProperty({ description: 'Último día del periodo, YYYY-MM-DD' })
  @Matches(DAY, { message: 'La fecha final debe tener el formato YYYY-MM-DD' })
  to: string;
}
