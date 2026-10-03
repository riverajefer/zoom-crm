import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useSnackbar } from 'notistack';
import { useCreateRefundRequest } from '../hooks/useRefundRequests';
import type { OrderItem } from '../../../types/order.types';
import type {
  RefundPaymentMethod,
  RefundReason,
} from '../../../types/refund-request.types';
import { REFUND_REASON_LABELS } from '../../../types/refund-request.types';
import { BankSelector } from '../../../components/common/BankSelector';
import { LoadingButton } from '../../../components/common/LoadingButton';
import {
  computePartialAnnulment,
  getAliveQuantity,
} from '../utils/partialAnnulment';

interface PartialAnnulmentDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  items: OrderItem[];
  orderSubtotal: number;
  orderTotal: number;
  /** Valor de venta todavía vigente (total menos lo ya anulado). */
  pendingSaleValue: number;
  /** Saldo de la orden hoy: positivo = el cliente debe, negativo = saldo a favor. */
  currentBalance: number;
  /** Abono neto del cliente: tope de lo que puede salir de la caja. */
  paidAmount: number;
}

const formatCurrencyInput = (value: string | number): string => {
  const numericValue = value.toString().replace(/\D/g, '');
  if (!numericValue) return '';
  return new Intl.NumberFormat('es-CO').format(parseInt(numericValue, 10));
};

const parseCurrency = (value: string): number =>
  parseFloat(value.replace(/\./g, '')) || 0;

const formatCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n);

const PAYMENT_METHOD_OPTIONS: { value: RefundPaymentMethod; label: string }[] =
  [
    { value: 'CASH', label: 'Efectivo' },
    { value: 'TRANSFER', label: 'Transferencia' },
    { value: 'CARD', label: 'Tarjeta' },
  ];

const REASONS: RefundReason[] = [
  'CLIENT_WITHDRAWAL',
  'QUALITY',
  'DELIVERY_DELAY',
  'FORCE_MAJEURE',
  'OTHER',
];

const SummaryRow: React.FC<{
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}> = ({ label, value, strong, color }) => (
  <Box display='flex' justifyContent='space-between' gap={2}>
    <Typography variant='body2' fontWeight={strong ? 600 : 400}>
      {label}
    </Typography>
    <Typography variant='body2' fontWeight={strong ? 700 : 500} color={color}>
      {value}
    </Typography>
  </Box>
);

/**
 * Anulación parcial: parte del trabajo se cae y el resto de la orden sigue.
 *
 * El usuario elige los ítems y dice cuánto retiene la empresa; la venta que se
 * anula y el dinero que puede salir se calculan solos. Viaja como una solicitud
 * de devolución —misma autorización de gerencia, mismo pago por Caja—, con la
 * diferencia de que puede no devolver nada: ahí solo baja el saldo.
 */
