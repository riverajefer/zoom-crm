import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useOrders,
  useOrder,
  useOrderPayments,
  useOrderProfitability,
  useProfitabilityList,
  useSalesSummary,
  useSalesGoals,
  useOrdersDashboardSummary,
} from './useOrders';
import { ordersApi } from '../../../api/orders.api';

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: enqueueMock }) }));

vi.mock('../../../api/orders.api', () => ({
  ordersApi: {
    getDashboardSummary: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    getPayments: vi.fn(),
    addPayment: vi.fn(),
    updatePayment: vi.fn(),
    getProfitability: vi.fn(),
    getProfitabilityList: vi.fn(),
    getSalesSummary: vi.fn(),
    getSalesGoals: vi.fn(),
    upsertSalesGoal: vi.fn(),
    deleteSalesGoal: vi.fn(),
  },
}));

const createWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  (ordersApi.getAll as any).mockResolvedValue({ data: [{ id: 'o1' }], meta: {} });
  (ordersApi.getById as any).mockResolvedValue({ id: 'o1' });
  (ordersApi.create as any).mockResolvedValue({ id: 'o1' });
  (ordersApi.update as any).mockResolvedValue({ id: 'o1' });
  (ordersApi.updateStatus as any).mockResolvedValue({ id: 'o1' });
  (ordersApi.delete as any).mockResolvedValue({});
  (ordersApi.getPayments as any).mockResolvedValue([{ id: 'pay1' }]);
  (ordersApi.addPayment as any).mockResolvedValue({ id: 'pay1' });
  (ordersApi.updatePayment as any).mockResolvedValue({ id: 'pay1' });
  (ordersApi.getDashboardSummary as any).mockResolvedValue({ total: 0 });
});
afterEach(() => vi.clearAllMocks());

describe('useOrders (lista)', () => {
  it('lista órdenes con filtros', async () => {
    const { result } = renderHook(() => useOrders({ status: 'ACTIVE' } as any), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.ordersQuery.isSuccess).toBe(true));
    expect(ordersApi.getAll).toHaveBeenCalledWith({ status: 'ACTIVE' });
  });

  it('create notifica éxito', async () => {
    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.createOrderMutation.mutateAsync({ clientId: 'c1' } as any);
    });
    expect(enqueueMock).toHaveBeenCalledWith('Orden creada correctamente', { variant: 'success' });
  });

  it('updateStatus notifica éxito', async () => {
    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.updateStatusMutation.mutateAsync({ id: 'o1', status: 'PAID' as any });
    });
    expect(ordersApi.updateStatus).toHaveBeenCalledWith('o1', 'PAID');
    expect(enqueueMock).toHaveBeenCalledWith('Estado actualizado correctamente', {
      variant: 'success',
    });
  });

  it('updateStatus envía el motivo al devolver la orden a un estado previo', async () => {
    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.updateStatusMutation.mutateAsync({
        id: 'o1',
        status: 'CONFIRMED' as any,
        reason: 'Se registró por error',
      });
    });
    expect(ordersApi.updateStatus).toHaveBeenCalledWith('o1', 'CONFIRMED', {
      reason: 'Se registró por error',
    });
  });

  it('updateStatus NO muestra snackbar ante un 403 (lo maneja el diálogo de autorización)', async () => {
    (ordersApi.updateStatus as any).mockRejectedValue({ response: { status: 403 } });
    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.updateStatusMutation
        .mutateAsync({ id: 'o1', status: 'PAID' as any })
        .catch(() => {});
    });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('updateStatus muestra el error del backend para otros códigos', async () => {
    (ordersApi.updateStatus as any).mockRejectedValue({
      response: { status: 400, data: { message: 'Transición inválida' } },
    });
    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.updateStatusMutation
        .mutateAsync({ id: 'o1', status: 'PAID' as any })
        .catch(() => {});
    });
    expect(enqueueMock).toHaveBeenCalledWith('Transición inválida', { variant: 'error' });
  });

  it('delete elimina la orden', async () => {
    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.deleteOrderMutation.mutateAsync('o1');
    });
    expect(ordersApi.delete).toHaveBeenCalledWith('o1');
  });
});

