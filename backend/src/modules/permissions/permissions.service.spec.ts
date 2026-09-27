import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './permissions.repository';

const mockPermissionsRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  findByNameExcludingId: jest.fn(),
  findByIds: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findRoleName: jest.fn(),
};

describe('PermissionsService', () => {
  let service: PermissionsService;

  // Fixture: permiso como lo devuelve el repository
  const mockPermissionFromRepo = {
    id: 'perm-1',
    name: 'read_users',
    description: 'Read users',
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [
      { role: { id: 'role-1', name: 'admin' } },
    ],
  };

  // Fixture: permiso sin roles asignados
  const mockPermissionNoRoles = {
    ...mockPermissionFromRepo,
    roles: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PermissionsRepository, useValue: mockPermissionsRepository },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────
  describe('findAll', () => {
    it('should delegate to permissionsRepository.findAll', async () => {
      mockPermissionsRepository.findAll.mockResolvedValue([mockPermissionFromRepo]);

      const result = await service.findAll();

      expect(mockPermissionsRepository.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockPermissionFromRepo]);
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return permission with flattened roles array', async () => {
      mockPermissionsRepository.findById.mockResolvedValue(mockPermissionFromRepo);

      const result = await service.findOne('perm-1');

      expect(result).toMatchObject({
        id: 'perm-1',
        name: 'read_users',
        description: 'Read users',
      });
      expect(result.roles).toEqual([{ id: 'role-1', name: 'admin' }]);
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPermissionsRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('bad-id')).rejects.toThrow(
        'Permission with ID bad-id not found',
      );
    });
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    const createDto = { name: 'delete_users', description: 'Delete users' };

    it('should create permission when name is unique', async () => {
      mockPermissionsRepository.findByName.mockResolvedValue(null);
      mockPermissionsRepository.create.mockResolvedValue(mockPermissionFromRepo);

      await service.create(createDto);

      expect(mockPermissionsRepository.create).toHaveBeenCalledWith(createDto);
    });

    it('should throw BadRequestException when permission name already exists', async () => {
      mockPermissionsRepository.findByName.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto)).rejects.toThrow(
        'Permission name already exists',
      );
      expect(mockPermissionsRepository.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // createMany
  // ─────────────────────────────────────────────
  describe('createMany', () => {
    it('should return success entries for all permissions when names are unique', async () => {
      mockPermissionsRepository.findByName.mockResolvedValue(null);
      mockPermissionsRepository.create.mockResolvedValue(mockPermissionFromRepo);

      const result = await service.createMany([
        { name: 'read_orders', description: 'Read orders' },
        { name: 'create_orders', description: 'Create orders' },
      ]);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.success === true)).toBe(true);
    });

    it('should return failure entry when a permission name already exists', async () => {
      // Primera crea bien, segunda duplicada
      mockPermissionsRepository.findByName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });
      mockPermissionsRepository.create.mockResolvedValue(mockPermissionFromRepo);

      const result = await service.createMany([
        { name: 'read_orders', description: 'Read orders' },
        { name: 'read_users', description: 'Already exists' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
      expect(result[1]).toHaveProperty('error', 'Permission name already exists');
      expect(result[1]).toHaveProperty('name', 'read_users');
    });

    it('should continue processing remaining permissions after a failure', async () => {
      mockPermissionsRepository.findByName
        .mockResolvedValueOnce({ id: 'existing' }) // primera falla
        .mockResolvedValueOnce(null);              // segunda OK
      mockPermissionsRepository.create.mockResolvedValue(mockPermissionFromRepo);

      const result = await service.createMany([
        { name: 'duplicate', description: 'x' },
        { name: 'new_perm', description: 'y' },
      ]);

      expect(result[0].success).toBe(false);
      expect(result[1].success).toBe(true);
    });

    it('should return empty array when input is empty', async () => {
      const result = await service.createMany([]);

      expect(result).toEqual([]);
      expect(mockPermissionsRepository.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe('update', () => {
    beforeEach(() => {
      mockPermissionsRepository.findById.mockResolvedValue(mockPermissionFromRepo);
      mockPermissionsRepository.findByNameExcludingId.mockResolvedValue(null);
      mockPermissionsRepository.update.mockResolvedValue(mockPermissionFromRepo);
    });

    it('should update permission and return result from repository', async () => {
      const result = await service.update('perm-1', { description: 'Updated desc' });

      expect(mockPermissionsRepository.update).toHaveBeenCalledWith('perm-1', {
        description: 'Updated desc',
      });
      expect(result).toEqual(mockPermissionFromRepo);
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPermissionsRepository.findById.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when new name is already used', async () => {
      mockPermissionsRepository.findByNameExcludingId.mockResolvedValue({ id: 'other' });

      await expect(service.update('perm-1', { name: 'taken' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('perm-1', { name: 'taken' })).rejects.toThrow(
        'Permission name already in use',
      );
    });

    it('should not check name uniqueness when name is not being updated', async () => {
      await service.update('perm-1', { description: 'New desc' });

      expect(mockPermissionsRepository.findByNameExcludingId).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────
  describe('remove', () => {
    it('should delete permission and return success message', async () => {
      mockPermissionsRepository.findById.mockResolvedValue(mockPermissionNoRoles);
      mockPermissionsRepository.delete.mockResolvedValue({});

      const result = await service.remove('perm-1');

      expect(mockPermissionsRepository.delete).toHaveBeenCalledWith('perm-1');
      expect(result).toEqual({
        message: `Permission "read_users" deleted successfully`,
      });
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPermissionsRepository.findById.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow(NotFoundException);
      expect(mockPermissionsRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when permission is assigned to at least one role', async () => {
      // mockPermissionFromRepo ya tiene roles: [{ role: ... }]
      mockPermissionsRepository.findById.mockResolvedValue(mockPermissionFromRepo);

      await expect(service.remove('perm-1')).rejects.toThrow(BadRequestException);
      await expect(service.remove('perm-1')).rejects.toThrow(
        'Cannot delete permission assigned to roles',
      );
      expect(mockPermissionsRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('permisos reservados a soporte', () => {
    const reservado = { ...mockPermissionFromRepo, id: 'perm-ml', name: 'manage_locations', roles: [] };

    it('no aparecen en la lista para quien no es soporte', async () => {
      mockPermissionsRepository.findAll.mockResolvedValue([mockPermissionFromRepo, reservado]);
      mockPermissionsRepository.findRoleName.mockResolvedValue('admin');

      const result = await service.findAll('role-adm');

      expect(result.map((p: any) => p.name)).toEqual(['read_users']);
    });

    it('soporte sí los ve', async () => {
      mockPermissionsRepository.findAll.mockResolvedValue([mockPermissionFromRepo, reservado]);
      mockPermissionsRepository.findRoleName.mockResolvedValue('soporte');

      expect(await service.findAll('role-sop')).toHaveLength(2);
    });

    it('su detalle es 404 para quien no es soporte', async () => {
      mockPermissionsRepository.findById.mockResolvedValue(reservado);
      mockPermissionsRepository.findRoleName.mockResolvedValue('admin');

      await expect(service.findOne('perm-ml', 'role-adm')).rejects.toThrow(NotFoundException);
    });

    it('no se crean por la API', async () => {
      await expect(
        service.create({ name: 'manage_locations', description: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('no se editan ni se les pone su nombre a otro permiso', async () => {
      mockPermissionsRepository.findById.mockResolvedValueOnce(reservado);
      await expect(service.update('perm-ml', { description: 'x' } as any)).rejects.toThrow(ForbiddenException);

      mockPermissionsRepository.findById.mockResolvedValueOnce(mockPermissionFromRepo);
      await expect(
        service.update('perm-1', { name: 'manage_locations' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
