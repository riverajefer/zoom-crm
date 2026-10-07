import axiosInstance from './axios';
import { AuthResponse, LoginDto, ProfileResponse, UpdateProfilePhotoDto, UserSedes } from '../types';

export interface LogoutCheck {
  canLogout: boolean;
  openCashSession: {
    id: string;
    cashRegister: { name: string; location: { id: string; name: string } };
  } | null;
}

export const authApi = {
  /**
   * Login con email y password
   */
  login: async (credentials: LoginDto): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  /**
   * Refrescar access token usando refresh token
   */
  refresh: async (userId: string, refreshToken: string): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>('/auth/refresh', {
      userId,
      refreshToken,
    });
    return response.data;
  },

  /**
   * Logout del usuario actual
   * @param token Token explícito a usar (para cuando el store ya fue limpiado)
   */
  logout: async (token?: string): Promise<void> => {
    const config = token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : {};
    await axiosInstance.post('/auth/logout', {}, config);
  },

  /**
   * ¿Puede cerrar sesión? El encargado de la caja no sale con su caja abierta
   * (solo Zoom); la respuesta trae la sesión de caja que lo impide.
   */
  logoutCheck: async (): Promise<LogoutCheck> => {
    const response = await axiosInstance.get<LogoutCheck>('/auth/logout-check');
    return response.data;
  },

  /**
   * Obtener información del usuario actual con sus permisos
   */
  me: async (): Promise<{ user: any; permissions: string[] } & Partial<UserSedes>> => {
    const response = await axiosInstance.post('/auth/me');
    return response.data;
  },

  /**
   * Obtener perfil completo del usuario actual
   */
  getProfile: async (): Promise<ProfileResponse> => {
    const response = await axiosInstance.get<ProfileResponse>('/auth/profile');
    return response.data;
  },

  /**
   * Cambiar contraseña del usuario autenticado
   */
  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> => {
    const response = await axiosInstance.post('/auth/change-password', data);
    return response.data;
  },

  /**
   * Actualizar foto de perfil
   */
  updateProfilePhoto: async (data: UpdateProfilePhotoDto): Promise<{ id: string; profilePhoto: string | null }> => {
    const response = await axiosInstance.patch('/auth/profile/photo', data);
    return response.data;
  },

  /**
   * Verificar contraseña del usuario autenticado
   */
  verifyPassword: async (password: string): Promise<{ valid: boolean }> => {
    const response = await axiosInstance.post<{ valid: boolean }>('/auth/verify-password', { password });
    return response.data;
  },
};
