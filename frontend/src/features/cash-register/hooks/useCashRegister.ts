import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { cashRegisterApi } from '../../../api/cash-register.api';
import type {
  CreateCashRegisterDto,
  UpdateCashRegisterDto,
  OpenCashSessionDto,
  CloseCashSessionDto,
  CreateCashMovementDto,
  VoidCashMovementDto,
  FilterCashSessionsDto,
  FilterCashMovementsDto,
} from '../../../types/cash-register.types';

// ── Query Keys ───────────────────────────────────────────────────────────────

export const cashKeys = {
  registers: {
    all: ['cash-registers'] as const,
    lists: () => [...cashKeys.registers.all, 'list'] as const,
    detail: (id: string) => [...cashKeys.registers.all, 'detail', id] as const,
  },
  sessions: {
    all: ['cash-sessions'] as const,
    lists: () => [...cashKeys.sessions.all, 'list'] as const,
    list: (filters?: FilterCashSessionsDto) =>
      [...cashKeys.sessions.lists(), filters] as const,
    detail: (id: string) => [...cashKeys.sessions.all, 'detail', id] as const,
    balancePreview: (id: string) =>
      [...cashKeys.sessions.all, 'balance-preview', id] as const,
  },
  pendingEntries: {
    all: ['cash-pending-entries'] as const,
  },
  isOpen: {
    all: ['cash-is-open'] as const,
  },
  movements: {
    all: ['cash-movements'] as const,
    lists: () => [...cashKeys.movements.all, 'list'] as const,
    list: (filters?: FilterCashMovementsDto) =>
      [...cashKeys.movements.lists(), filters] as const,
    detail: (id: string) => [...cashKeys.movements.all, 'detail', id] as const,
  },
};

// ── Registers ────────────────────────────────────────────────────────────────

export const useCashRegisters = () => {
  return useQuery({
    queryKey: cashKeys.registers.lists(),
    queryFn: () => cashRegisterApi.getAllRegisters(),
  });
};

export const useCashRegister = (id: string) => {
  return useQuery({
    queryKey: cashKeys.registers.detail(id),
    queryFn: () => cashRegisterApi.getRegisterById(id),
    enabled: !!id,
  });
};

// ── Sessions ─────────────────────────────────────────────────────────────────

export const useCashSessions = (filters?: FilterCashSessionsDto) => {
  return useQuery({
    queryKey: cashKeys.sessions.list(filters),
    queryFn: () => cashRegisterApi.getSessions(filters),
    // Sin esto `data` queda en undefined al cambiar de página, el `rowCount`
    // cae a 0 y la grilla rebota a la página 1.
    placeholderData: keepPreviousData,
  });
};

export const useCashSession = (id: string) => {
  return useQuery({
    queryKey: cashKeys.sessions.detail(id),
    queryFn: () => cashRegisterApi.getSessionById(id),
    enabled: !!id,
  });
};

export const useBalancePreview = (id: string, enabled = true) => {
  return useQuery({
    queryKey: cashKeys.sessions.balancePreview(id),
    queryFn: () => cashRegisterApi.getBalancePreview(id),
    enabled: !!id && enabled,
  });
};

// ── Movements ────────────────────────────────────────────────────────────────

/**
 * Abonos que se cobraron sin caja abierta y esperan entrar al arqueo.
 *
 * Se refresca solo: quien está por abrir la caja necesita ver el arrastre
 * actualizado, y entre que carga la pantalla y confirma la apertura una
 * comercial puede haber registrado otro abono.
 */
export const usePendingCashEntries = (enabled = true) => {
  return useQuery({
    queryKey: cashKeys.pendingEntries.all,
    queryFn: () => cashRegisterApi.getPendingCashEntries(),
    enabled,
    refetchInterval: 60_000,
  });
};

/**
 * Si hay caja abierta. Pensado para pantallas fuera del módulo de Caja (el
 * formulario de OP), donde el usuario no tiene permiso para ver la caja pero sí
 * necesita saber si su abono va a entrar directo o a la cola.
 */
export const useIsCashOpen = () => {
  return useQuery({
    queryKey: cashKeys.isOpen.all,
    queryFn: () => cashRegisterApi.isCashOpen(),
    // La caja puede abrirse mientras se llena el formulario.
    staleTime: 30_000,
  });
};

export const useCashMovements = (filters?: FilterCashMovementsDto) => {
  return useQuery({
    queryKey: cashKeys.movements.list(filters),
    queryFn: () => cashRegisterApi.getMovements(filters),
    enabled: !!filters?.cashSessionId,
    refetchInterval: 15_000, // refresca cada 15s para capturar pagos de OG desde otras pestañas/usuarios
  });
};

