import React from 'react';
import { Alert, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import type { AnnulmentAmounts } from '../utils/annulment';

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('es-CO').format(parseInt(digits, 10));
};

const formatCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n);

/** Valor retenido en pesos a partir de lo que guarda el campo (solo dígitos). */
export const parseRetainedAmount = (value: string): number =>
  parseInt(value.replace(/\D/g, '') || '0', 10);

/** El valor supera lo que la empresa puede retener. */
export const isRetainedAmountInvalid = (
  value: string,
  amounts: AnnulmentAmounts,
): boolean => parseRetainedAmount(value) > amounts.maxRetainable;

interface RetainedAmountFieldProps {
  amounts: AnnulmentAmounts;
  /** Solo dígitos, como el resto de campos de moneda del proyecto. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Lo que retiene la empresa al anular una orden con pagos, y cuánto le queda al
 * cliente como saldo a favor. Lo usan el diálogo de anulación directa (admin) y
 * la solicitud de anulación, para que las dos muestren la misma cuenta.
 */
export const RetainedAmountField: React.FC<RetainedAmountFieldProps> = ({
  amounts,
  value,
  onChange,
  disabled,
}) => {
  const retained = parseRetainedAmount(value);
  const invalid = retained > amounts.maxRetainable;
  const creditLeft = Math.max(0, amounts.unusedPaid - retained);

  return (
    <Stack spacing={2}>
      <Typography variant='body2' color='text.secondary'>
        El cliente pagó <strong>{formatCOP(amounts.unusedPaid)}</strong> que no
        ha usado en otras órdenes. Lo que no retenga la empresa queda como saldo
        a favor: puede usarlo en otras órdenes o pedir que se le devuelva.
      </Typography>

      <TextField
        fullWidth
        label='Valor que retiene la empresa'
        value={value ? formatCurrencyInput(value) : ''}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        disabled={disabled}
        error={invalid}
        helperText={
          invalid
            ? `No puede pasar de ${formatCOP(amounts.maxRetainable)}`
            : 'Déjalo vacío si se le reconoce todo al cliente. Por ejemplo, si el trabajo ya estaba en producción, lo que costó hasta ahí.'
        }
        InputProps={{
          startAdornment: <InputAdornment position='start'>$</InputAdornment>,
        }}
        inputProps={{ style: { textAlign: 'right' }, inputMode: 'numeric' }}
      />

      {!invalid && (
        <Alert severity='success'>
          Queda como saldo a favor del cliente:{' '}
          <strong>{formatCOP(creditLeft)}</strong>
        </Alert>
      )}
    </Stack>
  );
};
