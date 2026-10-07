import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard, JwtAuthGuard } from './guards';
import { LoginDto, RefreshTokenDto, UpdateProfilePhotoDto, ChangePasswordDto, VerifyPasswordDto } from './dto';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthenticatedUser, TokenPair } from '../../common/interfaces';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Autentica un usuario con email y password
   * Retorna access token y refresh token
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() _loginDto: LoginDto, // Validación del DTO
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TokenPair & { user: AuthenticatedUser; permissions: string[] }> {
    // Extract IP address (handle proxy headers)
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || request.ip
      || request.socket.remoteAddress;

    // Extract user agent
    const userAgent = request.headers['user-agent'];

    return this.authService.loginWithPermissions(user, ipAddress, userAgent);
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresca el access token usando el refresh token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<TokenPair & { user: AuthenticatedUser }> {
    return this.authService.refreshTokens(
      refreshTokenDto.userId,
      refreshTokenDto.refreshToken,
    );
  }

  /**
   * GET /api/v1/auth/logout-check
   * Lo consulta el botón «Cerrar sesión» antes de salir (solo Zoom).
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('logout-check')
  @ApiOperation({
    summary: '¿El usuario puede cerrar sesión?',
    description:
      'El encargado de la caja no puede salir con una caja abierta por él. ' +
      'Devuelve la sesión de caja que lo impide, si la hay.',
  })
  async logoutCheck(@CurrentUser('id') userId: string) {
    return this.authService.getLogoutCheck(userId);
  }

  /**
   * POST /api/v1/auth/logout
   * Cierra la sesión del usuario (invalida el refresh token)
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 409, description: 'CASH_SESSION_OPEN: el encargado de la caja debe cerrarla antes de salir' })
  async logout(
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.authService.logout(userId);
    return { message: 'Logged out successfully' };
  }

  /**
   * POST /api/v1/auth/me
   * Retorna información del usuario autenticado con sus permisos
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('me')
  @HttpCode(HttpStatus.OK)
  async getProfile(
    @CurrentUser('id') userId: string,
  ): Promise<{ user: any; permissions: string[] }> {
    return this.authService.getUserProfile(userId);
  }

  /**
   * GET /api/v1/auth/profile
   * Retorna el perfil completo del usuario autenticado
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getFullProfile(
    @CurrentUser('id') userId: string,
  ): Promise<{ user: any; permissions: string[] }> {
    return this.authService.getUserProfile(userId);
  }

  /**
   * POST /api/v1/auth/change-password
   * Cambia la contraseña del usuario autenticado (obligatorio en primer login)
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar contraseña propia (obligatorio en primer login)' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada correctamente' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    return { message: 'Contraseña actualizada correctamente' };
  }

  /**
   * POST /api/v1/auth/verify-password
   * Verifica la contraseña del usuario autenticado
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('verify-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar contraseña del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Contraseña verificada correctamente' })
  @ApiResponse({ status: 401, description: 'Contraseña incorrecta' })
  async verifyPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyPasswordDto,
  ): Promise<{ valid: boolean }> {
    await this.authService.verifyPassword(userId, dto.password);
    return { valid: true };
  }

  /**
   * PATCH /api/v1/auth/profile/photo
   * Actualiza la foto de perfil del usuario autenticado
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('profile/photo')
  @ApiOperation({ summary: 'Update profile photo' })
  @ApiResponse({ status: 200, description: 'Profile photo updated successfully' })
  async updateProfilePhoto(
    @CurrentUser('id') userId: string,
    @Body() updateProfilePhotoDto: UpdateProfilePhotoDto,
  ): Promise<{ id: string; profilePhoto: string | null }> {
    return this.authService.updateProfilePhoto(userId, updateProfilePhotoDto.profilePhoto || null);
  }
}
