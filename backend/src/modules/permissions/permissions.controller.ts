import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto, UpdatePermissionDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';
import { CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('permissions')
@ApiBearerAuth('JWT-auth')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /**
   * GET /api/v1/permissions
   * Lista todos los permisos
   * Requiere permiso: read_permissions
   */
  @Get()
  @RequirePermissions('read_permissions')
  findAll(@CurrentUser('roleId') actorRoleId: string) {
    return this.permissionsService.findAll(actorRoleId);
  }

  /**
   * GET /api/v1/permissions/:id
   * Obtiene un permiso por ID
   * Requiere permiso: read_permissions
   */
  @Get(':id')
  @RequirePermissions('read_permissions')
  findOne(@Param('id') id: string, @CurrentUser('roleId') actorRoleId: string) {
    return this.permissionsService.findOne(id, actorRoleId);
  }

  /**
   * POST /api/v1/permissions
   * Crea un nuevo permiso
   * Requiere permiso: create_permissions
   */
  @Post()
  @RequirePermissions('create_permissions')
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  /**
   * POST /api/v1/permissions/bulk
   * Crea múltiples permisos
   * Requiere permiso: create_permissions
   */
  @Post('bulk')
  @RequirePermissions('create_permissions')
  createMany(@Body() permissions: CreatePermissionDto[]) {
    return this.permissionsService.createMany(permissions);
  }

  /**
   * PUT /api/v1/permissions/:id
   * Actualiza un permiso
   * Requiere permiso: update_permissions
   */
  @Put(':id')
  @RequirePermissions('update_permissions')
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto);
  }

  /**
   * DELETE /api/v1/permissions/:id
   * Elimina un permiso
   * Requiere permiso: delete_permissions
   */
  @Delete(':id')
  @RequirePermissions('delete_permissions')
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}
