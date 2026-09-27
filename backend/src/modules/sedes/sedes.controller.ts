import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SedesService } from './sedes.service';
import { CreateSedeDto, UpdateSedeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';
import { RequirePermissions } from '../../common/decorators';

/**
 * El módulo `locations` ya es el de departamentos y ciudades (viene de High),
 * por eso las sedes viven en `/sedes`.
 */
@ApiTags('sedes')
@ApiBearerAuth('JWT-auth')
@Controller('sedes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SedesController {
  constructor(private readonly sedesService: SedesService) {}

  /**
   * GET /api/v1/sedes
   * Sedes activas. Cualquier usuario autenticado: las usan el selector y los chips.
   */
  @Get()
  @ApiOperation({ summary: 'Listar las sedes activas' })
  findAll() {
    return this.sedesService.findAll();
  }

  /**
   * GET /api/v1/sedes/manage
   * Todas las sedes, incluidas las inactivas. Solo soporte.
   */
  @Get('manage')
  @RequirePermissions('manage_locations')
  @ApiOperation({ summary: 'Listar todas las sedes (soporte)' })
  findAllForManagement() {
    return this.sedesService.findAll(true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una sede' })
  findOne(@Param('id') id: string) {
    return this.sedesService.findOne(id);
  }

  @Post()
  @RequirePermissions('manage_locations')
  @ApiOperation({ summary: 'Crear una sede (soporte)' })
  create(@Body() dto: CreateSedeDto) {
    return this.sedesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('manage_locations')
  @ApiOperation({ summary: 'Editar una sede (soporte)' })
  update(@Param('id') id: string, @Body() dto: UpdateSedeDto) {
    return this.sedesService.update(id, dto);
  }
}
