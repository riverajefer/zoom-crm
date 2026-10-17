import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMachineDto } from './create-machine.dto';

export class UpdateMachineDto extends PartialType(CreateMachineDto) {
  @ApiProperty({
    description: 'Si la máquina se puede elegir al iniciar una tarea',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
