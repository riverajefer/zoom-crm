import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LocationLookupDto } from '../../common/dto/location-lookup.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import {
  AddSupplyToItemDto,
  CreateWorkOrderDto,
  CreateWorkOrderTimeEntryDto,
  FilterWorkOrdersDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
  UpdateWorkOrderTimeEntryDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { WorkOrderStatus } from '../../generated/prisma';

@ApiTags('work-orders')
@ApiBearerAuth('JWT-auth')
@Controller('work-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @RequirePermissions('read_work_orders')
  @ApiOperation({ summary: 'Listar órdenes de trabajo con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'OTs obtenidas correctamente' })
  findAll(@Query() filters: FilterWorkOrdersDto) {
    return this.workOrdersService.findAll(filters);
  }

  // Antes de `@Get(':id')`: si no, `lookup` se tomaría como un id.
  @Get('lookup')
  @RequirePermissions('read_work_orders', 'read_other_locations')
  @ApiOperation({ summary: 'Buscar OT en las otras sedes, agrupadas por sede (modo consulta)' })
  lookup(@Query() { q }: LocationLookupDto) {
    return this.workOrdersService.lookupInOtherLocations(q);
  }

  @Get(':id')
  @RequirePermissions('read_work_orders')
  @ApiOperation({ summary: 'Obtener detalle de una OT' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiResponse({ status: 200, description: 'OT obtenida correctamente' })
  @ApiResponse({ status: 404, description: 'OT no encontrada' })
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOneForView(id);
  }

  @Post()
  @RequirePermissions('create_work_orders')
  @ApiOperation({ summary: 'Crear una nueva OT desde una orden de pedido' })
  @ApiResponse({ status: 201, description: 'OT creada correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Orden de pedido no encontrada' })
  create(
    @Body() dto: CreateWorkOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: WorkOrderStatus,
  ) {
    const initialStatus =
      status === WorkOrderStatus.CONFIRMED
        ? WorkOrderStatus.CONFIRMED
        : WorkOrderStatus.DRAFT;
    return this.workOrdersService.create(dto, user.id, initialStatus);
  }

  @Patch(':id')
  @RequirePermissions('update_work_orders')
  @ApiOperation({ summary: 'Actualizar una OT (solo en DRAFT, CONFIRMED o IN_PRODUCTION)' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiResponse({ status: 200, description: 'OT actualizada correctamente' })
  @ApiResponse({ status: 400, description: 'No se puede modificar en el estado actual' })
  @ApiResponse({ status: 404, description: 'OT no encontrada' })
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('update_work_orders')
  @ApiOperation({ summary: 'Cambiar el estado de una OT' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiResponse({ status: 200, description: 'Estado actualizado correctamente' })
  @ApiResponse({ status: 400, description: 'Transición de estado no permitida' })
  @ApiResponse({ status: 404, description: 'OT no encontrada' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.workOrdersService.updateStatus(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('delete_work_orders')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una OT (solo en DRAFT)' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiResponse({ status: 204, description: 'OT eliminada correctamente' })
  @ApiResponse({ status: 400, description: 'Solo se puede eliminar una OT en DRAFT' })
  @ApiResponse({ status: 404, description: 'OT no encontrada' })
  remove(@Param('id') id: string) {
    return this.workOrdersService.remove(id);
  }

  @Post(':id/items/:itemId/supplies')
  @RequirePermissions('update_work_orders')
  @ApiOperation({ summary: 'Agregar o actualizar un insumo en un item de la OT' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiParam({ name: 'itemId', description: 'ID del item de la OT' })
  @ApiResponse({ status: 201, description: 'Insumo agregado correctamente' })
  @ApiResponse({ status: 404, description: 'OT o item no encontrado' })
  addSupplyToItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: AddSupplyToItemDto,
  ) {
    return this.workOrdersService.addSupplyToItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId/supplies/:supplyId')
  @RequirePermissions('update_work_orders')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un insumo de un item de la OT' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiParam({ name: 'itemId', description: 'ID del item de la OT' })
  @ApiParam({ name: 'supplyId', description: 'ID del insumo' })
  @ApiResponse({ status: 204, description: 'Insumo eliminado correctamente' })
  @ApiResponse({ status: 404, description: 'OT, item o insumo no encontrado' })
  removeSupplyFromItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Param('supplyId') supplyId: string,
  ) {
    return this.workOrdersService.removeSupplyFromItem(id, itemId, supplyId);
  }

  @Post(':id/time-entries')
  @RequirePermissions('read_work_orders')
  @ApiOperation({ summary: 'Registrar horas trabajadas en una OT' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiResponse({ status: 201, description: 'Horas registradas correctamente' })
  @ApiResponse({ status: 404, description: 'OT o item no encontrado' })
  createTimeEntry(
    @Param('id') id: string,
    @Body() dto: CreateWorkOrderTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workOrdersService.createTimeEntry(id, dto, user.id);
  }

  @Patch(':id/time-entries/:timeEntryId')
  @RequirePermissions('read_work_orders')
  @ApiOperation({ summary: 'Editar registro de horas en una OT' })
  @ApiParam({ name: 'id', description: 'ID de la OT' })
  @ApiParam({ name: 'timeEntryId', description: 'ID del registro de horas' })
  @ApiResponse({ status: 200, description: 'Registro de horas actualizado correctamente' })
  @ApiResponse({ status: 404, description: 'OT o registro no encontrado' })
  updateTimeEntry(
    @Param('id') id: string,
    @Param('timeEntryId') timeEntryId: string,
    @Body() dto: UpdateWorkOrderTimeEntryDto,
  ) {
    return this.workOrdersService.updateTimeEntry(id, timeEntryId, dto);
  }
}
