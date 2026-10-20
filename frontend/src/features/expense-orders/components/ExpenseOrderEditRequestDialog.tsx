import React, { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { isAxiosError } from 'axios';
import { expenseOrderEditRequestsApi } from '../../../api/expense-order-edit-requests.api';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { paidEditStatusKey } from '../hooks/usePaidExpenseOrderEdit';

interface ExpenseOrderEditRequestDialogProps {
  open: boolean;
  onClose: () => void;
  expenseOrder: { id: string; ogNumber: string };
}

/**
 * Pide al admin autorización para editar una OG que ya se pagó. Al aprobarla,
 * el solicitante puede hacer una edición en las siguientes 24 horas.
 */
export const ExpenseOrderEditRequestDialog: React.FC<ExpenseOrderEditRequestDialogProps> = ({
  open,
  onClose,
  expenseOrder,
}) => {
  const [reason, setReason] = useState('');
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  // El ref frena el doble clic en el mismo frame, antes de que el botón se
  // alcance a deshabilitar (ver ExpenseOrderAuthRequestDialog).
  const submitting = useRef(false);

  const createMutation = useMutation({
    mutationFn: expenseOrderEditRequestsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paidEditStatusKey(expenseOrder.id) });
      queryClient.invalidateQueries({ queryKey: ['og-edit-requests', expenseOrder.id] });
      enqueueSnackbar('Solicitud enviada. Te avisaremos cuando el administrador responda.', {
        variant: 'success',
      });
      setReason('');
      onClose();
    },
    onError: (error: unknown) => {
      const message = isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      enqueueSnackbar(message || 'Error al crear la solicitud', {
        variant: 'error',
      });
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const handleSubmit = () => {
    if (submitting.current || !reason.trim()) return;
    submitting.current = true;
    createMutation.mutate({ expenseOrderId: expenseOrder.id, reason: reason.trim() });
  };

  const handleClose = () => {
    if (createMutation.isPending) return;
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Solicitar edición de OG pagada</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Esta OG ya fue pagada. Para corregirla (por ejemplo, agregar el IVA que faltó) el
          administrador debe autorizarlo. Recibirá la solicitud por <strong>WhatsApp</strong> y en{' '}
          <strong>Solicitudes Pendientes</strong>.
          <br />
          Si el total sube, la diferencia queda pendiente en la <strong>cuenta por pagar</strong> de
          la OG y Caja la paga desde ahí. El total no puede quedar por debajo de lo ya pagado.
        </Alert>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>OG:</strong> {expenseOrder.ogNumber}
          </Typography>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={4}
          label="¿Qué hay que corregir? *"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej.: Se olvidó incluir el IVA del 19 % de la factura del proveedor"
          disabled={createMutation.isPending}
          inputProps={{ maxLength: 500 }}
          helperText="Obligatorio. El administrador lo verá al revisar la solicitud."
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={createMutation.isPending}>
          Cancelar
        </Button>
        <LoadingButton
          onClick={handleSubmit}
          variant="contained"
          loading={createMutation.isPending}
          disabled={!reason.trim()}
        >
          Enviar solicitud
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
