import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentVerificationsApi } from '../../../api/payment-verifications.api';
import type { FilterPaymentVerificationsDto } from '../../../types/payment-verification.types';

export const PAYMENT_VERIFICATIONS_KEY = ['payment-verifications'] as const;

export const usePaymentVerifications = (filters: FilterPaymentVerificationsDto) =>
  useQuery({
    queryKey: [...PAYMENT_VERIFICATIONS_KEY, 'list', filters],
    queryFn: () => paymentVerificationsApi.findAll(filters),
    placeholderData: keepPreviousData,
  });

export const usePaymentVerificationSummary = () =>
  useQuery({
    queryKey: [...PAYMENT_VERIFICATIONS_KEY, 'summary'],
    queryFn: () => paymentVerificationsApi.getSummary(),
  });

export const usePaymentVerificationHistory = (paymentId: string | null) =>
  useQuery({
    queryKey: [...PAYMENT_VERIFICATIONS_KEY, 'history', paymentId],
    queryFn: () => paymentVerificationsApi.getHistory(paymentId!),
    enabled: !!paymentId,
  });

export const usePaymentVerificationActions = () => {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PAYMENT_VERIFICATIONS_KEY });
    // El historial de pagos de la OP muestra el mismo estado.
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const verifyMutation = useMutation({
    mutationFn: ({ paymentIds, notes }: { paymentIds: string[]; notes?: string }) =>
      paymentVerificationsApi.verify(paymentIds, notes),
    onSuccess: invalidate,
  });

  const observeMutation = useMutation({
    mutationFn: ({ paymentId, notes }: { paymentId: string; notes: string }) =>
      paymentVerificationsApi.observe(paymentId, notes),
    onSuccess: invalidate,
  });

  return { verifyMutation, observeMutation };
};
