import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payrollItemsApi } from '../../../api/payroll-items.api';
import type { CreatePayrollPaymentsDto } from '../../../types/payroll-item.types';

/**
 * Pagos de nómina por empleado. Registrar o anular un pago cambia lo pagado
 * del registro, el resumen y, si cierra o reabre el periodo, su estado.
 */
export const usePayrollPayments = (periodId: string, options: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ['payroll-payments', periodId],
    queryFn: () => payrollItemsApi.getPayments(periodId),
    enabled: !!periodId && (options.enabled ?? true),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-payments', periodId] });
    queryClient.invalidateQueries({ queryKey: ['payroll-items', periodId] });
    // Prefijo: refresca el periodo (su estado) y su resumen.
    queryClient.invalidateQueries({ queryKey: ['payroll-periods', periodId] });
    queryClient.invalidateQueries({ queryKey: ['payroll-periods'], exact: true });
  };

  const registerMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: CreatePayrollPaymentsDto }) =>
      payrollItemsApi.registerPayments(periodId, itemId, data),
    onSuccess: invalidate,
  });

  const voidMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      payrollItemsApi.voidPayment(periodId, paymentId, reason),
    onSuccess: invalidate,
  });

  return { paymentsQuery, registerMutation, voidMutation };
};
