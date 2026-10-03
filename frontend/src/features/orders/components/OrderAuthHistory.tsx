import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Box,
  Typography,
  Chip,
  Avatar,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from '@mui/material';
import { lighten } from '@mui/material/styles';
import {
  Payments as PaymentsIcon,
  LocalOffer as LocalOfferIcon,
  SupervisorAccount as SupervisorAccountIcon,
  EditNote as EditNoteIcon,
  Edit as EditIcon,
  Block as BlockIcon,
  Person as PersonIcon,
  CurrencyExchange as CurrencyExchangeIcon,
  ReceiptLong as ReceiptLongIcon,
  SwapHoriz as SwapHorizIcon,
  ManageAccounts as ManageAccountsIcon,
} from '@mui/icons-material';
import { ordersApi } from '../../../api/orders.api';
import { storageApi } from '../../../api/storage.api';
import type {
  OrderAuthHistoryEvent,
  OrderAuthEventType,
  OrderAuthEventStatus,
} from '../../../types/order-authorization-history.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDateTime = (date?: string | null): string => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

const formatCurrency = (value?: string | null): string => {
  if (value == null) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(num);
};

type MinimalUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null;

const userName = (user?: MinimalUser): string => {
  if (!user) return '—';
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return full || user.email || '—';
};

// ─── Config por tipo de evento ────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  OrderAuthEventType,
  { label: string; icon: React.ReactElement; verb: string }
> = {
  ADVANCE_PAYMENT: {
    label: 'Anticipo',
    icon: <PaymentsIcon fontSize="small" />,
    verb: 'Solicitó aprobación de un pago anticipado',
  },
  DISCOUNT: {
    label: 'Descuento',
    icon: <LocalOfferIcon fontSize="small" />,
    verb: 'Solicitó aprobación de un descuento',
  },
  CLIENT_OWNERSHIP: {
    label: 'Propiedad de cliente',
    icon: <SupervisorAccountIcon fontSize="small" />,
    verb: 'Solicitó autorización de propiedad de cliente',
  },
  PAYMENT_EDIT: {
    label: 'Edición de pago',
    icon: <EditNoteIcon fontSize="small" />,
    verb: 'Solicitó autorización para editar un pago',
  },
  PAYMENT_VOID: {
    label: 'Anulación de pago',
    icon: <BlockIcon fontSize="small" />,
    verb: 'Solicitó autorización para anular un pago',
  },
  EDIT_REQUEST: {
    label: 'Solicitud de edición',
    icon: <EditIcon fontSize="small" />,
    verb: 'Solicitó permiso para editar la orden',
  },
  REFUND: {
    label: 'Devolución',
    icon: <CurrencyExchangeIcon fontSize="small" />,
    verb: 'Solicitó autorización para una devolución',
  },
  STATUS_CHANGE: {
    label: 'Cambio de estado',
    icon: <SwapHorizIcon fontSize="small" />,
    verb: 'Solicitó autorización para cambiar el estado',
  },
  ADVISOR_CHANGE: {
    label: 'Cambio de asesor',
    icon: <ManageAccountsIcon fontSize="small" />,
    verb: 'Solicitó cambiar el asesor',
  },
};

/**
 * Qué se hizo, cuando quien podía aprobar lo hizo sin solicitud (solo Zoom,
 * docs/PLAN_SEDES.md §6.3). No "solicitó" nada: lo hizo.
 */
const directVerb = (event: OrderAuthHistoryEvent): string => {
  switch (event.type) {
    case 'PAYMENT_VOID':
      return 'Anuló un pago';
    case 'PAYMENT_EDIT':
      return 'Editó un pago';
    case 'DISCOUNT':
      return 'Aplicó un descuento';
    case 'EDIT_REQUEST':
      return 'Editó la orden directamente';
    case 'ADVISOR_CHANGE':
      return 'Cambió el asesor';
    case 'STATUS_CHANGE':
      return event.requestedStatus === 'ANULADO'
        ? 'Anuló la orden'
        : event.requestedStatus === 'DELIVERED_ON_CREDIT'
          ? 'Entregó la orden a crédito'
          : 'Cambió el estado';
    default:
      return TYPE_CONFIG[event.type].verb;
  }
};

/** Verbo de una solicitud de cambio de estado, según el estado pedido. */
const statusRequestVerb = (event: OrderAuthHistoryEvent): string =>
  event.requestedStatus === 'ANULADO'
    ? 'Solicitó anular la orden'
    : event.requestedStatus === 'DELIVERED_ON_CREDIT'
      ? 'Solicitó entregar la orden a crédito'
      : TYPE_CONFIG.STATUS_CHANGE.verb;

