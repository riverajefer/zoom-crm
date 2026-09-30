import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material';

interface Props {
  open: boolean;
  title: string;
  description: React.ReactNode;
  label: string;
  confirmText: string;
  confirmColor?: 'primary' | 'error';
  /** El motivo es obligatorio (terminar); la nota de aprobar o rechazar no. */
  required?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
}

/** Confirmación con una nota o un motivo, para aprobar, rechazar o terminar un apoyo. */
export const LocationSupportNoteDialog: React.FC<Props> = ({
  open,
  title,
  description,
  label,
  confirmText,
  confirmColor = 'primary',
  required = false,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);

  const missing = required && text.trim().length < 3;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>
        <TextField
          autoFocus
          label={label}
          value={text}
          onChange={(e) => setText(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          required={required}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          color={confirmColor}
          disabled={missing || loading}
          onClick={() => onConfirm(text.trim())}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
