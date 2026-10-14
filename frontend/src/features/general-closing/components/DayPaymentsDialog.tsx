import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrorred';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { storageApi } from '../../../api';
import { PATHS } from '../../../router/paths';
import { PAYMENT_METHOD_LABELS } from '../../../types/order.types';
import {
  PAYMENT_ACCOUNTING_STATUS_COLORS,
  PAYMENT_ACCOUNTING_STATUS_LABELS,
  type PaymentAccountingStatus,
  type PaymentVerification,
} from '../../../types/payment-verification.types';
import type { RegisterDayRow } from '../../../types/general-closing.types';
import { ObservePaymentDialog } from '../../payment-verifications/components/ObservePaymentDialog';
import { ReceiptPreviewDialog } from '../../payment-verifications/components/ReceiptPreviewDialog';
import {
  usePaymentVerificationActions,
  usePaymentVerifications,
} from '../../payment-verifications/hooks/usePaymentVerifications';
import { GENERAL_CLOSING_KEY } from '../hooks/useGeneralClosing';
import { formatCurrency, formatTime, fullName } from '../utils';

const STATUSES: PaymentAccountingStatus[] = ['PENDING', 'OBSERVED', 'VERIFIED'];

const errorMessage = (error: unknown, fallback: string) =>
  (error as { message?: string })?.message || fallback;

interface Props {
  row: RegisterDayRow | null;
  date: string;
  onClose: () => void;
}

/**
 * Los pagos de un día en una sede, para que contabilidad los verifique sin
 * salir del cierre general. Usa la misma API y las mismas reglas que la página
 * de verificación de pagos.
 */
export const DayPaymentsDialog: React.FC<Props> = ({ row, date, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PaymentAccountingStatus>('PENDING');
  const [observing, setObserving] = useState<PaymentVerification | null>(null);
  const [receipt, setReceipt] = useState({ open: false, url: '', mimeType: '' });

  // Al abrir, la pestaña con trabajo: pendientes si hay, si no los verificados.
  useEffect(() => {
    if (row) setStatus(row.payments.pending > 0 ? 'PENDING' : 'VERIFIED');
  }, [row]);

  const locationId = row?.cashRegister.location.id;
  const paymentsQuery = usePaymentVerifications(
    { status, locationId, dateFrom: date, dateTo: date, page: 1, limit: 100 },
    !!row,
  );
  const { verifyMutation, observeMutation } = usePaymentVerificationActions();
  const payments = paymentsQuery.data?.data ?? [];
  const busy = verifyMutation.isPending || observeMutation.isPending;

  // El cierre general muestra los conteos y bloquea con los pendientes.
  const refreshClosing = () => queryClient.invalidateQueries({ queryKey: GENERAL_CLOSING_KEY });

  const verify = async (paymentIds: string[]) => {
    try {
      const result = await verifyMutation.mutateAsync({ paymentIds });
      refreshClosing();
      enqueueSnackbar(
        result.verified === 1 ? 'Pago verificado' : `${result.verified} pagos verificados`,
        { variant: 'success' },
      );
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo verificar'), { variant: 'error' });
    }
  };

  const observe = async (notes: string) => {
    if (!observing) return;
    try {
      await observeMutation.mutateAsync({ paymentId: observing.id, notes });
      refreshClosing();
      enqueueSnackbar('Pago observado. La sede ya recibió el aviso.', { variant: 'warning' });
      setObserving(null);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo observar el pago'), { variant: 'error' });
    }
  };

  const viewReceipt = async (fileId: string) => {
    try {
      const [urlResponse, file] = await Promise.all([
        storageApi.getFileUrl(fileId),
        storageApi.getFile(fileId),
      ]);
      setReceipt({ open: true, url: urlResponse.url, mimeType: file.mimeType ?? '' });
    } catch {
      enqueueSnackbar('Error al ver el comprobante', { variant: 'error' });
    }
  };

  const counts: Record<PaymentAccountingStatus, number> = {
    PENDING: row?.payments.pending ?? 0,
    OBSERVED: row?.payments.observed ?? 0,
    VERIFIED: row?.payments.verified ?? 0,
  };

  return (
    <>
      <Dialog open={!!row} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
        <DialogTitle>Pagos del día · {row?.cashRegister.location.name}</DialogTitle>
        <DialogContent>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 2 }}
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              value={status}
              onChange={(_, next: PaymentAccountingStatus | null) => next && setStatus(next)}
            >
              {STATUSES.map((s) => (
                <ToggleButton key={s} value={s}>
                  {PAYMENT_ACCOUNTING_STATUS_LABELS[s]} ({counts[s]})
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {status === 'PENDING' && payments.length > 1 && (
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={busy}
                onClick={() => verify(payments.map((p) => p.id))}
              >
                Verificar los {payments.length}
              </Button>
            )}
          </Stack>

          {paymentsQuery.isFetching && <LinearProgress sx={{ mb: 1 }} />}
          {!paymentsQuery.isFetching && payments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              No hay pagos en este estado.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Hora</TableCell>
                  <TableCell>Orden</TableCell>
                  <TableCell>Método</TableCell>
                  <TableCell align="right">Monto</TableCell>
                  <TableCell>Recibió</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTime(payment.paymentDate)}</TableCell>
                    <TableCell>
                      <Link component={RouterLink} to={PATHS.ORDERS_DETAIL.replace(':id', payment.order.id)} target="_blank">
                        {payment.order.orderNumber}
                      </Link>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {payment.order.client.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                      {(payment.bankEntity || payment.reference) && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {[payment.bankEntity, payment.reference].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      {fullName(payment.receivedBy)}
                      {payment.accountingStatus !== 'PENDING' && (
                        <Box>
                          <Chip
                            size="small"
                            sx={{ mt: 0.5 }}
                            color={PAYMENT_ACCOUNTING_STATUS_COLORS[payment.accountingStatus]}
                            label={PAYMENT_ACCOUNTING_STATUS_LABELS[payment.accountingStatus]}
                          />
                          {payment.accountingNotes && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {payment.accountingNotes}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title={payment.receiptFileId ? 'Ver comprobante' : 'Sin comprobante'}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={!payment.receiptFileId}
                              onClick={() => viewReceipt(payment.receiptFileId!)}
                              aria-label="Ver comprobante"
                            >
                              <ReceiptLongIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {payment.accountingStatus !== 'OBSERVED' && (
                          <Tooltip title="Observar">
                            <span>
                              <IconButton
                                size="small"
                                color="warning"
                                disabled={busy}
                                onClick={() => setObserving(payment)}
                                aria-label="Observar pago"
                              >
                                <ReportGmailerrorredIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {payment.accountingStatus !== 'VERIFIED' && (
                          <Tooltip title="Verificar">
                            <span>
                              <IconButton
                                size="small"
                                color="success"
                                disabled={busy}
                                onClick={() => verify([payment.id])}
                                aria-label="Verificar pago"
                              >
                                <CheckCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
      <ObservePaymentDialog
        payment={observing}
        loading={observeMutation.isPending}
        onClose={() => setObserving(null)}
        onConfirm={observe}
      />
      <ReceiptPreviewDialog
        open={receipt.open}
        url={receipt.url}
        mimeType={receipt.mimeType}
        onClose={() => setReceipt({ open: false, url: '', mimeType: '' })}
      />
    </>
  );
};
