import React from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from '@mui/material';
import { lighten } from '@mui/material/styles';
import {
  HourglassTop as HourglassTopIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Person as PersonIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  Payments as PaymentsIcon,
  Block as BlockIcon,
} from '@mui/icons-material';
import { expenseOrderAuthRequestsApi } from '../../../api/expense-order-auth-requests.api';
import { expenseOrderEditRequestsApi } from '../../../api/expense-order-edit-requests.api';
import type { ExpenseOrder } from '../../../types/expense-order.types';

// ─── Types ─────────────────────────────────────────────────────────────────

type MinimalUser = {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
} | null;

type EventKind =
  | 'REQUEST_PENDING'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'ADMIN_AUTH'
  | 'CAJA_AUTH'
  | 'CAJA_REJECT';

interface TimelineEvent {
  key: string;
  timestamp: string;
  kind: EventKind;
  /** Actor principal del evento (quien lo generó) */
  user: MinimalUser;
  /** Descripción principal */
  title: string;
  /** Motivo / notas asociadas */
  detail?: string | null;
  /** Línea secundaria de revisión (solo solicitudes resueltas) */
  reviewLine?: string | null;
}

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

const userName = (user?: MinimalUser): string => {
  if (!user) return '—';
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return full || user.email;
};

const KIND_CONFIG: Record<
  EventKind,
  {
    label: string;
    color: 'warning' | 'success' | 'error' | 'info';
    icon: React.ReactElement;
    dotBg: string;
  }