describe('useOrder (detalle)', () => {
  it('carga el detalle con id', async () => {
    const { result } = renderHook(() => useOrder('o1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.orderQuery.isSuccess).toBe(true));
    expect(ordersApi.getById).toHaveBeenCalledWith('o1');
  });

  it('no carga sin id', async () => {
    vi.clearAllMocks();
    const { result } = renderHook(() => useOrder(''), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.orderQuery.fetchStatus).toBe('idle');
    expect(ordersApi.getById).not.toHaveBeenCalled();
  });

  it('update y delete llaman a la API', async () => {
    const { result } = renderHook(() => useOrder('o1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.updateOrderMutation.mutateAsync({ notes: 'x' } as any);
    });
    await act(async () => {
      await result.current.deleteOrderMutation.mutateAsync();
    });
    expect(ordersApi.update).toHaveBeenCalledWith('o1', { notes: 'x' });
    expect(ordersApi.delete).toHaveBeenCalledWith('o1');
  });
});

describe('useOrderPayments', () => {
  it('lista pagos y registra uno nuevo', async () => {
    const { result } = renderHook(() => useOrderPayments('o1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.paymentsQuery.isSuccess).toBe(true));

    await act(async () => {
      await result.current.addPaymentMutation.mutateAsync({ amount: 100 } as any);
    });
    expect(ordersApi.addPayment).toHaveBeenCalledWith('o1', { amount: 100 });
    expect(enqueueMock).toHaveBeenCalledWith('Pago registrado correctamente', {
      variant: 'success',
    });
  });

  it('updatePayment avisa cuando queda pendiente de aprobación', async () => {
    (ordersApi.updatePayment as any).mockResolvedValue({
      status: 'PENDING_APPROVAL',
      message: 'Enviado a aprobación',
    });
    const { result } = renderHook(() => useOrderPayments('o1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.updatePaymentMutation.mutateAsync({
        paymentId: 'pay1',
        data: { amount: 200 } as any,
      });
    });
    expect(enqueueMock).toHaveBeenCalledWith('Enviado a aprobación', { variant: 'info' });
  });

  it('updatePayment notifica éxito cuando se aplica directamente', async () => {
    (ordersApi.updatePayment as any).mockResolvedValue({ id: 'pay1' });
    const { result } = renderHook(() => useOrderPayments('o1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.updatePaymentMutation.mutateAsync({
        paymentId: 'pay1',
        data: { amount: 200 } as any,
      });
    });
    expect(enqueueMock).toHaveBeenCalledWith('Pago actualizado correctamente', {
      variant: 'success',
    });
  });
});

describe('queries de rentabilidad y ventas', () => {
  it('useOrderProfitability consulta por orden', async () => {
    (ordersApi.getProfitability as any).mockResolvedValue({ margin: 0.3 });
    const { result } = renderHook(() => useOrderProfitability('o1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ordersApi.getProfitability).toHaveBeenCalledWith('o1');
  });

  it('useProfitabilityList consulta la lista', async () => {
    (ordersApi.getProfitabilityList as any).mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useProfitabilityList({ page: 1 } as any), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ordersApi.getProfitabilityList).toHaveBeenCalledWith({ page: 1 });
  });

  it('useSalesSummary consulta el resumen', async () => {
    (ordersApi.getSalesSummary as any).mockResolvedValue({ total: 0 });
    const { result } = renderHook(() => useSalesSummary(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ordersApi.getSalesSummary).toHaveBeenCalled();
  });

  it('useOrdersDashboardSummary carga el mini dashboard', async () => {
    const { result } = renderHook(() => useOrdersDashboardSummary(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ordersApi.getDashboardSummary).toHaveBeenCalled();
  });
});

describe('useSalesGoals', () => {
  it('no consulta sin mes y año', async () => {
    const { result } = renderHook(() => useSalesGoals({}), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.goalsQuery.fetchStatus).toBe('idle');
    expect(ordersApi.getSalesGoals).not.toHaveBeenCalled();
  });

  it('consulta las metas cuando hay mes y año', async () => {
    (ordersApi.getSalesGoals as any).mockResolvedValue([]);
    const { result } = renderHook(() => useSalesGoals({ month: 8, year: 2026 }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.goalsQuery.isSuccess).toBe(true));
    expect(ordersApi.getSalesGoals).toHaveBeenCalledWith({ month: 8, year: 2026 });
  });

  it('upsert y delete de metas', async () => {
    (ordersApi.upsertSalesGoal as any).mockResolvedValue({ id: 'g1' });
    (ordersApi.deleteSalesGoal as any).mockResolvedValue({});
    const { result } = renderHook(() => useSalesGoals({ month: 8, year: 2026 }), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.upsertMutation.mutateAsync({ amount: 1000 } as any);
    });
    await act(async () => {
      await result.current.deleteMutation.mutateAsync('g1');
    });
    expect(ordersApi.upsertSalesGoal).toHaveBeenCalled();
    expect(ordersApi.deleteSalesGoal).toHaveBeenCalledWith('g1');
    expect(enqueueMock).toHaveBeenCalledWith('Meta guardada correctamente', { variant: 'success' });
  });
});
