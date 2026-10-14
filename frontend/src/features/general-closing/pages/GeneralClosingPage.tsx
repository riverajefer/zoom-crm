import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Paper,
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
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import LockIcon from '@mui/icons-material/Lock';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../../components/common/PageHeader';
import { useAuthStore } from '../../../store/authStore';
import {
  TOTAL_COLUMNS,
  type GeneralClosingReviewStatus,
  type RegisterDayRow,
} from '../../../types/general-closing.types';
import { PERMISSIONS } from '../../../utils/constants';
import { RegisterCard } from '../components/RegisterCard';
import { ConsolidatedSheet } from '../components/ConsolidatedSheet';
import { ByLocationView } from '../components/ByLocationView';
import { CloseDayPanel } from '../components/CloseDayPanel';
import { DayPaymentsDialog } from '../components/DayPaymentsDialog';
import { HandoverDialog } from '../components/HandoverDialog';
import { NoteDialog } from '../components/NoteDialog';
import {
  useGeneralClosingActions,
  useGeneralClosingDay,
  useGeneralClosingHistory,
  useGeneralClosingPendingDays,
} from '../hooks/useGeneralClosing';
import {
  addDays,
  businessToday,
  discrepancyLabel,
  exportGeneralClosingExcel,
  formatCurrency,
  formatDateTime,
  formatDay,
  fullName,
  isDay,
} from '../utils';

const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string | string[]; blockers?: string[] } } })
    ?.response?.data;
  if (data?.blockers?.length) return `${data.message}: ${data.blockers.join('. ')}`;
  if (Array.isArray(data?.message)) return data.message.join('. ');
  return data?.message || fallback;
};

const FIELD_LABELS = Object.fromEntries(TOTAL_COLUMNS.map((c) => [c.field, c.label]));

type View = 'day' | 'by-location' | 'history';

/**
 * Cierre general diario (solo Zoom): contabilidad ve las cajas de todas las
 * sedes en un día, revisa cada una y firma. Es un control posterior: no cierra
 * sesiones ni bloquea movimientos. Muestra todas las cajas, sea cual sea la
 * sede activa.
 */
const GeneralClosingPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = businessToday();
  const requested = searchParams.get('fecha');
  // Por defecto, ayer: el cierre se hace cuando las sedes ya cerraron.
  const date = isDay(requested) && requested <= today ? requested : addDays(today, -1);

  const [view, setView] = useState<View>('day');
  const [observing, setObserving] = useState<RegisterDayRow | null>(null);
  const [handingOver, setHandingOver] = useState<RegisterDayRow | null>(null);
  const [paymentsOf, setPaymentsOf] = useState<RegisterDayRow | null>(null);
  const [closingOpen, setClosingOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(20);

  const dayQuery = useGeneralClosingDay(date);
  const pendingQuery = useGeneralClosingPendingDays();
  const historyQuery = useGeneralClosingHistory(historyPage + 1, historyLimit, view === 'history');
  const { reviewMutation, handoverMutation, closeMutation, reopenMutation } =
    useGeneralClosingActions(date);

  const day = dayQuery.data;
  const signed = day?.closing?.status === 'CLOSED';
  const canPerform = hasPermission(PERMISSIONS.PERFORM_GENERAL_CLOSING);
  const canReopen = hasPermission(PERMISSIONS.REOPEN_GENERAL_CLOSING);
  // El detalle de una sesión de otra sede solo abre para quien opera en todas.
  const canOpenSessions =
    hasPermission(PERMISSIONS.READ_CASH_SESSIONS) && hasPermission(PERMISSIONS.VIEW_ALL_LOCATIONS);
  const busy =
    reviewMutation.isPending ||
    handoverMutation.isPending ||
    closeMutation.isPending ||
    reopenMutation.isPending;
  const pendingDays = (pendingQuery.data ?? []).filter((d) => d.date !== date);

  const goTo = (next: string) => {
    setSearchParams({ fecha: next });
    setView('day');
  };

  const review = async (row: RegisterDayRow, status: GeneralClosingReviewStatus, notes?: string) => {
    try {
      await reviewMutation.mutateAsync({ cashRegisterId: row.cashRegister.id, status, notes });
      setObserving(null);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo guardar la revisión'), { variant: 'error' });
    }
  };

  const handleReview = (row: RegisterDayRow, status: GeneralClosingReviewStatus) => {
    if (status === 'OBSERVED') setObserving(row);
    else void review(row, status);
  };

  const handleHandover = async (baseLeft: number) => {
    if (!handingOver) return;
    try {
      await handoverMutation.mutateAsync({ cashRegisterId: handingOver.cashRegister.id, baseLeft });
      enqueueSnackbar(`Efectivo de ${handingOver.cashRegister.name} recibido en la caja de la Matriz`, {
        variant: 'success',
      });
      setHandingOver(null);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo recibir el efectivo'), { variant: 'error' });
    }
  };

  const handleClose = async (notes: string) => {
    try {
      await closeMutation.mutateAsync(notes);
      enqueueSnackbar(`Cierre general del ${formatDay(date)} firmado`, { variant: 'success' });
      setClosingOpen(false);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo cerrar el día'), { variant: 'error' });
    }
  };

  const handleReopen = async (reason: string) => {
    if (!day?.closing) return;
    try {
      await reopenMutation.mutateAsync({ id: day.closing.id, reason });
      enqueueSnackbar('Día reabierto', { variant: 'info' });
      setReopenOpen(false);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo reabrir el día'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Cierre General"
        subtitle="Revisión de contabilidad sobre las cajas de todas las sedes, día por día"
      />

      <Tabs
        value={view}
        onChange={(_, next: View) => setView(next)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="day" label="Día" />
        <Tab value="by-location" label="Por sede" />
        <Tab value="history" label="Historial" />
      </Tabs>

      {view === 'day' && (
        <>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <IconButton aria-label="Día anterior" onClick={() => goTo(addDays(date, -1))}>
              <ChevronLeftIcon />
            </IconButton>
            <TextField
              type="date"
              size="small"
              label="Día"
              value={date}
              onChange={(e) => isDay(e.target.value) && goTo(e.target.value)}
              inputProps={{ max: today }}
              InputLabelProps={{ shrink: true }}
            />
            <IconButton
              aria-label="Día siguiente"
              disabled={date >= today}
              onClick={() => goTo(addDays(date, 1))}
            >
              <ChevronRightIcon />
            </IconButton>
            <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {formatDay(date)}
            </Typography>
            {day && (
              <Chip
                size="small"
                icon={signed ? <LockIcon /> : undefined}
                color={signed ? 'success' : 'default'}
                label={signed ? 'Cerrado' : 'En revisión'}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            {day && (
              <Button
                size="small"
                startIcon={<FileDownloadIcon />}
                onClick={() => exportGeneralClosingExcel(day)}
              >
                Excel
              </Button>
            )}
          </Stack>

          {pendingDays.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <AlertTitle>Días con caja y sin cierre general</AlertTitle>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {pendingDays.slice(0, 14).map((pending) => (
                  <Chip
                    key={pending.date}
                    size="small"
                    clickable
                    variant="outlined"
                    color={pending.openSessions > 0 ? 'warning' : 'default'}
                    label={formatDay(pending.date)}
                    onClick={() => goTo(pending.date)}
                  />
                ))}
                {pendingDays.length > 14 && (
                  <Typography variant="caption" color="text.secondary" alignSelf="center">
                    y {pendingDays.length - 14} más
                  </Typography>
                )}
              </Stack>
            </Alert>
          )}

          {(dayQuery.isFetching || busy) && <LinearProgress sx={{ mb: 1 }} />}
          {dayQuery.isError && (
            <Alert severity="error">{errorMessage(dayQuery.error, 'No se pudo cargar el día')}</Alert>
          )}

          {day && (
            <>
              {signed && day.closing && (
                <Alert severity="success" icon={<LockIcon />} sx={{ mb: 2 }}>
                  Firmado por {fullName(day.closing.closedBy)}
                  {day.closing.closedAt && ` el ${formatDateTime(day.closing.closedAt)}`}. Los números son
                  los del momento de la firma.
                  {day.closing.notes && ` Nota: ${day.closing.notes}`}
                </Alert>
              )}

              {day.drift.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <AlertTitle>Cambió después del cierre</AlertTitle>
                  {day.drift.map((item) => (
                    <Typography key={`${item.cashRegisterId}-${item.field}`} variant="body2">
                      {item.cashRegisterName} · {FIELD_LABELS[item.field]}: firmado{' '}
                      {formatCurrency(item.signed ?? 0)}, hoy {formatCurrency(item.current ?? 0)}
                    </Typography>
                  ))}
                </Alert>
              )}

              <Stack spacing={1.5}>
                {day.registers.map((row) => (
                  <RegisterCard
                    key={row.cashRegister.id}
                    row={row}
                    canReview={canPerform && !signed}
                    canOpenSessions={canOpenSessions}
                    busy={busy}
                    onReview={handleReview}
                    onHandover={setHandingOver}
                    onPayments={setPaymentsOf}
                    canReceiveToday={date < today}
                  />
                ))}
              </Stack>

              <CloseDayPanel
                day={day}
                signed={signed}
                canPerform={canPerform}
                canReopen={canReopen}
                busy={busy}
                onClose={() => setClosingOpen(true)}
                onReopen={() => setReopenOpen(true)}
              />

              <ConsolidatedSheet consolidated={day.consolidated} />

              {!!day.closing?.events.length && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Historial del día
                  </Typography>
                  {day.closing.events.map((event) => (
                    <Typography key={event.id} variant="body2" color="text.secondary">
                      {formatDateTime(event.createdAt)} · {event.type === 'CLOSED' ? 'Cerrado' : 'Reabierto'} por{' '}
                      {fullName(event.user)}
                      {event.notes && ` · ${event.notes}`}
                    </Typography>
                  ))}
                </Box>
              )}
            </>
          )}
        </>
      )}

      {view === 'by-location' && <ByLocationView />}

      {view === 'history' && (
        <Paper variant="outlined">
          {historyQuery.isFetching && <LinearProgress />}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Día</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Cerró</TableCell>
                  <TableCell align="right">Contado</TableCell>
                  <TableCell align="right">Diferencia</TableCell>
                  <TableCell align="right">Observadas</TableCell>
                  <TableCell>Nota</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(historyQuery.data?.data ?? []).map((item) => (
                  <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => goTo(item.date)}>
                    <TableCell sx={{ whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                      {formatDay(item.date)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={item.status === 'CLOSED' ? 'success' : 'default'}
                        label={item.status === 'CLOSED' ? 'Cerrado' : 'En revisión'}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {item.closedAt ? `${fullName(item.closedBy)} · ${formatDateTime(item.closedAt)}` : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {item.totals?.counted != null ? formatCurrency(item.totals.counted) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {item.totals?.discrepancy != null ? formatCurrency(item.totals.discrepancy) : '—'}
                    </TableCell>
                    <TableCell align="right">{item.observedCount || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>{item.notes ?? ''}</TableCell>
                  </TableRow>
                ))}
                {historyQuery.data?.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      Todavía no hay cierres generales
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={historyQuery.data?.meta.total ?? 0}
            page={historyPage}
            rowsPerPage={historyLimit}
            rowsPerPageOptions={[20, 50]}
            onPageChange={(_, page) => setHistoryPage(page)}
            onRowsPerPageChange={(e) => {
              setHistoryLimit(Number(e.target.value));
              setHistoryPage(0);
            }}
            labelRowsPerPage="Filas"
          />
        </Paper>
      )}

      <NoteDialog
        open={!!observing}
        title={`Observación · ${observing?.cashRegister.name ?? ''}`}
        description={
          observing && (observing.totals.discrepancy ?? 0) !== 0
            ? `La caja cerró con ${discrepancyLabel(observing.totals.discrepancy ?? 0).toLowerCase()}. ` +
              'Anota qué pasó (por ejemplo, a quién se le pidió explicación o cómo se va a reponer). ' +
              'La caja no se reabre ni cambia su cuadre.'
            : 'Anota lo que encontraste. La caja no se reabre ni cambia su cuadre.'
        }
        label="Nota de contabilidad"
        confirmLabel="Guardar nota"
        confirmColor="warning"
        required
        loading={reviewMutation.isPending}
        onClose={() => setObserving(null)}
        onConfirm={(notes) => observing && review(observing, 'OBSERVED', notes)}
      />
      <DayPaymentsDialog row={paymentsOf} date={date} onClose={() => setPaymentsOf(null)} />
      <HandoverDialog
        row={handingOver}
        loading={handoverMutation.isPending}
        onClose={() => setHandingOver(null)}
        onConfirm={handleHandover}
      />
      <NoteDialog
        open={closingOpen}
        title={`Cerrar el ${formatDay(date)}`}
        description="Se guarda la foto de los totales con tu firma. No bloquea las cajas: si algo cambia después, aquí se verá la diferencia."
        label="Nota del cierre (opcional)"
        confirmLabel="Cerrar el día"
        maxLength={1000}
        loading={closeMutation.isPending}
        onClose={() => setClosingOpen(false)}
        onConfirm={handleClose}
      />
      <NoteDialog
        open={reopenOpen}
        title={`Reabrir el ${formatDay(date)}`}
        description="Se quita la firma para volver a revisar las cajas. Las revisiones se conservan y el motivo queda en el historial."
        label="Motivo"
        confirmLabel="Reabrir"
        confirmColor="warning"
        required
        loading={reopenMutation.isPending}
        onClose={() => setReopenOpen(false)}
        onConfirm={handleReopen}
      />
    </Box>
  );
};

export default GeneralClosingPage;
