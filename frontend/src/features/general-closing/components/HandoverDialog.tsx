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
import {
  formatCurrencyInput,
  parseCurrencyInput,
  sanitizeCurrencyInput,
} from '../../../utils/currencyInput';
import { formatCurrency } from '../utils';

/** Efectivo en pesos: sin decimales. */
const DECIMALS = 0;

interface Props {
  row: RegisterDayRow | null;
  loading: boolean;
  onClose: () => void;
  /** La API recibe la base que queda en el local; lo recibido es lo contado menos eso. */
  onConfirm: (baseLeft: number) => void;
}

/**
 * La Matriz recoge el efectivo de un local que ya cerró. Se escribe cuánto se
 * recibe (por defecto, el efectivo que esperaba la caja) y lo que no se recoge
 * queda de base para que el local abra al día siguiente.
 */
export const HandoverDialog: React.FC<Props> = ({ row, loading, onClose, onConfirm }) => {
  const counted = row?.totals.counted ?? 0;
  const expected = row?.totals.expected ?? counted;
  // No se puede recibir plata que no está: con faltante, arranca en lo contado.
  const suggested = Math.min(expected, counted);
  const [received, setReceived] = useState('');

  useEffect(() => {
    if (row) setReceived(String(suggested));
  }, [row, suggested]);

  const amount = parseCurrencyInput(received, DECIMALS);
  const valid = amount > 0 && amount <= counted;
  const baseLeft = counted - amount;

  return (
    <Dialog open={!!row} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Recibir efectivo de {row?.cashRegister.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            La caja esperaba <strong>{formatCurrency(expected)}</strong> y contó{' '}
            <strong>{formatCurrency(counted)}</strong>. Lo que recibas entra a la caja de la Matriz
            abierta hoy.
          </Typography>
          {counted < expected && (
            <Alert severity="warning">
              Contó menos de lo esperado: solo puedes recibir lo que hay en la caja.
            </Alert>
          )}
          <TextField
            label="Efectivo que recibes"
            value={received ? formatCurrencyInput(received, DECIMALS) : ''}
            onChange={(e) => setReceived(sanitizeCurrencyInput(e.target.value, DECIMALS))}
            autoFocus
            fullWidth
            disabled={loading}
            error={received !== '' && !valid}
            helperText={
              received !== '' && amount > counted
                ? `No puede ser más de lo contado (${formatCurrency(counted)})`
                : received !== '' && amount <= 0
                  ? 'Escribe cuánto recibes'
                  : ' '
            }
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
          />
          {valid && (
            <Alert severity="info" icon={false}>
              Queda de base en el local: <strong>{formatCurrency(baseLeft)}</strong>. Con eso abre
              mañana.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="contained" disabled={loading || !valid} onClick={() => onConfirm(baseLeft)}>
          {loading ? 'Guardando...' : `Recibir ${valid ? formatCurrency(amount) : ''}`.trim()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
