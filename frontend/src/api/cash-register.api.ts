import axiosInstance from './axios';
import { fetchAllPages } from '../utils/fetchAllPages';

/** Tope de página del backend para movimientos (`MAX_CASH_PAGE_SIZE`). */
const CASH_MOVEMENTS_PAGE_SIZE = 200;
import type {
  PendingCashEntriesSummary,
  CashRegister,
  CashSession,
  CashMovement,
  BalancePreview,
  CashSessionsListResponse,
  CashMovementsListResponse,
  CreateCashRegisterDto,
  UpdateCashRegisterDto,
  OpenCashSessionDto,
  CloseCashSessionDto,
  CreateCashMovementDto,
  VoidCashMovementDto,
  FilterCashSessionsDto,
  FilterCashMovementsDto,
} from '../types/cash-register.types';

// ── Cash Registers ───────────────────────────────────────────────────────────

export const cashRegisterApi = {
  getAllRegisters: async (): Promise<CashRegister[]> => {
    const { data } = await axiosInstance.get<CashRegister[]>('/cash-registers');
    return data;
  },

  getRegisterById: async (id: string): Promise<CashRegister> => {
    const { data } = await axiosInstance.get<CashRegister>(`/cash-registers/${id}`);
    return data;
  },

  createRegister: async (dto: CreateCashRegisterDto): Promise<CashRegister> => {
    const { data } = await axiosInstance.post<CashRegister>('/cash-registers', dto);
    return data;
  },

  updateRegister: async (id: string, dto: UpdateCashRegisterDto): Promise<CashRegister> => {
    const { data } = await axiosInstance.put<CashRegister>(`/cash-registers/${id}`, dto);
    return data;
  },

  deleteRegister: async (id: string): Promise<{ message: string }> => {
    const { data } = await axiosInstance.delete<{ message: string }>(`/cash-registers/${id}`);
    return data;
  },

  // ── Cash Sessions ─────────────────────────────────────────────────────────

  openSession: async (dto: OpenCashSessionDto): Promise<CashSession> => {
    const { data } = await axiosInstance.post<CashSession>('/cash-sessions/open', dto);
    return data;
  },

  closeSession: async (id: string, dto: CloseCashSessionDto): Promise<CashSession> => {
    const { data } = await axiosInstance.post<CashSession>(`/cash-sessions/${id}/close`, dto);
    return data;
  },

  getBalancePreview: async (id: string): Promise<BalancePreview> => {
    const { data } = await axiosInstance.get<BalancePreview>(`/cash-sessions/${id}/balance-preview`);
    return data;
  },

  getSessionById: async (id: string): Promise<CashSession> => {
    const { data } = await axiosInstance.get<CashSession>(`/cash-sessions/${id}`);
    return data;
  },

  getSessions: async (params?: FilterCashSessionsDto): Promise<CashSessionsListResponse> => {
    const { data } = await axiosInstance.get<CashSessionsListResponse>('/cash-sessions', { params });
    return data;
  },

  getLastClosingDenominations: async (
    cashRegisterId: string,
  ): Promise<{
    sessionId?: string;
    closedAt?: string;
    denominations: { denomination: number; quantity: number; denomType: string }[];
  }> => {
    const { data } = await axiosInstance.get(
      `/cash-sessions/last-closing/${cashRegisterId}`,
    );
    return data;
  },

  /**
   * ¿Hay caja abierta ahora? Booleano sin datos sensibles: lo consultan las
   * comerciales desde el formulario de OP, que no tienen permiso sobre caja.
   */
  isCashOpen: async (): Promise<{ isOpen: boolean }> => {
    const { data } = await axiosInstance.get<{ isOpen: boolean }>(
      '/cash-sessions/is-open',
    );
    return data;
  },

  /**
   * Abonos cobrados sin caja abierta que están esperando entrar al arqueo.
   * Se consulta antes de abrir para saber cuánto va a ingresar de arrastre.
   */
  getPendingCashEntries: async (): Promise<PendingCashEntriesSummary> => {
    const { data } = await axiosInstance.get<PendingCashEntriesSummary>(
      '/cash-sessions/pending-entries',
    );
    return data;
  },

  // ── Cash Movements ────────────────────────────────────────────────────────

  createMovement: async (dto: CreateCashMovementDto): Promise<CashMovement> => {
    const { data } = await axiosInstance.post<CashMovement>('/cash-movements', dto);
    return data;
  },

  voidMovement: async (id: string, dto: VoidCashMovementDto): Promise<CashMovement> => {
    const { data } = await axiosInstance.post<CashMovement>(`/cash-movements/${id}/void`, dto);
    return data;
  },

  getMovements: async (params?: FilterCashMovementsDto): Promise<CashMovementsListResponse> => {
    const { data } = await axiosInstance.get<CashMovementsListResponse>('/cash-movements', { params });
    return data;
  },

  /**
   * Todos los movimientos de una sesión, recorriendo las páginas.
   *
   * El listado devuelve 50 por defecto y una sesión normal tiene entre 60 y 130:
   * con una sola página, la sesión activa calculaba su saldo sobre los últimos 50
   * y no mostraba los de la mañana.
   */
  getAllSessionMovements: async (
    params: Omit<FilterCashMovementsDto, 'page' | 'limit'>,
  ): Promise<CashMovement[]> => {
    const rows = await fetchAllPages(
      async (page, limit) => {
        const { data } = await axiosInstance.get<CashMovementsListResponse>('/cash-movements', {
          params: { ...params, page, limit },
        });
        return data.data;
      },
      CASH_MOVEMENTS_PAGE_SIZE,
    );
    // Un movimiento creado mientras se recorren las páginas corre el orden un
    // puesto y repite la última fila de la página siguiente.
    const seen = new Set<string>();
    return rows.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  },
};
