import axiosInstance from './axios';
import type { CreateMachineDto, Machine, UpdateMachineDto } from '../types/machine.types';

export const machinesApi = {
  getAll: async (params?: { includeInactive?: boolean }): Promise<Machine[]> => {
    const { data } = await axiosInstance.get<Machine[]>('/machines', { params });
    return data;
  },

  create: async (dto: CreateMachineDto): Promise<Machine> => {
    const { data } = await axiosInstance.post<Machine>('/machines', dto);
    return data;
  },

  update: async (id: string, dto: UpdateMachineDto): Promise<Machine> => {
    const { data } = await axiosInstance.put<Machine>(`/machines/${id}`, dto);
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/machines/${id}`);
  },
};
