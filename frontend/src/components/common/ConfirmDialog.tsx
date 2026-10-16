import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import { LoadingButton } from './LoadingButton';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  severity?: 'warning' | 'error' | 'info';
  /** Tercer botón opcional, a la izquierda de los otros dos. */
  extraAction?: { label: string; onClick: () => void };
}

/**
 * Diálogo de confirmación reutilizable
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isLoading = false,
  severity = 'warning',
  extraAction,
}) => {
  const severityColor = severity === 'error' ? 'error' : 'warning';

  return (
    <Dialog
      open={open}
      // Mientras la acción corre, ni ESC ni el clic afuera cierran: si se
      // cerrara, el usuario creería que se canceló cuando ya va en camino.
      onClose={isLoading ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          m: { xs: 2, sm: 3 },
          maxWidth: { xs: 'calc(100% - 32px)', sm: 'sm' },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontSize: { xs: '1.125rem', sm: '1.25rem' },
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3 },
        }}
      >
        <WarningIcon color={severityColor} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }} />
        {title}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ py: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
          {message}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, gap: { xs: 1, sm: 1.5 } }}>
        {extraAction && (
          <Button
            onClick={extraAction.onClick}
            disabled={isLoading}
            color="inherit"
            sx={{ mr: 'auto' }}
          >
            {extraAction.label}
          </Button>
        )}
        <Button onClick={onCancel} disabled={isLoading}>
          {cancelText}
        </Button>
        <LoadingButton
          onClick={onConfirm}
          variant="contained"
          color={severityColor}
          loading={isLoading}
        >
          {confirmText}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
