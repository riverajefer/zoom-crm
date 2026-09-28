import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** Búsqueda de documentos en las otras sedes (docs/PLAN_SEDES.md §8). */
export class LocationLookupDto {
  @ApiProperty({ description: 'Número del documento o nombre del cliente', example: '119-OP-0042' })
  @IsString()
  @MaxLength(100)
  q: string;
}
