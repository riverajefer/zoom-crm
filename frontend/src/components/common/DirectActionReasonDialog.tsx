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
} from '@mui/material';
import { LoadingButton } from './LoadingButton';
import { useSingleFlight } from '../../hooks/useSingleFlight';

interface DirectActionReasonDialogProps {
  open: boolean;
  title: string;
  /** Qué se va a hacer, en una línea. */
  description?: string;
  confirmLabel: string;
  confirmColor?: 'primary' | 'error' | 'warning';
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}

/**
 * Pide el motivo de una acción que el admin hace sin solicitud (anular,
 * entregar a crédito, editar una orden bloqueada). El motivo queda registrado
 * en el historial de la orden como una autorización hecha directamente.
 * Ver docs/PLAN_SEDES.md §6.3.
 */
export const DirectActionReasonDialog: React.FC<DirectActionReasonDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  confirmColor = 'primary',
  loading = false,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = reason.trim().length === 0;

  const handleClose = () => {
    if (loading) return;
    setReason('');
    setTouched(false);
    onClose();
  };

  const handleConfirm = useSingleFlight(async () => {
    setTouched(true);
    if (invalid) return;
    await onConfirm(reason.trim());
    setReason('');
    setTouched(false);
    onClose();
  });

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {description && <Alert severity="info">{description}</Alert>}
          <TextField
            label="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={touched && invalid}
            helperText={
              touched && invalid
                ? 'El motivo es obligatorio'
                : 'Queda registrado en el historial de la orden como una autorización hecha directamente.'
            }
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
            autoFocus
            disabled={loading}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <LoadingButton variant="contained" color={confirmColor} loading={loading} onClick={handleConfirm}>
          {confirmLabel}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
