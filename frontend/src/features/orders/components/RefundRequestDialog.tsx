import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Alert,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Box,
  Typography,
  Divider,
  Chip,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { useSnackbar } from 'notistack';
import { storageApi } from '../../../api/storage.api';
import { useCreateRefundRequest } from '../hooks/useRefundRequests';
import type {
  RefundPaymentMethod,
  RefundReason,
} from '../../../types/refund-request.types';
import { REFUND_REASON_LABELS } from '../../../types/refund-request.types';
import { BankSelector } from '../../../components/common/BankSelector';
import { LoadingButton } from '../../../components/common/LoadingButton';
import {
  computeAvailableRefund,
  computeReversalNeededToFreeCash,
} from '../utils/refundAvailability';

interface RefundRequestDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  /** Saldo a favor ya existente: excedente sin anular nada de la venta. */
  maxAmount: number;
  /** Valor de venta todavía vigente (total menos lo ya anulado). */
  pendingSaleValue: number;
  /** Abono neto del cliente: tope de lo que puede salir de la caja. */
  paidAmount: number;
  /**
   * Saldo de la orden hoy: positivo = el cliente debe, negativo = saldo a favor.
   *
   * Es imprescindible para saber cuánto libera una anulación: mientras la orden
   * tenga deuda, la venta que se anula primero cubre esa deuda y solo el
   * excedente puede salir de la caja. Sin este dato la UI proponía devolver
   * dinero que el backend rechazaba ("Anular ese valor no deja dinero por
   * devolver").
   */
  currentBalance: number;
  /**
   * La orden está anulada: su venta ya se anuló, así que solo se devuelve el
   * saldo a favor y no se ofrece anular venta.
   */
  saleAlreadyAnnulled?: boolean;
}

/**
 * Las dos modalidades son la misma operación con distinto valor anulado, pero
 * mezclarlas en un solo formulario obliga al usuario a entender la diferencia
 * entre "dinero devuelto" y "venta anulada" antes de poder escribir nada. El
 * selector la resuelve por él: en saldo a favor la venta no se toca.
 */
type RefundMode = 'CREDIT_BALANCE' | 'SALE_REVERSAL';

