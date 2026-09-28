import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request as NestRequest,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { LocationLookupDto } from '../../common/dto/location-lookup.dto';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  FilterQuotesDto,
} from './dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('Cotizaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @RequirePermissions('create_quotes')
  @ApiOperation({ summary: 'Crear una nueva cotización' })
  create(@Body() createQuoteDto: CreateQuoteDto, @NestRequest() req: AuthenticatedRequest) {
    return this.quotesService.create(createQuoteDto, req.user.id);
  }

  @Get()
  @RequirePermissions('read_quotes')
  @ApiOperation({ summary: 'Listar cotizaciones con filtros' })
  findAll(
    @Query() filters: FilterQuotesDto,
    @NestRequest() req: AuthenticatedRequest,
  ) {
    return this.quotesService.findAll(filters, req.user.id);
  }

  // Antes de `@Get(':id')`: si no, `lookup` se tomaría como un id.
  @Get('lookup')
  @RequirePermissions('read_quotes', 'read_other_locations')
  @ApiOperation({ summary: 'Buscar COT en las otras sedes, agrupadas por sede (modo consulta)' })
  lookup(@Query() { q }: LocationLookupDto) {
    return this.quotesService.lookupInOtherLocations(q);
  }

  @Get(':id')
  @RequirePermissions('read_quotes')
  @ApiOperation({ summary: 'Obtener detalle de una cotización' })
  findOne(@Param('id') id: string) {
    return this.quotesService.findOneForView(id);
  }

  @Patch(':id')
  @RequirePermissions('update_quotes')
  @ApiOperation({ summary: 'Actualizar una cotización' })
  update(
    @Param('id') id: string,
    @Body() updateQuoteDto: UpdateQuoteDto,
    @NestRequest() req: AuthenticatedRequest,
  ) {
    return this.quotesService.update(id, updateQuoteDto, req.user.id);
  }

  @Delete(':id')
  @RequirePermissions('delete_quotes')
  @ApiOperation({ summary: 'Eliminar una cotización' })
  remove(@Param('id') id: string) {
    return this.quotesService.remove(id);
  }

  @Post(':id/convert')
  @RequirePermissions('convert_quotes')
  @ApiOperation({ summary: 'Convertir cotización en orden de pedido' })
  convertToOrder(@Param('id') id: string, @NestRequest() req: AuthenticatedRequest) {
    return this.quotesService.convertToOrder(id, req.user.id);
  }

  @Post(':quoteId/items/:itemId/sample-image')
  @RequirePermissions('update_quotes', 'upload_files')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir imagen de muestra para un item de cotización' })
  @ApiParam({ name: 'quoteId', description: 'ID de la cotización' })
  @ApiParam({ name: 'itemId', description: 'ID del item' })
  @ApiBody({
    description: 'Imagen de muestra',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadSampleImage(
    @Param('quoteId') quoteId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @NestRequest() req: AuthenticatedRequest,
  ) {
    return this.quotesService.uploadItemSampleImage(quoteId, itemId, file, req.user.id);
  }

  @Delete(':quoteId/items/:itemId/sample-image')
  @RequirePermissions('update_quotes')
  @ApiOperation({ summary: 'Eliminar imagen de muestra de un item de cotización' })
  @ApiParam({ name: 'quoteId', description: 'ID de la cotización' })
  @ApiParam({ name: 'itemId', description: 'ID del item' })
  async deleteSampleImage(
    @Param('quoteId') quoteId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quotesService.deleteItemSampleImage(quoteId, itemId);
  }
}
