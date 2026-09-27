import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';

const mockPermissionsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('PermissionsController', () => {
  let controller: PermissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [{ provide: PermissionsService, useValue: mockPermissionsService }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('should delegate to permissionsService.findAll', async () => {
      mockPermissionsService.findAll.mockResolvedValue([]);
      expect(await controller.findAll('role-actor')).toEqual([]);
      expect(mockPermissionsService.findAll).toHaveBeenCalledWith('role-actor');
    });
  });

  describe('findOne', () => {
    it('should delegate to permissionsService.findOne with the given id', async () => {
      const perm = { id: 'perm-1', name: 'read_users' };
      mockPermissionsService.findOne.mockResolvedValue(perm);
      expect(await controller.findOne('perm-1', 'role-actor')).toEqual(perm);
      expect(mockPermissionsService.findOne).toHaveBeenCalledWith('perm-1', 'role-actor');
    });
  });

  describe('create', () => {
    it('should delegate to permissionsService.create with the dto', async () => {
      const dto = { name: 'delete_users', description: 'Delete users' } as any;
      mockPermissionsService.create.mockResolvedValue({ id: 'perm-2', ...dto });
      await controller.create(dto);
      expect(mockPermissionsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('createMany', () => {
    it('should delegate to permissionsService.createMany with the array', async () => {
      const dtos = [{ name: 'perm_a' }, { name: 'perm_b' }] as any[];
      mockPermissionsService.createMany.mockResolvedValue(dtos);
      await controller.createMany(dtos);
      expect(mockPermissionsService.createMany).toHaveBeenCalledWith(dtos);
    });
  });

  describe('update', () => {
    it('should delegate to permissionsService.update with id and dto', async () => {
      const dto = { description: 'Updated' } as any;
      mockPermissionsService.update.mockResolvedValue({ id: 'perm-1', ...dto });
      await controller.update('perm-1', dto);
      expect(mockPermissionsService.update).toHaveBeenCalledWith('perm-1', dto);
    });
  });

  describe('remove', () => {
    it('should delegate to permissionsService.remove with the given id', async () => {
      mockPermissionsService.remove.mockResolvedValue({ id: 'perm-1' });
      await controller.remove('perm-1');
      expect(mockPermissionsService.remove).toHaveBeenCalledWith('perm-1');
    });
  });
});
