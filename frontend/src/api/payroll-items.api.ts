import axiosInstance from './axios';
import type { PayrollItem, CreatePayrollItemDto, UpdatePayrollItemDto } from '../types';
import type { CreatePayrollPaymentsDto, PayrollPayment } from '../types/payroll-item.types';

export const payrollItemsApi = {
  getByPeriod: async (periodId: string): Promise<PayrollItem[]> => {
    const { data } = await axiosInstance.get<PayrollItem[]>(`/payroll/periods/${periodId}/items`);
    return data;
  },

  create: async (periodId: string, payload: CreatePayrollItemDto): Promise<PayrollItem> => {
    const { data } = await axiosInstance.post<PayrollItem>(
      `/payroll/periods/${periodId}/items`,
      payload,
    );
    return data;
  },

  update: async (
    periodId: string,
    itemId: string,
    payload: UpdatePayrollItemDto,
  ): Promise<PayrollItem> => {
    const { data } = await axiosInstance.put<PayrollItem>(
      `/payroll/periods/${periodId}/items/${itemId}`,
      payload,
    );
    return data;
  },

  delete: async (periodId: string, itemId: string): Promise<void> => {
    await axiosInstance.delete(`/payroll/periods/${periodId}/items/${itemId}`);
  },

  getPayments: async (periodId: string): Promise<PayrollPayment[]> => {
    const { data } = await axiosInstance.get<PayrollPayment[]>(
      `/payroll/periods/${periodId}/payments`,
    );
    return data;
  },

  registerPayments: async (
    periodId: string,
    itemId: string,
    payload: CreatePayrollPaymentsDto,
  ): Promise<{ payments: PayrollPayment[]; periodStatus: string }> => {
    const { data } = await axiosInstance.post(
      `/payroll/periods/${periodId}/items/${itemId}/payments`,
      payload,
    );
    return data;
  },

  voidPayment: async (
    periodId: string,
    paymentId: string,
    reason: string,
  ): Promise<{ payment: PayrollPayment; periodStatus: string }> => {
    const { data } = await axiosInstance.patch(
      `/payroll/periods/${periodId}/payments/${paymentId}/void`,
      { reason },
    );
    return data;
  },
};
