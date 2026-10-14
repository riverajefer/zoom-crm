import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { RegisterDayRow } from '../../../types/general-closing.types';
import { formatCurrency } from '../utils';

interface Props {
  row: RegisterDayRow | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (baseLeft: number) => void;
}

/**
 * La Matriz recoge el efectivo de un local que ya cerró. Se escribe la base
 * que se le deja para el día siguiente; lo demás entra a la caja de la Matriz.
 */
export const HandoverDialog: React.FC<Props> = ({ row, loading, onClose, onConfirm }) => {
  const [base, setBase] = useState('');

  useEffect(() => {
    if (row) setBase('');
  }, [row]);

  const counted = row?.totals.counted ?? 0;
  const baseLeft = base === '' ? NaN : Number(base);
  const valid = Number.isFinite(baseLeft) && baseLeft >= 0 && baseLeft < counted;
  const received = valid ? counted - baseLeft : null;

  return (
    <Dialog open={!!row} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Recibir efectivo de {row?.cashRegister.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            La caja cerró con <strong>{formatCurrency(counted)}</strong> contados. Lo que recibas
            entra como depósito a la caja de la Matriz, que debe estar abierta.
          </Typography>
          <TextField
            label="Base que le dejas al local"
            type="number"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            autoFocus
            fullWidth
            disabled={loading}
            error={base !== '' && !valid}
            helperText={
              base !== '' && !valid ? 'Debe ser menor que lo contado' : 'Con eso abre el local mañana'
            }
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            inputProps={{ min: 0, step: 1000 }}
          />
          {received !== null && (
            <Alert severity="info" icon={false}>
              Recibes <strong>{formatCurrency(received)}</strong> en la caja de la Matriz.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="contained" disabled={loading || !valid} onClick={() => onConfirm(baseLeft)}>
          {loading ? 'Guardando...' : 'Recibir'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
