import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD';

/**
 * El empleado pide trabajar en otra sede. Con un apoyo vigente es un cambio de
 * sede: a otra sede ajena o de vuelta a la suya (docs/PLAN_SEDES.md §16).
 */
export class RequestLocationSupportDto {
  @ApiProperty({ description: 'Sede donde va a trabajar' })
  @IsUUID()
  locationId: string;

  @ApiPropertyOptional({ description: 'Primer día (AAAA-MM-DD, Bogotá). Por defecto hoy', example: '2026-10-01' })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Último día (AAAA-MM-DD). Por defecto el mismo día de inicio, o el fin del apoyo que reemplaza',
    example: '2026-10-05',
  })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  endDate?: string;

  @ApiProperty({ description: 'Por qué', example: 'Cubro la ausencia de Laura en el 125' })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo' })
  @MaxLength(500)
  reason: string;
}

/** Gerencia programa un apoyo: nace aprobado. */
export class ScheduleLocationSupportDto {
  @ApiProperty({ description: 'Empleado que va de apoyo' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Sede del apoyo' })
  @IsUUID()
  locationId: string;

  @ApiProperty({ description: 'Primer día (AAAA-MM-DD, Bogotá)', example: '2026-10-01' })
  @Matches(DAY, { message: DAY_MESSAGE })
  startDate: string;

  @ApiPropertyOptional({ description: 'Último día (AAAA-MM-DD). Por defecto el mismo día de inicio', example: '2026-10-05' })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  endDate?: string;

  @ApiProperty({ description: 'Por qué', example: 'Vacaciones de Laura' })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo' })
  @MaxLength(500)
  reason: string;
}

export class ReviewLocationSupportDto {
  @ApiPropertyOptional({ description: 'Nota de Gerencia' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNotes?: string;
}

export class EndLocationSupportDto {
  @ApiProperty({ description: 'Por qué se termina antes de tiempo', example: 'Laura volvió antes' })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo' })
  @MaxLength(500)
  reason: string;
}

export const LOCATION_SUPPORT_VIEWS = ['pending', 'active', 'scheduled', 'history'] as const;
export type LocationSupportView = (typeof LOCATION_SUPPORT_VIEWS)[number];

export class FilterLocationSupportsDto {
  @ApiPropertyOptional({ enum: LOCATION_SUPPORT_VIEWS, description: 'Por defecto, pendientes' })
  @IsOptional()
  @IsIn(LOCATION_SUPPORT_VIEWS)
  view?: LocationSupportView;

  @ApiPropertyOptional({ description: 'Solo los de un empleado' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
