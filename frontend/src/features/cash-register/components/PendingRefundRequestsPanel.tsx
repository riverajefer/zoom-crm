import React, { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import {
  usePendingRefundRequests,
  useApproveRefundRequest,
  useRejectRefundRequest,
} from '../../orders/hooks/useRefundRequests';
import type { RefundRequest } from '../../../types/refund-request.types';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods';


const PAYMENT_METHOD_ICONS: Record<string, React.ReactNode> = {
  CASH: <LocalAtmIcon fontSize="inherit" />,
  TRANSFER: <SyncAltIcon fontSize="inherit" />,
  CARD: <CreditCardIcon fontSize="inherit" />,
};

const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(Number(value));

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const PendingRefundRequestsPanel: React.FC<{ hideWhenEmpty?: boolean }> = ({ hideWhenEmpty }) => {
  const { data: requests = [], isLoading, isFetching, refetch } = usePendingRefundRequests();
  const approveMutation = useApproveRefundRequest();
  const rejectMutation = useRejectRefundRequest();

  const [reviewTarget, setReviewTarget] = useState<{
    request: RefundRequest;
    action: 'approve' | 'reject';
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const handleAction = (request: RefundRequest, action: 'approve' | 'reject') => {
    setReviewTarget({ request, action });
    setReviewNotes('');
  };

  // `disabled={mutation.isPending}` no alcanza: el botón solo se deshabilita
  // cuando React vuelve a renderizar, y dos clics en el mismo frame entran los
  // dos. Aprobar dos veces mueve el dinero dos veces.
  const handleSubmitReview = useSingleFlight(async () => {
    if (!reviewTarget) return;
    const { request, action } = reviewTarget;

    if (action === 'approve') {
      await approveMutation.mutateAsync({
        id: request.id,
        dto: reviewNotes.trim() ? { reviewNotes } : undefined,
      });
    } else {
      if (!reviewNotes.trim()) return;
      await rejectMutation.mutateAsync({
        id: request.id,
        dto: { reviewNotes },
      });
    }
    setReviewTarget(null);
  });

  if (isLoading) return null;
  if (hideWhenEmpty && requests.length === 0) return null;

  return (
    <>
      <Card sx={{ mb: 2, border: requests.length > 0 ? '1px solid' : undefined, borderColor: 'info.main' }}>
        <CardContent sx={{ pb: requests.length === 0 ? '16px !important' : undefined }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: requests.length > 0 ? 1.5 : 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CurrencyExchangeIcon color="info" fontSize="small" />
              <Typography variant="subtitle2" color="text.secondary">
                Devoluciones Pendientes de Autorización
              </Typography>
              {requests.length > 0 && (
                <Badge badgeContent={requests.length} color="info" sx={{ ml: 1 }} />
              )}
            </Box>
            <Tooltip title="Actualizar solicitudes" arrow>
              <IconButton
                size="small"
                onClick={() => refetch()}
                disabled={isFetching}
                sx={{ color: 'text.secondary' }}
              >
                <RefreshIcon
                  fontSize="small"
                  sx={{
                    animation: isFetching ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
                  }}
                />
              </IconButton>
            </Tooltip>
          </Box>

          {requests.length === 0 && (
            <Typography variant="subtitle2" color="text.disabled" sx={{ mt: 0.2 }}>
              No hay solicitudes pendientes
            </Typography>
          )}

          {requests.length > 0 && <Divider sx={{ mb: 1.5 }} />}

          <Stack spacing={1.5}>
            {requests.map((req) => {
              const clientName = req.order?.client?.name || '—';
              const requesterName =
                [req.requestedBy?.firstName, req.requestedBy?.lastName].filter(Boolean).join(' ') ||
                req.requestedBy?.email || '—';

              return (
                <Box
                  key={req.id}
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Order Number + Client */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip
                          label={req.order?.orderNumber || '—'}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {clientName}
                        </Typography>
                        {Number(req.reversedAmount ?? 0) > 0 && (
                          <Chip
                            label="Anula venta"
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem' }}
                          />
                        )}
                      </Box>

                      {/* Requester */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary">
                          Solicitado por: {requesterName}
                        </Typography>
                      </Box>

                      {/* Payment method + Amount */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          icon={<>{PAYMENT_METHOD_ICONS[req.paymentMethod] || null}</>}
                          label={PAYMENT_METHOD_LABELS[req.paymentMethod] || req.paymentMethod}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                        <Typography variant="body2" fontWeight={700} color="info.main">
                          {formatCurrency(req.refundAmount)}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                          {formatDate(req.requestedAt)}
                        </Typography>
                      </Box>

                      {/* Ítems anulados */}
                      {!!req.items?.length && (
                        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
                          Anula:{' '}
                          {req.items
                            .map((i) => `${Number(i.quantity)} × ${i.description.trim()}`)
                            .join(', ')}
                          {Number(req.retainedAmount ?? 0) > 0 &&
                            ` · retiene ${formatCurrency(req.retainedAmount ?? 0)}`}
                        </Typography>
                      )}

                      {/* Observation */}
                      {req.observation && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          Motivo: {req.observation}
                        </Typography>
                      )}
                    </Box>

                    {/* Action buttons */}
                    <Stack spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => handleAction(req, 'approve')}
                        sx={{ minWidth: 100, fontSize: '0.75rem' }}
                      >
                        Autorizar
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<CancelIcon />}
                        onClick={() => handleAction(req, 'reject')}
                        sx={{ minWidth: 100, fontSize: '0.75rem' }}
                      >
                        Rechazar
                      </Button>
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {reviewTarget?.action === 'approve'
            ? 'Autorizar Devolución'
            : 'Rechazar Devolución'}
        </DialogTitle>
        <DialogContent>
          {reviewTarget?.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {reviewTarget.request.order?.orderNumber || '—'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto a devolver:</strong> {formatCurrency(reviewTarget.request.refundAmount)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Método:</strong>{' '}
                {PAYMENT_METHOD_LABELS[reviewTarget.request.paymentMethod] || reviewTarget.request.paymentMethod}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong>{' '}
                {[reviewTarget.request.requestedBy?.firstName, reviewTarget.request.requestedBy?.lastName].filter(Boolean).join(' ') ||
                  reviewTarget.request.requestedBy?.email || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Motivo:</strong> {reviewTarget.request.observation}
              </Typography>
              {!!reviewTarget.request.items?.length && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Ítems que se anulan:</strong>{' '}
                  {reviewTarget.request.items
                    .map((i) => `${Number(i.quantity)} × ${i.description.trim()} (${formatCurrency(i.amount)})`)
                    .join(', ')}
                  {Number(reviewTarget.request.retainedAmount ?? 0) > 0 &&
                    `. La empresa retiene ${formatCurrency(reviewTarget.request.retainedAmount ?? 0)}`}
                  .
                </Typography>
              )}
              {reviewTarget.action === 'approve' &&
                !!reviewTarget.request.items?.length &&
                Number(reviewTarget.request.refundAmount) === 0 && (
                  <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                    No hay dinero que devolver: al autorizar, la anulación se
                    aplica de inmediato y baja el saldo de la orden.
                  </Typography>
                )}
              {Number(reviewTarget.request.reversedAmount ?? 0) > 0 && (
                <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
                  <strong>Anula venta:</strong>{' '}
                  {formatCurrency(reviewTarget.request.reversedAmount)}. No es
                  un excedente que se devuelve: es trabajo que deja de
                  facturarse.
                </Typography>
              )}
              {reviewTarget.action === 'approve' &&
                Number(reviewTarget.request.refundAmount) > 0 && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  Autorizar no mueve dinero: la devolución queda pendiente de
                  pago y Caja la registra desde su panel.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={reviewTarget?.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder={
              reviewTarget?.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la devolución...'
            }
            required={reviewTarget?.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewTarget(null)}>Cancelar</Button>
          <Button
            onClick={handleSubmitReview}
            variant="contained"
            color={reviewTarget?.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveMutation.isPending ||
              rejectMutation.isPending ||
              (reviewTarget?.action === 'reject' && !reviewNotes.trim())
            }
          >
            {reviewTarget?.action === 'approve' ? 'Autorizar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PendingRefundRequestsPanel;
