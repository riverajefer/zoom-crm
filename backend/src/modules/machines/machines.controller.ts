import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';
import { RequirePermissions } from '../../common/decorators';
import { CreateMachineDto, UpdateMachineDto } from './dto';
import { MachinesService } from './machines.service';

@ApiTags('machines')
@ApiBearerAuth('JWT-auth')
@Controller('machines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Get()
  @RequirePermissions('read_machines')
  @ApiOperation({ summary: 'Listar máquinas de la planta' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Máquinas obtenidas correctamente' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.machinesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions('read_machines')
  @ApiOperation({ summary: 'Obtener una máquina' })
  @ApiParam({ name: 'id', description: 'ID de la máquina' })
  @ApiResponse({ status: 404, description: 'Máquina no encontrada' })
  findOne(@Param('id') id: string) {
    return this.machinesService.findOne(id);
  }

  @Post()
  @RequirePermissions('create_machines')
  @ApiOperation({ summary: 'Crear una máquina' })
  @ApiResponse({ status: 201, description: 'Máquina creada correctamente' })
  @ApiResponse({ status: 400, description: 'Nombre repetido o área inexistente' })
  create(@Body() dto: CreateMachineDto) {
    return this.machinesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('update_machines')
  @ApiOperation({ summary: 'Actualizar una máquina' })
  @ApiParam({ name: 'id', description: 'ID de la máquina' })
  @ApiResponse({ status: 200, description: 'Máquina actualizada correctamente' })
  update(@Param('id') id: string, @Body() dto: UpdateMachineDto) {
    return this.machinesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('delete_machines')
  @ApiOperation({ summary: 'Desactivar una máquina (no se borra)' })
  @ApiParam({ name: 'id', description: 'ID de la máquina' })
  remove(@Param('id') id: string) {
    return this.machinesService.remove(id);
  }
}
