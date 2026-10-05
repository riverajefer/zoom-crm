import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, SetUserLocationsDto, UpdateUserDto } from './dto';
import { UsersRepository } from './users.repository';
import { RolesRepository } from '../roles/roles.repository';
import { CargosRepository } from '../cargos/cargos.repository';
import { RolePrivilegeService } from '../roles/role-privilege.service';
import { AuthenticatedUser } from '../../common/interfaces';
import {
  ADMIN_ROLE_NAME,
  SUPPORT_ROLE_NAME,
} from '../../common/constants/roles.constants';

/**
 * Los nombres de usuario se guardan en mayúscula sostenida, sin espacios de
 * sobra. Va en el servicio y no en el DTO porque nómina también crea usuarios
 * (`PayrollEmployeesService.createSystemUser`) llamando a `create` directamente.
 * Conserva tildes y ñ: «José Muñoz» → «JOSÉ MUÑOZ».
 */
function toPersonName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-CO');
}

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly cargosRepository: CargosRepository,
    private readonly rolePrivilegeService: RolePrivilegeService,
  ) {}

  private async assertAdmin(currentUser: AuthenticatedUser): Promise<void> {
    const role = await this.rolesRepository.findById(currentUser.roleId);
    const roleName = role?.name?.toLowerCase();

    if (roleName !== ADMIN_ROLE_NAME && roleName !== SUPPORT_ROLE_NAME) {
      throw new ForbiddenException('Only admin users can deactivate users');
    }
  }

  /**
   * Obtiene todos los usuarios con su rol
   */
  async findAll(actorRoleId?: string) {
    const users = await this.usersRepository.findAll();
    // Los usuarios de soporte solo los ve soporte. Sin actor (llamada interna) no se filtra.
    if (!actorRoleId || (await this.rolePrivilegeService.isSupportRole(actorRoleId))) {
      return users;
    }
    return users.filter((u) => u.role?.name !== SUPPORT_ROLE_NAME);
  }

  /**
   * Obtiene un usuario por ID con su rol y permisos
   */
  async findOne(id: string, actorRoleId?: string) {
    const user = await this.usersRepository.findById(id);

    const hidden =
      user?.role?.name === SUPPORT_ROLE_NAME &&
      !!actorRoleId &&
      !(await this.rolePrivilegeService.isSupportRole(actorRoleId));
    if (!user || hidden) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Transformar la estructura de permisos para mejor legibilidad
    const userResult = user as any;
    return {
      ...userResult,
      role: {
        id: userResult.role.id,
        name: userResult.role.name,
        permissions: userResult.role.permissions.map((rp: any) => rp.permission),
      },
    };
  }

  /**
   * Genera un username único a partir del nombre y apellido.
   * Si el username base ya existe, agrega un sufijo numérico incremental.
   */
  private async generateUniqueUsername(
    firstName?: string,
    lastName?: string,
  ): Promise<string> {
    const parts = [firstName, lastName].filter(Boolean).join('');
    const base = parts.toLowerCase().replace(/\s+/g, '') || 'user';

    const exists = await this.usersRepository.findByUsername(base);
    if (!exists) return base;

    for (let counter = 1; counter <= 999; counter++) {
      const candidate = `${base}${counter}`;
      const taken = await this.usersRepository.findByUsername(candidate);
      if (!taken) return candidate;
    }

    throw new BadRequestException(
      'Could not generate a unique username. Please provide one manually.',
    );
  }

  /**
   * Crea un nuevo usuario
   */
  /**
   * @param actorRoleId Rol de quien crea la cuenta. `null` solo cuando el rol
   *   lo fija el propio sistema y no quien hace la petición (el alta desde
   *   nómina, que siempre usa el rol por defecto de empleado).
   */
  async create(createUserDto: CreateUserDto, actorRoleId: string | null) {
    // Determinar el username
    let username: string;
    if (createUserDto.username) {
      const existingByUsername = await this.usersRepository.findByUsername(
        createUserDto.username,
      );
      if (existingByUsername) {
        throw new BadRequestException('Username already taken');
      }
      username = createUserDto.username;
    } else {
      username = await this.generateUniqueUsername(
        createUserDto.firstName,
        createUserDto.lastName,
      );
    }

    // Verificar si el email ya existe (si se proporciona)
    if (createUserDto.email) {
      const existingUser = await this.usersRepository.findByEmail(createUserDto.email);
      if (existingUser) {
        throw new BadRequestException('Email already registered');
      }
    }

    // Verificar si el rol existe
    const role = await this.rolesRepository.findById(createUserDto.roleId);

    if (!role) {
      throw new BadRequestException('Invalid role ID');
    }

    // Crear una cuenta con un rol es darle esos permisos a alguien: solo se
    // puede con roles contenidos en los tuyos. Ver `RolePrivilegeService`.
    if (actorRoleId !== null) {
      await this.rolePrivilegeService.assertCanAssignRole(
        actorRoleId,
        createUserDto.roleId,
      );
    }

    // Verificar si el cargo existe (si se proporciona)
    if (createUserDto.cargoId) {
      const cargo = await this.cargosRepository.findById(createUserDto.cargoId);

      if (!cargo) {
        throw new BadRequestException('Invalid cargo ID');
      }

      if (!cargo.isActive) {
        throw new BadRequestException('Cannot assign an inactive cargo');
      }
    }

    // Sede inicial (opcional): queda como la única permitida y la
    // predeterminada; las demás se agregan en la ficha (`setLocations`). Pide
    // el mismo permiso que esa pantalla.
    const locationId = createUserDto.locationId;
    if (locationId) {
      if (
        actorRoleId !== null &&
        !(await this.usersRepository.roleHasPermission(actorRoleId, 'manage_user_locations'))
      ) {
        throw new ForbiddenException('No tienes permiso para asignar sedes a los usuarios');
      }
      if ((await this.usersRepository.countActiveLocations([locationId])) !== 1) {
        throw new BadRequestException('La sede no existe o está inactiva');
      }
    }

    // Hashear el password
    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      this.SALT_ROUNDS,
    );

    // Crear el usuario (mustChangePassword=true porque fue creado por un admin)
    return this.usersRepository.create({
      username: username as string,
      ...(createUserDto.email && { email: createUserDto.email }),
      ...(createUserDto.phone && { phone: createUserDto.phone }),
      password: hashedPassword,
      firstName: toPersonName(createUserDto.firstName),
      lastName: toPersonName(createUserDto.lastName),
      mustChangePassword: true,
      role: {
        connect: { id: createUserDto.roleId },
      },
      ...(createUserDto.cargoId && {
        cargo: {
          connect: { id: createUserDto.cargoId },
        },
      }),
      ...(locationId && {
        defaultLocation: { connect: { id: locationId } },
        locations: { create: { location: { connect: { id: locationId } } } },
      }),
    });
  }

  /**
   * Actualiza un usuario
   */
  async update(id: string, updateUserDto: UpdateUserDto, actorRoleId: string) {
    // Verificar que el usuario existe
    await this.findOne(id);

    // Editar a alguien con más permisos que tú —su contraseña, su correo, su
    // rol— es tomar su cuenta. Ver `RolePrivilegeService`.
    await this.rolePrivilegeService.assertCanManageUser(actorRoleId, id);

    // Si se actualiza el username, verificar unicidad
    if (updateUserDto.username) {
      const existingByUsername =
        await this.usersRepository.findByUsernameExcludingId(
          updateUserDto.username,
          id,
        );
      if (existingByUsername) {
        throw new BadRequestException('Username already taken');
      }
    }

    // Si se actualiza el email, verificar que no exista
    if (updateUserDto.email) {
      const existingUser = await this.usersRepository.findByEmailExcludingId(
        updateUserDto.email,
        id,
      );

      if (existingUser) {
        throw new BadRequestException('Email already in use');
      }
    }

    // Si se actualiza el rol, verificar que existe
    if (updateUserDto.roleId) {
      const role = await this.rolesRepository.findById(updateUserDto.roleId);

      if (!role) {
        throw new BadRequestException('Invalid role ID');
      }

      await this.rolePrivilegeService.assertCanAssignRole(
        actorRoleId,
        updateUserDto.roleId,
      );
    }

    // Si se actualiza el cargo, verificar que existe y está activo
    if (updateUserDto.cargoId) {
      const cargo = await this.cargosRepository.findById(updateUserDto.cargoId);

      if (!cargo) {
        throw new BadRequestException('Invalid cargo ID');
      }

      if (!cargo.isActive) {
        throw new BadRequestException('Cannot assign an inactive cargo');
      }
    }

    // Preparar datos de actualización
    const { password, roleId, cargoId, username, isActive, ...updateData } = updateUserDto;

    if (typeof updateData.firstName === 'string') {
      updateData.firstName = toPersonName(updateData.firstName);
    }
    if (typeof updateData.lastName === 'string') {
      updateData.lastName = toPersonName(updateData.lastName);
    }

    // Incluir username si fue provisto
    if (username) {
      (updateData as any).username = username;
    }

    // Si se actualiza el password, hashearlo y forzar cambio en próximo login
    if (password) {
      (updateData as any).password = await bcrypt.hash(
        password,
        this.SALT_ROUNDS,
      );
      (updateData as any).mustChangePassword = true;
    }

    // Si se actualiza isActive, incluirlo y limpiar refreshToken si se desactiva
    if (isActive !== undefined) {
      (updateData as any).isActive = isActive;
      if (!isActive) {
        (updateData as any).refreshToken = null;
      }
    }

    // Si se actualiza el roleId, usar la sintaxis de Prisma connect
    if (roleId) {
      (updateData as any).role = { connect: { id: roleId } };
    }

    // Manejar cargoId: connect si tiene valor, disconnect si es null
    if (cargoId !== undefined) {
      if (cargoId === null) {
        (updateData as any).cargo = { disconnect: true };
      } else {
        (updateData as any).cargo = { connect: { id: cargoId } };
      }
    }

    return this.usersRepository.update(id, updateData);
  }

  /**
   * Elimina un usuario
   */
  async remove(id: string, currentUser: AuthenticatedUser) {
    await this.assertAdmin(currentUser);
    await this.rolePrivilegeService.assertCanManageUser(currentUser.roleId, id);

    await this.findOne(id);

    await this.usersRepository.delete(id);

    return { message: `User with ID ${id} deleted successfully` };
  }

  /**
   * Desactiva un usuario (soft delete)
   */
  async deactivate(id: string, currentUser: AuthenticatedUser) {
    await this.assertAdmin(currentUser);
    await this.rolePrivilegeService.assertCanManageUser(currentUser.roleId, id);

    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.isActive === false) {
      throw new BadRequestException('User is already deactivated');
    }

    const deactivatedUser = await this.usersRepository.deactivate(id);

    return {
      message: `User with ID ${id} deactivated successfully`,
      user: deactivatedUser,
    };
  }

  /**
   * Asigna las sedes en las que opera el usuario y la predeterminada (en la
   * que entra al iniciar sesión). Ver docs/PLAN_SEDES.md §6.5.
   */
  async setLocations(id: string, dto: SetUserLocationsDto, actorRoleId: string) {
    await this.findOne(id, actorRoleId);
    await this.rolePrivilegeService.assertCanManageUser(actorRoleId, id);

    const locationIds = [...new Set(dto.locationIds)];
    const defaultLocationId = dto.defaultLocationId ?? null;

    if (defaultLocationId && !locationIds.includes(defaultLocationId)) {
      throw new BadRequestException(
        'La sede predeterminada tiene que estar entre las sedes permitidas',
      );
    }

    if (locationIds.length > 0) {
      const active = await this.usersRepository.countActiveLocations(locationIds);
      if (active !== locationIds.length) {
        throw new BadRequestException('Alguna de las sedes no existe o está inactiva');
      }
    }

    return this.usersRepository.setLocations(id, locationIds, defaultLocationId);
  }
}