> = {
  REQUEST_PENDING: {
    label: 'Solicitud pendiente',
    color: 'warning',
    icon: <HourglassTopIcon fontSize="small" />,
    dotBg: '#e65100',
  },
  REQUEST_APPROVED: {
    label: 'Solicitud aprobada',
    color: 'success',
    icon: <CheckCircleIcon fontSize="small" />,
    dotBg: '#2e7d32',
  },
  REQUEST_REJECTED: {
    label: 'Solicitud rechazada',
    color: 'error',
    icon: <CancelIcon fontSize="small" />,
    dotBg: '#c62828',
  },
  ADMIN_AUTH: {
    label: 'Autorización Admin',
    color: 'success',
    icon: <AdminPanelSettingsIcon fontSize="small" />,
    dotBg: '#2e7d32',
  },
  CAJA_AUTH: {
    label: 'Firma de Caja',
    color: 'success',
    icon: <PaymentsIcon fontSize="small" />,
    dotBg: '#1565c0',
  },
  CAJA_REJECT: {
    label: 'Rechazo de Caja',
    color: 'error',
    icon: <BlockIcon fontSize="small" />,
    dotBg: '#c62828',
  },
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

const TimelineDot: React.FC<{ kind: EventKind }> = ({ kind }) => {
  const cfg = KIND_CONFIG[kind];
  return (
    <Avatar
      className="timeline-dot"
      sx={{
        width: 32,
        height: 32,
        backgroundColor: cfg.dotBg,
        color: '#fff',
        // Anillo más claro del mismo color: separa el punto del fondo oscuro
        // manteniendo el icono blanco con alto contraste sobre el relleno.
        border: '2px solid',
        borderColor: lighten(cfg.dotBg, 0.45),
        boxShadow: (theme) =>
          theme.palette.mode === 'dark'
            ? '0 0 10px rgba(0,0,0,0.5)'
            : '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 1,
        flexShrink: 0,
        transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      {cfg.icon}
    </Avatar>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface ExpenseOrderAuthHistoryProps {
  expenseOrder: ExpenseOrder;
}

export const ExpenseOrderAuthHistory: React.FC<
  ExpenseOrderAuthHistoryProps
> = ({ expenseOrder }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['og-auth-requests-history', expenseOrder.id],
    queryFn: () =>
      expenseOrderAuthRequestsApi.findByExpenseOrder(expenseOrder.id),
    enabled: !!expenseOrder.id,
  });

  // Solicitudes para editar la OG después de pagada. Solo existen en OG pagadas.
  const { data: editRequests } = useQuery({
    queryKey: ['og-edit-requests', expenseOrder.id],
    queryFn: () => expenseOrderEditRequestsApi.findByExpenseOrder(expenseOrder.id),
    enabled: !!expenseOrder.id && expenseOrder.status === 'PAID',
  });

  const events = React.useMemo<TimelineEvent[]>(() => {
    const list: TimelineEvent[] = [];
    const requests = data ?? [];

    // 0. Solicitudes de edición de la OG ya pagada
    for (const req of editRequests ?? []) {
      const kind: EventKind =
        req.status === 'APPROVED'
          ? 'REQUEST_APPROVED'
          : req.status === 'REJECTED' || req.status === 'EXPIRED'
            ? 'REQUEST_REJECTED'
            : 'REQUEST_PENDING';

      let reviewLine: string | null = null;
      if (req.status === 'EXPIRED') {
        reviewLine = 'Venció sin respuesta';
      } else if (req.status !== 'PENDING') {
        const verb = req.status === 'APPROVED' ? 'Aprobada por' : 'Rechazada por';
        const used = req.status === 'APPROVED' && req.consumedAt
          ? ` · editada el ${formatDateTime(req.consumedAt)}`
          : '';
        reviewLine = `${verb}: ${userName(req.reviewedBy)}${
          req.reviewedAt ? ` · ${formatDateTime(req.reviewedAt)}` : ''
        }${used}${req.reviewNotes ? ` · ${req.reviewNotes}` : ''}`;
      }

      list.push({
        key: `edit-${req.id}`,
        timestamp: req.createdAt,
        kind,
        user: req.requestedBy,
        title: 'Solicitó editar la OG después de pagada.',
        detail: `Motivo: ${req.reason}`,
        reviewLine,
      });
    }

    // 1. Solicitudes de autorización (creadas por no-admins)
    for (const req of requests) {
      const kind: EventKind =
        req.status === 'APPROVED'
          ? 'REQUEST_APPROVED'
          : req.status === 'REJECTED'
            ? 'REQUEST_REJECTED'
            : 'REQUEST_PENDING';

      let reviewLine: string | null = null;
      if (req.status !== 'PENDING') {
        const verb = req.status === 'APPROVED' ? 'Aprobada por' : 'Rechazada por';
        reviewLine = `${verb}: ${userName(req.reviewedBy)}${
          req.reviewedAt ? ` · ${formatDateTime(req.reviewedAt)}` : ''
        }`;
      }

      list.push({
        key: `req-${req.id}`,
        timestamp: req.createdAt,
        kind,
        user: req.requestedBy,
        title: 'Solicitó autorización administrativa de la OG.',
        detail: `Motivo: ${req.reason || 'Sin motivo especificado'}`,
        reviewLine,
      });
    }

    // 2. Autorización administrativa directa (admin autoriza sin solicitud previa).
    //    Si hubo una solicitud aprobada, ese evento ya representa la firma admin,
    //    así que solo se agrega este hito cuando NO existe solicitud aprobada.
    const hasApprovedRequest = requests.some((r) => r.status === 'APPROVED');
    if (expenseOrder.authorizedBy && expenseOrder.authorizedAt && !hasApprovedRequest) {
      list.push({
        key: 'admin-auth',
        timestamp: expenseOrder.authorizedAt,
        kind: 'ADMIN_AUTH',
        user: expenseOrder.authorizedBy,
        title: 'Autorizó administrativamente la OG (firma Admin).',
      });
    }

    // 3. Firma de Caja (segunda autorización que registra el pago)
    if (expenseOrder.cajaAuthorizedBy && expenseOrder.cajaAuthorizedAt) {
      list.push({
        key: 'caja-auth',
        timestamp: expenseOrder.cajaAuthorizedAt,
        kind: 'CAJA_AUTH',
        user: expenseOrder.cajaAuthorizedBy,
        title: 'Firmó la OG desde Caja y registró el pago.',
      });
    }

    // 4. Rechazo de Caja
    if (expenseOrder.cajaRejectedBy && expenseOrder.cajaRejectedAt) {
      list.push({
        key: 'caja-reject',
        timestamp: expenseOrder.cajaRejectedAt,
        kind: 'CAJA_REJECT',
        user: expenseOrder.cajaRejectedBy,
        title: 'Rechazó la OG desde Caja.',
        detail: expenseOrder.cajaRejectionReason
          ? `Motivo: ${expenseOrder.cajaRejectionReason}`
          : null,
      });
    }

    // Orden cronológico descendente (más reciente arriba)
    return list.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [data, editRequests, expenseOrder]);

  const HEADER = (
    <CardHeader
      title="Historial de Aprobaciones y Solicitudes de Autorización"
      subheader={
        events.length
          ? `Registro de autorizaciones y solicitudes de esta OG (${events.length})`
          : 'Registro de autorizaciones y solicitudes de esta OG'
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
            esta OG
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
            const cfg = KIND_CONFIG[event.kind];
            const isLast = index === events.length - 1;

            return (
              <Box
                key={event.key}
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
                  <TimelineDot kind={event.kind} />
                  <TimelineLine hide={isLast} />
                </Box>

                {/* Columna derecha: contenido */}
                <Box sx={{ flex: 1, pb: isLast ? 0 : 4, minWidth: 0 }}>
                  {/* Header: actor + fecha + tipo */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
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
                        {userName(event.user)}
                      </Typography>
                    </Box>

                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontSize: '0.75rem' }}
                    >
                      {formatDateTime(event.timestamp)}
                    </Typography>

                    <Chip
                      label={cfg.label}
                      color={cfg.color}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        height: 22,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        px: 0.5,
                        ml: 'auto',
                      }}
                    />
                  </Box>

                  {/* Detalle */}
                  <Box sx={{ ml: 1 }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {event.title}
                    </Typography>

                    {event.detail && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {event.detail}
                      </Typography>
                    )}

                    {event.reviewLine && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ mt: 0.5 }}
                      >
                        {event.reviewLine}
                      </Typography>
                    )}
                  </Box>

                  {!isLast && <Divider sx={{ mt: 3, opacity: 0.4 }} />}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ExpenseOrderAuthHistory;
