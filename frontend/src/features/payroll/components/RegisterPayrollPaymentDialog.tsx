import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { CallSplit, Close } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSnackbar } from 'notistack';
import { BankSelector } from '../../../components/common/BankSelector';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { formatCurrency } from '../../../utils/formatters';
import {
  formatCurrencyInput,
  parseCurrencyInput,
  sanitizeCurrencyInput,
  toCurrencyInputValue,
} from '../../../utils/currencyInput';
import { paymentMethodLabel } from '../../../utils/paymentMethods';
import type { PayrollItem, PayrollPaymentMethod } from '../../../types/payroll-item.types';
import { usePayrollPayments } from '../hooks/usePayrollPayments';
import { apiErrorMessage, itemBalance, itemPaidAmount } from '../utils/payments';

const METHODS: PayrollPaymentMethod[] = ['CASH', 'TRANSFER'];

const lineSchema = z.object({
  amount: z
    .string()
    .min(1, 'Ingresa el monto')
    .refine((v) => parseCurrencyInput(v) > 0, 'El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['CASH', 'TRANSFER']),
  reference: z.string().optional(),
  bankEntity: z.string().nullable().optional(),
});

const buildSchema = (balance: number) =>
  z
    .object({
      paidAt: z.date({ required_error: 'La fecha es requerida' }).nullable(),
      lines: z.array(lineSchema).min(1),
      notes: z.string().optional(),
    })
    .refine((v) => v.paidAt !== null, { message: 'La fecha es requerida', path: ['paidAt'] })
    .refine(
      (v) =>
        Math.round(v.lines.reduce((acc, l) => acc + parseCurrencyInput(l.amount), 0) * 100) <=
        Math.round(balance * 100),
      { message: `El pago supera el saldo (${formatCurrency(balance)})`, path: ['lines'] },
    );

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

interface Props {
  periodId: string;
  /** Registro a pagar; `null` cierra el diálogo. */
  item: PayrollItem | null;
  onClose: () => void;
}

const employeeName = (item: PayrollItem) =>
  `${item.employee?.user?.firstName ?? ''} ${item.employee?.user?.lastName ?? ''}`.trim() ||
  'Empleado';

/**
 * Registra el pago (o abono) de un empleado. Un pago mixto se registra en dos
 * líneas, una por método, en el mismo envío.
 */
export const RegisterPayrollPaymentDialog: React.FC<Props> = ({ periodId, item, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { registerMutation } = usePayrollPayments(periodId, { enabled: false });

  const total = item ? Number(item.totalPayment) : 0;
  const paid = item ? itemPaidAmount(item) : 0;
  const balance = item ? itemBalance(item) : 0;
  // El tope depende del empleado abierto; el resolver lo lee del ref para no
  // quedarse con el saldo del primer render.
  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: (values, context, options) =>
      zodResolver(buildSchema(balanceRef.current))(values, context, options),
    defaultValues: { paidAt: new Date(), lines: [], notes: '' },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // Cada vez que se abre para un empleado, arranca con todo el saldo en efectivo.
  useEffect(() => {
    if (item) {
      reset({
        paidAt: new Date(),
        lines: [
          {
            amount: toCurrencyInputValue(itemBalance(item)),
            paymentMethod: 'CASH',
            reference: '',
            bankEntity: null,
          },
        ],
        notes: '',
      });
    }
  }, [item, reset]);

  const lines = watch('lines') ?? [];
  const entered = lines.reduce((acc, l) => acc + parseCurrencyInput(l.amount ?? ''), 0);
  const remaining = Math.round((balance - entered) * 100) / 100;

  const handleSplit = () => {
    const first = lines[0];
    const firstAmount = parseCurrencyInput(first?.amount ?? '');
    const other: PayrollPaymentMethod = first?.paymentMethod === 'CASH' ? 'TRANSFER' : 'CASH';
    // Si la primera línea traía todo el saldo, la segunda arranca vacía y el
    // usuario reparte; si no, la segunda propone lo que falta.
    const rest = Math.max(balance - firstAmount, 0);
    append({
      amount: rest > 0 ? toCurrencyInputValue(rest) : '',
      paymentMethod: other,
      reference: '',
      bankEntity: null,
    });
  };

  const handleClose = () => {
    if (!registerMutation.isPending) onClose();
  };

  // RHF no bloquea envíos reentrantes: dos clics en el mismo frame registrarían
  // el pago dos veces.
  const onSubmit = useSingleFlight(async (values: FormValues) => {
    if (!item) return;
    try {
      const result = await registerMutation.mutateAsync({
        itemId: item.id,
        data: {
          paidAt: values.paidAt!.toISOString(),
          lines: values.lines.map((l) => ({
            amount: parseCurrencyInput(l.amount),
            paymentMethod: l.paymentMethod,
            reference: l.paymentMethod === 'TRANSFER' ? l.reference || undefined : undefined,
            bankEntity: l.paymentMethod === 'TRANSFER' ? l.bankEntity || undefined : undefined,
          })),
          notes: values.notes || undefined,
        },
      });
      enqueueSnackbar(
        result.periodStatus === 'PAID'
          ? `Pago registrado. Ya se le pagó a todos: el periodo quedó como «Pagado».`
          : `Pago registrado a ${employeeName(item)}`,
        { variant: 'success' },
      );
      onClose();
    } catch (err) {
      enqueueSnackbar(apiErrorMessage(err, 'No se pudo registrar el pago'), { variant: 'error' });
      throw err;
    }
  });

  const linesError = (errors.lines as { message?: string } | undefined)?.message ??
    (errors.lines as { root?: { message?: string } } | undefined)?.root?.message;

  return (
    <Dialog open={!!item} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Registrar pago{item ? ` — ${employeeName(item)}` : ''}</DialogTitle>
      <DialogContent dividers>
        {item && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Total a pagar: <strong>{formatCurrency(total)}</strong>
              </Typography>
              {paid > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Ya pagado: <strong>{formatCurrency(paid)}</strong>
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Saldo: <strong>{formatCurrency(balance)}</strong>
              </Typography>
            </Stack>

            {fields.map((field, index) => {
              const method = lines[index]?.paymentMethod;
              const lineErrors = errors.lines?.[index];
              return (
                <Box
                  key={field.id}
                  sx={{
                    p: fields.length > 1 ? 1.5 : 0,
                    border: fields.length > 1 ? 1 : 0,
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
                    <Controller
                      name={`lines.${index}.paymentMethod`}
                      control={control}
                      render={({ field: f }) => (
                        <TextField {...f} select label="Método" sx={{ minWidth: 160 }} fullWidth>
                          {METHODS.map((m) => (
                            <MenuItem key={m} value={m}>
                              {paymentMethodLabel(m)}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                    />
                    <Controller
                      name={`lines.${index}.amount`}
                      control={control}
                      render={({ field: f }) => (
                        <TextField
                          {...f}
                          value={formatCurrencyInput(f.value ?? '')}
                          onChange={(e) => f.onChange(sanitizeCurrencyInput(e.target.value))}
                          label="Monto"
                          fullWidth
                          required
                          error={!!lineErrors?.amount}
                          helperText={lineErrors?.amount?.message}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          }}
                        />
                      )}
                    />
                    {fields.length > 1 && (
                      <Tooltip title="Quitar esta parte">
                        <IconButton onClick={() => remove(index)} sx={{ mt: 1 }}>
                          <Close fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  {method === 'TRANSFER' && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                      <Controller
                        name={`lines.${index}.bankEntity`}
                        control={control}
                        render={({ field: f }) => (
                          <BankSelector value={f.value ?? null} onChange={f.onChange} fullWidth />
                        )}
                      />
                      <Controller
                        name={`lines.${index}.reference`}
                        control={control}
                        render={({ field: f }) => (
                          <TextField {...f} label="Referencia (opcional)" fullWidth />
                        )}
                      />
                    </Stack>
                  )}
                </Box>
              );
            })}

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {fields.length === 1 && (
                <Button size="small" startIcon={<CallSplit />} onClick={handleSplit}>
                  Dividir en efectivo + transferencia
                </Button>
              )}
              {fields.length === 1 && remaining !== 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  color="primary"
                  label={`Pagar saldo completo: ${formatCurrency(balance)}`}
                  onClick={() => setValue('lines.0.amount', toCurrencyInputValue(balance))}
                />
              )}
            </Stack>

            {remaining < 0 ? (
              <Alert severity="error">
                El pago supera el saldo en {formatCurrency(-remaining)}. Lo máximo es{' '}
                {formatCurrency(balance)}.
              </Alert>
            ) : linesError ? (
              <Alert severity="error">{linesError}</Alert>
            ) : remaining > 0 && entered > 0 ? (
              <Alert severity="info">
                Es un abono: quedan {formatCurrency(remaining)} por pagarle.
              </Alert>
            ) : null}

            <Controller
              name="paidAt"
              control={control}
              render={({ field, fieldState }) => (
                <DatePicker
                  label="Fecha del pago"
                  value={field.value}
                  onChange={field.onChange}
                  disableFuture
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true,
                      error: !!fieldState.error,
                      helperText: fieldState.error?.message,
                    },
                  }}
                />
              )}
            />
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField {...field} label="Nota (opcional)" fullWidth multiline minRows={1} />
              )}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={registerMutation.isPending}>
          Cancelar
        </Button>
        <LoadingButton
          variant="contained"
          loading={registerMutation.isPending}
          disabled={remaining < 0}
          onClick={handleSubmit(onSubmit)}
        >
          Registrar pago
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
