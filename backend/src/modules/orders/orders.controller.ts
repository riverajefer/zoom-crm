import {
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderDto,
  FilterOrdersDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  CreatePaymentDto,
  UpdatePaymentDto,
  UpdateOrderStatusDto,
  ApplyDiscountDto,
  RegisterElectronicInvoiceDto,
  OrderProfitabilityDto,
  PaginatedProfitabilityDto,
  UpsertSalesGoalDto,
  FilterSalesGoalsDto,
  OrdersDashboardQueryDto,
  AdvisorTrackingQueryDto,
  VoidPaymentDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CanEditOrderGuard } from '../../common/guards/can-edit-order.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrderStatus } from '../../generated/prisma';

@ApiTags('orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Get all orders with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  findAll(@Query() filters: FilterOrdersDto) {
    return this.ordersService.findAll(filters);
  }

  // ── Sales Goals ──────────────────────────────────────────────

  @Get('sales-goals')
  @RequirePermissions('read_sales_by_advisor')
  @ApiOperation({ summary: 'List sales goals by month/year' })
  @ApiResponse({ status: 200, description: 'Sales goals retrieved successfully' })
  getSalesGoals(@Query() filters: FilterSalesGoalsDto) {
    return this.ordersService.getSalesGoals(filters);
  }

  @Post('sales-goals')
  @RequirePermissions('manage_sales_goals')
  @ApiOperation({ summary: 'Create or update a monthly sales goal for an advisor' })
  @ApiResponse({ status: 200, description: 'Sales goal saved successfully' })
  upsertSalesGoal(@Body() dto: UpsertSalesGoalDto) {
    return this.ordersService.upsertSalesGoal(dto);
  }

  @Delete('sales-goals/:goalId')
  @RequirePermissions('manage_sales_goals')
  @ApiOperation({ summary: 'Delete a sales goal' })
  @ApiParam({ name: 'goalId', type: String })
  @ApiResponse({ status: 200, description: 'Sales goal deleted successfully' })
  deleteSalesGoal(@Param('goalId') goalId: string) {
    return this.ordersService.deleteSalesGoal(goalId);
  }

  // ── Sales Summary ─────────────────────────────────────────────

  @Get('dashboard-summary')
  @RequirePermissions('read_orders_dashboard')
  @ApiOperation({ summary: 'Get the orders list mini dashboard summary' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Dashboard summary retrieved successfully' })
  getDashboardSummary(@Query() query: OrdersDashboardQueryDto) {
    return this.ordersService.getDashboardSummary(query);
  }

  @Get('pending-payment-summary')
  @RequirePermissions('read_orders')
  @ApiOperation({
    summary: 'Totales de cartera pendiente (saldo > 0 en estados de venta en firme)',
  })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Totales obtenidos correctamente' })
  getPendingPaymentSummary(@Query() filters: FilterOrdersDto) {
    return this.ordersService.getPendingPaymentSummary(filters);
  }

  @Get('advisors')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Asesores que han creado al menos una orden' })
  @ApiResponse({ status: 200, description: 'Asesores obtenidos correctamente' })
  getAdvisorsWithOrders() {
    return this.ordersService.getAdvisorsWithOrders();
  }

  @Get('sales-summary')
  @RequirePermissions('read_sales_by_advisor')
  @ApiOperation({ summary: 'Get sales summary grouped by advisor' })
  @ApiResponse({ status: 200, description: 'Sales summary retrieved successfully' })
  getSalesSummary(@Query() filters: FilterOrdersDto) {
    return this.ordersService.getSalesSummary(filters);
  }

  @Get('advisor-tracking')
  @RequirePermissions('read_sales_by_advisor')
  @ApiOperation({
    summary: 'Seguimiento de OP del mes: matriz asesor × estado × pago',
  })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'advisorId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Advisor tracking retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver otros asesores' })
  getAdvisorTracking(
    @Query() query: AdvisorTrackingQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.getAdvisorTracking(query, userId);
  }

  @Get('profitability')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Get profitability list for all orders' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'orderDateFrom', required: false, type: String })
  @ApiQuery({ name: 'orderDateTo', required: false, type: String })
  @ApiResponse({ status: 200, type: PaginatedProfitabilityDto })
  getProfitabilityList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('orderDateFrom') orderDateFrom?: string,
    @Query('orderDateTo') orderDateTo?: string,
  ) {
    return this.ordersService.getProfitabilityList({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
      orderDateFrom,
      orderDateTo,
    });
  }

  @Get(':id')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/profitability')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Get profitability breakdown for a single order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, type: OrderProfitabilityDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrderProfitability(@Param('id') id: string) {
    return this.ordersService.getOrderProfitability(id);
  }

  @Post()
  @RequirePermissions('create_orders')
  @ApiOperation({ summary: 'Create new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.create(createOrderDto, userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard, CanEditOrderGuard)
  @RequirePermissions('update_orders')
  @ApiOperation({ summary: 'Update order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @ApiResponse({
    status: 403,
    description: 'No permission to edit this order',
  })
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.update(id, updateOrderDto, userId);
  }

  @Put(':id/status')
  @RequirePermissions('change_order_status')
  @ApiOperation({ summary: 'Change order status' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.updateStatus(id, updateStatusDto.status, userId, {
      retainedAmount: updateStatusDto.retainedAmount,
    });
  }

  @Delete(':id')
  @RequirePermissions('delete_orders')
  @ApiOperation({ summary: 'Delete order (only DRAFT/CANCELLED)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete this order' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.ordersService.remove(id, userId);
  }

  // ========== ITEM MANAGEMENT ENDPOINTS ==========

  @Post(':id/items')
  @UseGuards(JwtAuthGuard, PermissionsGuard, CanEditOrderGuard)
  @RequirePermissions('update_orders')
  @ApiOperation({ summary: 'Add item to order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 201, description: 'Item added successfully' })
  @ApiResponse({
    status: 403,
    description: 'No permission to edit this order',
  })
  addItem(@Param('id') orderId: string, @Body() addItemDto: AddOrderItemDto) {
    return this.ordersService.addItem(orderId, addItemDto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(JwtAuthGuard, PermissionsGuard, CanEditOrderGuard)
  @RequirePermissions('update_orders')
  @ApiOperation({ summary: 'Update order item' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @ApiResponse({
    status: 403,
    description: 'No permission to edit this order',
  })
  updateItem(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() updateItemDto: UpdateOrderItemDto,
  ) {
    return this.ordersService.updateItem(orderId, itemId, updateItemDto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(JwtAuthGuard, PermissionsGuard, CanEditOrderGuard)
  @RequirePermissions('update_orders')
  @ApiOperation({ summary: 'Remove item from order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Item removed successfully' })
  @ApiResponse({
    status: 403,
    description: 'No permission to edit this order',
  })
  removeItem(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ordersService.removeItem(orderId, itemId);
  }

  // ========== PAYMENT MANAGEMENT ENDPOINTS ==========

  @Post(':id/payments')
  @RequirePermissions('register_order_payments')
  @ApiOperation({ summary: 'Add payment to order (only CONFIRMED+)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 201, description: 'Payment added successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot add payment to DRAFT order or payment exceeds balance',
  })
  addPayment(
    @Param('id') orderId: string,
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.addPayment(orderId, createPaymentDto, userId);
  }

  @Get(':id/payments')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Get all payments for an order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
  getPayments(@Param('id') orderId: string) {
    return this.ordersService.getPayments(orderId);
  }

  @Post(':id/payments/:paymentId/void')
  // Pedir la anulación y ejecutarla son permisos distintos: este abre la puerta,
  // y `void_cash_movements` (que el servicio consulta aparte) decide si la
  // anulación es directa o queda como solicitud para el admin.
  @RequirePermissions('request_payment_void')
  @ApiOperation({
    summary:
      'Anular un pago de la orden. Si la caja del pago sigue abierta se anula de inmediato; si ya cerró, queda como solicitud para el admin',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({ status: 201, description: 'Pago anulado o solicitud creada' })
  @ApiResponse({ status: 400, description: 'El pago ya está anulado' })
  @ApiResponse({ status: 404, description: 'Orden o pago no encontrado' })
  voidPayment(
    @Param('id') orderId: string,
    @Param('paymentId') paymentId: string,
    @Body() voidPaymentDto: VoidPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.voidPayment(
      orderId,
      paymentId,
      voidPaymentDto,
      userId,
    );
  }

  @Patch(':id/payments/:paymentId')
  @RequirePermissions('edit_order_payments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Editar un pago (incluye comprobante opcional). Requiere aprobación del admin salvo permiso approve_payment_edits',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Pago actualizado o solicitud creada' })
  @ApiResponse({ status: 404, description: 'Orden o pago no encontrado' })
  updatePayment(
    @Param('id') orderId: string,
    @Param('paymentId') paymentId: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|gif|webp|pdf)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.ordersService.updatePayment(
      orderId,
      paymentId,
      updatePaymentDto,
      userId,
      file,
    );
  }

  @Post(':orderId/payments/:paymentId/receipt')
  @RequirePermissions('register_order_payments', 'upload_files')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload payment receipt' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Receipt uploaded successfully' })
  async uploadPaymentReceipt(
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.uploadPaymentReceipt(orderId, paymentId, file, userId);
  }

  @Delete(':orderId/payments/:paymentId/receipt')
  @RequirePermissions('delete_payment_receipts')
  @ApiOperation({ summary: 'Delete payment receipt (requires delete_payment_receipts)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Receipt deleted successfully' })
  async deletePaymentReceipt(
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.ordersService.deletePaymentReceipt(orderId, paymentId);
  }

  // ========== ELECTRONIC INVOICE ENDPOINT ==========

  @Patch(':id/electronic-invoice')
  @RequirePermissions('update_orders')
  @ApiOperation({ summary: 'Register electronic invoice number (only if order has IVA and is not DRAFT)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Electronic invoice number registered successfully' })
  @ApiResponse({ status: 400, description: 'Order has no IVA or is in DRAFT status' })
  registerElectronicInvoice(
    @Param('id') id: string,
    @Body() dto: RegisterElectronicInvoiceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.registerElectronicInvoice(id, dto.electronicInvoiceNumber, userId);
  }

  // ========== DISCOUNT MANAGEMENT ENDPOINTS ==========

  @Post(':id/discounts')
  @RequirePermissions('apply_discounts')
  @ApiOperation({ summary: 'Apply discount to order (only CONFIRMED+)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 201, description: 'Discount applied successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot apply discount to DRAFT order or discount exceeds total',
  })
  applyDiscount(
    @Param('id') orderId: string,
    @Body() applyDiscountDto: ApplyDiscountDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.applyDiscount(orderId, applyDiscountDto, userId);
  }

  @Get(':id/authorization-history')
  @RequirePermissions('read_orders')
  @ApiOperation({
    summary: 'Historial unificado de aprobaciones y solicitudes de autorización',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Authorization history retrieved' })
  getAuthorizationHistory(@Param('id') orderId: string) {
    return this.ordersService.getAuthorizationHistory(orderId);
  }

  @Get(':id/discounts')
  @RequirePermissions('read_orders')
  @ApiOperation({ summary: 'Get all discounts for an order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Discounts retrieved successfully' })
  getDiscounts(@Param('id') orderId: string) {
    return this.ordersService.getDiscounts(orderId);
  }

  @Delete(':id/discounts/:discountId')
  @RequirePermissions('delete_discounts')
  @ApiOperation({ summary: 'Remove discount from order (admin only)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'discountId', description: 'Discount ID' })
  @ApiResponse({ status: 200, description: 'Discount removed successfully' })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  removeDiscount(
    @Param('id') orderId: string,
    @Param('discountId') discountId: string,
  ) {
    return this.ordersService.removeDiscount(orderId, discountId);
  }
}
