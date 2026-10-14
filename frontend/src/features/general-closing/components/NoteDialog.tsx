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

interface Props {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  label: string;
  confirmLabel: string;
  confirmColor?: 'primary' | 'warning';
  /** Si la nota es obligatoria para confirmar. */
  required?: boolean;
  maxLength?: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

/** Un texto y una confirmación: lo usan observar una caja, cerrar el día y reabrirlo. */
export const NoteDialog: React.FC<Props> = ({
  open,
  title,
  description,
  label,
  confirmLabel,
  confirmColor = 'primary',
  required = false,
  maxLength = 500,
  loading,
  onClose,
  onConfirm,
}) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const trimmed = notes.trim();

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {description}
          </Typography>
        )}
        <TextField
          label={label}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          minRows={3}
          fullWidth
          autoFocus
          disabled={loading}
          inputProps={{ maxLength }}
          helperText={`${notes.length}/${maxLength}`}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          disabled={loading || (required && !trimmed)}
          onClick={() => onConfirm(trimmed)}
        >
          {loading ? 'Guardando...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
