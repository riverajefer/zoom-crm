import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Block } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { formatCurrency } from '../../../utils/formatters';
import { paymentMethodLabel } from '../../../utils/paymentMethods';
import type { PayrollItem, PayrollPayment } from '../../../types/payroll-item.types';
import { usePayrollPayments } from '../hooks/usePayrollPayments';
import { apiErrorMessage, itemBalance, itemPaidAmount } from '../utils/payments';

interface Props {
  periodId: string;
  item: PayrollItem | null;
  canVoid: boolean;
  onClose: () => void;
}

const userName = (u: { firstName: string | null; lastName: string | null } | null) =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO');

/**
 * Historial de pagos de un empleado en el periodo. Los anulados se ven
 * tachados con su motivo: un error se corrige anulando, nunca borrando.
 */
export const PayrollPaymentsDialog: React.FC<Props> = ({ periodId, item, canVoid, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { paymentsQuery, voidMutation } = usePayrollPayments(periodId, { enabled: !!item });
  const [toVoid, setToVoid] = useState<PayrollPayment | null>(null);
  const [reason, setReason] = useState('');

  const payments = (paymentsQuery.data ?? []).filter((p) => p.payrollItemId === item?.id);

  const closeVoid = () => {
    setToVoid(null);
    setReason('');
  };

  const handleVoid = useSingleFlight(async () => {
    if (!toVoid) return;
    try {
      const result = await voidMutation.mutateAsync({ paymentId: toVoid.id, reason: reason.trim() });
      enqueueSnackbar(
        result.periodStatus === 'CALCULATED'
          ? 'Pago anulado. El periodo volvió a «Calculado» porque quedó un saldo pendiente.'
          : 'Pago anulado',
        { variant: 'success' },
      );
      closeVoid();
    } catch (err) {
      enqueueSnackbar(apiErrorMessage(err, 'No se pudo anular el pago'), { variant: 'error' });
      throw err;
    }
  });

  const name = item
    ? `${item.employee?.user?.firstName ?? ''} ${item.employee?.user?.lastName ?? ''}`.trim()
    : '';

  return (
    <>
      <Dialog open={!!item} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Pagos — {name}</DialogTitle>
        <DialogContent dividers>
          {item && (
            <Stack direction="row" spacing={3} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Total: <strong>{formatCurrency(Number(item.totalPayment))}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pagado: <strong>{formatCurrency(itemPaidAmount(item))}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Saldo: <strong>{formatCurrency(Math.max(itemBalance(item), 0))}</strong>
              </Typography>
            </Stack>
          )}
          {paymentsQuery.isLoading ? (
            <LoadingSpinner />
          ) : payments.length === 0 ? (
            <Alert severity="info">Todavía no se le ha registrado ningún pago.</Alert>
          ) : (
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {payments.map((p) => (
                <Box key={p.id} sx={{ opacity: p.isVoided ? 0.6 : 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          variant="subtitle2"
                          sx={{ textDecoration: p.isVoided ? 'line-through' : 'none' }}
                        >
                          {formatCurrency(Number(p.amount))}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={paymentMethodLabel(p.paymentMethod)}
                          color={p.paymentMethod === 'CASH' ? 'success' : 'info'}
                        />
                        {p.isVoided && <Chip size="small" color="error" label="Anulado" />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {formatDate(p.paidAt)} · registró {userName(p.createdBy) || '—'}
                        {p.bankEntity ? ` · ${p.bankEntity}` : ''}
                        {p.reference ? ` · Ref. ${p.reference}` : ''}
                      </Typography>
                      {p.notes && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {p.notes}
                        </Typography>
                      )}
                      {p.isVoided && (
                        <Typography variant="caption" color="error.main" display="block">
                          Anulado por {userName(p.voidedBy) || '—'}
                          {p.voidedAt ? ` el ${formatDate(p.voidedAt)}` : ''}: {p.voidReason}
                        </Typography>
                      )}
                    </Box>
                    {canVoid && !p.isVoided && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<Block fontSize="small" />}
                        onClick={() => setToVoid(p)}
                      >
                        Anular
                      </Button>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!toVoid} onClose={voidMutation.isPending ? undefined : closeVoid} maxWidth="xs" fullWidth>
        <DialogTitle>Anular pago</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Se anulará el pago de{' '}
            <strong>{toVoid ? formatCurrency(Number(toVoid.amount)) : ''}</strong> en{' '}
            {toVoid ? paymentMethodLabel(toVoid.paymentMethod).toLowerCase() : ''}. Queda en el
            historial pero deja de contar como pagado.
          </Typography>
          <TextField
            autoFocus
            label="Motivo"
            fullWidth
            required
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Mínimo 5 caracteres"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeVoid} disabled={voidMutation.isPending}>
            Cancelar
          </Button>
          <LoadingButton
            color="error"
            variant="contained"
            loading={voidMutation.isPending}
            disabled={reason.trim().length < 5}
            onClick={handleVoid}
          >
            Anular pago
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
};