/**
 * Estado de una devolución tal como se lee.
 *
 * `APPROVED` es ambiguo en una devolución: gerencia autoriza y Caja paga
 * después, así que una solicitud aprobada puede tener el dinero todavía en la
 * caja. Mostrar "Aprobada" en ese caso haría creer que la plata ya salió.
 */
const refundStatusChip = (
  event: OrderAuthHistoryEvent,
): { label: string; color: 'warning' | 'success' | 'error' | 'default' } | null => {
  if (event.type !== 'REFUND' || event.status !== 'APPROVED') return null;
  // Anulación de ítems sin devolución: no hubo nada que pagar.
  if (event.executedAt && !(parseFloat(event.amount ?? '0') > 0)) {
    return { label: 'Aplicada', color: 'success' };
  }
  return event.executedAt
    ? { label: 'Pagada', color: 'success' }
    : { label: 'Autorizada · falta pago', color: 'warning' };
};

const STATUS_CONFIG: Record<
  OrderAuthEventStatus,
  { label: string; color: 'warning' | 'success' | 'error' | 'default'; dotBg: string }
> = {
  // Tonos oscuros (Material 800/900) para que el icono blanco tenga buen contraste
  PENDING: { label: 'Pendiente', color: 'warning', dotBg: '#e65100' },
  APPROVED: { label: 'Aprobada', color: 'success', dotBg: '#2e7d32' },
  REJECTED: { label: 'Rechazada', color: 'error', dotBg: '#c62828' },
  EXPIRED: { label: 'Expirada', color: 'default', dotBg: '#616161' },
};

// ─── Presentational bits ──────────────────────────────────────────────────────

const TimelineLine: React.FC<{ hide: boolean }> = ({ hide }) => (
  <Box
    sx={{
      width: 2,
      flex: hide ? 0 : 1,
      minHeight: hide ? 0 : 24,
      backgroundColor: 'divider',
    }}
  />
);

