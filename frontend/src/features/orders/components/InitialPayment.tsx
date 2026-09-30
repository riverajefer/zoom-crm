import React, { useRef, useState, useEffect } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Collapse,
  Divider,
  MenuItem,
  FormLabel,
  Stack,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress,
} from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  Image as ImageIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import axiosInstance from '../../../api/axios';
import { useIsCashOpen } from '../../cash-register/hooks/useCashRegister';
import { storageApi } from '../../../api/storage.api';
import type {
  InitialPaymentData,
  PaymentMethod,
} from '../../../types/order.types';
import { PAYMENT_METHOD_LABELS } from '../../../types/order.types';
import { requiresZeroAmount } from '../../../utils/paymentMethods';
import { BankSelector } from '../../../components/common/BankSelector';

const MAX_PAYMENTS = 3;

interface InitialPaymentProps {
  total: number;
  enabled: boolean;
  values: InitialPaymentData[];
  onEnabledChange: (value: boolean) => void;
  onChange: (data: InitialPaymentData[]) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  required?: boolean;
  creditBalance?: number;
  /**
   * El cliente está vinculado a una ficha de nómina. Solo entonces se ofrece
   * "Descuento por nómina": para el resto de los clientes no hay quincena de
   * dónde restar y la opción sería una promesa que el backend rechaza.
   */
  clientIsEmployee?: boolean;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCurrencyInput = (value: string | number): string => {
  const numericValue = value.toString().replace(/\D/g, '');
  if (!numericValue) return '';
  const number = parseInt(numericValue, 10);
  return new Intl.NumberFormat('es-CO').format(number);
};

const EMPTY_PAYMENT = (): InitialPaymentData => ({
  amount: 0,
  paymentMethod: 'TRANSFER',
  reference: '',
  notes: '',
  bankEntity: null,
  receiptFile: null,
});

export const InitialPayment: React.FC<InitialPaymentProps> = ({
  total,
  enabled,
  values = [],
  onChange,
  disabled = false,
  required = false,
  creditBalance,
  clientIsEmployee = false,
}) => {
  // Estado de la caja: define si el abono entra directo al arqueo o a la cola.
  const { data: isCashOpen } = useIsCashOpen();

  // One ref per possible payment block (max 3)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedMimeTypes, setSignedMimeTypes] = useState<Record<string, string>>({});
  const [viewReceipt, setViewReceipt] = useState<{ open: boolean; url: string; mimeType: string }>({
    open: false, url: '', mimeType: '',
  });

  // Si el asesor cambia a un cliente que no es empleado, el descuento por
  // nómina deja de tener sentido: no hay quincena de dónde restar. Sin este
  // reseteo el método se queda pegado del cliente anterior —el select lo sigue
  // mostrando para no quedar en blanco— y el asesor solo se entera al guardar,
  // cuando el backend le responde que ese cliente no está vinculado a nómina.
  useEffect(() => {
    if (clientIsEmployee) return;
    if (!values.some((p) => p.paymentMethod === 'PAYROLL_DEDUCTION')) return;

    onChange(
      values.map((p) =>
        p.paymentMethod === 'PAYROLL_DEDUCTION'
          ? { ...p, paymentMethod: 'CASH' as PaymentMethod, amount: 0 }
          : p,
      ),
    );
  }, [clientIsEmployee, values]);

  useEffect(() => {
    const fileIds = values
      .map((p) => p.existingReceiptFileId)
      .filter((id): id is string => !!id && !signedUrls[id]);
    if (fileIds.length === 0) return;
    Promise.all(
      fileIds.map(async (fileId) => {
        const [urlRes, fileData] = await Promise.all([
          axiosInstance.get(`/storage/${fileId}/url`),
          storageApi.getFile(fileId),
        ]);
        return { fileId, url: urlRes.data.url as string, mimeType: fileData.mimeType };
      }),
    ).then((results) => {
      setSignedUrls((prev) => ({ ...prev, ...Object.fromEntries(results.map((r) => [r.fileId, r.url])) }));
      setSignedMimeTypes((prev) => ({ ...prev, ...Object.fromEntries(results.map((r) => [r.fileId, r.mimeType])) }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const handleFieldChange = (
    index: number,
    field: keyof InitialPaymentData,
    newValue: any,
  ) => {
    const updated = values.map((p, i) => {
      if (i !== index) return p;
      const updatedPayment = { ...p, [field]: newValue };
      // Ni el crédito ni el descuento por nómina registran dinero al crear la
      // OP: el valor del trabajo queda como saldo pendiente. Dejar que
      // conserven un monto hacía que la orden naciera pagada y que el abono real
      // se duplicara.
      if (field === 'paymentMethod' && requiresZeroAmount(newValue)) {
        updatedPayment.amount = 0;
      }
      // Limpiar banco de origen si deja de ser transferencia
      if (field === 'paymentMethod' && newValue !== 'TRANSFER') {
        updatedPayment.bankEntity = null;
      }
      return updatedPayment;
    });
    onChange(updated);
  };

  const handleAddPayment = () => {
    if (values.length >= MAX_PAYMENTS || disabled) return;
    onChange([...values, EMPTY_PAYMENT()]);
  };

  const handleRemovePayment = (index: number) => {
    if (values.length <= 1) return;
    onChange(values.filter((_, i) => i !== index));
  };

  // Computed values
  const totalPaid = values.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = total - totalPaid;
  const cashUsedIndices = values
    .map((p, i) => (p.paymentMethod === 'CASH' ? i : -1))
    .filter((i) => i !== -1);
  const cashAlreadyUsed = cashUsedIndices.length > 0;

  const isMethodDisabled = (index: number, method: PaymentMethod): boolean => {
    if (method !== 'CASH') return false;
    // CASH is disabled if another block already uses it
    return cashAlreadyUsed && !cashUsedIndices.includes(index);
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
          Abono Inicial
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {/* Alerta: todo anticipo requiere autorización de Caja, sin importar el
            rol. El descuento por nómina es la excepción: no entra dinero a caja
            en ningún momento, así que quien lo autoriza es nómina. Decirle al
            asesor que espere a Caja lo dejaría esperando una aprobación que
            nunca va a llegar. */}
        {enabled && !values.every((p) => p.paymentMethod === 'PAYROLL_DEDUCTION') && (
          <Alert severity="info" sx={{ mb: 2 }}>
            El anticipo debe ser aprobado por Caja antes de que la orden pueda avanzar de estado.
          </Alert>
        )}

        {enabled && values.some((p) => p.paymentMethod === 'PAYROLL_DEDUCTION') && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>El descuento lo aprueba Nómina, no Caja</AlertTitle>
            No entra dinero a la caja: el valor se le resta al empleado de su
            quincena. La orden queda con saldo pendiente hasta que Nómina aplique
            el descuento.
          </Alert>
        )}

        {/* Con la caja cerrada el abono se registra igual, pero no entra al
            arqueo hasta que alguien abra caja. Sin este aviso el usuario lo
            reporta como "cargué el pago y no aparece en caja", que es
            exactamente el problema que originó la cola. */}
        {enabled && isCashOpen?.isOpen === false && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>La caja está cerrada en este momento</AlertTitle>
            El abono se registra igual y queda en espera. Entrará al arqueo
            automáticamente cuando se abra la próxima caja.
          </Alert>
        )}

        <Collapse in={enabled || required}>
          <Stack spacing={2}>
            {values.map((payment, index) => (
              <Box
                key={index}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                  position: 'relative',
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(0,0,0,0.01)',
                }}
              >
                {/* Block header */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                    Anticipo {index + 1}
                  </Typography>
                  {values.length > 1 && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemovePayment(index)}
                      disabled={disabled}
                      title="Eliminar anticipo"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>

                <Grid container spacing={2}>
                  {/* Método de Pago */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      fullWidth
                      label="Método de Pago"
                      value={payment.paymentMethod || 'CASH'}
                      onChange={(e) =>
                        handleFieldChange(index, 'paymentMethod', e.target.value as PaymentMethod)
                      }
                      disabled={disabled}
                    >
                      {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(
                        ([method, label]) => {
                          if (method === 'CREDIT_BALANCE' && payment.paymentMethod !== 'CREDIT_BALANCE') {
                            return null;
                          }
                          // Solo para clientes con ficha de nómina. Se sigue
                          // mostrando si ya está elegido, para no dejar el
                          // select en blanco al editar una OP existente.
                          if (
                            method === 'PAYROLL_DEDUCTION' &&
                            !clientIsEmployee &&
                            payment.paymentMethod !== 'PAYROLL_DEDUCTION'
                          ) {
                            return null;
                          }
                          const displayLabel = method === 'CREDIT_BALANCE' ? `${label} (${formatCurrency(creditBalance || 0)})` : label;
                          return (
                            <MenuItem
                              key={method}
                              value={method}
                              disabled={isMethodDisabled(index, method)}
                            >
                              {displayLabel}
                              {isMethodDisabled(index, method) ? ' (ya usado)' : ''}
                            </MenuItem>
                          );
                        },
                      )}
                    </TextField>
                  </Grid>

                  {/* Monto */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      required={!requiresZeroAmount(payment.paymentMethod)}
                      label="Monto del Abono"
                      value={
                        (payment.amount === 0 && !requiresZeroAmount(payment.paymentMethod))
                          ? ''
                          : payment.amount !== undefined && payment.amount !== null
                          ? formatCurrencyInput(payment.amount)
                          : ''
                      }
                      onChange={(e) => {
                        const rawValue = e.target.value.replace(/\D/g, '');
                        const amount = rawValue ? parseInt(rawValue, 10) : 0;
                        handleFieldChange(index, 'amount', amount);
                      }}
                      color={totalPaid > total ? 'warning' : 'primary'}
                      // Sin monto, un abono que mueve dinero no es válido y el
                      // formulario no deja crear la orden: se dice aquí por qué.
                      error={!disabled && !requiresZeroAmount(payment.paymentMethod) && !payment.amount}
                      helperText={
                        !disabled && !requiresZeroAmount(payment.paymentMethod) && !payment.amount
                          ? 'Ingresa el monto del abono, o elige «Crédito» si el cliente no deja anticipo'
                          : payment.paymentMethod === 'PAYROLL_DEDUCTION'
                          ? `Se le descontarán ${formatCurrency(total)} de la nómina cuando se apruebe. La orden queda con saldo pendiente hasta entonces.`
                          : payment.paymentMethod === 'CREDIT'
                          ? `El crédito no registra dinero: quedan ${formatCurrency(total)} como saldo pendiente por cobrar`
                          : totalPaid > total
                          ? `Quedará un saldo a favor al cliente de ${formatCurrency(totalPaid - total)}`
                          : disabled
                          ? 'Primero seleccione un cliente'
                          : `Total de la orden: ${formatCurrency(total)}`
                      }
                      FormHelperTextProps={{
                        sx: {
                          color: totalPaid > total ? 'warning.main' : 'text.secondary',
                          fontWeight: totalPaid > total ? 600 : 400
                        }
                      }}
                      disabled={disabled || requiresZeroAmount(payment.paymentMethod)}
                      InputProps={{
                        startAdornment: (
                          <Typography sx={{ mr: 1, color: 'text.secondary', fontWeight: 500 }}>
                            $
                          </Typography>
                        ),
                      }}
                      inputProps={{
                        style: { textAlign: 'right', fontWeight: 600 },
                      }}
                    />
                  </Grid>

                  {/* Banco de origen (solo transferencias) */}
                  {payment.paymentMethod === 'TRANSFER' && (
                    <Grid item xs={12} sm={6}>
                      <BankSelector
                        value={payment.bankEntity ?? null}
                        onChange={(val) => handleFieldChange(index, 'bankEntity', val)}
                        disabled={disabled}
                      />
                    </Grid>
                  )}

                  {/* Notas */}
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Notas del Pago"
                      placeholder="Ej: Anticipo"
                      value={payment.notes || ''}
                      onChange={(e) => handleFieldChange(index, 'notes', e.target.value)}
                      disabled={disabled}
                    />
                  </Grid>

                  {/* Comprobante */}
                  <Grid item xs={12}>
                    <Box>
                      <FormLabel sx={{ mb: 1, display: 'block' }}>
                        Comprobante de Pago (Opcional)
                      </FormLabel>
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/gif,image/webp,.pdf"
                        ref={(el) => { fileInputRefs.current[index] = el; }}
                        disabled={disabled}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFieldChange(index, 'receiptFile', file);
                          if (e.target) e.target.value = '';
                        }}
                      />

                      {/* Existing receipt from server (edit mode) */}
                      {payment.existingReceiptFileId && !payment.receiptFile && (
                        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                          {signedUrls[payment.existingReceiptFileId] ? (
                            signedMimeTypes[payment.existingReceiptFileId]?.startsWith('image/') ? (
                              <Box
                                component="img"
                                src={signedUrls[payment.existingReceiptFileId]}
                                alt="Comprobante"
                                onClick={() => setViewReceipt({
                                  open: true,
                                  url: signedUrls[payment.existingReceiptFileId!],
                                  mimeType: signedMimeTypes[payment.existingReceiptFileId!],
                                })}
                                sx={{
                                  width: 80,
                                  height: 80,
                                  objectFit: 'cover',
                                  borderRadius: 1,
                                  border: '1px solid',
                                  borderColor: 'grey.300',
                                  cursor: 'pointer',
                                  '&:hover': { opacity: 0.85 },
                                }}
                              />
                            ) : (
                              <Chip
                                icon={<AttachFileIcon />}
                                label="Comprobante adjunto"
                                variant="outlined"
                                color="info"
                                size="small"
                                onClick={() => setViewReceipt({
                                  open: true,
                                  url: signedUrls[payment.existingReceiptFileId!],
                                  mimeType: signedMimeTypes[payment.existingReceiptFileId!],
                                })}
                              />
                            )
                          ) : (
                            <CircularProgress size={20} />
                          )}
                          <IconButton
                            size="small"
                            color="info"
                            title="Ver comprobante"
                            disabled={!signedUrls[payment.existingReceiptFileId]}
                            onClick={() => setViewReceipt({
                              open: true,
                              url: signedUrls[payment.existingReceiptFileId!],
                              mimeType: signedMimeTypes[payment.existingReceiptFileId!],
                            })}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AttachFileIcon />}
                            disabled={disabled}
                            onClick={() => fileInputRefs.current[index]?.click()}
                            sx={{ textTransform: 'none' }}
                          >
                            Reemplazar
                          </Button>
                        </Stack>
                      )}

                      {payment.existingReceiptFileId && !payment.receiptFile && (
                        <Box
                          onPaste={(e) => {
                            if (disabled) return;
                            const items = e.clipboardData.items;
                            for (let i = 0; i < items.length; i++) {
                              if (items[i].type.indexOf('image') !== -1) {
                                const file = items[i].getAsFile();
                                if (file) handleFieldChange(index, 'receiptFile', file);
                                break;
                              }
                            }
                          }}
                          tabIndex={disabled ? -1 : 0}
                          sx={{
                            border: '2px dashed',
                            borderColor: 'grey.300',
                            borderRadius: 1,
                            p: 1.5,
                            textAlign: 'center',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.6 : 1,
                            transition: 'border-color 0.2s, background-color 0.2s',
                            '&:hover, &:focus': !disabled
                              ? { borderColor: 'primary.main', bgcolor: 'action.hover' }
                              : {},
                          }}
                          onClick={() => { if (!disabled) fileInputRefs.current[index]?.click(); }}
                        >
                          <Typography variant="caption" color="text.secondary" display="block">
                            O pega una imagen aquí para reemplazar (Ctrl+V / ⌘+V)
                          </Typography>
                        </Box>
                      )}

                      {!payment.receiptFile && !payment.existingReceiptFileId ? (
                        <Stack spacing={1}>
                          <Button
                            variant="outlined"
                            startIcon={<AttachFileIcon />}
                            size="small"
                            disabled={disabled}
                            onClick={() => fileInputRefs.current[index]?.click()}
                            sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                          >
                            Adjuntar imagen o PDF
                          </Button>
                          <Box
                            onPaste={(e) => {
                              if (disabled) return;
                              const items = e.clipboardData.items;
                              for (let i = 0; i < items.length; i++) {
                                if (items[i].type.indexOf('image') !== -1) {
                                  const file = items[i].getAsFile();
                                  if (file) handleFieldChange(index, 'receiptFile', file);
                                  break;
                                }
                              }
                            }}
                            tabIndex={disabled ? -1 : 0}
                            sx={{
                              border: '2px dashed',
                              borderColor: 'grey.300',
                              borderRadius: 1,
                              p: 2,
                              textAlign: 'center',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              opacity: disabled ? 0.6 : 1,
                              transition: 'border-color 0.2s, background-color 0.2s',
                              '&:hover, &:focus': !disabled
                                ? { borderColor: 'primary.main', bgcolor: 'action.hover' }
                                : {},
                            }}
                            onClick={() => {
                              if (!disabled) fileInputRefs.current[index]?.click();
                            }}
                          >
                            <ImageIcon sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }} />
                            <Typography variant="caption" color="text.secondary" display="block">
                              O pega una imagen aquí (Ctrl+V / ⌘+V)
                            </Typography>
                          </Box>
                        </Stack>
                      ) : null}

                      {payment.receiptFile && (
                        <Stack spacing={1.5} direction="row" alignItems="center">
                          {payment.receiptFile.type.startsWith('image/') ? (
                            <Box
                              sx={{
                                position: 'relative',
                                width: 80,
                                height: 80,
                                border: '1px solid',
                                borderColor: 'grey.300',
                                borderRadius: 1,
                                overflow: 'hidden',
                                bgcolor: 'grey.50',
                              }}
                            >
                              <Box
                                component="img"
                                src={URL.createObjectURL(payment.receiptFile)}
                                alt="Vista previa"
                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </Box>
                          ) : (
                            <Chip
                              icon={<AttachFileIcon />}
                              label={payment.receiptFile.name}
                              variant="outlined"
                            />
                          )}
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleFieldChange(index, 'receiptFile', null)}
                            disabled={disabled}
                          >
                            <CloseIcon />
                          </IconButton>
                        </Stack>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            ))}

            {/* Botón agregar anticipo */}
            {values.length < MAX_PAYMENTS && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddPayment}
                disabled={disabled}
                size="verySmall"
                sx={{ alignSelf: 'flex-end', textTransform: 'none' }}
              >
                Agregar otro anticipo
              </Button>
            )}

            {/* Resumen de totales */}
            <Box
              sx={{
                mt: 1,
                p: 2,
                borderRadius: 2,
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(0, 0, 0, 0.02)',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Total abonado
                  </Typography>
                  <Typography variant="h6" fontWeight={700} color="primary.main">
                    {formatCurrency(totalPaid)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Saldo Pendiente
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      color: balance > 0 ? 'warning.main' : 'success.main',
                    }}
                  >
                    {formatCurrency(Math.max(0, balance))}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Collapse>
      </CardContent>

      {/* Viewer de comprobante existente */}
      <Dialog
        open={viewReceipt.open}
        onClose={() => setViewReceipt({ open: false, url: '', mimeType: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Comprobante de Pago
          <IconButton size="small" onClick={() => setViewReceipt({ open: false, url: '', mimeType: '' })}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'grey.100', borderRadius: 1, p: 2, minHeight: 300 }}>
            {viewReceipt.mimeType.startsWith('image/') ? (
              <Box
                component="img"
                src={viewReceipt.url}
                alt="Comprobante"
                sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            ) : viewReceipt.mimeType === 'application/pdf' ? (
              <iframe
                src={viewReceipt.url}
                title="Comprobante PDF"
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            ) : null}
          </Box>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