/**
 * Todos los movimientos de una sesión (incluidos los anulados), sin cortar en la
 * primera página: el saldo y los desgloses de la sesión activa se calculan sobre
 * esta lista. Comparte la raíz de claves con `useCashMovements`, así que las
 * mutaciones que invalidan movimientos también la refrescan.
 */
export const useSessionMovements = (cashSessionId: string) => {
  return useQuery({
    queryKey: [...cashKeys.movements.lists(), 'session-all', cashSessionId] as const,
    queryFn: () => cashRegisterApi.getAllSessionMovements({ cashSessionId, includeVoided: true }),
    enabled: !!cashSessionId,
    refetchInterval: 15_000, // refresca cada 15s para capturar pagos de OG desde otras pestañas/usuarios
  });
};

// ── Mutations ─────────────────────────────────────────────────────────────────

export const useCashMutations = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const invalidateRegisters = () =>
    queryClient.invalidateQueries({ queryKey: cashKeys.registers.all });

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: cashKeys.sessions.all });

  const invalidateMovements = () =>
    queryClient.invalidateQueries({ queryKey: cashKeys.movements.all });

  const invalidatePendingEntries = () =>
    queryClient.invalidateQueries({ queryKey: cashKeys.pendingEntries.all });

  // Register mutations
  const createRegister = useMutation({
    mutationFn: (dto: CreateCashRegisterDto) => cashRegisterApi.createRegister(dto),
    onSuccess: () => {
      invalidateRegisters();
      enqueueSnackbar('Caja registradora creada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al crear la caja registradora',
        { variant: 'error' },
      );
    },
  });

  const updateRegister = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCashRegisterDto }) =>
      cashRegisterApi.updateRegister(id, dto),
    onSuccess: () => {
      invalidateRegisters();
      enqueueSnackbar('Caja registradora actualizada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al actualizar',
        { variant: 'error' },
      );
    },
  });

  const deleteRegister = useMutation({
    mutationFn: (id: string) => cashRegisterApi.deleteRegister(id),
    onSuccess: () => {
      invalidateRegisters();
      enqueueSnackbar('Caja registradora eliminada', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al eliminar',
        { variant: 'error' },
      );
    },
  });

  // Session mutations
  const openSession = useMutation({
    mutationFn: (dto: OpenCashSessionDto) => cashRegisterApi.openSession(dto),
    onSuccess: () => {
      invalidateSessions();
      invalidateRegisters();
      // Al abrir se descarga la cola de abonos pendientes: la cola queda vacía
      // y aparecen movimientos nuevos que no se registraron en esta sesión.
      invalidatePendingEntries();
      invalidateMovements();
      queryClient.invalidateQueries({ queryKey: cashKeys.isOpen.all });
      enqueueSnackbar('Sesión de caja abierta correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al abrir la sesión',
        { variant: 'error' },
      );
    },
  });

  const closeSession = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CloseCashSessionDto }) =>
      cashRegisterApi.closeSession(id, dto),
    onSuccess: () => {
      invalidateSessions();
      invalidateRegisters();
      // Al cerrar, los abonos nuevos pasan a encolarse: el aviso del formulario
      // de OP tiene que reflejarlo.
      queryClient.invalidateQueries({ queryKey: cashKeys.isOpen.all });
      enqueueSnackbar('Sesión de caja cerrada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al cerrar la sesión',
        { variant: 'error' },
      );
    },
  });

  // Movement mutations
  const createMovement = useMutation({
    mutationFn: (dto: CreateCashMovementDto) => cashRegisterApi.createMovement(dto),
    onSuccess: (_, variables) => {
      invalidateMovements();
      queryClient.invalidateQueries({
        queryKey: cashKeys.sessions.detail(variables.cashSessionId),
      });
      enqueueSnackbar('Movimiento registrado correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al registrar el movimiento',
        { variant: 'error' },
      );
    },
  });

  const voidMovement = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: VoidCashMovementDto }) =>
      cashRegisterApi.voidMovement(id, dto),
    onSuccess: () => {
      invalidateMovements();
      invalidateSessions();
      enqueueSnackbar('Movimiento anulado correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al anular el movimiento',
        { variant: 'error' },
      );
    },
  });

  return {
    createRegister,
    updateRegister,
    deleteRegister,
    openSession,
    closeSession,
    createMovement,
    voidMovement,
  };
};
