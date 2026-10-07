import React, { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import type { Order, OrderStatus } from '../../../types/order.types';
import { ORDER_STATUS_CONFIG } from '../../../types/order.types';
import {
  COMPLETED_WORK_ORDER_NOTICE,
  revertLeavesCompletedWorkOrder,
} from '../utils/statusRevert';

const MAX_REASON_LENGTH = 500;

interface RevertStatusDialogProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  targetStatus: OrderStatus;
  loading: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
}

/**
 * Retroceso directo (admin) de una orden a su estado previo: no pasa por
 * solicitud, pero el motivo es obligatorio porque es lo único que queda en el
 * historial. Quien necesita autorización da el motivo en la solicitud, no aquí.
 */
export const RevertStatusDialog: React.FC<RevertStatusDialogProps> = ({
  open,
  onClose,
  order,
  targetStatus,
  loading,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  const handleClose = () => {
    if (loading) return;
    setReason('');
    onClose();
  };

  const handleConfirm = useSingleFlight(async () => {
    if (!trimmed) return;
    await onConfirm(trimmed);
    setReason('');
    onClose();
  });

  const currentLabel = ORDER_STATUS_CONFIG[order.status]?.label || order.status;
  const targetLabel = ORDER_STATUS_CONFIG[targetStatus]?.label || targetStatus;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Devolver la orden {order.orderNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant='body2' color='text.secondary'>
            La orden pasa de <strong>{currentLabel}</strong> a{' '}
            <strong>{targetLabel}</strong>.
          </Typography>
          {revertLeavesCompletedWorkOrder(order, targetStatus) && (
            <Alert severity='warning'>{COMPLETED_WORK_ORDER_NOTICE}</Alert>
          )}
          <TextField
            fullWidth
            multiline
            rows={3}
            label='Motivo *'
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='Explica por qué la orden vuelve a un estado previo...'
            disabled={loading}
            inputProps={{ maxLength: MAX_REASON_LENGTH }}
            helperText='Queda en el historial de autorizaciones de la orden'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <LoadingButton
          variant='contained'
          color='warning'
          loading={loading}
          disabled={!trimmed}
          onClick={handleConfirm}
        >
          Devolver a {targetLabel}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
