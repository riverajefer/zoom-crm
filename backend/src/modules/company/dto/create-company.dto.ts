import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  IsUrl,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Zoom Publicidad S.A.S', description: 'Nombre de la compañía' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'ID del logo modo claro (UploadedFile)' })
  @IsString()
  @IsOptional()
  logoLightId?: string;

  @ApiPropertyOptional({ description: 'ID del logo modo oscuro (UploadedFile)' })
  @IsString()
  @IsOptional()
  logoDarkId?: string;

  @ApiPropertyOptional({ description: 'Descripción de la empresa' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '6012345678', description: 'Teléfono fijo' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '3001234567', description: 'Teléfono celular' })
  @IsString()
  @IsOptional()
  mobilePhone?: string;

  @ApiPropertyOptional({ example: 'contacto@empresa.com', description: 'Email de contacto' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'https://www.empresa.com', description: 'Página web' })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ example: 'Calle 123 # 45-67, Bogotá', description: 'Dirección' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '900123456-7', description: 'NIT de la empresa' })
  @IsString()
  @IsOptional()
  nit?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Representante legal' })
  @IsString()
  @IsOptional()
  legalRepresentative?: string;

  @ApiPropertyOptional({ example: 2015, description: 'Año de fundación' })
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  @IsOptional()
  foundedYear?: number;

  @ApiPropertyOptional({ example: 'Régimen Simple', description: 'Régimen tributario' })
  @IsString()
  @IsOptional()
  taxRegime?: string;

  @ApiPropertyOptional({ example: 'Bancolombia', description: 'Nombre del banco' })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ example: '123-456789-00', description: 'Número de cuenta bancaria' })
  @IsString()
  @IsOptional()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: 'Corriente', description: 'Tipo de cuenta bancaria' })
  @IsString()
  @IsOptional()
  bankAccountType?: string;
}
