import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload, TokenPair, AuthenticatedUser } from '../../common/interfaces';
import { SessionLogsService } from '../session-logs/session-logs.service';
import { AttendanceService } from '../attendance/attendance.service';
import { VIEW_ALL_LOCATIONS_PERMISSION } from '../../common/utils/location-context';
import { findActiveLocationSupport } from '../../common/utils/location-support.util';

/** Sedes del usuario que viajan con el login y con `/auth/me`. */
export interface UserLocations {
  locations: {
    id: string;
    code: string;
    name: string;
    type: string;
    color: string;
    address: string | null;
    phone: string | null;
  }[];
  defaultLocationId: string | null;
  canViewAllLocations: boolean;
  /**
   * Apoyo en otra sede vigente (docs/PLAN_SEDES.md §16). Mientras dura, su sede
   * es la única de `locations` y la predeterminada.
   */
  activeLocationSupport: {
    id: string;
    locationId: string;
    startDate: string;
    endDate: string;
    reason: string;
    authorizedBy: string | null;
    /** Venció, pero sigue hasta que cierre su caja en esa sede. */
    overdue: boolean;
  } | null;
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SessionLogsService))
    private readonly sessionLogsService: SessionLogsService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Valida las credenciales del usuario
   * Retorna el usuario sin el password si es válido, null si no
   */
  async validateUser(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        password: true,
        roleId: true,
        firstName: true,
        lastName: true,
        profilePhoto: true,
        cargoId: true,
        mustChangePassword: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            productionArea: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    if (!user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    return {
      id: user.id,
      username: user.username!,
      email: user.email,
      roleId: user.roleId,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePhoto: user.profilePhoto,
      cargoId: user.cargoId,
      mustChangePassword: user.mustChangePassword,
      role: user.role,
      cargo: user.cargo,
    };
  }

  /**
   * Genera tokens y los guarda en la base de datos
   * Llamado después de una autenticación exitosa
   */
  async login(user: AuthenticatedUser): Promise<TokenPair> {
    const tokens = await this.generateTokens(user);

    // Hashear y guardar el refresh token
    const hashedRefreshToken = await bcrypt.hash(
      tokens.refreshToken,
      this.SALT_ROUNDS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return tokens;
  }

  /**
   * Login que retorna los tokens y los permisos del usuario
   */
  async loginWithPermissions(
    user: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    TokenPair & { user: AuthenticatedUser; permissions: string[] } & UserLocations
  > {
    const tokens = await this.login(user);
    const permissions = await this.getUserPermissions(user.id);
    const locations = await this.getUserLocations(user.id, permissions);

    // Create session log
    await this.sessionLogsService.createLoginLog(user.id, ipAddress, userAgent);

    return {
      ...tokens,
      user,
      permissions,
      ...locations,
    };
  }

  /**
   * Sedes en las que el usuario puede operar y la predeterminada, para el
   * selector del frontend. Con `view_all_locations` son todas las activas; con
   * un apoyo en otra sede vigente, solo la del apoyo.
   * Ver docs/PLAN_SEDES.md §5 y §16.
   */
  async getUserLocations(userId: string, permissions: string[]): Promise<UserLocations> {
    const select = {
      id: true,
      code: true,
      name: true,
      type: true,
      color: true,
      address: true,
      phone: true,
    } as const;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultLocationId: true,
        locations: {
          where: { location: { isActive: true } },
          select: { location: { select } },
          orderBy: { location: { sortOrder: 'asc' } },
        },
      },
    });

    const canViewAll = permissions.includes(VIEW_ALL_LOCATIONS_PERMISSION);
    const support = canViewAll ? null : await findActiveLocationSupport(this.prisma, userId);
    if (support) {
      const by = support.reviewedBy;
      return {
        locations: [support.location],
        defaultLocationId: support.locationId,
        canViewAllLocations: false,
        activeLocationSupport: {
          id: support.id,
          locationId: support.locationId,
          startDate: support.startDate.toISOString().slice(0, 10),
          endDate: support.endDate.toISOString().slice(0, 10),
          reason: support.reason,
          authorizedBy: by ? [by.firstName, by.lastName].filter(Boolean).join(' ') || by.username : null,
          overdue: support.overdue,
        },
      };
    }

    const locations = canViewAll
      ? await this.prisma.location.findMany({
          where: { isActive: true },
          select,
          orderBy: { sortOrder: 'asc' },
        })
      : (user?.locations ?? []).map((ul) => ul.location);

    const defaultLocationId =
      user?.defaultLocationId && locations.some((l) => l.id === user.defaultLocationId)
        ? user.defaultLocationId
        : null;

    return { locations, defaultLocationId, canViewAllLocations: canViewAll, activeLocationSupport: null };
  }

  /**
   * Refresca el access token usando el refresh token
   */
  async refreshTokens(userId: string, refreshToken: string): Promise<TokenPair & { user: AuthenticatedUser }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        roleId: true,
        firstName: true,
        lastName: true,
        profilePhoto: true,
        cargoId: true,
        mustChangePassword: true,
        refreshToken: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            productionArea: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.refreshToken || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Verificar el refresh token contra el hash almacenado
    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username!,
      email: user.email,
      roleId: user.roleId,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePhoto: user.profilePhoto,
      cargoId: user.cargoId,
      mustChangePassword: user.mustChangePassword,
      role: user.role,
      cargo: user.cargo,
    };

    // Generar nuevos tokens
    const tokens = await this.generateTokens(authenticatedUser);

    // Actualizar el refresh token en la base de datos
    const hashedRefreshToken = await bcrypt.hash(
      tokens.refreshToken,
      this.SALT_ROUNDS,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      ...tokens,
      user: authenticatedUser,
    };
  }

  /**
   * Cierra la sesión del usuario eliminando su refresh token
   */
  async logout(userId: string): Promise<void> {
    // Cerrar registro de asistencia activo si existe
    await this.attendanceService.closeOpenRecordOnLogout(userId);

    // Create logout log
    await this.sessionLogsService.createLogoutLog(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  /**
   * Obtiene el perfil del usuario con sus permisos
   */
  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        cargo: {
          include: {
            productionArea: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    // Extraer solo los nombres de los permisos
    const permissions = user.role.permissions.map((rp: any) => rp.permission.name);
    const locations = await this.getUserLocations(user.id, permissions);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePhoto: user.profilePhoto,
        roleId: user.roleId,
        cargoId: user.cargoId,
        mustChangePassword: user.mustChangePassword,
        role: {
          id: user.role.id,
          name: user.role.name,
        },
        cargo: user.cargo ? {
          id: user.cargo.id,
          name: user.cargo.name,
          productionArea: user.cargo.productionArea ? {
            id: user.cargo.productionArea.id,
            name: user.cargo.productionArea.name,
          } : null,
        } : null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      permissions,
      ...locations,
    };
  }

  /**
   * Actualiza la foto de perfil del usuario
   */
  async updateProfilePhoto(userId: string, profilePhoto: string | null) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profilePhoto },
      select: {
        id: true,
        profilePhoto: true,
      },
    });

    return user;
  }

  /**
   * Verifica la contraseña del usuario autenticado
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    return true;
  }

  /**
   * Cambia la contraseña del usuario autenticado
   * Limpia el flag mustChangePassword al completar el cambio
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, mustChangePassword: false },
    });
  }

  /**
   * Genera un par de tokens (access + refresh)
   */
  private async generateTokens(user: AuthenticatedUser): Promise<TokenPair> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      roleId: user.roleId,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      roleId: user.roleId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Obtiene los permisos de un usuario por su ID
   */
  private async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    if (!user.isActive) {
      return [];
    }

    return user.role.permissions.map((rp: any) => rp.permission.name);
  }
}
