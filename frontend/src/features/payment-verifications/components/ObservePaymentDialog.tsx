import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import type { PaymentVerification } from '../../../types/payment-verification.types';
import { formatCurrency } from '../utils';

interface Props {
  payment: PaymentVerification | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

/** Motivo obligatorio: es lo que lee la sede para saber qué corregir. */
export const ObservePaymentDialog: React.FC<Props> = ({ payment, loading, onClose, onConfirm }) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (payment) setNotes('');
  }, [payment]);

  const trimmed = notes.trim();

  return (
    <Dialog open={!!payment} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Observar pago</DialogTitle>
      <DialogContent>
        {payment && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {formatCurrency(payment.amount)} · {payment.order.orderNumber} ·{' '}
            {payment.order.client.name}. El pago no se anula ni cambia el saldo de la orden: la
            sede recibe el aviso y lo corrige editando o anulando el pago.
          </Typography>
        )}
        <TextField
          label="¿Qué encontraste?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          minRows={3}
          fullWidth
          autoFocus
          disabled={loading}
          inputProps={{ maxLength: 500 }}
          helperText={`${notes.length}/500`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={loading || !trimmed}
          onClick={() => onConfirm(trimmed)}
        >
          {loading ? 'Guardando...' : 'Observar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
