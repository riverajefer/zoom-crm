import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  Box,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { orderStatusChangeRequestsApi } from '../../../api/order-status-change-requests.api';
import type { Order, OrderStatus } from '../../../types/order.types';
import { ORDER_STATUS_CONFIG } from '../../../types/order.types';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { getAnnulmentAmounts } from '../utils/annulment';
import {
  RetainedAmountField,
  isRetainedAmountInvalid,
  parseRetainedAmount,
} from './RetainedAmountField';

interface StatusChangeAuthRequestDialogProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  requestedStatus: OrderStatus;
}

export const StatusChangeAuthRequestDialog: React.FC<StatusChangeAuthRequestDialogProps> = ({
  open,
  onClose,
  order,
  requestedStatus,
}) => {
  const [reason, setReason] = useState('');
  const [retained, setRetained] = useState('');
  const { enqueueSnackbar } = useSnackbar();

  // Al anular una orden con pagos, lo que retiene la empresa viaja en la
  // solicitud: el admin lo aprueba junto con la anulación.
  const annulmentAmounts =
    requestedStatus === 'ANULADO' ? getAnnulmentAmounts(order) : null;
  const asksRetained = !!annulmentAmounts && annulmentAmounts.unusedPaid > 0;
  const retainedInvalid =
    asksRetained && isRetainedAmountInvalid(retained, annulmentAmounts);

  // `disabled={mutation.isPending}` solo surte efecto después de que React vuelve
  // a renderizar, así que dos clics en el mismo frame envían dos solicitudes. El
  // ref se marca antes de salir del handler.
  const submitting = useRef(false);

  const createRequestMutation = useMutation({
    mutationFn: orderStatusChangeRequestsApi.create,
    onSuccess: () => {
      enqueueSnackbar(
        'Solicitud enviada exitosamente. Espere la aprobación de un administrador.',
        { variant: 'success' }
      );
      setReason('');
      setRetained('');
      onClose();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al crear solicitud',
        { variant: 'error' }
      );
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const handleSubmit = () => {
    if (submitting.current) return;

    if (!reason.trim()) {
      enqueueSnackbar('Por favor ingrese una razón para el cambio', { variant: 'warning' });
      return;
    }

    if (retainedInvalid) return;

    submitting.current = true;
    createRequestMutation.mutate({
      orderId: order.id,
      currentStatus: order.status,
      requestedStatus,
      reason: reason.trim(),
      ...(asksRetained && { retainedAmount: parseRetainedAmount(retained) }),
    });
  };

  const handleClose = () => {
    if (!createRequestMutation.isPending) {
      setReason('');
      setRetained('');
      onClose();
    }
  };

  const currentStatusLabel = ORDER_STATUS_CONFIG[order.status]?.label || order.status;
  const requestedStatusLabel = ORDER_STATUS_CONFIG[requestedStatus]?.label || requestedStatus;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Solicitar Autorización de Cambio de Estado</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Este cambio de estado requiere autorización de un administrador.
        </Alert>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <strong>Orden:</strong> {order.orderNumber}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <strong>Estado actual:</strong> {currentStatusLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Estado solicitado:</strong> {requestedStatusLabel}
          </Typography>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={4}
          label="Razón del cambio *"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explique por qué necesita cambiar el estado de esta orden..."
          disabled={createRequestMutation.isPending}
          helperText="Este campo es obligatorio"
          sx={{ mt: 2 }}
        />

        {asksRetained && (
          <Box sx={{ mt: 3 }}>
            <RetainedAmountField
              amounts={annulmentAmounts}
              value={retained}
              onChange={setRetained}
              disabled={createRequestMutation.isPending}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={createRequestMutation.isPending}>
          Cancelar
        </Button>
        <LoadingButton
          onClick={handleSubmit}
          variant="contained"
          loading={createRequestMutation.isPending}
          disabled={!reason.trim() || retainedInvalid}
        >
          Enviar Solicitud
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
