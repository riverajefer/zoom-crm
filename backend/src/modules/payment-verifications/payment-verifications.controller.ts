import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FilterPaymentVerificationsDto, ObservePaymentDto, VerifyPaymentsDto } from './dto';
import { PaymentVerificationsService } from './payment-verifications.service';

@ApiTags('payment-verifications')
@ApiBearerAuth('JWT-auth')
@Controller('payment-verifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentVerificationsController {
  constructor(private readonly service: PaymentVerificationsService) {}

  @Get()
  @RequirePermissions('verify_payments')
  @ApiOperation({ summary: 'Pagos de órdenes para verificación contable' })
  @ApiResponse({ status: 200, description: 'Pagos paginados de las sedes que el usuario puede ver' })
  findAll(@Query() filters: FilterPaymentVerificationsDto) {
    return this.service.findAll(filters);
  }

  @Get('summary')
  @RequirePermissions('verify_payments')
  @ApiOperation({ summary: 'Conteo y monto de pagos por estado de verificación' })
  getSummary() {
    return this.service.getSummary();
  }

  @Get(':paymentId/history')
  @RequirePermissions('verify_payments')
  @ApiOperation({ summary: 'Historial de verificación de un pago' })
  @ApiParam({ name: 'paymentId', description: 'ID del pago' })
  getHistory(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.service.getHistory(paymentId);
  }

  @Post('verify')
  @RequirePermissions('verify_payments')
  @ApiOperation({ summary: 'Verificar uno o varios pagos' })
  @ApiResponse({ status: 201, description: 'Pagos verificados' })
  @ApiResponse({ status: 404, description: 'Algún pago no está disponible para verificación' })
  verify(@Body() dto: VerifyPaymentsDto, @CurrentUser('id') reviewerId: string) {
    return this.service.verify(dto, reviewerId);
  }

  @Post(':paymentId/observe')
  @RequirePermissions('verify_payments')
  @ApiOperation({ summary: 'Observar un pago (motivo obligatorio)' })
  @ApiParam({ name: 'paymentId', description: 'ID del pago' })
  @ApiResponse({ status: 201, description: 'Pago observado' })
  observe(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ObservePaymentDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.service.observe(paymentId, dto, reviewerId);
  }
}
