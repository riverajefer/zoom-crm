import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { UpdateProductionSettingsDto } from './dto';
import { ProductionSettingsService } from './production-settings.service';

@ApiTags('production-settings')
@ApiBearerAuth('JWT-auth')
@Controller('production-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionSettingsController {
  constructor(private readonly service: ProductionSettingsService) {}

  @Get()
  @RequirePermissions('manage_production_settings')
  @ApiOperation({ summary: 'Parámetros del reporte de productividad' })
  get() {
    return this.service.get();
  }

  @Put()
  @RequirePermissions('manage_production_settings')
  @ApiOperation({
    summary: 'Editar los parámetros del reporte de productividad',
    description:
      'Divisor del valor hora, recargo de la hora extra y umbrales del semáforo de mano de obra / venta. Aplica a todo el reporte, también a periodos pasados.',
  })
  @ApiResponse({ status: 400, description: 'Valores fuera de rango o umbral de atención ≥ alerta' })
  update(@Body() dto: UpdateProductionSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(dto, user.id);
  }
}
