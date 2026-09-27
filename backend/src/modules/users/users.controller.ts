import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, SetUserLocationsDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthenticatedUser } from '../../common/interfaces';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/v1/users
   * Lista todos los usuarios
   * Requiere permiso: read_users
   */
  @Get()
  @RequirePermissions('read_users')
  findAll(@CurrentUser('roleId') actorRoleId: string) {
    return this.usersService.findAll(actorRoleId);
  }

  /**
   * GET /api/v1/users/:id
   * Obtiene un usuario por ID
   * Requiere permiso: read_users
   */
  @Get(':id')
  @RequirePermissions('read_users')
  findOne(@Param('id') id: string, @CurrentUser('roleId') actorRoleId: string) {
    return this.usersService.findOne(id, actorRoleId);
  }

  /**
   * POST /api/v1/users
   * Crea un nuevo usuario
   * Requiere permiso: create_users
   */
  @Post()
  @RequirePermissions('create_users')
  create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.usersService.create(createUserDto, actorRoleId);
  }

  /**
   * PUT /api/v1/users/:id
   * Actualiza un usuario
   * Requiere permiso: update_users
   */
  @Put(':id')
  @RequirePermissions('update_users')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.usersService.update(id, updateUserDto, actorRoleId);
  }

  /**
   * PUT /api/v1/users/:id/locations
   * Asigna las sedes permitidas y la predeterminada
   * Requiere permiso: manage_user_locations
   */
  @Put(':id/locations')
  @RequirePermissions('manage_user_locations')
  setLocations(
    @Param('id') id: string,
    @Body() dto: SetUserLocationsDto,
    @CurrentUser('roleId') actorRoleId: string,
  ) {
    return this.usersService.setLocations(id, dto, actorRoleId);
  }

  /**
   * PATCH /api/v1/users/:id/deactivate
   * Desactiva un usuario (soft delete)
   * Requiere permiso: update_users + rol admin
   */
  @Patch(':id/deactivate')
  @RequirePermissions('update_users')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usersService.deactivate(id, currentUser);
  }

  /**
   * DELETE /api/v1/users/:id
   * Elimina un usuario
   * Requiere permiso: delete_users
   */
  @Delete(':id')
  @RequirePermissions('delete_users')
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.remove(id, currentUser);
  }
}
