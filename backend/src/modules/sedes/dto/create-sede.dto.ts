import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationType } from '../../../generated/prisma';

export class CreateSedeDto {
  @ApiProperty({
    example: '130',
    description:
      'Código corto y estable: es el prefijo de la numeración (130-OP-0001). No se puede cambiar después.',
  })
  @Matches(/^[A-Z0-9]{2,5}$/, {
    message: 'El código lleva de 2 a 5 letras mayúsculas o dígitos',
  })
  code: string;

  @ApiProperty({ example: 'Local 130' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ enum: LocationType, default: LocationType.STORE })
  @IsEnum(LocationType)
  @IsOptional()
  type?: LocationType;

  @ApiPropertyOptional({ example: 'Cra 28 #10-38 Interior 125 B' })
  @IsString()
  @IsOptional()
  address?: string | null;

  @ApiPropertyOptional({ example: '(+57) 300 368 0868' })
  @IsString()
  @IsOptional()
  phone?: string | null;

  @ApiProperty({ example: '#FF8A7A' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'El color va en hexadecimal: #RRGGBB' })
  color: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
