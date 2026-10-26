import React, { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { expenseOrdersApi } from '../../../api/expense-orders.api';
import { ExpenseOrderStatus } from '../../../types/expense-order.types';
import type { ExpenseOrder } from '../../../types/expense-order.types';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { useAuthStore } from '../../../store/authStore';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value);

const userName = (user?: { firstName?: string | null; lastName?: string | null; email: string } | null) => {
  if (!user) return '—';
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return full || user.email;
};

const PendingOgAuthorizationsPanel: React.FC<{ hideWhenEmpty?: boolean }> = ({ hideWhenEmpty }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const currentUser = useAuthStore((state) => state.user);

  const [rejectTarget, setRejectTarget] = useState<ExpenseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: pendingData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['expense-orders', 'pending-caja'],
    queryFn: () => expenseOrdersApi.getAll({ status: ExpenseOrderStatus.ADMIN_AUTHORIZED, limit: 50 }),
    refetchInterval: 30_000,
  });

  const pendingOgs = pendingData?.data ?? [];

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['expense-orders', 'pending-caja'] });
    queryClient.invalidateQueries({ queryKey: ['expense-orders'] });
    queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
  };

  const cajaAuthorizeMutation = useMutation({
    mutationFn: (ogId: string) => expenseOrdersApi.cajaAuthorize(ogId),
    onSuccess: () => {
      invalidateQueries();
      enqueueSnackbar('OG autorizada por Caja y pagada correctamente', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al autorizar la OG', { variant: 'error' });
    },
  });

  const cajaRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      expenseOrdersApi.cajaReject(id, reason),
    onSuccess: () => {
      invalidateQueries();
      enqueueSnackbar('OG rechazada. El solicitante deberá reiniciar el proceso de autorización.', {
        variant: 'warning',
      });
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (error: any) => {
      enqueueSnackbar(error?.response?.data?.message || 'Error al rechazar la OG', { variant: 'error' });
    },
  });

  const handleOpenReject = (og: ExpenseOrder) => {
    setRejectTarget(og);
    setRejectReason('');
  };

  // `disabled={isBusy}` no alcanza: el botón solo se deshabilita cuando React
  // vuelve a renderizar, y dos clics en el mismo frame entran los dos. Autorizar
  // dos veces mueve el dinero dos veces.
  const handleAuthorize = useSingleFlight(async (id: string) => {
    await cajaAuthorizeMutation.mutateAsync(id);
  });

  const handleConfirmReject = useSingleFlight(async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    await cajaRejectMutation.mutateAsync({
      id: rejectTarget.id,
      reason: rejectReason.trim(),
    });
  });

  if (isLoading) return null;
  if (hideWhenEmpty && pendingOgs.length === 0) return null;

  return (
    <>
      <Card
        sx={{
          mb: 2,
          border: pendingOgs.length > 0 ? '1px solid' : undefined,
          borderColor: 'success.main',
        }}
      >
        <CardContent sx={{ pb: pendingOgs.length === 0 ? '16px !important' : undefined }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: pendingOgs.length > 0 ? 1.5 : 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon color="success" fontSize="small" />
              <Typography variant="subtitle2" color="text.secondary">
                Órdenes de Gasto — Pendientes de Firma Caja
              </Typography>
              {pendingOgs.length > 0 && (
                <Badge badgeContent={pendingOgs.length} color="success" sx={{ ml: 1 }} />
              )}
            </Box>
            <Tooltip title="Actualizar lista" arrow>
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
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              </IconButton>
            </Tooltip>
          </Box>

          {pendingOgs.length === 0 && (
            <Typography variant="subtitle2" color="text.disabled" sx={{ mt: 0.2 }}>
              No hay órdenes de gasto pendientes de firma
            </Typography>
          )}

          {pendingOgs.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Estas OGs ya fueron aprobadas por el administrador. Haz clic en{' '}
                <strong>Autorizar</strong> para registrar el pago, o en{' '}
                <strong>Rechazar</strong> si hay algún problema con la solicitud.
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
            </>
          )}

          <Stack spacing={1.5}>
            {pendingOgs.map((og) => {
              const total = og.items.reduce((acc, item) => acc + parseFloat(item.total), 0);
              const isAuthorizing =
                cajaAuthorizeMutation.isPending && cajaAuthorizeMutation.variables === og.id;
              const isRejecting =
                cajaRejectMutation.isPending && cajaRejectMutation.variables?.id === og.id;
              const isBusy = cajaAuthorizeMutation.isPending || cajaRejectMutation.isPending;
              // Quien firmó la OG como admin no la autoriza también en Caja.
              const signedAsAdmin = !!og.authorizedById && og.authorizedById === currentUser?.id;

              return (
                <Box
                  key={og.id}
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
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip
                          label={og.ogNumber}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {og.expenseType.name}
                        </Typography>
                      </Box>

                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        {og.expenseSubcategory.name}
                      </Typography>

                      {og.authorizedBy && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                          <PersonIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          <Typography variant="caption" color="text.secondary">
                            Pre-autorizado por: {userName(og.authorizedBy)}
                          </Typography>
                        </Box>
                      )}

                      <Typography variant="body2" fontWeight={700} color="success.main">
                        {formatCurrency(total)}
                      </Typography>
                    </Box>

                    <Stack spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Tooltip
                        title={
                          signedAsAdmin
                            ? 'La firmaste como admin: la autorización de Caja la debe hacer otra persona'
                            : ''
                        }
                        arrow
                      >
                        <span>
                          <LoadingButton
                            loading={isAuthorizing}
                            variant="contained"
                            color="success"
                            size="small"
                            startIcon={<CheckCircleIcon />}
                            onClick={() => handleAuthorize(og.id)}
                            disabled={isBusy || signedAsAdmin}
                            sx={{ minWidth: 110, fontSize: '0.75rem' }}
                          >
                            {isAuthorizing ? 'Autorizando...' : 'Autorizar'}
                          </LoadingButton>
                        </span>
                      </Tooltip>
                      <LoadingButton
                        loading={isRejecting}
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<CancelIcon />}
                        onClick={() => handleOpenReject(og)}
                        disabled={isBusy}
                        sx={{ minWidth: 110, fontSize: '0.75rem' }}
                      >
                        {isRejecting ? 'Rechazando...' : 'Rechazar'}
                      </LoadingButton>
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {/* Dialog de rechazo */}
      <Dialog
        open={!!rejectTarget}
        onClose={() => !cajaRejectMutation.isPending && setRejectTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rechazar Orden de Gasto</DialogTitle>
        <DialogContent>
          {rejectTarget && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>OG:</strong> {rejectTarget.ogNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Tipo:</strong> {rejectTarget.expenseType.name} —{' '}
                {rejectTarget.expenseSubcategory.name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto:</strong>{' '}
                {formatCurrency(
                  rejectTarget.items.reduce((acc, item) => acc + parseFloat(item.total), 0),
                )}
              </Typography>
              <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
                Al rechazar, la OG volverá al estado <strong>CREADA</strong> y el solicitante
                deberá iniciar nuevamente el proceso de autorización.
              </Typography>
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Motivo del rechazo *"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explique por qué se rechaza esta OG..."
            disabled={cajaRejectMutation.isPending}
            helperText="Este campo es obligatorio (mínimo 5 caracteres)"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRejectTarget(null)}
            disabled={cajaRejectMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmReject}
            variant="contained"
            color="error"
            disabled={cajaRejectMutation.isPending || rejectReason.trim().length < 5}
          >
            {cajaRejectMutation.isPending ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Confirmar Rechazo'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PendingOgAuthorizationsPanel;
