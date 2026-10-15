import React, { useMemo } from 'react';
import { Alert, Box, Card, CardContent, Chip, Grid, Link, Typography } from '@mui/material';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Link as RouterLink } from 'react-router-dom';
import { DataTable } from '../../../components/common/DataTable';
import { PATHS } from '../../../router/paths';
import { PERMISSIONS } from '../../../utils/constants';
import { paymentMethodLabel } from '../../../utils/paymentMethods';
import { useAuthStore } from '../../../store/authStore';
import type {
  PayrollAdvance,
  PayrollAdvanceUser,
} from '../../../types/payroll-period.types';
import { advanceDisbursed } from '../utils/advances';

const formatCOP = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const formatDateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const userName = (u: PayrollAdvanceUser | null | undefined) =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '—' : '';

type ChipColor = 'success' | 'warning' | 'error' | 'info' | 'default';

/** Fila de la tabla: el anticipo aplanado con su firma vigente. */
interface AdvanceRow {
  id: string;
  apNumber: string;
  createdAt: string;
  employee: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  statusLabel: string;
  statusColor: ChipColor;
  requestedBy: string;
  approvedBy: string;
  approvedAt: string | null;
  disbursedBy: string;
  disbursedAt: string | null;
  paymentMethod: string;
  notes: string;
}

const pendingStatus: Record<string, { label: string; color: ChipColor }> = {
  PENDING: { label: 'Pendiente de Gerencia', color: 'warning' },
  ADMIN_APPROVED: { label: 'Pendiente de Caja', color: 'info' },
  ADMIN_REJECTED: { label: 'Rechazado por Gerencia', color: 'error' },
  CAJA_REJECTED: { label: 'Rechazado por Caja', color: 'error' },
  EXPIRED: { label: 'Solicitud vencida', color: 'error' },
};

/**
 * Aplana el anticipo. La aprobación sale de la solicitud de pago que generó el
 * desembolso; si no hay desembolso, de la última solicitud, que explica por qué
 * el anticipo sigue sin pagarse.
 */
const toRow = (a: PayrollAdvance): AdvanceRow => {
  const payment = a.payments.find((p) => !p.isReversed) ?? null;
  const lastRequest = a.paymentAuthRequests[0] ?? null;
  const approval = payment?.paymentAuthRequest ?? lastRequest;

  const total = Number(a.totalAmount);
  const paid = advanceDisbursed(a);

  let status: { label: string; color: ChipColor };
  if (paid > 0 && paid >= total) status = { label: 'Desembolsado', color: 'success' };
  else if (paid > 0) status = { label: 'Desembolso parcial', color: 'warning' };
  else if (lastRequest) status = pendingStatus[lastRequest.status] ?? { label: lastRequest.status, color: 'default' };
  else status = { label: 'Sin solicitud de pago', color: 'default' };

  const notes = [
    lastRequest && !payment ? lastRequest.cajaRejectionReason || lastRequest.adminNotes : null,
    approval?.reason,
    payment?.reference ? `Ref. ${payment.reference}` : null,
    payment?.notes,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: a.id,
    apNumber: a.apNumber,
    createdAt: a.createdAt,
    employee: userName(a.beneficiaryUser) || 'Empleado',
    description: a.description,
    totalAmount: total,
    paidAmount: paid,
    statusLabel: status.label,
    statusColor: status.color,
    requestedBy: userName(approval?.requestedBy ?? a.createdBy),
    approvedBy: userName(approval?.adminReviewedBy),
    approvedAt: approval?.adminReviewedAt ?? null,
    disbursedBy: payment ? userName(payment.paymentAuthRequest?.cajaReviewedBy ?? payment.registeredBy) : '',
    disbursedAt: payment ? payment.paymentAuthRequest?.cajaReviewedAt ?? payment.createdAt : null,
    paymentMethod: payment ? paymentMethodLabel(payment.paymentMethod) : '',
    notes,
  };
};

/** Nombre arriba y fecha/hora debajo, o un guion si ese paso no ocurrió. */
const PersonAtCell: React.FC<{ name: string; at: string | null }> = ({ name, at }) =>
  name ? (
    <Box sx={{ lineHeight: 1.3, py: 0.5 }}>
      <Typography variant="body2" noWrap>{name}</Typography>
      {at && (
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {formatDateTime(at)}
        </Typography>
      )}
    </Box>
  ) : (
    <Typography variant="body2" color="text.disabled">—</Typography>
  );

