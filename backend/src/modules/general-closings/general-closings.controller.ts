import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CloseGeneralClosingDto,
  FilterGeneralClosingsDto,
  ReopenGeneralClosingDto,
  ReviewRegisterDto,
} from './dto';
import { GeneralClosingsService } from './general-closings.service';

@ApiTags('general-closings')
@ApiBearerAuth('JWT-auth')
@Controller('general-closings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GeneralClosingsController {
  constructor(private readonly service: GeneralClosingsService) {}

  @Get()
  @RequirePermissions('read_all_cash_sessions')
  @ApiOperation({ summary: 'Historial de cierres generales' })
  findHistory(@Query() filters: FilterGeneralClosingsDto) {
    return this.service.findHistory(filters);
  }

  @Get('pending-days')
  @RequirePermissions('read_all_cash_sessions')
  @ApiOperation({ summary: 'Días pasados con caja y sin cierre general firmado' })
  findPendingDays() {
    return this.service.findPendingDays();
  }

  @Get('day/:date')
  @RequirePermissions('read_all_cash_sessions')
  @ApiOperation({ summary: 'Consolidado de las cajas de todas las sedes en un día' })
  @ApiParam({ name: 'date', description: 'Día del negocio, YYYY-MM-DD' })
  getDay(@Param('date') date: string) {
    return this.service.getDay(date);
  }

  @Put('day/:date/reviews/:cashRegisterId')
  @RequirePermissions('perform_general_closing')
  @ApiOperation({ summary: 'Marcar la revisión de una caja en el cierre del día' })
  @ApiParam({ name: 'date', description: 'Día del negocio, YYYY-MM-DD' })
  @ApiResponse({ status: 400, description: 'La caja sigue abierta, el día está cerrado o la revisión no le corresponde' })
  reviewRegister(
    @Param('date') date: string,
    @Param('cashRegisterId', ParseUUIDPipe) cashRegisterId: string,
    @Body() dto: ReviewRegisterDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.reviewRegister(date, cashRegisterId, dto, userId);
  }

  @Post('day/:date/close')
  @RequirePermissions('perform_general_closing')
  @ApiOperation({ summary: 'Firmar el cierre general del día' })
  @ApiParam({ name: 'date', description: 'Día del negocio, YYYY-MM-DD' })
  @ApiResponse({ status: 400, description: 'Hay cajas abiertas o sin revisar' })
  closeDay(
    @Param('date') date: string,
    @Body() dto: CloseGeneralClosingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.closeDay(date, dto, userId);
  }

  @Post(':id/reopen')
  @RequirePermissions('reopen_general_closing')
  @ApiOperation({ summary: 'Reabrir un cierre general firmado (motivo obligatorio)' })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenGeneralClosingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.reopen(id, dto, userId);
  }
}
