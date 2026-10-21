import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateProductionSettingsDto {
  @ApiProperty({
    description: 'Horas al mes para el valor hora (salario ÷ divisor). 210 = jornada de 42 h semanales',
    example: 210,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Las horas al mes deben ser un número' })
  @Min(100, { message: 'Las horas al mes no pueden ser menos de 100' })
  @Max(300, { message: 'Las horas al mes no pueden pasar de 300' })
  hourlyDivisor: number;

  @ApiProperty({ description: 'Recargo de la hora extra: 1,25 = 25 % más que la hora normal', example: 1.25 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El recargo debe ser un número' })
  @Min(1, { message: 'El recargo no puede ser menor que 1 (hora normal)' })
  @Max(3, { message: 'El recargo no puede pasar de 3' })
  overtimeFactor: number;

  @ApiProperty({ description: 'Mano de obra / venta de la OT (%) desde la que se marca en naranja', example: 15 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El umbral de atención debe ser un número' })
  @Min(1, { message: 'El umbral de atención debe ser de al menos 1 %' })
  @Max(100, { message: 'El umbral de atención no puede pasar de 100 %' })
  laborShareWarningPct: number;

  @ApiProperty({ description: 'Mano de obra / venta de la OT (%) desde la que se marca en rojo', example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El umbral de alerta debe ser un número' })
  @Min(1, { message: 'El umbral de alerta debe ser de al menos 1 %' })
  @Max(100, { message: 'El umbral de alerta no puede pasar de 100 %' })
  laborShareCriticalPct: number;
}
