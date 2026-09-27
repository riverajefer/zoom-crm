import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';

const mockRolesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  assignPermissions: jest.fn(),
  addPermissions: jest.fn(),
  removePermissions: jest.fn(),
};

describe('RolesController', () => {
  let controller: RolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: mockRolesService }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RolesController>(RolesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('should delegate to rolesService.findAll', async () => {
      mockRolesService.findAll.mockResolvedValue([]);
      expect(await controller.findAll('role-actor')).toEqual([]);
      expect(mockRolesService.findAll).toHaveBeenCalledWith('role-actor');
    });
  });

  describe('findOne', () => {
    it('should delegate to rolesService.findOne with the given id', async () => {
      const role = { id: 'role-1', name: 'admin' };
      mockRolesService.findOne.mockResolvedValue(role);
      expect(await controller.findOne('role-1', 'role-actor')).toEqual(role);
      expect(mockRolesService.findOne).toHaveBeenCalledWith('role-1', 'role-actor');
    });
  });

  describe('create', () => {
    it('should delegate to rolesService.create with the dto', async () => {
      const dto = { name: 'editor' } as any;
      mockRolesService.create.mockResolvedValue({ id: 'role-2', ...dto });
      await controller.create(dto, 'actor-role');
      expect(mockRolesService.create).toHaveBeenCalledWith(dto, 'actor-role');
    });
  });

  describe('update', () => {
    it('should delegate to rolesService.update with id and dto', async () => {
      const dto = { name: 'editor-updated' } as any;
      mockRolesService.update.mockResolvedValue({ id: 'role-1', ...dto });
      await controller.update('role-1', dto, 'actor-role');
      expect(mockRolesService.update).toHaveBeenCalledWith('role-1', dto, 'actor-role');
    });
  });

  describe('remove', () => {
    it('should delegate to rolesService.remove', async () => {
      mockRolesService.remove.mockResolvedValue({ id: 'role-1' });
      await controller.remove('role-1', 'actor-role');
      expect(mockRolesService.remove).toHaveBeenCalledWith('role-1', 'actor-role');
    });
  });

  describe('assignPermissions', () => {
    it('should delegate to rolesService.assignPermissions', async () => {
      const dto = { permissionIds: ['perm-1', 'perm-2'] } as any;
      mockRolesService.assignPermissions.mockResolvedValue({});
      await controller.assignPermissions('role-1', dto, 'actor-role');
      expect(mockRolesService.assignPermissions).toHaveBeenCalledWith('role-1', dto, 'actor-role');
    });
  });

  describe('addPermissions', () => {
    it('should delegate to rolesService.addPermissions', async () => {
      const dto = { permissionIds: ['perm-3'] } as any;
      mockRolesService.addPermissions.mockResolvedValue({});
      await controller.addPermissions('role-1', dto, 'actor-role');
      expect(mockRolesService.addPermissions).toHaveBeenCalledWith('role-1', dto, 'actor-role');
    });
  });

  describe('removePermissions', () => {
    it('should delegate to rolesService.removePermissions', async () => {
      const dto = { permissionIds: ['perm-1'] } as any;
      mockRolesService.removePermissions.mockResolvedValue({});
      await controller.removePermissions('role-1', dto, 'actor-role');
      expect(mockRolesService.removePermissions).toHaveBeenCalledWith('role-1', dto, 'actor-role');
    });
  });
});
