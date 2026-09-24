import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { FilterNotificationsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener notificaciones del usuario actual' })
  @ApiResponse({
    status: 200,
    description: 'Notificaciones obtenidas correctamente',
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() filters: FilterNotificationsDto,
  ) {
    return this.notificationsService.findByUser(userId, filters);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contar notificaciones no leídas' })
  @ApiResponse({
    status: 200,
    description: 'Cantidad de notificaciones no leídas',
  })
  async countUnread(@CurrentUser('id') userId: string) {
    const count = await this.notificationsService.countUnread(userId);
    return { count };
  }

  @Get(':id/target')
  @ApiOperation({
    summary: 'Resolver la entidad a la que lleva una notificación',
    description:
      'Retorna { entityType, entityId } de la entidad con pantalla de detalle (OP, OG, CP, cliente, sesión de caja, insumo), o null si no tiene destino.',
  })
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiResponse({ status: 200, description: 'Destino resuelto (o null)' })
  @ApiResponse({ status: 404, description: 'Notificación no encontrada' })
  async resolveTarget(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.resolveTarget(id, userId);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.notificationsService.markAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }

  @Put('mark-all-read')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiResponse({
    status: 200,
    description: 'Todas las notificaciones marcadas como leídas',
  })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { message: 'All notifications marked as read' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar notificación' })
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiResponse({ status: 200, description: 'Notificación eliminada' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.notificationsService.delete(id, userId);
    return { message: 'Notification deleted' };
  }
}
