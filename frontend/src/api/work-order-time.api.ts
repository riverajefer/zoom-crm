import axiosInstance from './axios';
import type { WorkOrderTimeEntry } from '../types/work-order.types';
import type {
  AdjustTimeEntryDto,
  CreateManualTimeEntryDto,
  MachineOption,
  MyRunningTasksResponse,
  OperatorOption,
  StartTimeEntryDto,
} from '../types/work-order-time.types';

const BASE = '/work-order-time-entries';

/** Temporizador de producción de la OT. */
export const workOrderTimeApi = {
  getMyRunning: async (): Promise<MyRunningTasksResponse> => {
    const { data } = await axiosInstance.get<MyRunningTasksResponse>(`${BASE}/my-running`);
    return data;
  },

  getMachines: async (): Promise<MachineOption[]> => {
    const { data } = await axiosInstance.get<MachineOption[]>(`${BASE}/machines`);
    return data;
  },

  start: async (dto: StartTimeEntryDto): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.post<WorkOrderTimeEntry>(`${BASE}/start`, dto);
    return data;
  },

  stop: async (entryId: string): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.post<WorkOrderTimeEntry>(`${BASE}/${entryId}/stop`);
    return data;
  },

  extend: async (entryId: string): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.post<WorkOrderTimeEntry>(`${BASE}/${entryId}/extend`);
    return data;
  },

  getPendingReview: async (): Promise<WorkOrderTimeEntry[]> => {
    const { data } = await axiosInstance.get<WorkOrderTimeEntry[]>(`${BASE}/pending-review`);
    return data;
  },

  getOperators: async (): Promise<OperatorOption[]> => {
    const { data } = await axiosInstance.get<OperatorOption[]>(`${BASE}/operators`);
    return data;
  },

  createManual: async (dto: CreateManualTimeEntryDto): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.post<WorkOrderTimeEntry>(`${BASE}/manual`, dto);
    return data;
  },

  adjust: async (entryId: string, dto: AdjustTimeEntryDto): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.patch<WorkOrderTimeEntry>(`${BASE}/${entryId}/adjust`, dto);
    return data;
  },

  void: async (entryId: string, reason: string): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.post<WorkOrderTimeEntry>(`${BASE}/${entryId}/void`, { reason });
    return data;
  },

  markReviewed: async (entryId: string): Promise<WorkOrderTimeEntry> => {
    const { data } = await axiosInstance.post<WorkOrderTimeEntry>(`${BASE}/${entryId}/review`);
    return data;
  },
};
