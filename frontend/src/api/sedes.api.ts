import axiosInstance from './axios';
import { CreateSedeDto, Sede, SetUserLocationsDto, UpdateSedeDto, User } from '../types';

/** Sedes de Zoom (`/sedes` en el backend). Ver docs/PLAN_SEDES.md. */
export const sedesApi = {
  /** Sedes activas. Cualquier usuario autenticado. */
  getActive: async (): Promise<Sede[]> => {
    const response = await axiosInstance.get<Sede[]>('/sedes');
    return response.data;
  },

  /** Todas las sedes, incluidas las inactivas. Solo soporte (`manage_locations`). */
  getAllForManagement: async (): Promise<Sede[]> => {
    const response = await axiosInstance.get<Sede[]>('/sedes/manage');
    return response.data;
  },

  create: async (data: CreateSedeDto): Promise<Sede> => {
    const response = await axiosInstance.post<Sede>('/sedes', data);
    return response.data;
  },

  update: async (id: string, data: UpdateSedeDto): Promise<Sede> => {
    const response = await axiosInstance.patch<Sede>(`/sedes/${id}`, data);
    return response.data;
  },

  /** Sedes permitidas y predeterminada de un usuario (`manage_user_locations`). */
  setUserLocations: async (userId: string, data: SetUserLocationsDto): Promise<User> => {
    const response = await axiosInstance.put<User>(`/users/${userId}/locations`, data);
    return response.data;
  },
};
