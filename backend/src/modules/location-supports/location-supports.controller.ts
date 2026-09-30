import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AUTHORIZE_LOCATION_SUPPORT_PERMISSION } from '../../common/utils/location-support.util';
import { LocationSupportsService } from './location-supports.service';
import {
  EndLocationSupportDto,
  FilterLocationSupportsDto,
  RequestLocationSupportDto,
  ReviewLocationSupportDto,
  ScheduleLocationSupportDto,
} from './dto';

/**
 * Apoyo en otra sede autorizado por Gerencia (solo Zoom, docs/PLAN_SEDES.md §16).
 * Pedir, cancelar y ver los propios no exige permiso; lo demás es de Gerencia.
 */
@ApiTags('location-supports')
@ApiBearerAuth('JWT-auth')
@Controller('location-supports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LocationSupportsController {
  constructor(private readonly service: LocationSupportsService) {}

  @Get()
  @RequirePermissions(AUTHORIZE_LOCATION_SUPPORT_PERMISSION)
  @ApiOperation({ summary: 'Apoyos pendientes, vigentes, programados o historial (Gerencia)' })
  findAll(@Query() filters: FilterLocationSupportsDto) {
    return this.service.findAll(filters);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Mis apoyos y solicitudes de sede' })
  findMine(@CurrentUser('id') userId: string) {
    return this.service.findMine(userId);
  }

  @Post('requests')
  @ApiOperation({ summary: 'Pedir apoyo en otra sede, o un cambio de sede si ya estoy de apoyo' })
  @ApiResponse({ status: 400, description: 'Sede inválida, fechas, cruce con otro apoyo o solicitud pendiente' })
  request(@CurrentUser('id') userId: string, @Body() dto: RequestLocationSupportDto) {
    return this.service.request(userId, dto);
  }

  @Post(':id/cancel')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Cancelar mi solicitud pendiente' })
  cancel(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(userId, id);
  }

  @Post()
  @RequirePermissions(AUTHORIZE_LOCATION_SUPPORT_PERMISSION)
  @ApiOperation({ summary: 'Programar un apoyo en otra sede (nace aprobado)' })
  schedule(@CurrentUser('id') userId: string, @Body() dto: ScheduleLocationSupportDto) {
    return this.service.schedule(userId, dto);
  }

  @Post(':id/approve')
  @RequirePermissions(AUTHORIZE_LOCATION_SUPPORT_PERMISSION)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Aprobar una solicitud de apoyo o de cambio de sede' })
  @ApiResponse({ status: 400, description: 'CASH_SESSION_OPEN: el empleado tiene la caja abierta en la sede del apoyo' })
  approve(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLocationSupportDto,
  ) {
    return this.service.approve(userId, id, dto);
  }

  @Post(':id/reject')
  @RequirePermissions(AUTHORIZE_LOCATION_SUPPORT_PERMISSION)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Rechazar una solicitud de apoyo o de cambio de sede' })
  reject(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLocationSupportDto,
  ) {
    return this.service.reject(userId, id, dto);
  }

  @Post(':id/end')
  @RequirePermissions(AUTHORIZE_LOCATION_SUPPORT_PERMISSION)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Terminar un apoyo vigente antes de tiempo, o cancelar uno programado' })
  @ApiResponse({ status: 400, description: 'CASH_SESSION_OPEN: el empleado tiene la caja abierta en la sede del apoyo' })
  end(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EndLocationSupportDto,
  ) {
    return this.service.end(userId, id, dto);
  }
}
