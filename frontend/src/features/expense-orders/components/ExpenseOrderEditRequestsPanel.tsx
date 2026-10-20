import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { GridActionsCellItem, GridColDef } from '@mui/x-data-grid';
import { CheckCircle as CheckCircleIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { DataTable } from '../../../components/common/DataTable';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { expenseOrderEditRequestsApi } from '../../../api/expense-order-edit-requests.api';
import { useExpenseOrderEditRequestsInbox } from '../hooks/useExpenseOrderEditRequestsInbox';
import type { ExpenseOrderEditRequest } from '../../../types/expense-order-edit-request.types';

type ViewMode = 'pending' | 'history';

const STATUS_LABELS: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  PENDING: { label: 'Pendiente', color: 'warning' },
  APPROVED: { label: 'Aprobada', color: 'success' },
  REJECTED: { label: 'Rechazada', color: 'error' },
  EXPIRED: { label: 'Expirada', color: 'default' },
};

const formatDateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '-';

const apiMessage = (error: unknown) =>
  isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;

const getUserName = (user?: { firstName?: string | null; lastName?: string | null; email: string } | null) => {
  if (!user) return '-';
  return user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email;
};

interface ExpenseOrderEditRequestsPanelProps {
  viewMode: ViewMode;
  canApprove: boolean;
}

export const ExpenseOrderEditRequestsPanel: React.FC<ExpenseOrderEditRequestsPanelProps> = ({
  viewMode,
  canApprove,
}) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { rows, isLoading } = useExpenseOrderEditRequestsInbox(viewMode, canApprove);

  const [review, setReview] = useState<{
    request: ExpenseOrderEditRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ request: null, action: null });
  const [notes, setNotes] = useState('');

  const close = () => {
    setReview({ request: null, action: null });
    setNotes('');
  };

  const onDone = (message: string, variant: 'success' | 'info') => {
    queryClient.invalidateQueries({ queryKey: ['ogEditRequests'] });
    enqueueSnackbar(message, { variant });
    close();
  };
  const onError = (error: unknown) =>
    enqueueSnackbar(apiMessage(error) || 'No se pudo procesar la solicitud', {
      variant: 'error',
    });

  const approveMutation = useMutation({
    mutationFn: ({ id, reviewNotes }: { id: string; reviewNotes?: string }) =>
      expenseOrderEditRequestsApi.approve(id, reviewNotes),
    onSuccess: () => onDone('Edición aprobada. El solicitante ya puede corregir la OG.', 'success'),
    onError,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reviewNotes }: { id: string; reviewNotes: string }) =>
      expenseOrderEditRequestsApi.reject(id, reviewNotes),
    onSuccess: () => onDone('Solicitud de edición rechazada', 'info'),
    onError,
  });

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const handleConfirm = () => {
    if (!review.request || isPending) return;
    if (review.action === 'approve') {
      approveMutation.mutate({ id: review.request.id, reviewNotes: notes.trim() || undefined });
    } else if (review.action === 'reject' && notes.trim()) {
      rejectMutation.mutate({ id: review.request.id, reviewNotes: notes.trim() });
    }
  };

  const columns: GridColDef<ExpenseOrderEditRequest>[] = [
    {
      field: 'ogNumber',
      headerName: 'Nº OG',
      width: 150,
      valueGetter: (_, row) => row.expenseOrder?.ogNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.expenseOrder && navigate(`/expense-orders/${params.row.expenseOrder.id}`)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'reason',
      headerName: 'Qué hay que corregir',
      flex: 1,
      minWidth: 260,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const config = STATUS_LABELS[params.value] || { label: params.value, color: 'default' };
        const used = params.row.status === 'APPROVED' && params.row.consumedAt;
        return (
          <Chip
            label={used ? 'Aprobada · usada' : config.label}
            color={config.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApprove
      ? [
          {
            field: 'actions',
            type: 'actions' as const,
            headerName: 'Acciones',
            width: 120,
            getActions: (params: { row: ExpenseOrderEditRequest }) =>
              params.row.status !== 'PENDING'
                ? []
                : [
                    <GridActionsCellItem
                      key="approve"
                      icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
                      label="Aprobar"
                      onClick={() => setReview({ request: params.row, action: 'approve' })}
                    />,
                    <GridActionsCellItem
                      key="reject"
                      icon={<CancelIcon sx={{ color: 'error.main' }} />}
                      label="Rechazar"
                      onClick={() => setReview({ request: params.row, action: 'reject' })}
                    />,
                  ],
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        getRowId={(row) => row.id}
        density="compact"
        pageSize={20}
        pageSizeOptions={[20, 50, 100]}
      />

      <Dialog open={!!review.request} onClose={isPending ? undefined : close} maxWidth="sm" fullWidth>
        <DialogTitle>
          {review.action === 'approve' ? 'Aprobar edición de OG pagada' : 'Rechazar edición de OG pagada'}
        </DialogTitle>
        <DialogContent>
          {review.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>OG:</strong> {review.request.expenseOrder?.ogNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(review.request.requestedBy)}
              </Typography>
              <Typography variant="body2">
                <strong>Qué hay que corregir:</strong> {review.request.reason}
              </Typography>
            </Box>
          )}
          {review.action === 'approve' && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              El solicitante podrá editar la OG una vez en las próximas 24 horas. Si el total sube,
              la diferencia queda pendiente en la cuenta por pagar de la OG.
            </Typography>
          )}
          <TextField
            fullWidth
            multiline
            rows={3}
            label={review.action === 'approve' ? 'Notas (opcional)' : 'Motivo del rechazo *'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required={review.action === 'reject'}
            disabled={isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={isPending}>
            Cancelar
          </Button>
          <LoadingButton
            onClick={handleConfirm}
            variant="contained"
            color={review.action === 'approve' ? 'success' : 'error'}
            loading={isPending}
            disabled={review.action === 'reject' && !notes.trim()}
          >
            {review.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
};
