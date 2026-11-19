import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FilterHistoricalSalesDto } from './dto';
import { HistoricalSalesService } from './historical-sales.service';

@ApiTags('historical-sales')
@ApiBearerAuth('JWT-auth')
@Controller('historical-sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HistoricalSalesController {
  constructor(private readonly service: HistoricalSalesService) {}

  @Get()
  @RequirePermissions('read_historical_sales')
  @ApiOperation({ summary: 'OP históricas de las planillas de Excel (paginado)' })
  @ApiResponse({ status: 200, description: 'Ventas históricas de las sedes que el usuario puede ver' })
  findAll(@Query() filters: FilterHistoricalSalesDto) {
    return this.service.findAll(filters);
  }

  @Get('summary')
  @RequirePermissions('read_historical_sales')
  @ApiOperation({ summary: 'Totales del histórico con los mismos filtros del listado' })
  getSummary(@Query() filters: FilterHistoricalSalesDto) {
    return this.service.getSummary(filters);
  }

  @Get('filter-options')
  @RequirePermissions('read_historical_sales')
  @ApiOperation({ summary: 'Vendedores y años disponibles para filtrar' })
  getFilterOptions() {
    return this.service.getFilterOptions();
  }

  @Get('export')
  @RequirePermissions('export_historical_sales')
  @ApiOperation({ summary: 'Ventas históricas filtradas, con sus líneas, para exportar' })
  @ApiResponse({ status: 400, description: 'Demasiadas ventas para exportar' })
  findForExport(@Query() filters: FilterHistoricalSalesDto) {
    return this.service.findForExport(filters);
  }

  @Get(':id')
  @RequirePermissions('read_historical_sales')
  @ApiOperation({ summary: 'Detalle de una OP histórica con sus líneas' })
  @ApiParam({ name: 'id', description: 'ID de la venta histórica' })
  @ApiResponse({ status: 404, description: 'No existe o es de otra sede' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}
