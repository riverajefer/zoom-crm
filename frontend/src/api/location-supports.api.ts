import axiosInstance from './axios';
import type {
  LocationSupport,
  LocationSupportView,
  RequestLocationSupportDto,
  ScheduleLocationSupportDto,
} from '../types';

/** Apoyos en otra sede (`/location-supports`, solo Zoom). Ver docs/PLAN_SEDES.md §16. */
export const locationSupportsApi = {
  /** Gerencia (`authorize_location_support`). */
  list: async (view: LocationSupportView, userId?: string): Promise<LocationSupport[]> => {
    const { data } = await axiosInstance.get<LocationSupport[]>('/location-supports', { params: { view, userId } });
    return data;
  },

  mine: async (): Promise<LocationSupport[]> => {
    const { data } = await axiosInstance.get<LocationSupport[]>('/location-supports/mine');
    return data;
  },

  /** Pedir apoyo en otra sede, o un cambio de sede si ya está de apoyo. */
  request: async (dto: RequestLocationSupportDto): Promise<LocationSupport> => {
    const { data } = await axiosInstance.post<LocationSupport>('/location-supports/requests', dto);
    return data;
  },

  cancel: async (id: string): Promise<LocationSupport> => {
    const { data } = await axiosInstance.post<LocationSupport>(`/location-supports/${id}/cancel`);
    return data;
  },

  schedule: async (dto: ScheduleLocationSupportDto): Promise<LocationSupport> => {
    const { data } = await axiosInstance.post<LocationSupport>('/location-supports', dto);
    return data;
  },

  approve: async (id: string, reviewNotes?: string): Promise<LocationSupport> => {
    const { data } = await axiosInstance.post<LocationSupport>(`/location-supports/${id}/approve`, { reviewNotes });
    return data;
  },

  reject: async (id: string, reviewNotes?: string): Promise<LocationSupport> => {
    const { data } = await axiosInstance.post<LocationSupport>(`/location-supports/${id}/reject`, { reviewNotes });
    return data;
  },

  /** Termina un apoyo vigente antes de tiempo, o cancela uno programado. */
  end: async (id: string, reason: string): Promise<LocationSupport> => {
    const { data } = await axiosInstance.post<LocationSupport>(`/location-supports/${id}/end`, { reason });
    return data;
  },
};
