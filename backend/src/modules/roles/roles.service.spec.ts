import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { PermissionsRepository } from '../permissions/permissions.repository';
import { RolePrivilegeService } from './role-privilege.service';

const mockRolesRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  findByNameExcludingId: jest.fn(),
  create: jest.fn(),
  createWithPermissions: jest.fn(),
  update: jest.fn(),
  replacePermissions: jest.fn(),
  addPermissions: jest.fn(),
  removePermissions: jest.fn(),
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

const mockPermissionsRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  findByNameExcludingId: jest.fn(),
  findByIds: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('RolesService', () => {
  let service: RolesService;

  // Fixture: rol como lo devuelve rolesRepository.findById
  const mockRoleFromRepo = {
    id: 'role-1',
    name: 'editor',
    description: 'Administrator role',
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [
      { permission: { id: 'perm-1', name: 'read_users', description: 'Read users' } },
      { permission: { id: 'perm-2', name: 'create_users', description: 'Create users' } },
    ],
    users: [],
  };

  // Fixture: rol como lo devuelve findAll (con _count)
  const mockRoleFromFindAll = {
    ...mockRoleFromRepo,
    _count: { users: 0 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: RolesRepository, useValue: mockRolesRepository },
        { provide: PermissionsRepository, useValue: mockPermissionsRepository },
        { provide: RolePrivilegeService, useValue: mockRolePrivilegeService },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────
  describe('findAll', () => {
    it('should return transformed roles with usersCount and flattened permissions', async () => {
      mockRolesRepository.findAll.mockResolvedValue([mockRoleFromFindAll]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'role-1',
        name: 'editor',
        usersCount: 0,
      });
      expect(result[0].permissions).toEqual([
        { id: 'perm-1', name: 'read_users', description: 'Read users' },
        { id: 'perm-2', name: 'create_users', description: 'Create users' },
      ]);
      // _count y la estructura anidada NO deben estar en el resultado
      expect(result[0]).not.toHaveProperty('_count');
    });

    it('should return empty array when no roles exist', async () => {
      mockRolesRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return transformed role with flattened permissions', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);

      const result = await service.findOne('role-1');

      expect(result).toMatchObject({ id: 'role-1', name: 'editor' });
      expect(result.permissions).toEqual([
        { id: 'perm-1', name: 'read_users', description: 'Read users' },
        { id: 'perm-2', name: 'create_users', description: 'Create users' },
      ]);
      expect(result.users).toEqual([]);
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('bad-id')).rejects.toThrow(
        'Role with ID bad-id not found',
      );
    });
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a role without permissions when permissionIds is not provided', async () => {
      mockRolesRepository.findByName.mockResolvedValue(null);
      mockRolesRepository.create.mockResolvedValue(mockRoleFromRepo);

      await service.create({ name: 'editor', description: 'Admin role' }, 'actor-role');

      expect(mockRolesRepository.create).toHaveBeenCalledWith({
        name: 'editor',
        description: 'Admin role',
      });
      expect(mockRolesRepository.createWithPermissions).not.toHaveBeenCalled();
    });

    it('should create a role with permissions when permissionIds is provided', async () => {
      mockRolesRepository.findByName.mockResolvedValue(null);
      mockRolesRepository.createWithPermissions.mockResolvedValue(mockRoleFromRepo);

      await service.create({
        name: 'editor',
        description: 'Editor role',
        permissionIds: ['perm-1', 'perm-2'],
      }, 'actor-role');

      expect(mockRolesRepository.createWithPermissions).toHaveBeenCalledWith(
        'editor',
        'Editor role',
        ['perm-1', 'perm-2'],
      );
      expect(mockRolesRepository.create).not.toHaveBeenCalled();
    });

    it('should return transformed role with flattened permissions', async () => {
      mockRolesRepository.findByName.mockResolvedValue(null);
      mockRolesRepository.create.mockResolvedValue(mockRoleFromRepo);

      const result = await service.create({ name: 'editor' }, 'actor-role');

      expect(result).toMatchObject({ id: 'role-1', name: 'editor' });
      expect(result.permissions).toEqual([
        { id: 'perm-1', name: 'read_users', description: 'Read users' },
        { id: 'perm-2', name: 'create_users', description: 'Create users' },
      ]);
    });

    it('should throw BadRequestException when role name already exists', async () => {
      mockRolesRepository.findByName.mockResolvedValue({ id: 'existing', name: 'editor' });

      await expect(service.create({ name: 'editor' }, 'actor-role')).rejects.toThrow(BadRequestException);
      await expect(service.create({ name: 'editor' }, 'actor-role')).rejects.toThrow(
        'Role name already exists',
      );
      expect(mockRolesRepository.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe('update', () => {
    beforeEach(() => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockRolesRepository.findByNameExcludingId.mockResolvedValue(null);
      mockRolesRepository.update.mockResolvedValue({
        ...mockRoleFromRepo,
        name: 'updated-name',
      });
    });

    it('should update role and return transformed data', async () => {
      const result = await service.update('role-1', { name: 'updated-name' }, 'actor-role');

      expect(mockRolesRepository.update).toHaveBeenCalledWith('role-1', { name: 'updated-name' });
      expect(result).toMatchObject({ id: 'role-1', name: 'updated-name' });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'x' }, 'actor-role')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when new name is already used by another role', async () => {
      mockRolesRepository.findByNameExcludingId.mockResolvedValue({ id: 'other-role' });

      await expect(service.update('role-1', { name: 'taken' }, 'actor-role')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('role-1', { name: 'taken' }, 'actor-role')).rejects.toThrow(
        'Role name already in use',
      );
    });

    it('should not check name uniqueness when name is not being updated', async () => {
      await service.update('role-1', { description: 'new desc' }, 'actor-role');

      expect(mockRolesRepository.findByNameExcludingId).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // assignPermissions
  // ─────────────────────────────────────────────
  describe('assignPermissions', () => {
    const permissionIds = ['perm-1', 'perm-2'];

    beforeEach(() => {
      // findOne (findById) — primera llamada para validar rol
      // segunda llamada al final para retornar el rol actualizado
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockPermissionsRepository.findByIds.mockResolvedValue([
        { id: 'perm-1' },
        { id: 'perm-2' },
      ]);
      mockRolesRepository.replacePermissions.mockResolvedValue([{}, {}]);
    });

    it('should replace permissions and return updated role', async () => {
      const result = await service.assignPermissions('role-1', { permissionIds }, 'actor-role');

      expect(mockRolesRepository.replacePermissions).toHaveBeenCalledWith(
        'role-1',
        permissionIds,
      );
      expect(result).toMatchObject({ id: 'role-1' });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(
        service.assignPermissions('bad-id', { permissionIds }, 'actor-role'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when some permissionIds are invalid', async () => {
      // Solo retorna 1 de los 2 permisos pedidos → alguno no existe
      mockPermissionsRepository.findByIds.mockResolvedValue([{ id: 'perm-1' }]);

      await expect(
        service.assignPermissions('role-1', { permissionIds }, 'actor-role'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.assignPermissions('role-1', { permissionIds }, 'actor-role'),
      ).rejects.toThrow('One or more permission IDs are invalid');
      expect(mockRolesRepository.replacePermissions).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // addPermissions
  // ─────────────────────────────────────────────
  describe('addPermissions', () => {
    it('should add only new permissions (skip already assigned)', async () => {
      // El rol ya tiene perm-1 asignado
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockPermissionsRepository.findByIds.mockResolvedValue([
        { id: 'perm-1' },
        { id: 'perm-3' },
      ]);
      mockRolesRepository.addPermissions.mockResolvedValue({});

      await service.addPermissions('role-1', { permissionIds: ['perm-1', 'perm-3'] }, 'actor-role');

      // perm-1 ya existe, solo debe agregar perm-3
      expect(mockRolesRepository.addPermissions).toHaveBeenCalledWith('role-1', ['perm-3']);
    });

    it('should not call addPermissions when all permissions already assigned', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      // Los dos permisos ya están en el rol (perm-1 y perm-2)
      mockPermissionsRepository.findByIds.mockResolvedValue([
        { id: 'perm-1' },
        { id: 'perm-2' },
      ]);

      await service.addPermissions('role-1', { permissionIds: ['perm-1', 'perm-2'] }, 'actor-role');

      expect(mockRolesRepository.addPermissions).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when some permissionIds are invalid', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockPermissionsRepository.findByIds.mockResolvedValue([{ id: 'perm-1' }]);

      await expect(
        service.addPermissions('role-1', { permissionIds: ['perm-1', 'bad-perm'] }, 'actor-role'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  // removePermissions
  // ─────────────────────────────────────────────
  describe('removePermissions', () => {
    it('should remove permissions and return updated role', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockRolesRepository.removePermissions.mockResolvedValue({});

      await service.removePermissions('role-1', { permissionIds: ['perm-1'] }, 'actor-role');

      expect(mockRolesRepository.removePermissions).toHaveBeenCalledWith('role-1', ['perm-1']);
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(
        service.removePermissions('bad-id', { permissionIds: ['perm-1'] }, 'actor-role'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────
  describe('remove', () => {
    it('should delete role and return success message', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo); // users: []
      mockRolesRepository.delete.mockResolvedValue({});

      const result = await service.remove('role-1', 'actor-role');

      expect(mockRolesRepository.delete).toHaveBeenCalledWith('role-1');
      expect(result).toEqual({ message: 'Role "editor" deleted successfully' });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockRolesRepository.findById.mockResolvedValue(null);

      await expect(service.remove('bad-id', 'actor-role')).rejects.toThrow(NotFoundException);
      expect(mockRolesRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when role has assigned users', async () => {
      mockRolesRepository.findById.mockResolvedValue({
        ...mockRoleFromRepo,
        users: [{ id: 'user-1', email: 'user@example.com' }],
      });

      await expect(service.remove('role-1', 'actor-role')).rejects.toThrow(BadRequestException);
      await expect(service.remove('role-1', 'actor-role')).rejects.toThrow(
        'Cannot delete role with assigned users',
      );
      expect(mockRolesRepository.delete).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // Privilegios y nombre reservado
  // ─────────────────────────────────────────────
  describe('privilegios y rol admin', () => {
    const adminRole = { ...mockRoleFromRepo, id: 'role-admin', name: 'admin' };

    it.each(['admin', 'Admin', 'ADMIN'])(
      'no deja crear un rol llamado «%s»',
      async (name) => {
        await expect(service.create({ name }, 'actor-role')).rejects.toThrow(
          BadRequestException,
        );
        expect(mockRolesRepository.create).not.toHaveBeenCalled();
      },
    );

    it('valida que quien crea el rol tenga los permisos que otorga', async () => {
      mockRolesRepository.findByName.mockResolvedValue(null);
      mockRolesRepository.createWithPermissions.mockResolvedValue(mockRoleFromRepo);

      await service.create(
        { name: 'nuevo', permissionIds: ['perm-1'] },
        'actor-role',
      );

      expect(mockRolePrivilegeService.assertCanGrantPermissions).toHaveBeenCalledWith(
        'actor-role',
        ['perm-1'],
      );
    });

    it('no crea el rol si la regla de privilegios lo rechaza', async () => {
      mockRolePrivilegeService.assertCanGrantPermissions.mockRejectedValueOnce(
        new ForbiddenException('sin permisos'),
      );

      await expect(
        service.create({ name: 'nuevo', permissionIds: ['perm-1'] }, 'actor-role'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRolesRepository.createWithPermissions).not.toHaveBeenCalled();
    });

    it('no deja renombrar el rol admin', async () => {
      mockRolesRepository.findById.mockResolvedValue(adminRole);

      await expect(
        service.update('role-admin', { name: 'Administrador' }, 'actor-role'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRolesRepository.update).not.toHaveBeenCalled();
    });

    it('sí deja cambiarle la descripción al rol admin', async () => {
      mockRolesRepository.findById.mockResolvedValue(adminRole);
      mockRolesRepository.update.mockResolvedValue(adminRole);

      await expect(
        service.update('role-admin', { description: 'nueva' }, 'actor-role'),
      ).resolves.toBeDefined();
    });

    it('no deja renombrar otro rol a «Admin»', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);

      await expect(
        service.update('role-1', { name: 'Admin' }, 'actor-role'),
      ).rejects.toThrow(BadRequestException);
    });

    it('no deja eliminar el rol admin', async () => {
      mockRolesRepository.findById.mockResolvedValue(adminRole);

      await expect(service.remove('role-admin', 'actor-role')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRolesRepository.delete).not.toHaveBeenCalled();
    });

    it('al reemplazar permisos valida el rol destino y los permisos nuevos', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockPermissionsRepository.findByIds.mockResolvedValue([{ id: 'perm-9' }]);

      await service.assignPermissions(
        'role-1',
        { permissionIds: ['perm-9'] },
        'actor-role',
      );

      expect(mockRolePrivilegeService.assertCanManageRole).toHaveBeenCalledWith(
        'actor-role',
        'role-1',
      );
      expect(mockRolePrivilegeService.assertCanGrantPermissions).toHaveBeenCalledWith(
        'actor-role',
        ['perm-9'],
      );
    });

    it('no reemplaza permisos si la regla lo rechaza', async () => {
      mockRolesRepository.findById.mockResolvedValue(mockRoleFromRepo);
      mockPermissionsRepository.findByIds.mockResolvedValue([{ id: 'perm-9' }]);
      mockRolePrivilegeService.assertCanGrantPermissions.mockRejectedValueOnce(
        new ForbiddenException('sin permisos'),
      );

      await expect(
        service.assignPermissions('role-1', { permissionIds: ['perm-9'] }, 'actor-role'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRolesRepository.replacePermissions).not.toHaveBeenCalled();
    });
  });

  describe('rol de soporte', () => {
    const soporte = { id: 'role-sop', name: 'soporte', description: null, createdAt: new Date(), updatedAt: new Date(), _count: { users: 1 }, permissions: [], users: [] };
    const admin = { ...soporte, id: 'role-adm', name: 'admin' };

    it('no aparece en la lista para quien no es soporte', async () => {
      mockRolesRepository.findAll.mockResolvedValue([admin, soporte]);
      mockRolePrivilegeService.isSupportRole.mockResolvedValue(false);

      const result = await service.findAll('role-adm');

      expect(result.map((r) => r.name)).toEqual(['admin']);
    });

    it('su detalle es 404 para quien no es soporte', async () => {
      mockRolesRepository.findById.mockResolvedValue(soporte);
      mockRolePrivilegeService.isSupportRole.mockResolvedValue(false);

      await expect(service.findOne('role-sop', 'role-adm')).rejects.toThrow(NotFoundException);
    });

    it.each(['soporte', 'Soporte', ' SOPORTE '])('el nombre «%s» está reservado', async (name) => {
      await expect(service.create({ name } as any, 'role-adm')).rejects.toThrow(/reservado/);
    });

    it('no se puede eliminar', async () => {
      mockRolesRepository.findById.mockResolvedValue(soporte);

      await expect(service.remove('role-sop', 'role-sop')).rejects.toThrow(BadRequestException);
    });
  });
});
