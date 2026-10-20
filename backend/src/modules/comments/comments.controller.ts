import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthenticatedUser } from '../../common/interfaces';
import { CommentsService } from './comments.service';
import { CreateCommentDto, FilterCommentsDto } from './dto';

@ApiTags('comments')
@ApiBearerAuth('JWT-auth')
@Controller('comments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @RequirePermissions('read_comments')
  @ApiOperation({ summary: 'Obtener comentarios de una entidad (COT / OP / OT / OG)' })
  @ApiResponse({ status: 200, description: 'Comentarios obtenidos exitosamente' })
  findByEntity(@Query() filters: FilterCommentsDto) {
    return this.commentsService.findByEntity(filters);
  }

  @Get('mentions')
  @RequirePermissions('read_comments')
  @ApiOperation({ summary: 'Buscar usuarios para mencionar en un comentario (@usuario)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios mencionables' })
  searchMentions(@Query('q') q: string) {
    return this.commentsService.searchMentionableUsers(q ?? '');
  }

  @Post()
  @RequirePermissions('create_comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un comentario en una entidad' })
  @ApiResponse({ status: 201, description: 'Comentario creado exitosamente' })
  create(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.commentsService.create(user.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('create_comments')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un comentario (soft delete)' })
  @ApiResponse({ status: 204, description: 'Comentario eliminado exitosamente' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.commentsService.remove(id, user.id);
  }
}