const TimelineDot: React.FC<{
  type: OrderAuthEventType;
  status: OrderAuthEventStatus;
}> = ({ type, status }) => (
  <Avatar
    className="timeline-dot"
    sx={{
      width: 32,
      height: 32,
      backgroundColor: STATUS_CONFIG[status].dotBg,
      color: '#fff',
      // Anillo más claro del mismo color: separa el punto del fondo oscuro
      // manteniendo el icono blanco con alto contraste sobre el relleno.
      border: '2px solid',
      borderColor: lighten(STATUS_CONFIG[status].dotBg, 0.45),
      boxShadow: (theme) =>
        theme.palette.mode === 'dark'
          ? '0 0 10px rgba(0,0,0,0.5)'
          : '0 2px 4px rgba(0,0,0,0.1)',
      zIndex: 1,
      flexShrink: 0,
      transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    }}
  >
    {TYPE_CONFIG[type].icon}
  </Avatar>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface OrderAuthHistoryProps {
  orderId: string;
}

export const OrderAuthHistory: React.FC<OrderAuthHistoryProps> = ({
  orderId,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-authorization-history', orderId],
    queryFn: () => ordersApi.getAuthorizationHistory(orderId),
    enabled: !!orderId,
  });

  // Comprobante de una devolución por transferencia. La URL es prefirmada, así
  // que se pide al abrir y no se guarda en el estado del listado.
  const [receipt, setReceipt] = useState<{
    url: string;
    mimeType: string;
  } | null>(null);

  const openReceipt = async (fileId: string) => {
    try {
      const [{ url }, file] = await Promise.all([
        storageApi.getFileUrl(fileId),
        storageApi.getFile(fileId),
      ]);
      setReceipt({ url, mimeType: file.mimeType });
    } catch {
      enqueueSnackbar('No se pudo abrir el comprobante', { variant: 'error' });
    }
  };

  const events: OrderAuthHistoryEvent[] = data ?? [];

  const HEADER = (
    <CardHeader
      title="Historial de Aprobaciones y Solicitudes de Autorización"
      subheader={
        events.length
          ? `Registro de autorizaciones y solicitudes de esta OP (${events.length})`
          : 'Registro de autorizaciones y solicitudes de esta OP'
      }
    />
  );

  if (isLoading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card variant="outlined">
        {HEADER}
        <CardContent>
          <Typography color="error" textAlign="center" py={3}>
            Error al cargar el historial de autorizaciones
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!events.length) {
    return (
      <Card variant="outlined">
        {HEADER}
        <CardContent>
          <Typography color="text.secondary" textAlign="center" py={3}>
            No hay aprobaciones ni solicitudes de autorización registradas para
            esta OP
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      {HEADER}
      <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {events.map((event, index) => {
            const typeCfg = TYPE_CONFIG[event.type];
            const statusCfg = STATUS_CONFIG[event.status];
            const isLast = index === events.length - 1;

            // Título principal del evento — el monto se resalta en negrita + color
            const isItemAnnulment =
              event.type === 'REFUND' && !!event.annulledItems?.length;
            const hasMoney = parseFloat(event.amount ?? '0') > 0;
            const showAmount =
              event.amount != null &&
              // Una anulación de ítems puede no devolver nada: "de $0" confunde.
              (!isItemAnnulment || hasMoney) &&
              (event.type === 'ADVANCE_PAYMENT' ||
                event.type === 'PAYMENT_EDIT' ||
                event.type === 'PAYMENT_VOID' ||
                event.type === 'DISCOUNT' ||
                event.type === 'REFUND');
            // Caja anulando con la caja abierta, o quien podía aprobar haciéndolo
            // directamente, no "solicitó" nada: lo hizo.
            const verbText = isItemAnnulment
              ? `Solicitó anular ítems (${event
                  .annulledItems!.map(
                    (i) => `${Number(i.quantity)} × ${i.description.trim()}`,
                  )
                  .join(', ')})${hasMoney ? ' con devolución' : ''}`
              : event.direct
                ? directVerb(event)
                : event.type === 'STATUS_CHANGE'
                  ? statusRequestVerb(event)
                  : typeCfg.verb;
            const titleNode = (
              <>
                {verbText}
                {showAmount && (
                  <>
                    {' de '}
                    <Box
                      component="span"
                      sx={{ fontWeight: 800, color: 'primary.main' }}
                    >
                      {formatCurrency(event.amount)}
                    </Box>
                  </>
                )}
                {event.type === 'CLIENT_OWNERSHIP' && event.advisor
                  ? ` para ${userName(event.advisor)}`
                  : ''}
                {event.type === 'ADVISOR_CHANGE' && event.advisor
                  ? ` a ${userName(event.advisor)}`
                  : ''}
                {event.type === 'STATUS_CHANGE' &&
                  event.requestedStatus === 'ANULADO' &&
                  event.amount != null &&
                  parseFloat(event.amount) > 0 && (
                    <>
                      {', reteniendo '}
                      <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        {formatCurrency(event.amount)}
                      </Box>
                    </>
                  )}
                {event.type === 'REFUND' && event.reversedAmount && (
                  <>
                    {', anulando '}
                    <Box
                      component="span"
                      sx={{ fontWeight: 800, color: 'error.main' }}
                    >
                      {formatCurrency(event.reversedAmount)}
                    </Box>
                    {' de la venta'}
                  </>
                )}
                {event.type === 'REFUND' &&
                  event.retainedAmount &&
                  ` (la empresa retiene ${formatCurrency(event.retainedAmount)})`}
                {'.'}
              </>
            );

            // Línea de revisión (solicitudes resueltas)
            let reviewLine: string | null = null;
            if (event.type === 'PAYMENT_VOID' && event.direct) {
              // No hubo revisión: quien lo hizo tenía permiso de anular directo.
              reviewLine = `Anulado sin aprobación — tiene permiso de anulación directa${
                event.reviewedAt ? ` · ${formatDateTime(event.reviewedAt)}` : ''
              }`;
            } else if (event.direct) {
              // Quien podía aprobar lo hizo sin solicitud: queda con su nombre y el motivo.
              reviewLine = `Hecho directamente, sin solicitud — ${userName(event.requestedBy)}${
                event.reviewedAt ? ` · ${formatDateTime(event.reviewedAt)}` : ''
              }`;
            } else if (event.status !== 'PENDING') {
              const verb =
                event.status === 'APPROVED'
                  ? // En una devolución quien aprueba no es quien paga: decir
                    // "aprobada" a secas se confundiría con el pago.
                    event.type === 'REFUND'
                    ? 'Autorizada por'
                    : 'Aprobada por'
                  : event.status === 'REJECTED'
                    ? 'Rechazada por'
                    : 'Resuelta';
              reviewLine =
                event.status === 'EXPIRED'
                  ? 'La solicitud expiró sin ser revisada.'
                  : `${verb}: ${userName(event.reviewedBy)}${
                      event.reviewedAt
                        ? ` · ${formatDateTime(event.reviewedAt)}`
                        : ''
                    }`;
            }

            // Tercer hito de la devolución: gerencia autoriza, Caja paga. Sin
            // esta línea el timeline no dice si el dinero ya salió de la caja.
            let executionLine: string | null = null;
            if (event.type === 'REFUND' && event.status === 'APPROVED') {
              executionLine = event.executedAt && !hasMoney
                ? 'Aplicada al autorizar — no hubo devolución de dinero.'
                : event.executedAt
                ? `Pagada en caja por: ${userName(event.executedBy)} · ${formatDateTime(event.executedAt)}`
                : 'Pendiente de pago en Caja — el dinero aún no ha salido.';
            }

            const statusChip = refundStatusChip(event) ?? {
              label: statusCfg.label,
              color: statusCfg.color,
            };

            return (
              <Box
                key={event.id}
                sx={{
                  display: 'flex',
                  gap: 2,
                  '&:hover .timeline-dot': { transform: 'scale(1.15)' },
                }}
              >
                {/* Columna izquierda: línea + punto */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: 36,
                    flexShrink: 0,
                  }}
                >
                  <TimelineLine hide={index === 0} />
                  <TimelineDot type={event.type} status={event.status} />
                  <TimelineLine hide={isLast} />
                </Box>

                {/* Columna derecha: contenido */}
                <Box sx={{ flex: 1, pb: isLast ? 0 : 4, minWidth: 0 }}>
                  {/* Header: actor + fecha + tipo + estado */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                      py: 0.75,
                      px: 1,
                      borderRadius: 1.5,
                      backgroundColor: (theme) =>
                        theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.02)'
                          : 'rgba(0,0,0,0.01)',
                      mb: 1,
                    }}
                  >
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <PersonIcon
                        sx={{ color: 'text.secondary', fontSize: '1rem' }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, fontSize: '0.85rem' }}
                      >
                        {userName(event.requestedBy)}
                      </Typography>
                    </Box>

                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontSize: '0.75rem' }}
                    >
                      {formatDateTime(event.createdAt)}
                    </Typography>

                    <Box
                      sx={{
                        ml: 'auto',
                        display: 'flex',
                        gap: 0.75,
                        alignItems: 'center',
                      }}
                    >
                      <Chip
                        label={typeCfg.label}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                      />
                      <Chip
                        label={statusChip.label}
                        color={statusChip.color}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          height: 22,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          px: 0.5,
                        }}
                      />
                    </Box>
                  </Box>

                  {/* Detalle */}
                  <Box sx={{ ml: 1 }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {titleNode}
                    </Typography>

                    {event.reason && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        <strong>Motivo:</strong> {event.reason}
                      </Typography>
                    )}

                    {reviewLine && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ mt: 0.5 }}
                      >
                        {reviewLine}
                      </Typography>
                    )}

                    {executionLine && (
                      <Typography
                        variant="caption"
                        color={
                          event.executedAt ? 'text.secondary' : 'warning.main'
                        }
                        display="block"
                        sx={{ mt: 0.5, fontWeight: event.executedAt ? 400 : 600 }}
                      >
                        {executionLine}
                      </Typography>
                    )}

                    {event.reviewNotes && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ mt: 0.5, fontStyle: 'italic' }}
                      >
                        <strong>Notas:</strong> {event.reviewNotes}
                      </Typography>
                    )}

                    {/* Una devolución por transferencia puede tener dos
                        soportes: el que adjuntó quien la solicitó y el que
                        adjuntó Caja al hacer el giro. Se distinguen solo cuando
                        existen los dos; con uno solo, el rótulo genérico. */}
                    {(event.receiptFileId || event.executionReceiptFileId) && (
                      <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        sx={{ mt: 0.5 }}
                      >
                        {event.receiptFileId && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<ReceiptLongIcon />}
                            onClick={() => openReceipt(event.receiptFileId!)}
                            sx={{ textTransform: 'none', px: 0.5 }}
                          >
                            {event.executionReceiptFileId
                              ? 'Comprobante de la solicitud'
                              : 'Ver comprobante de la transferencia'}
                          </Button>
                        )}
                        {event.executionReceiptFileId && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<ReceiptLongIcon />}
                            onClick={() =>
                              openReceipt(event.executionReceiptFileId!)
                            }
                            sx={{ textTransform: 'none', px: 0.5 }}
                          >
                            {event.receiptFileId
                              ? 'Comprobante del pago'
                              : 'Ver comprobante de la transferencia'}
                          </Button>
                        )}
                      </Stack>
                    )}
                  </Box>

                  {!isLast && <Divider sx={{ mt: 3, opacity: 0.4 }} />}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>

      <Dialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Comprobante de la transferencia</DialogTitle>
        <DialogContent dividers>
          {receipt?.mimeType === 'application/pdf' ? (
            <Box
              component="iframe"
              src={receipt.url}
              title="Comprobante"
              sx={{ width: '100%', height: '70vh', border: 0 }}
            />
          ) : (
            receipt && (
              <Box
                component="img"
                src={receipt.url}
                alt="Comprobante de la transferencia"
                sx={{ display: 'block', maxWidth: '100%', mx: 'auto' }}
              />
            )
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceipt(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default OrderAuthHistory;
