import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkOrders, useWorkOrder } from './useWorkOrders';
import { workOrdersApi } from '../../../api/work-orders.api';

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: enqueueMock }) }));

vi.mock('../../../api/work-orders.api', () => ({
  workOrdersApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    addSupplyToItem: vi.fn(),
    removeSupplyFromItem: vi.fn(),
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

describe('useWorkOrders (lista)', () => {
  beforeEach(() => {
    (workOrdersApi.getAll as any).mockResolvedValue({ data: [{ id: 'wo1' }], meta: {} });
    (workOrdersApi.create as any).mockResolvedValue({ id: 'wo1' });
    (workOrdersApi.delete as any).mockResolvedValue({});
  });
  afterEach(() => vi.clearAllMocks());

  it('lista OTs con filtros', async () => {
    const { result } = renderHook(() => useWorkOrders({ status: 'PENDING' } as any), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.workOrdersQuery.isSuccess).toBe(true));
    expect(workOrdersApi.getAll).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('create pasa dto y el flag confirmed', async () => {
    const { result } = renderHook(() => useWorkOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.createWorkOrderMutation.mutateAsync({
        dto: { orderId: 'o1' } as any,
        confirmed: true,
      });
    });
    expect(workOrdersApi.create).toHaveBeenCalledWith({ orderId: 'o1' }, true);
    expect(enqueueMock).toHaveBeenCalledWith('Orden de trabajo creada correctamente', {
      variant: 'success',
    });
  });

  it('delete elimina la OT', async () => {
    const { result } = renderHook(() => useWorkOrders(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.deleteWorkOrderMutation.mutateAsync('wo1');
    });
    expect(workOrdersApi.delete).toHaveBeenCalledWith('wo1');
  });
});

describe('useWorkOrder (detalle)', () => {
  beforeEach(() => {
    (workOrdersApi.getById as any).mockResolvedValue({ id: 'wo1' });
    (workOrdersApi.update as any).mockResolvedValue({ id: 'wo1' });
    (workOrdersApi.updateStatus as any).mockResolvedValue({ id: 'wo1' });
    (workOrdersApi.addSupplyToItem as any).mockResolvedValue({});
    (workOrdersApi.removeSupplyFromItem as any).mockResolvedValue({});
  });
  afterEach(() => vi.clearAllMocks());

  it('carga el detalle con id', async () => {
    const { result } = renderHook(() => useWorkOrder('wo1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.workOrderQuery.isSuccess).toBe(true));
    expect(workOrdersApi.getById).toHaveBeenCalledWith('wo1');
  });

  it('no carga sin id', async () => {
    vi.clearAllMocks();
    const { result } = renderHook(() => useWorkOrder(undefined), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.workOrderQuery.fetchStatus).toBe('idle');
    expect(workOrdersApi.getById).not.toHaveBeenCalled();
  });

  it('update y cambio de estado', async () => {
    const { result } = renderHook(() => useWorkOrder('wo1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.updateWorkOrderMutation.mutateAsync({ id: 'wo1', dto: { notes: 'x' } as any });
    });
    await act(async () => {
      await result.current.updateStatusMutation.mutateAsync({
        id: 'wo1',
        dto: { status: 'IN_PROGRESS' } as any,
      });
    });
    expect(workOrdersApi.update).toHaveBeenCalledWith('wo1', { notes: 'x' });
    expect(workOrdersApi.updateStatus).toHaveBeenCalledWith('wo1', { status: 'IN_PROGRESS' });
  });

  it('agregar y quitar insumos de un ítem', async () => {
    const { result } = renderHook(() => useWorkOrder('wo1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.addSupplyMutation.mutateAsync({
        workOrderId: 'wo1',
        itemId: 'it1',
        dto: { supplyId: 's1' } as any,
      });
    });
    await act(async () => {
      await result.current.removeSupplyMutation.mutateAsync({
        workOrderId: 'wo1',
        itemId: 'it1',
        supplyId: 's1',
      });
    });
    expect(workOrdersApi.addSupplyToItem).toHaveBeenCalledWith('wo1', 'it1', { supplyId: 's1' });
    expect(workOrdersApi.removeSupplyFromItem).toHaveBeenCalledWith('wo1', 'it1', 's1');
  });
});
