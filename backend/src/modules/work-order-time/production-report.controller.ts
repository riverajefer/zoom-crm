import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { ProductionReportQueryDto } from './dto';
import { ProductionReportService } from './production-report.service';

@ApiTags('production-reports')
@ApiBearerAuth('JWT-auth')
@Controller('production-reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionReportController {
  constructor(private readonly service: ProductionReportService) {}

  @Get('productivity')
  @RequirePermissions('read_production_reports')
  @ApiOperation({
    summary: 'Productividad de producción por operario en un periodo',
    description:
      'Tiempo en planta, tiempo en tareas, ocupación, paralelo, horas extra, OT y máquinas, y calidad del registro. Incluye los totales del periodo anterior de la misma duración. Con read_production_costs trae también costos y mano de obra por OT.',
  })
  @ApiResponse({ status: 400, description: 'Fechas inválidas o periodo de más de 92 días' })
  getProductivity(@Query() query: ProductionReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getReport(query, user.roleId);
  }
}