interface PayrollAdvancesTabProps {
  advances: PayrollAdvance[];
  loading: boolean;
}

export const PayrollAdvancesTab: React.FC<PayrollAdvancesTabProps> = ({ advances, loading }) => {
  const { hasPermission } = useAuthStore();
  const canOpenAccountPayable = hasPermission(PERMISSIONS.READ_ACCOUNTS_PAYABLE);

  const rows = useMemo(() => advances.map(toRow), [advances]);
  const total = rows.reduce((s, r) => s + r.totalAmount, 0);
  const paid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const notDisbursed = rows.filter((r) => r.paidAmount < r.totalAmount);

  const columns: GridColDef<AdvanceRow>[] = [
    {
      field: 'createdAt',
      headerName: 'Solicitado',
      width: 170,
      valueFormatter: (value: string) => formatDateTime(value),
    },
    {
      field: 'apNumber',
      headerName: 'CP',
      width: 130,
      renderCell: (params: GridRenderCellParams<AdvanceRow>) =>
        canOpenAccountPayable ? (
          <Link
            component={RouterLink}
            to={PATHS.ACCOUNTS_PAYABLE_DETAIL.replace(':id', params.row.id)}
            underline="hover"
          >
            {params.row.apNumber}
          </Link>
        ) : (
          params.row.apNumber
        ),
    },
    { field: 'employee', headerName: 'Empleado', flex: 1, minWidth: 200 },
    {
      field: 'totalAmount',
      headerName: 'Monto',
      width: 120,
      type: 'number',
      valueFormatter: (value: number) => formatCOP(value),
    },
    {
      field: 'statusLabel',
      headerName: 'Estado',
      width: 190,
      renderCell: (params: GridRenderCellParams<AdvanceRow>) => (
        <Chip label={params.row.statusLabel} color={params.row.statusColor} size="small" />
      ),
    },
    {
      field: 'approvedBy',
      headerName: 'Aprobó (Gerencia)',
      width: 210,
      renderCell: (params: GridRenderCellParams<AdvanceRow>) => (
        <PersonAtCell name={params.row.approvedBy} at={params.row.approvedAt} />
      ),
    },
    {
      field: 'disbursedBy',
      headerName: 'Desembolsó (Caja)',
      width: 210,
      renderCell: (params: GridRenderCellParams<AdvanceRow>) => (
        <PersonAtCell name={params.row.disbursedBy} at={params.row.disbursedAt} />
      ),
    },
    { field: 'paymentMethod', headerName: 'Método', width: 130 },
    { field: 'requestedBy', headerName: 'Solicitó', width: 190 },
    { field: 'description', headerName: 'Descripción', width: 240 },
    { field: 'notes', headerName: 'Observaciones', width: 260 },
  ];

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total vinculado</Typography>
              <Typography variant="h6" fontWeight="bold">{formatCOP(total)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {rows.length} anticipo{rows.length === 1 ? '' : 's'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Desembolsado (a descontar)</Typography>
              <Typography variant="h6" fontWeight="bold" color="success.main">{formatCOP(paid)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Sin desembolsar</Typography>
              <Typography
                variant="h6"
                fontWeight="bold"
                color={total - paid > 0 ? 'error.main' : 'text.primary'}
              >
                {formatCOP(total - paid)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {notDisbursed.length} anticipo{notDisbursed.length === 1 ? '' : 's'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {notDisbursed.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Hay {notDisbursed.length} anticipo{notDisbursed.length === 1 ? '' : 's'} vinculado
          {notDisbursed.length === 1 ? '' : 's'} a este periodo que Caja no ha desembolsado
          ({formatCOP(total - paid)}). Esa parte no se suma al descuento de anticipos de la nómina.
        </Alert>
      )}

      <DataTable
        density="comfortable"
        pageSize={20}
        pageSizeOptions={[20, 50, 100]}
        rows={rows}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar empleado, CP o aprobador..."
        emptyMessage="No hay anticipos vinculados a este periodo."
      />
    </Box>
  );
};
