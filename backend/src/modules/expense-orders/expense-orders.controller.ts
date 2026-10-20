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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ExpenseOrdersService } from './expense-orders.service';
import {
  CajaRejectExpenseOrderDto,
  CreateExpenseItemDto,
  CreateExpenseOrderDto,
  FilterExpenseOrdersDto,
  RegisterExpenseElectronicInvoiceDto,
  UpdateExpenseOrderDto,
  UpdateExpenseOrderStatusDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { ExpenseOrderStatus } from '../../generated/prisma';

@ApiTags('expense-orders')
@ApiBearerAuth('JWT-auth')
@Controller('expense-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseOrdersController {
  constructor(private readonly service: ExpenseOrdersService) {}

  @Get()
  @RequirePermissions('read_expense_orders')
  @ApiOperation({ summary: 'Listar órdenes de gasto con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'OGs obtenidas correctamente' })
  findAll(@Query() filters: FilterExpenseOrdersDto) {
    return this.service.findAll(filters);
  }

  @Get(':id')
  @RequirePermissions('read_expense_orders')
  @ApiOperation({ summary: 'Obtener detalle de una OG' })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'OG obtenida correctamente' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('create_expense_orders')
  @ApiOperation({ summary: 'Crear una nueva Orden de Gasto' })
  @ApiResponse({ status: 201, description: 'OG creada correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ExpenseOrderStatus,
    description: 'Estado inicial (DRAFT por defecto)',
  })
  create(
    @Body() dto: CreateExpenseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ExpenseOrderStatus,
  ) {
    const initialStatus =
      status === ExpenseOrderStatus.CREATED
        ? ExpenseOrderStatus.CREATED
        : ExpenseOrderStatus.DRAFT;
    return this.service.create(dto, user.id, initialStatus);
  }

  @Post(':id/items')
  @RequirePermissions('update_expense_orders')
  @ApiOperation({ summary: 'Agregar un ítem a una OG existente (solo en DRAFT o CREATED)' })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 201, description: 'Ítem agregado correctamente' })
  @ApiResponse({ status: 400, description: 'No se puede agregar ítems en el estado actual' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  addItem(
    @Param('id') id: string,
    @Body() dto: CreateExpenseItemDto,
  ) {
    return this.service.addItem(id, dto);
  }

  @Patch(':id')
  @RequirePermissions('update_expense_orders')
  @ApiOperation({
    summary: 'Actualizar una OG (en DRAFT o CREATED; una OG pagada, con autorización del admin)',
  })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'OG actualizada correctamente' })
  @ApiResponse({ status: 400, description: 'No se puede modificar en el estado actual' })
  @ApiResponse({ status: 403, description: 'OG pagada sin autorización de edición vigente' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermissions('update_expense_orders')
  @ApiOperation({ summary: 'Cambiar el estado de una OG' })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'Estado actualizado correctamente' })
  @ApiResponse({ status: 400, description: 'Transición de estado no permitida' })
  @ApiResponse({ status: 403, description: 'Sin permisos para marcar como PAID' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateStatus(id, dto, user);
  }

  @Patch(':id/caja-authorize')
  @RequirePermissions('caja_authorize_expense_orders')
  @ApiOperation({ summary: 'Segunda firma Caja: autorizar OG y registrar pago (requiere ADMIN_AUTHORIZED)' })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'OG autorizada por Caja y pagada automáticamente' })
  @ApiResponse({ status: 400, description: 'OG no está en estado ADMIN_AUTHORIZED o no hay sesión de caja activa' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  cajaAuthorize(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cajaAuthorize(id, user);
  }

  @Patch(':id/caja-reject')
  @RequirePermissions('caja_authorize_expense_orders')
  @ApiOperation({ summary: 'Caja rechaza una OG y la devuelve a CREATED con un motivo' })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'OG rechazada por Caja y devuelta a CREATED' })
  @ApiResponse({ status: 400, description: 'OG no está en estado ADMIN_AUTHORIZED' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  cajaReject(
    @Param('id') id: string,
    @Body() dto: CajaRejectExpenseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cajaReject(id, dto, user);
  }

  @Patch(':id/electronic-invoice')
  @RequirePermissions('update_expense_orders')
  @ApiOperation({ summary: 'Registrar/actualizar el número de factura electrónica del proveedor (no disponible en DRAFT)' })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'Factura electrónica registrada correctamente' })
  @ApiResponse({ status: 400, description: 'La OG está en estado BORRADOR' })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  registerElectronicInvoice(
    @Param('id') id: string,
    @Body() dto: RegisterExpenseElectronicInvoiceDto,
  ) {
    return this.service.registerElectronicInvoice(id, dto.electronicInvoiceNumber);
  }

  @Delete(':id')
  @RequirePermissions('delete_expense_orders')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Eliminar una OG (solo en DRAFT o CREATED). Borra también su Cuenta por Pagar si no tiene pagos',
  })
  @ApiParam({ name: 'id', description: 'ID de la OG' })
  @ApiResponse({ status: 204, description: 'OG eliminada correctamente' })
  @ApiResponse({
    status: 400,
    description: 'La OG ya está autorizada, o su cuenta por pagar tiene pagos registrados',
  })
  @ApiResponse({ status: 404, description: 'OG no encontrada' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
