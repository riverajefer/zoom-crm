import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { OrderEditRequestsService } from './order-edit-requests.service';
import { CreateEditRequestDto, ReviewEditRequestDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('order-edit-requests')
@ApiBearerAuth('JWT-auth')
@Controller('orders/:orderId/edit-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderEditRequestsController {
  constructor(
    private readonly orderEditRequestsService: OrderEditRequestsService,
  ) {}

  @Post()
  @RequirePermissions('create_orders')
  @ApiOperation({ summary: 'Crear solicitud de edición de orden' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  @ApiResponse({
    status: 201,
    description: 'Solicitud creada correctamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'Estado de orden no permite solicitudes o ya existe solicitud pendiente',
  })
  async create(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEditRequestDto,
  ) {
    return this.orderEditRequestsService.create(orderId, userId, dto);
  }

  /**
   * El admin abre la edición de una orden bloqueada indicando el motivo. Queda
   * como solicitud aprobada directamente (docs/PLAN_SEDES.md §6.3).
   */
  @Post('direct')
  @RequirePermissions('update_orders')
  @ApiOperation({ summary: 'Edición directa del admin (con motivo)' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  async createDirect(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEditRequestDto,
  ) {
    return this.orderEditRequestsService.createDirect(orderId, userId, dto);
  }

  @Get()
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Listar solicitudes de edición de una orden' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Solicitudes obtenidas correctamente',
  })
  async findByOrder(@Param('orderId') orderId: string) {
    return this.orderEditRequestsService.findByOrder(orderId);
  }

  @Get('active-permission')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Verificar permiso activo del usuario' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Permiso activo o null si no tiene',
  })
  async getActivePermission(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.orderEditRequestsService.getActivePermission(orderId, userId);
  }

  @Get(':requestId')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Obtener solicitud específica' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  @ApiParam({ name: 'requestId', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  async findOne(
    @Param('orderId') orderId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.orderEditRequestsService.findOne(orderId, requestId);
  }

  @Put(':requestId/approve')
  @RequirePermissions('approve_orders')
  @ApiOperation({ summary: 'Aprobar solicitud de edición (solo admin)' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  @ApiParam({ name: 'requestId', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud aprobada' })
  @ApiResponse({
    status: 403,
    description: 'Solo administradores pueden aprobar',
  })
  async approve(
    @Param('orderId') orderId: string,
    @Param('requestId') requestId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewEditRequestDto,
  ) {
    return this.orderEditRequestsService.approve(
      orderId,
      requestId,
      adminId,
      dto,
    );
  }

  @Put(':requestId/reject')
  @RequirePermissions('approve_orders')
  @ApiOperation({ summary: 'Rechazar solicitud de edición (solo admin)' })
  @ApiParam({ name: 'orderId', description: 'ID de la orden' })
  @ApiParam({ name: 'requestId', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud rechazada' })
  @ApiResponse({
    status: 403,
    description: 'Solo administradores pueden rechazar',
  })
  async reject(
    @Param('orderId') orderId: string,
    @Param('requestId') requestId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewEditRequestDto,
  ) {
    return this.orderEditRequestsService.reject(
      orderId,
      requestId,
      adminId,
      dto,
    );
  }
}
