import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Tipos de error que reporta el frontend.
 * - render: excepción capturada por el ErrorBoundary de React.
 * - chunk: un archivo JS con code-splitting no se pudo descargar (deploy nuevo).
 * - unhandled: error global no capturado (window.onerror / unhandledrejection).
 */
export const CLIENT_ERROR_KINDS = ['render', 'chunk', 'unhandled'] as const;

export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export class ReportClientErrorDto {
  @ApiProperty({
    description: 'Mensaje del error tal como lo reporta el navegador',
    example: "Cannot read properties of undefined (reading 'workOrders')",
  })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    description: 'Tipo de error detectado por el frontend',
    enum: CLIENT_ERROR_KINDS,
  })
  @IsOptional()
  @IsIn(CLIENT_ERROR_KINDS)
  kind?: ClientErrorKind;

  @ApiPropertyOptional({ description: 'Stack trace del error' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @ApiPropertyOptional({
    description: 'Árbol de componentes de React donde ocurrió el error',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  componentStack?: string;

  @ApiPropertyOptional({
    description: 'URL en la que estaba el usuario cuando ocurrió el error',
    example: 'https://crm.example.com/orders/33d01330-7efb-455e-95f1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({
    description:
      'ID del usuario según el frontend. Informativo: el endpoint es público y este dato no está verificado.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;

  @ApiPropertyOptional({
    description: 'Ambiente del frontend que reporta (staging / production)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  environment?: string;
}
