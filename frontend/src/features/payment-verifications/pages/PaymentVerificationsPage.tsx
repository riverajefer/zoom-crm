import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrorred';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { storageApi, usersApi } from '../../../api';
import { PageHeader } from '../../../components/common/PageHeader';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../../../types/order.types';
import type {
  FilterPaymentVerificationsDto,
  PaymentAccountingStatus,
  PaymentVerification,
} from '../../../types/payment-verification.types';
import { useActiveSedes } from '../../sedes/hooks/useSedes';
import { ObservePaymentDialog } from '../components/ObservePaymentDialog';
import { PaymentReviewHistoryDialog } from '../components/PaymentReviewHistoryDialog';
import { ReceiptPreviewDialog } from '../components/ReceiptPreviewDialog';
import {
  usePaymentVerificationActions,
  usePaymentVerificationSummary,
  usePaymentVerifications,
} from '../hooks/usePaymentVerifications';
import { formatCurrency, formatDateTime, fullName } from '../utils';

const TABS: { status: PaymentAccountingStatus; label: string }[] = [
  { status: 'PENDING', label: 'Pendientes' },
  { status: 'OBSERVED', label: 'Observados' },
  { status: 'VERIFIED', label: 'Verificados' },
];

// El saldo a favor no entra a la bandeja: no es dinero nuevo.
const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).filter(
  (method) => method !== 'CREDIT_BALANCE',
);

const errorMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  return message || fallback;
};

/**
 * Bandeja de contabilidad: segunda revisión de los pagos que cada sede registra
 * y aprueba en su caja. Verificar u observar no mueve dinero ni frena la OP.
 * Quien ve todas las sedes recibe los pagos de todas, esté en la que esté.
 */
const PaymentVerificationsPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [filters, setFilters] = useState<FilterPaymentVerificationsDto>({
    status: 'PENDING',
    page: 1,
    limit: 25,
  });
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [observing, setObserving] = useState<PaymentVerification | null>(null);
  const [historyOf, setHistoryOf] = useState<PaymentVerification | null>(null);
  const [receipt, setReceipt] = useState({ open: false, url: '', mimeType: '' });

  const paymentsQuery = usePaymentVerifications(filters);
  const summaryQuery = usePaymentVerificationSummary();
  const { verifyMutation, observeMutation } = usePaymentVerificationActions();
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => usersApi.getAll() });
  // La Matriz no tiene OP: solo se filtra por los locales.
  const sedesQuery = useActiveSedes();
  const stores = (sedesQuery.data ?? []).filter((sede) => sede.type === 'STORE');

  const payments = useMemo(() => paymentsQuery.data?.data ?? [], [paymentsQuery.data]);
  const meta = paymentsQuery.data?.meta;
  const isVerifiedTab = filters.status === 'VERIFIED';

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) =>
        (f.search ?? '') === searchInput.trim()
          ? f
          : { ...f, search: searchInput.trim() || undefined, page: 1 },
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // La selección solo vale para lo que se está viendo.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => payments.some((p) => p.id === id)));
  }, [payments]);

  const updateFilters = (patch: Partial<FilterPaymentVerificationsDto>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const allSelected = payments.length > 0 && selected.length === payments.length;
  const selectedAmount = payments
    .filter((p) => selected.includes(p.id))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleVerify = async (paymentIds: string[]) => {
    try {
      const result = await verifyMutation.mutateAsync({ paymentIds });
      enqueueSnackbar(
        result.verified === 1 ? 'Pago verificado' : `${result.verified} pagos verificados`,
        { variant: 'success' },
      );
      setSelected([]);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo verificar'), { variant: 'error' });
    }
  };

  const handleObserve = async (notes: string) => {
    if (!observing) return;
    try {
      await observeMutation.mutateAsync({ paymentId: observing.id, notes });
      enqueueSnackbar('Pago observado. La sede ya recibió el aviso.', { variant: 'warning' });
      setObserving(null);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo observar el pago'), { variant: 'error' });
    }
  };

  const handleViewReceipt = async (receiptFileId: string) => {
    try {
      const [urlResponse, fileData] = await Promise.all([
        storageApi.getFileUrl(receiptFileId),
        storageApi.getFile(receiptFileId),
      ]);
      setReceipt({ open: true, url: urlResponse.url, mimeType: fileData.mimeType ?? '' });
    } catch {
      enqueueSnackbar('Error al ver el comprobante', { variant: 'error' });
    }
  };

  const busy = verifyMutation.isPending || observeMutation.isPending;

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Verificación de Pagos"
        subtitle="Revisión de contabilidad sobre los pagos que cada sede ya aprobó en su caja"
      />

      <Tabs
        value={filters.status}
        onChange={(_, status: PaymentAccountingStatus) => updateFilters({ status })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {TABS.map((tab) => {
          const count = summaryQuery.data?.[tab.status]?.count;
          return (
            <Tab
              key={tab.status}
              value={tab.status}
              label={count === undefined ? tab.label : `${tab.label} (${count})`}
            />
          );
        })}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Buscar"
          placeholder="OP, cliente o referencia"
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <TextField
          label="Desde"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={filters.dateFrom ?? ''}
          onChange={(e) => updateFilters({ dateFrom: e.target.value || undefined })}
        />
        <TextField
          label="Hasta"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={filters.dateTo ?? ''}
          onChange={(e) => updateFilters({ dateTo: e.target.value || undefined })}
        />
        <FormControl sx={{ minWidth: 150 }} size="small">
          <InputLabel>Sede</InputLabel>
          <Select
            label="Sede"
            value={filters.locationId ?? ''}
            onChange={(e) => updateFilters({ locationId: e.target.value || undefined })}
          >
            <MenuItem value="">Todas</MenuItem>
            {stores.map((sede) => (
              <MenuItem key={sede.id} value={sede.id}>
                {sede.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 170 }} size="small">
          <InputLabel>Método</InputLabel>
          <Select
            label="Método"
            value={filters.paymentMethod ?? ''}
            onChange={(e) =>
              updateFilters({ paymentMethod: (e.target.value as PaymentMethod) || undefined })
            }
          >
            <MenuItem value="">Todos</MenuItem>
            {METHOD_OPTIONS.map((method) => (
              <MenuItem key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Recibido por</InputLabel>
          <Select
            label="Recibido por"
            value={filters.receivedById ?? ''}
            onChange={(e) => updateFilters({ receivedById: e.target.value || undefined })}
          >
            <MenuItem value="">Todos</MenuItem>
            {(usersQuery.data ?? []).map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {fullName(user as { firstName: string | null; lastName: string | null })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {paymentsQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage(paymentsQuery.error, 'No se pudieron cargar los pagos')}
        </Alert>
      )}

      <Paper variant="outlined">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {selected.length > 0
              ? `${selected.length} seleccionado(s) · ${formatCurrency(selectedAmount)}`
              : meta
                ? `${meta.total} pago(s) · ${formatCurrency(meta.totalAmount)}`
                : ' '}
          </Typography>
          {!isVerifiedTab && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleOutlineIcon />}
              disabled={selected.length === 0 || busy}
              onClick={() => handleVerify(selected)}
            >
              Verificar seleccionados
            </Button>
          )}
        </Box>
        {paymentsQuery.isFetching && <LinearProgress />}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {!isVerifiedTab && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selected.length > 0 && !allSelected}
                      onChange={() => setSelected(allSelected ? [] : payments.map((p) => p.id))}
                      inputProps={{ 'aria-label': 'Seleccionar todos' }}
                    />
                  </TableCell>
                )}
                <TableCell>Fecha</TableCell>
                <TableCell>Sede</TableCell>
                <TableCell>Orden</TableCell>
                <TableCell>Método</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Recibió / aprobó en caja</TableCell>
                {filters.status !== 'PENDING' && <TableCell>Contabilidad</TableCell>}
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.length === 0 && !paymentsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {filters.status === 'PENDING'
                        ? 'No hay pagos por verificar con estos filtros.'
                        : 'No hay pagos con estos filtros.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {payments.map((payment) => (
                <TableRow key={payment.id} hover selected={selected.includes(payment.id)}>
                  {!isVerifiedTab && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(payment.id)}
                        onChange={() => toggle(payment.id)}
                        inputProps={{ 'aria-label': `Seleccionar pago de ${payment.order.orderNumber}` }}
                      />
                    </TableCell>
                  )}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(payment.paymentDate)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
                      <SedeDot color={payment.order.location.color} />
                      {payment.order.location.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/orders/${payment.order.id}`}
                      underline="hover"
                      sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}
                    >
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
                  <TableCell align="right" sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {formatCurrency(payment.amount)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {fullName(payment.receivedBy)}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {payment.advancePaymentApproval?.reviewedBy
                        ? `Caja: ${fullName(payment.advancePaymentApproval.reviewedBy)}`
                        : 'Sin aprobación de caja'}
                    </Typography>
                  </TableCell>
                  {filters.status !== 'PENDING' && (
                    <TableCell sx={{ maxWidth: 260 }}>
                      {payment.accountingStatus === 'OBSERVED' && (
                        <Chip label="Observado" color="warning" size="small" sx={{ mb: 0.5 }} />
                      )}
                      {payment.accountingNotes && (
                        <Typography variant="body2">{payment.accountingNotes}</Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {fullName(payment.accountingReviewedBy)}
                        {payment.accountingReviewedAt
                          ? ` · ${formatDateTime(payment.accountingReviewedAt)}`
                          : ''}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title={payment.receiptFileId ? 'Ver comprobante' : 'Sin comprobante'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={!payment.receiptFileId}
                            onClick={() => handleViewReceipt(payment.receiptFileId!)}
                            aria-label="Ver comprobante"
                          >
                            <ReceiptLongIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Historial de verificación">
                        <IconButton
                          size="small"
                          onClick={() => setHistoryOf(payment)}
                          aria-label="Historial de verificación"
                        >
                          <HistoryIcon fontSize="small" />
                        </IconButton>
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
                              onClick={() => handleVerify([payment.id])}
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
        </TableContainer>

        <TablePagination
          component="div"
          count={meta?.total ?? 0}
          page={(filters.page ?? 1) - 1}
          rowsPerPage={filters.limit ?? 25}
          rowsPerPageOptions={[25, 50, 100]}
          onPageChange={(_, page) => setFilters((f) => ({ ...f, page: page + 1 }))}
          onRowsPerPageChange={(e) => updateFilters({ limit: Number(e.target.value) })}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>

      <ObservePaymentDialog
        payment={observing}
        loading={observeMutation.isPending}
        onClose={() => setObserving(null)}
        onConfirm={handleObserve}
      />
      <PaymentReviewHistoryDialog payment={historyOf} onClose={() => setHistoryOf(null)} />
      <ReceiptPreviewDialog
        open={receipt.open}
        url={receipt.url}
        mimeType={receipt.mimeType}
        onClose={() => setReceipt({ open: false, url: '', mimeType: '' })}
      />
    </Box>
  );
};

export default PaymentVerificationsPage;
