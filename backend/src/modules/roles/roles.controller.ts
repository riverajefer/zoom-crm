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
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';
import { CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('roles')
@ApiBearerAuth('JWT-auth')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * GET /api/v1/roles
   * Lista todos los roles
   * Requiere permiso: read_roles
   */
  @Get()
  @RequirePermissions('read_roles')
  findAll(@CurrentUser('roleId') actorRoleId: string) {
    return this.rolesService.findAll(actorRoleId);
  }

  /**
   * GET /api/v1/roles/:id
   * Obtiene un rol por ID
   * Requiere permiso: read_roles
   */
  @Get(':id')
  @RequirePermissions('read_roles')
  findOne(@Param('id') id: string, @CurrentUser('roleId') actorRoleId: string) {
    return this.rolesService.findOne(id, actorRoleId);
  }

  /**
   * POST /api/v1/roles
   * Crea un nuevo rol
   * Requiere permiso: create_roles
   */
  @Post()
  @RequirePermissions('create_roles')
  create(
    @Body() createRoleDto: CreateRoleDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.rolesService.create(createRoleDto, actorRoleId);
  }

  /**
   * PUT /api/v1/roles/:id
   * Actualiza un rol
   * Requiere permiso: update_roles
   */
  @Put(':id')
  @RequirePermissions('update_roles')
  update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.rolesService.update(id, updateRoleDto, actorRoleId);
  }

  /**
   * PUT /api/v1/roles/:id/permissions
   * Asigna permisos a un rol (reemplaza existentes)
   * Requiere permiso: manage_permissions
   */
  @Put(':id/permissions')
  @RequirePermissions('manage_permissions')
  assignPermissions(
    @Param('id') id: string,
    @Body() assignPermissionsDto: AssignPermissionsDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.rolesService.assignPermissions(
      id,
      assignPermissionsDto,
      actorRoleId,
    );
  }

  /**
   * POST /api/v1/roles/:id/permissions
   * Agrega permisos a un rol (mantiene existentes)
   * Requiere permiso: manage_permissions
   */
  @Post(':id/permissions')
  @RequirePermissions('manage_permissions')
  addPermissions(
    @Param('id') id: string,
    @Body() assignPermissionsDto: AssignPermissionsDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.rolesService.addPermissions(
      id,
      assignPermissionsDto,
      actorRoleId,
    );
  }

  /**
   * DELETE /api/v1/roles/:id/permissions
   * Remueve permisos de un rol
   * Requiere permiso: manage_permissions
   */
  @Delete(':id/permissions')
  @RequirePermissions('manage_permissions')
  removePermissions(
    @Param('id') id: string,
    @Body() assignPermissionsDto: AssignPermissionsDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.rolesService.removePermissions(
      id,
      assignPermissionsDto,
      actorRoleId,
    );
  }

  /**
   * DELETE /api/v1/roles/:id
   * Elimina un rol
   * Requiere permiso: delete_roles
   */
  @Delete(':id')
  @RequirePermissions('delete_roles')
  remove(
    @Param('id') id: string,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.rolesService.remove(id, actorRoleId);
  }
}