export const PartialAnnulmentDialog: React.FC<PartialAnnulmentDialogProps> = ({
  open,
  onClose,
  orderId,
  orderNumber,
  items,
  orderSubtotal,
  orderTotal,
  pendingSaleValue,
  currentBalance,
  paidAmount,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const createMutation = useCreateRefundRequest();
  const submitting = useRef(false);

  /** Cantidad a anular por ítem; un ítem ausente no se anula. */
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [retained, setRetained] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<RefundReason>('CLIENT_WITHDRAWAL');
  const [paymentMethod, setPaymentMethod] =
    useState<RefundPaymentMethod>('CASH');
  const [bankEntity, setBankEntity] = useState<string | null>(null);
  const [observation, setObservation] = useState('');

  const annullableItems = useMemo(
    () => items.filter((item) => getAliveQuantity(item) > 0),
    [items],
  );

  const selected = annullableItems
    .filter((item) => item.id in quantities)
    .map((item) => ({
      item,
      alive: getAliveQuantity(item),
      quantity: parseFloat(quantities[item.id]) || 0,
    }));

  const itemsAmount = selected.reduce(
    (sum, { item, quantity }) => sum + quantity * (parseFloat(item.unitPrice) || 0),
    0,
  );
  const retainedAmount = parseCurrency(retained);

  const { itemsSaleValue, reversedAmount, availableToRefund, balanceAfter } =
    computePartialAnnulment({
      itemsAmount,
      retainedAmount,
      orderSubtotal,
      orderTotal,
      currentBalance,
      paidAmount,
    });

  // Lo normal es devolver todo lo que sobra: se propone y el usuario lo baja si
  // quiere dejar parte como saldo a favor.
  useEffect(() => {
    setAmount(availableToRefund > 0 ? formatCurrencyInput(availableToRefund) : '');
  }, [availableToRefund]);

  const refundAmount = parseCurrency(amount);
  const invalidQuantity = selected.find(
    ({ quantity, alive }) => quantity <= 0 || quantity > alive,
  );
  const retainedTooHigh = itemsSaleValue > 0 && retainedAmount >= itemsSaleValue;

  const resetAndClose = () => {
    setQuantities({});
    setRetained('');
    setAmount('');
    setReason('CLIENT_WITHDRAWAL');
    setPaymentMethod('CASH');
    setBankEntity(null);
    setObservation('');
    onClose();
  };

  const toggleItem = (item: OrderItem) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (item.id in next) delete next[item.id];
      else next[item.id] = String(getAliveQuantity(item));
      return next;
    });
  };

  const handleSubmit = async () => {
    // El botón se deshabilita hasta el siguiente render, así que dos clics en el
    // mismo frame llegarían los dos hasta el `mutateAsync`.
    if (submitting.current) return;

    if (refundAmount > availableToRefund) {
      enqueueSnackbar(
        `El monto a devolver no puede exceder ${formatCOP(availableToRefund)}`,
        { variant: 'error' },
      );
      return;
    }

    submitting.current = true;
    try {
      await createMutation.mutateAsync({
        orderId,
        items: selected.map(({ item, quantity }) => ({
          orderItemId: item.id,
          quantity,
        })),
        retainedAmount,
        refundAmount,
        refundReason: reason,
        ...(refundAmount > 0
          ? {
              paymentMethod,
              bankEntity: paymentMethod === 'TRANSFER' ? bankEntity ?? null : null,
            }
          : {}),
        observation: observation.trim(),
      });
      resetAndClose();
    } catch {
      // handled by hook
    } finally {
      submitting.current = false;
    }
  };

  const canSubmit =
    selected.length > 0 &&
    !invalidQuantity &&
    !retainedTooHigh &&
    reversedAmount > 0 &&
    refundAmount <= availableToRefund &&
    observation.trim().length >= 5;

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth='sm' fullWidth>
      <DialogTitle>Anular ítems — Orden {orderNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Alert severity='info'>
            Para cuando una parte del trabajo se cae y el resto sigue. Los ítems
            anulados quedan en la orden, marcados, y la orden conserva su estado.
            La solicitud la autoriza gerencia.
          </Alert>

          <Box>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>
              ¿Qué se anula?
            </Typography>
            <Stack divider={<Divider flexItem />}>
              {annullableItems.map((item) => {
                const alive = getAliveQuantity(item);
                const checked = item.id in quantities;
                const quantity = parseFloat(quantities[item.id]) || 0;
                const invalid = checked && (quantity <= 0 || quantity > alive);
                return (
                  <Box
                    key={item.id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleItem(item)}
                      inputProps={{
                        'aria-label': `Anular ${item.description.trim()}`,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant='body2' fontWeight={500} noWrap>
                        {item.description.trim() || item.product?.name}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {alive} × {formatCOP(parseFloat(item.unitPrice) || 0)} ={' '}
                        {formatCOP(alive * (parseFloat(item.unitPrice) || 0))}
                      </Typography>
                    </Box>
                    {checked && (
                      <TextField
                        label='Cantidad'
                        type='number'
                        size='small'
                        value={quantities[item.id]}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        error={invalid}
                        helperText={invalid ? `Máx. ${alive}` : undefined}
                        inputProps={{ min: 0, max: alive, step: 'any' }}
                        sx={{ width: 110 }}
                      />
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Box>

          {selected.length > 0 && !invalidQuantity && (
            <>
              <TextField
                label='Valor que retiene la empresa (COP)'
                value={retained}
                onChange={(e) => setRetained(formatCurrencyInput(e.target.value))}
                fullWidth
                placeholder='0'
                error={retainedTooHigh}
                helperText={
                  retainedTooHigh
                    ? `Debe ser menor que ${formatCOP(itemsSaleValue)}, que es lo que valen los ítems anulados`
                    : 'Muestras, material ya gastado, diseño. Déjalo en 0 si no se retiene nada.'
                }
              />

              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                }}
              >
                <SummaryRow
                  label='Valor de los ítems anulados'
                  value={formatCOP(itemsSaleValue)}
                />
                {retainedAmount > 0 && (
                  <SummaryRow
                    label='Retiene la empresa'
                    value={`-${formatCOP(retainedAmount)}`}
                  />
                )}
                <SummaryRow
                  label='Venta que se anula'
                  value={formatCOP(reversedAmount)}
                  strong
                  color='error.main'
                />
                <Divider sx={{ my: 0.5 }} />
                <SummaryRow
                  label='La orden queda valiendo'
                  value={formatCOP(pendingSaleValue - reversedAmount)}
                />
                <SummaryRow
                  label={
                    balanceAfter > 0
                      ? 'El cliente queda debiendo'
                      : 'Le sobra al cliente'
                  }
                  value={formatCOP(Math.abs(balanceAfter))}
                  strong
                />
              </Box>

              {availableToRefund > 0 ? (
                <>
                  <TextField
                    label='Dinero a devolver al cliente (COP)'
                    value={amount}
                    onChange={(e) =>
                      setAmount(formatCurrencyInput(e.target.value))
                    }
                    fullWidth
                    placeholder='0'
                    error={refundAmount > availableToRefund}
                    helperText={
                      refundAmount < availableToRefund
                        ? `Máximo ${formatCOP(availableToRefund)}. Los ${formatCOP(availableToRefund - refundAmount)} que no se devuelven quedan como saldo a favor del cliente.`
                        : `Máximo ${formatCOP(availableToRefund)}. El dinero sale cuando Caja registre el pago.`
                    }
                  />

                  {refundAmount > 0 && (
                    <>
                      <TextField
                        select
                        label='Método de pago de la devolución'
                        value={paymentMethod}
                        onChange={(e) => {
                          const method = e.target.value as RefundPaymentMethod;
                          setPaymentMethod(method);
                          if (method !== 'TRANSFER') setBankEntity(null);
                        }}
                        fullWidth
                        required
                      >
                        {PAYMENT_METHOD_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      {paymentMethod === 'TRANSFER' && (
                        <BankSelector value={bankEntity} onChange={setBankEntity} />
                      )}
                    </>
                  )}
                </>
              ) : (
                <Alert severity='success'>
                  No sale dinero de caja: el cliente no ha abonado más de lo que
                  queda debiendo, así que la anulación solo baja el saldo de la
                  orden. Se aplica en cuanto gerencia la autorice.
                </Alert>
              )}
            </>
          )}

          <TextField
            select
            label='Motivo'
            value={reason}
            onChange={(e) => setReason(e.target.value as RefundReason)}
            fullWidth
            required
          >
            {REASONS.map((value) => (
              <MenuItem key={value} value={value}>
                {REFUND_REASON_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label='Observación'
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
            placeholder='Ej: Se canceló la marca en rígido; el DTF sí se entregó. Se retiene el valor de las muestras.'
            helperText='Mínimo 5 caracteres — quedará registrado en el historial'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetAndClose} disabled={createMutation.isPending}>
          Cancelar
        </Button>
        <LoadingButton
          onClick={handleSubmit}
          variant='contained'
          color='warning'
          loading={createMutation.isPending}
          startIcon={<SendIcon />}
          disabled={!canSubmit}
        >
          Enviar solicitud
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
