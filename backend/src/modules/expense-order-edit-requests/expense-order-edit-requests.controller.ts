import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExpenseOrderEditRequestsService } from './expense-order-edit-requests.service';
import { CreateExpenseOrderEditRequestDto, ReviewExpenseOrderEditRequestDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('expense-order-edit-requests')
@ApiBearerAuth('JWT-auth')
@Controller('expense-order-edit-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseOrderEditRequestsController {
  constructor(private readonly service: ExpenseOrderEditRequestsService) {}

  @Post()
  @RequirePermissions('update_expense_orders')
  @ApiOperation({ summary: 'Solicitar autorización para editar una OG pagada' })
  @ApiResponse({ status: 201, description: 'Solicitud creada correctamente' })
  @ApiResponse({ status: 400, description: 'OG no pagada, solicitud duplicada o usuario admin' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateExpenseOrderEditRequestDto,
  ) {
    return this.service.create(userId, dto);
  }

  @Get('pending')
  @RequirePermissions('approve_expense_orders')
  @ApiOperation({ summary: 'Listar solicitudes de edición pendientes (solo admins)' })
  @ApiResponse({ status: 200, description: 'Solicitudes pendientes' })
  async findPending() {
    return this.service.findPendingRequests();
  }

  @Get('all')
  @RequirePermissions('approve_expense_orders')
  @ApiOperation({ summary: 'Listar todas las solicitudes de edición (solo admins)' })
  @ApiResponse({ status: 200, description: 'Todas las solicitudes' })
  async findAll() {
    return this.service.findAll();
  }

  @Get('expense-order/:expenseOrderId')
  @RequirePermissions('read_expense_orders')
  @ApiOperation({ summary: 'Historial de solicitudes de edición de una OG' })
  @ApiParam({ name: 'expenseOrderId', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'Historial de solicitudes de la OG' })
  async findByExpenseOrder(@Param('expenseOrderId') expenseOrderId: string) {
    return this.service.findByExpenseOrder(expenseOrderId);
  }

  @Get('expense-order/:expenseOrderId/my-status')
  @RequirePermissions('read_expense_orders')
  @ApiOperation({ summary: 'Solicitud pendiente y edición aprobada del usuario actual para una OG' })
  @ApiParam({ name: 'expenseOrderId', description: 'ID de la OG' })
  @ApiResponse({ status: 200, description: 'Estado de la solicitud del usuario' })
  async findMyStatus(
    @Param('expenseOrderId') expenseOrderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.findMyStatus(expenseOrderId, userId);
  }

  @Put(':id/approve')
  @RequirePermissions('approve_expense_orders')
  @ApiOperation({ summary: 'Aprobar solicitud de edición (solo admin)' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud aprobada' })
  @ApiResponse({ status: 403, description: 'Solo administradores pueden aprobar' })
  async approve(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewExpenseOrderEditRequestDto,
  ) {
    return this.service.approve(id, adminId, dto);
  }

  @Put(':id/reject')
  @RequirePermissions('approve_expense_orders')
  @ApiOperation({ summary: 'Rechazar solicitud de edición (solo admin)' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud rechazada' })
  @ApiResponse({ status: 403, description: 'Solo administradores pueden rechazar' })
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewExpenseOrderEditRequestDto,
  ) {
    return this.service.reject(id, adminId, dto);
  }
}
