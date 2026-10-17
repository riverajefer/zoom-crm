import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import {
  AdjustTimeEntryDto,
  CreateManualTimeEntryDto,
  PlantDayQueryDto,
  StartTimeEntryDto,
  VoidTimeEntryDto,
} from './dto';
import { WorkOrderTimeService } from './work-order-time.service';

/**
 * Temporizador de producción de la OT.
 *
 * - `track_work_order_time`: el operario inicia, finaliza y extiende sus tareas.
 * - `adjust_work_order_time`: el supervisor corrige, anula, revisa y agrega
 *   registros olvidados. No puede tocar sus propias horas (salvo el admin).
 * - `read_production_plant`: vista «Planta hoy», qué hace cada operario en el día.
 */
@ApiTags('work-order-time')
@ApiBearerAuth('JWT-auth')
@Controller('work-order-time-entries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrderTimeController {
  constructor(private readonly service: WorkOrderTimeService) {}

  @Get('my-running')
  @RequirePermissions('track_work_order_time')
  @ApiOperation({ summary: 'Mis tareas en curso y el horario de la jornada' })
  findMyRunning(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findMyRunning(user.id);
  }

  // Sin permiso propio: lo usan tanto el operario (al iniciar) como el
  // supervisor (al ajustar), y es solo una lista de nombres.
  @Get('machines')
  @ApiOperation({ summary: 'Máquinas activas para elegir al iniciar o ajustar una tarea' })
  findActiveMachines() {
    return this.service.findActiveMachines();
  }

  @Post('start')
  @RequirePermissions('track_work_order_time')
  @ApiOperation({ summary: 'Iniciar una tarea (la hora la pone el servidor)' })
  @ApiResponse({ status: 201, description: 'Tarea iniciada (o la que ya estaba en curso)' })
  @ApiResponse({ status: 400, description: 'OT no apta o tope de tareas en curso' })
  start(@Body() dto: StartTimeEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.start(dto, user.id);
  }

  @Post(':entryId/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('track_work_order_time')
  @ApiOperation({ summary: 'Finalizar una tarea propia' })
  @ApiParam({ name: 'entryId', description: 'ID del registro' })
  @ApiResponse({ status: 403, description: 'La tarea es de otra persona' })
  stop(@Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.stop(entryId, user.id);
  }

  @Post(':entryId/extend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('track_work_order_time')
  @ApiOperation({ summary: '«Sigo trabajando»: no cerrar la tarea al fin de la jornada' })
  @ApiParam({ name: 'entryId', description: 'ID del registro' })
  extend(@Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.extend(entryId, user.id);
  }

  @Get('pending-review')
  @RequirePermissions('adjust_work_order_time')
  @ApiOperation({ summary: 'Tareas que cerró el sistema y nadie ha revisado' })
  findPendingReview() {
    return this.service.findPendingReview();
  }

  @Get('operators')
  @RequirePermissions('adjust_work_order_time')
  @ApiOperation({ summary: 'Usuarios que usan el temporizador (para registros olvidados)' })
  findOperators() {
    return this.service.findOperators();
  }

  @Get('plant')
  @RequirePermissions('read_production_plant')
  @ApiOperation({ summary: '«Planta hoy»: asistencia y tareas de cada operario en un día' })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD, calendario de Colombia; por defecto hoy' })
  findPlant(@Query() query: PlantDayQueryDto) {
    return this.service.findPlant(query.date);
  }

  @Post('manual')
  @RequirePermissions('adjust_work_order_time')
  @ApiOperation({ summary: 'Agregar un registro olvidado' })
  @ApiResponse({ status: 201, description: 'Registro agregado' })
  createManual(@Body() dto: CreateManualTimeEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createManual(dto, user.id);
  }

  @Patch(':entryId/adjust')
  @RequirePermissions('adjust_work_order_time')
  @ApiOperation({ summary: 'Ajustar inicio, fin, ítem, máquina o nota (con motivo)' })
  @ApiParam({ name: 'entryId', description: 'ID del registro' })
  adjust(
    @Param('entryId') entryId: string,
    @Body() dto: AdjustTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.adjust(entryId, dto, user.id);
  }

  @Post(':entryId/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('adjust_work_order_time')
  @ApiOperation({ summary: 'Anular un registro (no se borra)' })
  @ApiParam({ name: 'entryId', description: 'ID del registro' })
  void(
    @Param('entryId') entryId: string,
    @Body() dto: VoidTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.void(entryId, dto, user.id);
  }

  @Post(':entryId/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('adjust_work_order_time')
  @ApiOperation({ summary: 'Dar por buena una tarea que cerró el sistema' })
  @ApiParam({ name: 'entryId', description: 'ID del registro' })
  markReviewed(@Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.markReviewed(entryId, user.id);
  }
}
