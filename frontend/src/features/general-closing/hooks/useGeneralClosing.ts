import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generalClosingsApi } from '../../../api/general-closings.api';
import { cashKeys } from '../../cash-register/hooks/useCashRegister';
import type { GeneralClosingReviewStatus } from '../../../types/general-closing.types';

export const GENERAL_CLOSING_KEY = ['general-closings'] as const;

export const useGeneralClosingDay = (date: string) =>
  useQuery({
    queryKey: [...GENERAL_CLOSING_KEY, 'day', date],
    queryFn: () => generalClosingsApi.getDay(date),
    placeholderData: keepPreviousData,
  });

export const useGeneralClosingPendingDays = () =>
  useQuery({
    queryKey: [...GENERAL_CLOSING_KEY, 'pending-days'],
    queryFn: () => generalClosingsApi.getPendingDays(),
  });

export const useGeneralClosingHistory = (page: number, limit: number, enabled: boolean) =>
  useQuery({
    queryKey: [...GENERAL_CLOSING_KEY, 'history', page, limit],
    queryFn: () => generalClosingsApi.getHistory(page, limit),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useGeneralClosingActions = (date: string) => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: GENERAL_CLOSING_KEY });

  const handoverMutation = useMutation({
    mutationFn: (vars: { cashRegisterId: string; baseLeft: number }) =>
      generalClosingsApi.receiveHandover(date, vars.cashRegisterId, vars.baseLeft),
    onSuccess: () => {
      invalidate();
      // Entró un depósito a la caja de la Matriz.
      queryClient.invalidateQueries({ queryKey: cashKeys.sessions.all });
      queryClient.invalidateQueries({ queryKey: cashKeys.movements.all });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (vars: { cashRegisterId: string; status: GeneralClosingReviewStatus; notes?: string }) =>
      generalClosingsApi.reviewRegister(date, vars.cashRegisterId, vars.status, vars.notes),
    onSuccess: invalidate,
  });

  const closeMutation = useMutation({
    mutationFn: (notes?: string) => generalClosingsApi.closeDay(date, notes),
    onSuccess: invalidate,
  });

  const reopenMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => generalClosingsApi.reopen(vars.id, vars.reason),
    onSuccess: invalidate,
  });

  return { reviewMutation, handoverMutation, closeMutation, reopenMutation };
};
