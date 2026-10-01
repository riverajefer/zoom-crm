import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { RolesRepository } from '../roles/roles.repository';
import { CargosRepository } from '../cargos/cargos.repository';
import { RolePrivilegeService } from '../roles/role-privilege.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockUsersRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailExcludingId: jest.fn(),
  findByUsernameExcludingId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  updateRefreshToken: jest.fn(),
  delete: jest.fn(),
  setLocations: jest.fn(),
  countActiveLocations: jest.fn(),
};

const mockRolesRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  findByNameExcludingId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

// La regla de privilegios tiene sus propias pruebas; aquí siempre deja pasar.
const mockRolePrivilegeService = {
  assertCanAssignRole: jest.fn(),
  assertCanManageUser: jest.fn(),
  assertCanManageRole: jest.fn(),
  assertCanGrantPermissions: jest.fn(),
  isSupportRole: jest.fn(),
};

const mockCargosRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByArea: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  // Fixture: a user as returned from usersRepository.findById (with nested permissions)
  const mockUserFromRepo = {
    id: 'user-1',
    email: 'test@example.com',
    isActive: true,
    firstName: 'John',
    lastName: 'Doe',
    profilePhoto: null,
    roleId: 'role-1',
    cargoId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: {
      id: 'role-1',
      name: 'admin',
      permissions: [
        { permission: { id: 'perm-1', name: 'read_users', description: 'Read users' } },
        { permission: { id: 'perm-2', name: 'create_users', description: 'Create users' } },
      ],
    },
    cargo: null,
  };

  const mockRole = { id: 'role-1', name: 'admin', description: 'Administrator' };
  const mockCargo = { id: 'cargo-1', name: 'Developer', isActive: true };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: RolesRepository, useValue: mockRolesRepository },
        { provide: CargosRepository, useValue: mockCargosRepository },
        { provide: RolePrivilegeService, useValue: mockRolePrivilegeService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────
  describe('findAll', () => {
    it('should delegate to usersRepository.findAll', async () => {
      mockUsersRepository.findAll.mockResolvedValue([mockUserFromRepo]);

      const result = await service.findAll();

      expect(mockUsersRepository.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockUserFromRepo]);
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return user with permissions flattened (rp.permission unwrapped)', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);

      const result = await service.findOne('user-1');

      expect(result.role.permissions).toEqual([
        { id: 'perm-1', name: 'read_users', description: 'Read users' },
        { id: 'perm-2', name: 'create_users', description: 'Create users' },
      ]);
      expect(result.id).toBe('user-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('nonexistent-id')).rejects.toThrow(
        'User with ID nonexistent-id not found',
      );
    });
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      email: 'new@example.com',
      password: 'plain-password',
      firstName: 'Jane',
      lastName: 'Smith',
      roleId: 'role-1',
      cargoId: undefined as string | undefined,
    };

    beforeEach(() => {
      mockUsersRepository.findByEmail.mockResolvedValue(null);
      mockRolesRepository.findById.mockResolvedValue(mockRole);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockUsersRepository.create.mockResolvedValue({ id: 'new-user', ...createDto });
    });

    it('should create user with hashed password when no cargoId is provided', async () => {
      await service.create(createDto, 'actor-role');

      expect(bcrypt.hash).toHaveBeenCalledWith(createDto.password, 12);
      expect(mockUsersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'hashed-password',
          email: createDto.email,
          role: { connect: { id: createDto.roleId } },
        }),
      );
      // cargo should NOT be in the create call when cargoId is undefined
      const callArg = mockUsersRepository.create.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('cargo');
    });

    it('guarda nombre y apellido en mayúscula sostenida, con tildes y sin espacios de sobra', async () => {
      await service.create(
        { ...createDto, firstName: '  josé   Ángel ', lastName: 'muñoz peña' },
        'actor-role',
      );

      expect(mockUsersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'JOSÉ ÁNGEL', lastName: 'MUÑOZ PEÑA' }),
      );
    });

    it('should create user with cargo connect when cargoId is provided and active', async () => {
      mockCargosRepository.findById.mockResolvedValue(mockCargo);
      const dtoWithCargo = { ...createDto, cargoId: 'cargo-1' };

      await service.create(dtoWithCargo, 'actor-role');

      const callArg = mockUsersRepository.create.mock.calls[0][0];
      expect(callArg).toHaveProperty('cargo', { connect: { id: 'cargo-1' } });
    });

    it('should throw BadRequestException when email already registered', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto, 'actor-role')).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto, 'actor-role')).rejects.toThrow('Email already registered');
      expect(mockRolesRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when roleId is invalid', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(service.create(createDto, 'actor-role')).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto, 'actor-role')).rejects.toThrow('Invalid role ID');
    });

    it('should throw BadRequestException when cargoId is invalid', async () => {
      mockCargosRepository.findById.mockResolvedValue(null);
      const dtoWithCargo = { ...createDto, cargoId: 'bad-cargo-id' };

      await expect(service.create(dtoWithCargo, 'actor-role')).rejects.toThrow(BadRequestException);
      await expect(service.create(dtoWithCargo, 'actor-role')).rejects.toThrow('Invalid cargo ID');
    });

    it('should throw BadRequestException when cargo is inactive', async () => {
      mockCargosRepository.findById.mockResolvedValue({ ...mockCargo, isActive: false });
      const dtoWithCargo = { ...createDto, cargoId: 'cargo-1' };

      await expect(service.create(dtoWithCargo, 'actor-role')).rejects.toThrow(BadRequestException);
      await expect(service.create(dtoWithCargo, 'actor-role')).rejects.toThrow(
        'Cannot assign an inactive cargo',
      );
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe('update', () => {
    beforeEach(() => {
      // findOne (findById) call inside update
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);
      mockUsersRepository.findByEmailExcludingId.mockResolvedValue(null);
      mockRolesRepository.findById.mockResolvedValue(mockRole);
      mockCargosRepository.findById.mockResolvedValue(mockCargo);
      mockUsersRepository.update.mockResolvedValue({ ...mockUserFromRepo });
    });

    it('should update user data without hashing password when password is not provided', async () => {
      await service.update('user-1', { firstName: 'Updated' }, 'actor-role');

      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('al editar el nombre lo guarda en mayúscula sostenida', async () => {
      await service.update('user-1', { firstName: 'carolina ', lastName: 'gonzález pérez' }, 'actor-role');

      expect(mockUsersRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ firstName: 'CAROLINA', lastName: 'GONZÁLEZ PÉREZ' }),
      );
    });

    it('should hash new password when password field is provided', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      await service.update('user-1', { password: 'new-plain-password' }, 'actor-role');

      expect(bcrypt.hash).toHaveBeenCalledWith('new-plain-password', 12);
      const callArg = mockUsersRepository.update.mock.calls[0][1];
      expect(callArg).toHaveProperty('password', 'new-hashed-password');
    });

    it('should use Prisma connect syntax when roleId is provided', async () => {
      await service.update('user-1', { roleId: 'role-1' }, 'actor-role');

      const callArg = mockUsersRepository.update.mock.calls[0][1];
      expect(callArg).toHaveProperty('role', { connect: { id: 'role-1' } });
    });

    it('should use Prisma disconnect syntax when cargoId is explicitly null', async () => {
      await service.update('user-1', { cargoId: null }, 'actor-role');

      const callArg = mockUsersRepository.update.mock.calls[0][1];
      expect(callArg).toHaveProperty('cargo', { disconnect: true });
    });

    it('should use Prisma connect syntax when cargoId has a value', async () => {
      await service.update('user-1', { cargoId: 'cargo-1' }, 'actor-role');

      const callArg = mockUsersRepository.update.mock.calls[0][1];
      expect(callArg).toHaveProperty('cargo', { connect: { id: 'cargo-1' } });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(null);

      await expect(service.update('bad-id', { firstName: 'X' }, 'actor-role')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when new email is already used by another user', async () => {
      mockUsersRepository.findByEmailExcludingId.mockResolvedValue({ id: 'other-user' });

      await expect(service.update('user-1', { email: 'taken@example.com' }, 'actor-role')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('user-1', { email: 'taken@example.com' }, 'actor-role')).rejects.toThrow(
        'Email already in use',
      );
    });

    it('should throw BadRequestException when new roleId is invalid', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(service.update('user-1', { roleId: 'invalid-role' }, 'actor-role')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('user-1', { roleId: 'invalid-role' }, 'actor-role')).rejects.toThrow(
        'Invalid role ID',
      );
    });
  });

  // ─────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────
  describe('remove', () => {
    const adminUser = {
      id: 'admin-1',
      role: { id: 'role-1', name: 'admin' },
    } as any;

    const managerUser = {
      id: 'manager-1',
      role: { id: 'role-2', name: 'manager' },
    } as any;

    it('should delete user and return success message', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-1', name: 'admin' });
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);
      mockUsersRepository.delete.mockResolvedValue(mockUserFromRepo);

      const result = await service.remove('user-1', adminUser);

      expect(mockUsersRepository.delete).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ message: 'User with ID user-1 deleted successfully' });
    });

    it('should throw ForbiddenException when current user is not admin', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-2', name: 'manager' });
      await expect(service.remove('user-1', managerUser)).rejects.toThrow('Only admin users can deactivate users');
      expect(mockUsersRepository.findById).not.toHaveBeenCalled();
      expect(mockUsersRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-1', name: 'admin' });
      mockUsersRepository.findById.mockResolvedValue(null);

      await expect(service.remove('bad-id', adminUser)).rejects.toThrow(NotFoundException);
      expect(mockUsersRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    const adminUser = {
      id: 'admin-1',
      role: { id: 'role-1', name: 'admin' },
    } as any;

    const managerUser = {
      id: 'manager-1',
      role: { id: 'role-2', name: 'manager' },
    } as any;

    it('should deactivate user and return success message', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-1', name: 'admin' });
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);
      mockUsersRepository.deactivate.mockResolvedValue({ ...mockUserFromRepo, isActive: false });

      const result = await service.deactivate('user-1', adminUser);

      expect(mockUsersRepository.deactivate).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        expect.objectContaining({
          message: 'User with ID user-1 deactivated successfully',
          user: expect.objectContaining({ id: 'user-1', isActive: false }),
        }),
      );
    });

    it('should throw ForbiddenException when current user is not admin', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-2', name: 'manager' });
      await expect(service.deactivate('user-1', managerUser)).rejects.toThrow(
        'Only admin users can deactivate users',
      );
      expect(mockUsersRepository.findById).not.toHaveBeenCalled();
      expect(mockUsersRepository.deactivate).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-1', name: 'admin' });
      mockUsersRepository.findById.mockResolvedValue(null);

      await expect(service.deactivate('bad-id', adminUser)).rejects.toThrow(NotFoundException);
      expect(mockUsersRepository.deactivate).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user is already inactive', async () => {
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-1', name: 'admin' });
      mockUsersRepository.findById.mockResolvedValue({ ...mockUserFromRepo, isActive: false });

      await expect(service.deactivate('user-1', adminUser)).rejects.toThrow(
        'User is already deactivated',
      );
      expect(mockUsersRepository.deactivate).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // Privilegios
  // ─────────────────────────────────────────────
  describe('privilegios', () => {
    it('no crea la cuenta si el rol pedido excede los permisos de quien la crea', async () => {
      mockUsersRepository.findByUsername.mockResolvedValue(null);
      mockUsersRepository.findByEmail.mockResolvedValue(null);
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-admin', name: 'admin' });
      mockRolePrivilegeService.assertCanAssignRole.mockRejectedValueOnce(
        new ForbiddenException('sin permisos'),
      );

      await expect(
        service.create(
          { username: 'nuevo', password: 'secreta', firstName: 'N', lastName: 'U', roleId: 'role-admin' } as any,
          'role-conta',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepository.create).not.toHaveBeenCalled();
    });

    // El alta desde nómina usa un rol fijo que no elige quien hace la petición.
    it('con actor null (rol fijado por el sistema) no aplica la regla', async () => {
      mockUsersRepository.findByUsername.mockResolvedValue(null);
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-user', name: 'user' });
      mockUsersRepository.create.mockResolvedValue({ id: 'u-new' });

      await service.create(
        { username: 'empleado', password: 'secreta', firstName: 'E', lastName: 'M', roleId: 'role-user' } as any,
        null,
      );

      expect(mockRolePrivilegeService.assertCanAssignRole).not.toHaveBeenCalled();
    });

    it('no edita a un usuario con más permisos (su contraseña, su correo, su rol)', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);
      mockRolePrivilegeService.assertCanManageUser.mockRejectedValueOnce(
        new ForbiddenException('sin permisos'),
      );

      await expect(
        service.update('user-1', { password: 'robada' } as any, 'role-comercial'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepository.update).not.toHaveBeenCalled();
    });

    it('al cambiar el rol valida también el rol nuevo', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);
      mockRolesRepository.findById.mockResolvedValue({ id: 'role-2', name: 'caja' });
      mockUsersRepository.update.mockResolvedValue(mockUserFromRepo);

      await service.update('user-1', { roleId: 'role-2' } as any, 'role-conta');

      expect(mockRolePrivilegeService.assertCanManageUser).toHaveBeenCalledWith(
        'role-conta',
        'user-1',
      );
      expect(mockRolePrivilegeService.assertCanAssignRole).toHaveBeenCalledWith(
        'role-conta',
        'role-2',
      );
    });
  });

  // ─────────────────────────────────────────────
  // Soporte oculto y sedes (docs/PLAN_SEDES.md §6.1 y §6.5)
  // ─────────────────────────────────────────────
  describe('usuarios de soporte', () => {
    const soporte = { ...mockUserFromRepo, id: 'u-sop', role: { ...mockUserFromRepo.role, name: 'soporte' } };

    it('quien no es soporte no ve a los usuarios de soporte en la lista', async () => {
      mockUsersRepository.findAll.mockResolvedValue([mockUserFromRepo, soporte]);
      mockRolePrivilegeService.isSupportRole.mockResolvedValue(false);

      const result = await service.findAll('role-admin');

      expect(result.map((u: any) => u.id)).toEqual(['user-1']);
    });

    it('soporte los ve a todos', async () => {
      mockUsersRepository.findAll.mockResolvedValue([mockUserFromRepo, soporte]);
      mockRolePrivilegeService.isSupportRole.mockResolvedValue(true);

      expect(await service.findAll('role-soporte')).toHaveLength(2);
    });

    it('el detalle de un usuario de soporte es 404 para los demás', async () => {
      mockUsersRepository.findById.mockResolvedValue(soporte);
      mockRolePrivilegeService.isSupportRole.mockResolvedValue(false);

      await expect(service.findOne('u-sop', 'role-admin')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setLocations', () => {
    beforeEach(() => {
      mockUsersRepository.findById.mockResolvedValue(mockUserFromRepo);
      mockRolePrivilegeService.isSupportRole.mockResolvedValue(false);
      mockUsersRepository.setLocations.mockResolvedValue(mockUserFromRepo);
    });

    it('guarda las sedes sin repetir y la predeterminada', async () => {
      mockUsersRepository.countActiveLocations.mockResolvedValue(2);

      await service.setLocations(
        'user-1',
        { locationIds: ['l-104', 'l-119', 'l-104'], defaultLocationId: 'l-119' },
        'role-admin',
      );

      expect(mockRolePrivilegeService.assertCanManageUser).toHaveBeenCalledWith('role-admin', 'user-1');
      expect(mockUsersRepository.setLocations).toHaveBeenCalledWith('user-1', ['l-104', 'l-119'], 'l-119');
    });

    it('rechaza una predeterminada que no está entre las permitidas', async () => {
      await expect(
        service.setLocations('user-1', { locationIds: ['l-104'], defaultLocationId: 'l-119' }, 'role-admin'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUsersRepository.setLocations).not.toHaveBeenCalled();
    });

    it('rechaza sedes inexistentes o inactivas', async () => {
      mockUsersRepository.countActiveLocations.mockResolvedValue(1);

      await expect(
        service.setLocations('user-1', { locationIds: ['l-104', 'l-vieja'] }, 'role-admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('una lista vacía deja al usuario sin sede', async () => {
      await service.setLocations('user-1', { locationIds: [] }, 'role-admin');

      expect(mockUsersRepository.countActiveLocations).not.toHaveBeenCalled();
      expect(mockUsersRepository.setLocations).toHaveBeenCalledWith('user-1', [], null);
    });
  });
});