const formatCurrencyInput = (value: string | number): string => {
  const numericValue = value.toString().replace(/\D/g, '');
  if (!numericValue) return '';
  const number = parseInt(numericValue, 10);
  return new Intl.NumberFormat('es-CO').format(number);
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

const REVERSAL_REASONS: RefundReason[] = [
  'QUALITY',
  'DELIVERY_DELAY',
  'FORCE_MAJEURE',
  'CLIENT_WITHDRAWAL',
  'OTHER',
];

export const RefundRequestDialog: React.FC<RefundRequestDialogProps> = ({
  open,
  onClose,
  orderId,
  orderNumber,
  maxAmount,
  pendingSaleValue,
  paidAmount,
  currentBalance,
  saleAlreadyAnnulled = false,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const createMutation = useCreateRefundRequest();

  const defaultMode: RefundMode =
    saleAlreadyAnnulled || maxAmount > 0 ? 'CREDIT_BALANCE' : 'SALE_REVERSAL';
  const [mode, setMode] = useState<RefundMode>(defaultMode);

  // El diálogo vive montado en la página, así que el estado inicial se calcula
  // con la orden de ese momento. Si después cambia —se anula, entra un pago de
  // más—, al abrir quedaba el modo viejo: una OP recién anulada abría en «anular
  // venta», que el backend rechaza.
  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);
  const [reversed, setReversed] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<RefundReason>('QUALITY');
  const [paymentMethod, setPaymentMethod] =
    useState<RefundPaymentMethod>('CASH');
  const [bankEntity, setBankEntity] = useState<string | null>(null);
  const [observation, setObservation] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  const loading = createMutation.isPending || uploadingReceipt;

  const reversedAmount = mode === 'SALE_REVERSAL' ? parseCurrency(reversed) : 0;

  // Dinero que puede salir de la caja. La cuenta vive en la util para que no se
  // separe de `computeAvailableOverpayment` del backend.
  const availableToRefund = computeAvailableRefund({
    currentBalance,
    reversedAmount,
    paidAmount,
  });

  const reversalNeededToFreeCash = computeReversalNeededToFreeCash(
    currentBalance,
    pendingSaleValue,
  );

  // Al anular venta, el dinero a devolver casi siempre es todo lo que se libera:
  // se propone y el usuario lo baja si quiere dejar parte como saldo a favor.
  useEffect(() => {
    if (mode !== 'SALE_REVERSAL') return;
    setAmount(availableToRefund > 0 ? formatCurrencyInput(availableToRefund) : '');
  }, [mode, reversedAmount, availableToRefund]);

  const resetAndClose = () => {
    setMode(defaultMode);
    setReversed('');
    setAmount('');
    setReason('QUALITY');
    setPaymentMethod('CASH');
    setBankEntity(null);
    setObservation('');
    setReceiptFile(null);
    onClose();
  };

  const handleFileChange = (file: File | null) => {
    setReceiptFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Pegar el pantallazo del banco es más rápido que buscarlo en el disco.
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith('image/'),
    );
    if (item) {
      const file = item.getAsFile();
      if (file) setReceiptFile(file);
    }
  }, []);

  const handleSubmit = async () => {
    // El botón se deshabilita hasta el siguiente render, así que dos clics en el
    // mismo frame llegarían los dos hasta el `mutateAsync`.
    if (submitting.current) return;

    const numericAmount = parseCurrency(amount);

    if (mode === 'SALE_REVERSAL') {
      if (!reversedAmount || reversedAmount <= 0) {
        enqueueSnackbar('Indica cuánto de la venta se anula', {
          variant: 'error',
        });
        return;
      }
      if (reversedAmount > pendingSaleValue) {
        enqueueSnackbar(
          `No puedes anular más de ${formatCOP(pendingSaleValue)}, que es lo que vale la orden hoy`,
          { variant: 'error' },
        );
        return;
      }
    }

    if (!numericAmount || numericAmount <= 0) {
      enqueueSnackbar('El monto a devolver debe ser mayor a 0', {
        variant: 'error',
      });
      return;
    }
    if (numericAmount > availableToRefund) {
      enqueueSnackbar(
        `El monto a devolver no puede exceder ${formatCOP(availableToRefund)}`,
        { variant: 'error' },
      );
      return;
    }
    if (!observation.trim() || observation.trim().length < 5) {
      enqueueSnackbar('La observación es obligatoria (mínimo 5 caracteres)', {
        variant: 'error',
      });
      return;
    }

    submitting.current = true;
    try {
      // El archivo se sube primero: si falla, no queda una solicitud creada
      // apuntando a un comprobante que nunca existió.
      let receiptFileId: string | undefined;
      if (paymentMethod === 'TRANSFER' && receiptFile) {
        setUploadingReceipt(true);
        try {
          const uploaded = await storageApi.uploadFile(receiptFile, {
            entityType: 'refund_request',
            entityId: orderId,
          });
          receiptFileId = uploaded.id;
        } catch {
          enqueueSnackbar(
            'No se pudo subir el comprobante. La solicitud no se creó.',
            { variant: 'error' },
          );
          return;
        } finally {
          setUploadingReceipt(false);
        }
      }

      await createMutation.mutateAsync({
        orderId,
        refundAmount: numericAmount,
        reversedAmount,
        refundReason: mode === 'SALE_REVERSAL' ? reason : 'CREDIT_BALANCE',
        paymentMethod,
        bankEntity: paymentMethod === 'TRANSFER' ? bankEntity ?? null : null,
        receiptFileId,
        observation: observation.trim(),
      });
      resetAndClose();
    } catch {
      // handled by hook
    } finally {
      submitting.current = false;
    }
  };

  const receiptIsImage = receiptFile?.type.startsWith('image/') ?? false;

  const isTotalReversal =
    mode === 'SALE_REVERSAL' &&
    reversedAmount > 0 &&
    reversedAmount >= pendingSaleValue;

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth='sm' fullWidth>
      <DialogTitle>Registrar devolución — Orden {orderNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Alert severity='info'>
            Esta solicitud la autoriza gerencia. El dinero sale de la caja{' '}
            <strong>cuando Caja registre el pago</strong>, no al aprobarla.
          </Alert>

          {saleAlreadyAnnulled && (
            <Alert severity='info'>
              La orden está anulada: se devuelve el saldo a favor que le quedó
              al cliente.
            </Alert>
          )}

          <Box sx={{ display: saleAlreadyAnnulled ? 'none' : undefined }}>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>
              ¿Por qué se devuelve?
            </Typography>
            <ToggleButtonGroup
              value={mode}
              exclusive
              fullWidth
              size='small'
              onChange={(_, value: RefundMode | null) => {
                if (!value) return;
                setMode(value);
                setReversed('');
                setAmount('');
              }}
            >
              <ToggleButton value='CREDIT_BALANCE' disabled={maxAmount <= 0}>
                El cliente pagó de más
              </ToggleButton>
              <ToggleButton value='SALE_REVERSAL'>
                El trabajo no se entregó o no cumplió
              </ToggleButton>
            </ToggleButtonGroup>
            {maxAmount <= 0 && (
              <Typography
                variant='caption'
                color='text.secondary'
                sx={{ mt: 0.5, display: 'block' }}
              >
                Esta orden no tiene saldo a favor, así que la devolución solo
                puede darse anulando parte de la venta.
              </Typography>
            )}
          </Box>

          {mode === 'CREDIT_BALANCE' && (
            <Alert severity='success'>
              Saldo a favor disponible: <strong>{formatCOP(maxAmount)}</strong>
            </Alert>
          )}

          {mode === 'SALE_REVERSAL' && (
            <>
              <TextField
                select
                label='Motivo'
                value={reason}
                onChange={(e) => setReason(e.target.value as RefundReason)}
                fullWidth
                required
              >
                {REVERSAL_REASONS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {REFUND_REASON_LABELS[value]}
                  </MenuItem>
                ))}
              </TextField>

              <Box>
                <TextField
                  label='Valor de la venta que se anula (COP)'
                  value={reversed}
                  onChange={(e) =>
                    setReversed(formatCurrencyInput(e.target.value))
                  }
                  fullWidth
                  required
                  placeholder='0'
                  helperText={`Cuánto trabajo se anula, no cuánta plata sale. La orden vale hoy ${formatCOP(pendingSaleValue)}${
                    currentBalance > 0
                      ? ` y el cliente aún debe ${formatCOP(currentBalance)}`
                      : ''
                  }.`}
                />
                <Button
                  size='small'
                  sx={{ mt: 0.5 }}
                  onClick={() =>
                    setReversed(formatCurrencyInput(pendingSaleValue))
                  }
                >
                  Anular la venta completa
                </Button>
              </Box>

              {isTotalReversal && (
                <Alert severity='warning'>
                  Se anula la venta completa: al pagarse, la orden quedará en
                  estado <strong>Devolución de dinero</strong> y no admitirá más
                  cambios.
                </Alert>
              )}
            </>
          )}

          <Divider />

          <TextField
            label='Dinero a devolver al cliente (COP)'
            value={amount}
            onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
            fullWidth
            required
            placeholder='0'
            disabled={availableToRefund <= 0}
            helperText={
              mode === 'SALE_REVERSAL'
                ? `Máximo ${formatCOP(availableToRefund)} — es lo que le sobra al cliente después de anular esa parte de la venta`
                : `Máximo: ${formatCOP(availableToRefund)}`
            }
          />

          {mode === 'SALE_REVERSAL' &&
            reversedAmount > 0 &&
            availableToRefund === 0 && (
              <Alert severity='warning'>
                Anular {formatCOP(reversedAmount)} no libera dinero: el cliente
                no ha abonado más de lo que quedaría debiendo, así que la
                anulación solo salda la deuda.{' '}
                {reversalNeededToFreeCash !== null ? (
                  <>
                    Para que sobre plata hay que anular más de{' '}
                    <strong>{formatCOP(reversalNeededToFreeCash)}</strong>; con
                    la venta completa se le devolverían{' '}
                    <strong>
                      {formatCOP(
                        Math.min(pendingSaleValue - currentBalance, paidAmount),
                      )}
                    </strong>
                    .
                  </>
                ) : (
                  <>
                    Ni anulando la venta completa quedaría dinero por devolver:
                    esta orden no necesita una devolución.
                  </>
                )}
              </Alert>
            )}

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
            <>
              <BankSelector value={bankEntity} onChange={setBankEntity} />

              {/* Comprobante de la transferencia.
                  En efectivo el soporte es el recibo de caja que genera la
                  ejecución; una transferencia no deja rastro en el sistema. */}
              <Box>
                <Typography variant='body2' fontWeight={500} sx={{ mb: 1 }}>
                  Comprobante de la transferencia{' '}
                  <Typography component='span' variant='caption' color='text.secondary'>
                    (opcional)
                  </Typography>
                </Typography>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/jpeg,image/png,image/gif,image/webp,application/pdf'
                  hidden
                  onChange={(e) =>
                    handleFileChange(e.target.files?.[0] ?? null)
                  }
                />
                {!receiptFile ? (
                  <Stack spacing={1}>
                    <Button
                      variant='outlined'
                      startIcon={<AttachFileIcon />}
                      size='small'
                      onClick={() => fileInputRef.current?.click()}
                      sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                    >
                      Adjuntar imagen o PDF
                    </Button>
                    <Box
                      onPaste={handlePaste}
                      tabIndex={0}
                      sx={{
                        border: '2px dashed',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'pointer',
                        outline: 'none',
                        '&:hover, &:focus': {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      <ImageIcon
                        sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }}
                      />
                      <Typography variant='caption' color='text.secondary'>
                        O pega una imagen aquí (Ctrl+V / ⌘+V)
                      </Typography>
                    </Box>
                  </Stack>
                ) : (
                  <Stack spacing={1}>
                    {receiptIsImage && (
                      <Box
                        sx={{
                          width: 'fit-content',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          component='img'
                          src={URL.createObjectURL(receiptFile)}
                          alt='Vista previa del comprobante'
                          sx={{
                            display: 'block',
                            maxWidth: 200,
                            maxHeight: 140,
                            objectFit: 'contain',
                          }}
                          onLoad={(e) =>
                            URL.revokeObjectURL(
                              (e.target as HTMLImageElement).src,
                            )
                          }
                        />
                      </Box>
                    )}
                    <Stack direction='row' alignItems='center' spacing={1}>
                      <Chip
                        icon={<ImageIcon />}
                        label={`${receiptFile.name} (${(receiptFile.size / 1024).toFixed(1)} KB)`}
                        color='primary'
                        variant='outlined'
                        size='small'
                        onDelete={() => handleFileChange(null)}
                        deleteIcon={<CloseIcon />}
                      />
                      <Button
                        size='small'
                        variant='text'
                        startIcon={<AttachFileIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        sx={{ textTransform: 'none' }}
                      >
                        Cambiar
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Box>
            </>
          )}

          <TextField
            label='Observación / Motivo'
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
            placeholder={
              mode === 'SALE_REVERSAL'
                ? 'Ej: El UV salió con mala resolución y el cliente no lo recibió'
                : 'Ej: Cliente pagó de más al liquidar la orden'
            }
            helperText='Mínimo 5 caracteres — quedará registrado en el historial'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetAndClose} disabled={loading}>
          Cancelar
        </Button>
        {/* El envío tiene dos fases (subir comprobante y crear la solicitud) y
            el texto las distingue, así que el spinner va en la ranura del ícono
            para no taparlo: sin `startIcon` el label queda transparente. */}
        <LoadingButton
          onClick={handleSubmit}
          variant='contained'
          color='warning'
          loading={loading}
          startIcon={<SendIcon />}
          disabled={
            !amount ||
            !observation.trim() ||
            // Sin dinero liberado la solicitud solo puede terminar en el
            // rechazo del backend; mejor no dejar enviarla.
            availableToRefund <= 0
          }
        >
          {uploadingReceipt
            ? 'Subiendo comprobante...'
            : loading
              ? 'Enviando...'
              : 'Enviar solicitud'}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
