import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  loginWithPermissions: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  getUserProfile: jest.fn(),
  updateProfilePhoto: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------
  describe('login', () => {
    it('should call authService.loginWithPermissions with user and request metadata', async () => {
      const user = { id: 'user-1', email: 'admin@example.com' } as any;
      const req = {
        headers: { 'x-forwarded-for': '10.0.0.1', 'user-agent': 'Jest/1.0' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as any;
      mockAuthService.loginWithPermissions.mockResolvedValue({ accessToken: 'tok', user, permissions: [] });

      const result = await controller.login({} as any, user, req);

      expect(mockAuthService.loginWithPermissions).toHaveBeenCalledWith(user, '10.0.0.1', 'Jest/1.0');
      expect(result).toEqual({ accessToken: 'tok', user, permissions: [] });
    });

    it('should fall back to request.ip when x-forwarded-for header is absent', async () => {
      const user = { id: 'user-1' } as any;
      const req = {
        headers: { 'user-agent': 'Jest' },
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      } as any;
      mockAuthService.loginWithPermissions.mockResolvedValue({});

      await controller.login({} as any, user, req);

      expect(mockAuthService.loginWithPermissions).toHaveBeenCalledWith(user, '192.168.1.1', 'Jest');
    });
  });

  // -------------------------------------------------------------------------
  // register (eliminado)
  // -------------------------------------------------------------------------
  // El autoregistro público aceptaba el `roleId` del cliente y el rol admin usa
  // un UUID fijo del seed: una petición sin token creaba un administrador. Los
  // usuarios se crean desde el módulo de Usuarios, con `create_users`.
  describe('register', () => {
    it('no expone un endpoint de registro', () => {
      expect((controller as unknown as Record<string, unknown>).register).toBeUndefined();
      expect(
        Object.getOwnPropertyNames(AuthController.prototype).filter((name) =>
          /register|signup/i.test(name),
        ),
      ).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // refresh
  // -------------------------------------------------------------------------
  describe('refresh', () => {
    it('should delegate to authService.refreshTokens with userId and token', async () => {
      const dto = { userId: 'user-1', refreshToken: 'rf-tok' } as any;
      mockAuthService.refreshTokens.mockResolvedValue({ accessToken: 'new-tok' });

      const result = await controller.refresh(dto);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('user-1', 'rf-tok');
      expect(result).toEqual({ accessToken: 'new-tok' });
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout', () => {
    it('should call authService.logout and return success message', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout('user-1', {});

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', { force: undefined });
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  // -------------------------------------------------------------------------
  // getProfile / getFullProfile
  // -------------------------------------------------------------------------
  describe('getProfile', () => {
    it('should call authService.getUserProfile with the current user id', async () => {
      const profileData = { user: { id: 'user-1' }, permissions: ['read_users'] };
      mockAuthService.getUserProfile.mockResolvedValue(profileData);

      const result = await controller.getProfile('user-1');

      expect(mockAuthService.getUserProfile).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(profileData);
    });
  });

  describe('getFullProfile', () => {
    it('should delegate to authService.getUserProfile', async () => {
      mockAuthService.getUserProfile.mockResolvedValue({ user: {}, permissions: [] });

      await controller.getFullProfile('user-1');

      expect(mockAuthService.getUserProfile).toHaveBeenCalledWith('user-1');
    });
  });

  // -------------------------------------------------------------------------
  // updateProfilePhoto
  // -------------------------------------------------------------------------
  describe('updateProfilePhoto', () => {
    it('should delegate to authService.updateProfilePhoto with userId and photo url', async () => {
      const dto = { profilePhoto: 'https://s3.example.com/photo.png' } as any;
      mockAuthService.updateProfilePhoto.mockResolvedValue({ id: 'user-1', profilePhoto: dto.profilePhoto });

      const result = await controller.updateProfilePhoto('user-1', dto);

      expect(mockAuthService.updateProfilePhoto).toHaveBeenCalledWith('user-1', dto.profilePhoto);
      expect(result).toEqual({ id: 'user-1', profilePhoto: dto.profilePhoto });
    });

    it('should pass null when profilePhoto is undefined', async () => {
      mockAuthService.updateProfilePhoto.mockResolvedValue({ id: 'user-1', profilePhoto: null });

      await controller.updateProfilePhoto('user-1', {} as any);

      expect(mockAuthService.updateProfilePhoto).toHaveBeenCalledWith('user-1', null);
    });
  });
});
