import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionsGuard } from '../../common/guards';

const mockUsersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  remove: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('should delegate to usersService.findAll', async () => {
      mockUsersService.findAll.mockResolvedValue([]);
      const result = await controller.findAll('role-actor');
      expect(mockUsersService.findAll).toHaveBeenCalledWith('role-actor');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should delegate to usersService.findOne with the given id', async () => {
      const user = { id: 'user-1', email: 'a@b.com' };
      mockUsersService.findOne.mockResolvedValue(user);
      const result = await controller.findOne('user-1', 'role-actor');
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-1', 'role-actor');
      expect(result).toEqual(user);
    });
  });

  describe('create', () => {
    it('should delegate to usersService.create with the dto', async () => {
      const dto = { email: 'new@test.com', password: 'pass' } as any;
      const created = { id: 'user-2', ...dto };
      mockUsersService.create.mockResolvedValue(created);
      const result = await controller.create(dto, 'actor-role');
      expect(mockUsersService.create).toHaveBeenCalledWith(dto, 'actor-role');
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('should delegate to usersService.update with id and dto', async () => {
      const dto = { firstName: 'Jane' } as any;
      const updated = { id: 'user-1', firstName: 'Jane' };
      mockUsersService.update.mockResolvedValue(updated);
      const result = await controller.update('user-1', dto, 'actor-role');
      expect(mockUsersService.update).toHaveBeenCalledWith('user-1', dto, 'actor-role');
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delegate to usersService.remove with the given id', async () => {
      mockUsersService.remove.mockResolvedValue({ id: 'user-1' });
      const currentUser = { id: 'admin-1', role: { id: 'role-1', name: 'admin' } } as any;
      await controller.remove('user-1', currentUser);
      expect(mockUsersService.remove).toHaveBeenCalledWith('user-1', currentUser);
    });
  });

  describe('deactivate', () => {
    it('should delegate to usersService.deactivate with id and current user', async () => {
      const currentUser = { id: 'admin-1', role: { id: 'role-1', name: 'admin' } } as any;
      const payload = { message: 'User with ID user-1 deactivated successfully' };
      mockUsersService.deactivate.mockResolvedValue(payload);

      const result = await controller.deactivate('user-1', currentUser);

      expect(mockUsersService.deactivate).toHaveBeenCalledWith('user-1', currentUser);
      expect(result).toEqual(payload);
    });
  });
});
