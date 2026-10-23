import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CashSessionService } from './cash-session.service';
import { PendingCashEntriesService } from './pending-cash-entries.service';
import {
  CloseCashSessionDto,
  FilterCashSessionsDto,
  OpenCashSessionDto,
} from './dto';

@ApiTags('cash-sessions')
@ApiBearerAuth()
@Controller('cash-sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashSessionController {
  constructor(
    private readonly service: CashSessionService,
    private readonly pendingCashEntriesService: PendingCashEntriesService,
  ) {}

  @Get()
  @RequirePermissions('read_cash_sessions')
  @ApiOperation({ summary: 'Listar sesiones de caja con filtros' })
  findAll(@Query() filters: FilterCashSessionsDto) {
    return this.service.findAll(filters);
  }

  // Sin `@RequirePermissions` a propósito: basta con estar autenticado. Lo
  // consultan las comerciales, que no tienen `read_cash_sessions`, y la
  // respuesta son dos booleanos sin datos de caja.
  @Get('is-open')
  @ApiOperation({
    summary: '¿Hay una sesión de caja abierta ahora?',
    description:
      'Booleano sin datos sensibles. Lo usa el formulario de OP para avisar ' +
      'que el abono quedará en cola si la caja está cerrada.',
  })
  isCashOpen() {
    return this.pendingCashEntriesService.isAnySessionOpen();
  }

  // Debe declararse ANTES de `@Get(':id')`: si no, la ruta de un solo segmento
  // se la come el parámetro y nunca llega aquí.
  @Get('pending-entries')
  @RequirePermissions('read_cash_sessions')
  @ApiOperation({
    summary: 'Abonos registrados sin caja abierta, en espera de ingresar',
    description:
      'Entran automáticamente al arqueo al abrir la próxima sesión de caja. ' +
      'Sirve para saber, antes de abrir, cuánto va a ingresar de arrastre.',
  })
  getPendingEntries() {
    return this.pendingCashEntriesService.getPendingSummary();
  }

  @Get(':id')
  @RequirePermissions('read_cash_sessions')
  @ApiOperation({ summary: 'Obtener detalle completo de una sesión de caja' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/balance-preview')
  @RequirePermissions('read_cash_sessions')
  @ApiOperation({ summary: 'Obtener balance actual sin cerrar la caja (arqueo rápido)' })
  getBalancePreview(@Param('id') id: string) {
    return this.service.getBalancePreview(id);
  }

  @Get('last-closing/:cashRegisterId')
  @RequirePermissions('open_cash_session')
  @ApiOperation({ summary: 'Obtener denominaciones de cierre de la última sesión de una caja' })
  getLastClosingDenominations(
    @Param('cashRegisterId') cashRegisterId: string,
  ) {
    return this.service.getLastClosingDenominations(cashRegisterId);
  }

  @Post('open')
  @RequirePermissions('open_cash_session')
  @ApiOperation({ summary: 'Abrir una nueva sesión de caja' })
  @ApiResponse({ status: 201, description: 'Sesión abierta correctamente' })
  @ApiResponse({ status: 409, description: 'La caja ya tiene una sesión abierta' })
  openSession(
    @Body() dto: OpenCashSessionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.openSession(dto, userId);
  }

  @Post(':id/start-count')
  @RequirePermissions('close_cash_session')
  @ApiOperation({
    summary:
      'Iniciar el arqueo de cierre: la sesión deja de aceptar efectivo hasta cerrar o cancelar',
  })
  startCount(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.startCount(id, userId);
  }

  @Post(':id/cancel-count')
  @RequirePermissions('close_cash_session')
  @ApiOperation({ summary: 'Cancelar el arqueo en curso sin cerrar la sesión' })
  cancelCount(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.cancelCount(id, userId);
  }

  @Post(':id/close')
  @RequirePermissions('close_cash_session')
  @ApiOperation({ summary: 'Cerrar la sesión de caja con conteo de denominaciones' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada con resumen de conciliación' })
  @ApiResponse({
    status: 409,
    description:
      'Hay movimientos posteriores al inicio del arqueo; reenviar con acknowledgeLateMovements',
  })
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.closeSession(id, dto, userId);
  }
}
