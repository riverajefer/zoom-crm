import React, { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import type { AnnulmentAmounts } from '../utils/annulment';
import {
  RetainedAmountField,
  isRetainedAmountInvalid,
  parseRetainedAmount,
} from './RetainedAmountField';

interface AnnulOrderDialogProps {
  open: boolean;
  onClose: () => void;
  orderNumber: string;
  amounts: AnnulmentAmounts;
  loading: boolean;
  onConfirm: (retainedAmount: number) => Promise<unknown>;
}

/**
 * Anulación directa (admin) de una orden con pagos: antes de anular hay que
 * decidir cuánto retiene la empresa, porque el resto queda como saldo a favor.
 * Quien necesita autorización lo decide en la solicitud, no aquí.
 */
export const AnnulOrderDialog: React.FC<AnnulOrderDialogProps> = ({
  open,
  onClose,
  orderNumber,
  amounts,
  loading,
  onConfirm,
}) => {
  const [retained, setRetained] = useState('');
  const invalid = isRetainedAmountInvalid(retained, amounts);

  const handleClose = () => {
    if (loading) return;
    setRetained('');
    onClose();
  };

  const handleConfirm = useSingleFlight(async () => {
    if (invalid) return;
    await onConfirm(parseRetainedAmount(retained));
    setRetained('');
    onClose();
  });

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Anular la orden {orderNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity='warning'>
            La anulación es definitiva: la orden no admite más cambios ni pagos.
          </Alert>
          <RetainedAmountField
            amounts={amounts}
            value={retained}
            onChange={setRetained}
            disabled={loading}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <LoadingButton
          variant='contained'
          color='error'
          loading={loading}
          disabled={invalid}
          onClick={handleConfirm}
        >
          Anular orden
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
