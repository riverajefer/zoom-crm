import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Typography,
  Stack,
  Divider,
  Alert,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { AutoAwesome, Edit, KeyboardArrowDown, ReceiptLong } from '@mui/icons-material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { DataTable } from '../../../components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { usePayrollPeriods } from '../hooks/usePayrollPeriods';
import { usePayrollItems } from '../hooks/usePayrollItems';
import { payrollPeriodsApi } from '../../../api/payroll-periods.api';
import { getItemColumns } from '../config/columns';
import { PayrollAdvancesTab } from '../components/PayrollAdvancesTab';
import { RegisterPayrollPaymentDialog } from '../components/RegisterPayrollPaymentDialog';
import { PayrollPaymentsDialog } from '../components/PayrollPaymentsDialog';
import { apiErrorMessage, itemPaymentStatus } from '../utils/payments';
import type { PayrollPaymentStatus } from '../../../types/payroll-item.types';
import { advanceDisbursed, advanceNotDisbursed, sumDisbursed, sumNotDisbursed } from '../utils/advances';
import { generatePayrollSlipsPdf } from '../utils/generatePayrollSlipPdf';
import type { PayrollItem } from '../../../types/payroll-item.types';
import { PATHS } from '../../../router/paths';
import { PERMISSIONS } from '../../../utils/constants';
import { useAuthStore } from '../../../store/authStore';

const formatCOP = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const periodStatusColor: Record<string, 'default' | 'warning' | 'info' | 'success'> = {
  DRAFT: 'default',
  IN_PROGRESS: 'warning',
  CALCULATED: 'info',
  PAID: 'success',
};

const periodStatusLabel: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En curso',
  CALCULATED: 'Calculado',
  PAID: 'Pagado',
};

const PayrollPeriodDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission(PERMISSIONS.UPDATE_PAYROLL_PERIODS);
  const canPay = hasPermission(PERMISSIONS.PAY_PAYROLL);
  const canVoidPayments = hasPermission(PERMISSIONS.VOID_PAYROLL_PAYMENTS);

  const { getPeriodQuery, getSummaryQuery, generateItemsMutation, updateMutation } = usePayrollPeriods();
  const periodQuery = getPeriodQuery(id!);
  const summaryQuery = getSummaryQuery(id!);
  const { itemsQuery, deleteMutation } = usePayrollItems(id!);
  const advancesQuery = useQuery({
    queryKey: ['payroll-advances', id],
    queryFn: () => payrollPeriodsApi.getAdvances(id!),
    enabled: !!id,
  });

  const [toDelete, setToDelete] = useState<PayrollItem | null>(null);
  const [statusAnchorEl, setStatusAnchorEl] = useState<null | HTMLElement>(null);
  const [generatingSlips, setGeneratingSlips] = useState(false);
  // Control de pagos uno a uno: a quién se le paga ahora y de quién se ve el historial.
  const [payItem, setPayItem] = useState<PayrollItem | null>(null);
  const [paymentsItemId, setPaymentsItemId] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | PayrollPaymentStatus>('ALL');
  // La pestaña vive en la URL para poder compartir el enlace directo a los anticipos.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'anticipos' ? 'anticipos' : 'registros';
  const setTab = (value: 'registros' | 'anticipos') =>
    setSearchParams(value === 'registros' ? {} : { tab: value }, { replace: true });

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: { status: newStatus as any },
      });
      enqueueSnackbar('Estado actualizado', { variant: 'success' });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Error al actualizar el estado';
      enqueueSnackbar(msg, { variant: 'error' });
    } finally {
      setStatusAnchorEl(null);
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateItemsMutation.mutateAsync(id!);
      enqueueSnackbar(result.message, { variant: 'success' });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Error al generar registros';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  // Un solo PDF con el desprendible de cada empleado del periodo, uno por página.
  const handleGenerateAllSlips = async () => {
    const currentItems = itemsQuery.data ?? [];
    if (!periodQuery.data || currentItems.length === 0) return;

    setGeneratingSlips(true);
    try {
      const doc = await generatePayrollSlipsPdf(currentItems, periodQuery.data);
      const slug = periodQuery.data.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      doc.save(`Desprendibles_${slug}.pdf`);
    } catch (error) {
      console.error('Error generando los desprendibles del periodo', error);
      enqueueSnackbar('No se pudieron generar los desprendibles', { variant: 'error' });
    } finally {
      setGeneratingSlips(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!toDelete) return;
    try {
      await deleteMutation.mutateAsync(toDelete.id);
      enqueueSnackbar('Registro eliminado', { variant: 'success' });
      setToDelete(null);
    } catch (err) {
      enqueueSnackbar(apiErrorMessage(err, 'Error al eliminar registro'), { variant: 'error' });
    }
  };

  if (periodQuery.isLoading) return <LoadingSpinner />;

  const period = periodQuery.data;
  if (!period) return <Alert severity="error">Periodo no encontrado</Alert>;

  const items = itemsQuery.data ?? [];
  const summary = summaryQuery.data;

  // Anticipos vinculados agrupados por empleado beneficiario. Solo se descuenta
  // lo que Caja desembolsó; lo rechazado o vencido se muestra aparte.
  const advances = advancesQuery.data ?? [];
  const advancesTotal = sumDisbursed(advances);
  const advancesNotDisbursed = sumNotDisbursed(advances);
  const notDisbursedCount = advances.filter((a) => advanceNotDisbursed(a) > 0).length;
  const advancesByEmployee = advances.reduce<
    Record<string, { name: string; total: number; notDisbursed: number; count: number }>
  >(
    (acc, a) => {
      const key = a.beneficiaryUser?.id ?? 'sin-empleado';
      const name =
        `${a.beneficiaryUser?.firstName ?? ''} ${a.beneficiaryUser?.lastName ?? ''}`.trim() ||
        a.beneficiaryUser?.email ||
        'Empleado';
      if (!acc[key]) acc[key] = { name, total: 0, notDisbursed: 0, count: 0 };
      acc[key].total += advanceDisbursed(a);
      acc[key].notDisbursed += advanceNotDisbursed(a);
      acc[key].count += 1;
      return acc;
    },
    {},
  );

  const columns = getItemColumns(
    (item) =>
      navigate(
        PATHS.PAYROLL_ITEM_EDIT.replace(':periodId', id!).replace(':itemId', item.id),
      ),
    (item) => setToDelete(item),
    period,
    {
      onPay: canPay ? (item) => setPayItem(item) : undefined,
      onViewPayments: (item) => setPaymentsItemId(item.id),
    },
  );

  const statusCount = summary?.paymentStatusCount;
  const pendingCount = statusCount ? statusCount.PENDING + statusCount.PARTIAL : 0;
  const filteredItems =
    paymentFilter === 'ALL' ? items : items.filter((i) => itemPaymentStatus(i) === paymentFilter);
  // Se busca en la lista viva para que el historial se refresque tras anular.
  const paymentsItem = items.find((i) => i.id === paymentsItemId) ?? null;

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title={period.name}
        subtitle={`${new Date(period.startDate).toLocaleDateString('es-CO')} — ${new Date(period.endDate).toLocaleDateString('es-CO')}`}
        breadcrumbs={[
          { label: 'Periodos', path: PATHS.PAYROLL_PERIODS },
          { label: period.name },
        ]}
      />

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Estado</Typography>
              <Chip
                label={periodStatusLabel[period.status] ?? period.status}
                color={periodStatusColor[period.status] ?? 'default'}
                sx={{ mt: 0.5, cursor: canEdit ? 'pointer' : 'default' }}
                onClick={canEdit ? (e) => setStatusAnchorEl(e.currentTarget) : undefined}
                onDelete={canEdit ? (e) => setStatusAnchorEl(e.currentTarget) : undefined}
                deleteIcon={canEdit ? <KeyboardArrowDown /> : undefined}
              />
              <Menu
                anchorEl={statusAnchorEl}
                open={Boolean(statusAnchorEl)}
                onClose={() => setStatusAnchorEl(null)}
              >
                <MenuItem onClick={() => handleStatusChange('DRAFT')} disabled={period.status === 'DRAFT' || updateMutation.isPending}>
                  Borrador
                </MenuItem>
                <MenuItem onClick={() => handleStatusChange('IN_PROGRESS')} disabled={period.status === 'IN_PROGRESS' || updateMutation.isPending}>
                  En curso
                </MenuItem>
                <MenuItem onClick={() => handleStatusChange('CALCULATED')} disabled={period.status === 'CALCULATED' || updateMutation.isPending}>
                  Calculado
                </MenuItem>
                {/* «Pagado» se pone solo al registrar el pago de todos. */}
                <MenuItem
                  onClick={() => handleStatusChange('PAID')}
                  disabled={period.status === 'PAID' || updateMutation.isPending || pendingCount > 0}
                >
                  Pagado
                  {pendingCount > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      (falta pagarle a {pendingCount})
                    </Typography>
                  )}
                </MenuItem>
              </Menu>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Empleados</Typography>
              <Typography variant="h5" fontWeight="bold">{summary?.employeeCount ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total a Pagar</Typography>
              <Typography variant="h5" fontWeight="bold" color="success.main">
                {summary ? formatCOP(summary.totalPayment) : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Costo Total (incl. SS y fondo)</Typography>
              <Typography variant="h5" fontWeight="bold" color="primary.main">
                {summary ? formatCOP(summary.totalPayrollCost) : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        {/* Solo aparece si alguien tiene ahorro al fondo: es el monto a girarle. */}
        {!!summary?.totalEmployeeFundSavings && (
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Ahorro fondo de empleados
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="warning.main">
                  {formatCOP(summary.totalEmployeeFundSavings)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Control de pagos: cuánto salió en efectivo, cuánto por transferencia y cuánto falta */}
      {summary && items.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">Pagados</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {statusCount?.PAID ?? 0} de {summary.employeeCount}
                </Typography>
                {!!statusCount?.PARTIAL && (
                  <Typography variant="caption" color="warning.main">
                    {statusCount.PARTIAL} con abono
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">Pagado en efectivo</Typography>
                <Typography variant="h5" fontWeight="bold">{formatCOP(summary.totalPaidCash)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">Pagado por transferencia</Typography>
                <Typography variant="h5" fontWeight="bold">{formatCOP(summary.totalPaidTransfer)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">Pendiente por pagar</Typography>
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  color={summary.totalPending > 0 ? 'warning.main' : 'success.main'}
                >
                  {formatCOP(summary.totalPending)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Overtime rates info */}
      {(period.overtimeDaytimeRate || period.overtimeNighttimeRate) && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Hora extra diurna: <strong>{formatCOP(period.overtimeDaytimeRate)}/h</strong>
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Typography variant="body2" color="text.secondary">
            Hora extra nocturna: <strong>{formatCOP(period.overtimeNighttimeRate)}/h</strong>
          </Typography>
        </Stack>
      )}

      {/* Actions */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        {canEdit && (
          <>
            <Button
              variant="outlined"
              startIcon={<AutoAwesome />}
              onClick={handleGenerate}
              disabled={generateItemsMutation.isPending}
            >
              {generateItemsMutation.isPending ? 'Generando...' : 'Generar para todos los activos'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Edit />}
              onClick={() => navigate(PATHS.PAYROLL_PERIODS_EDIT.replace(':id', id!))}
            >
              Editar Periodo
            </Button>
          </>
        )}
        {/* Imprimir no requiere permiso de edición: basta con poder ver el periodo. */}
        <Button
          variant="outlined"
          startIcon={<ReceiptLong />}
          onClick={handleGenerateAllSlips}
          disabled={generatingSlips || items.length === 0}
        >
          {generatingSlips ? 'Generando...' : 'Desprendibles del periodo'}
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="registros" label={`Registros de nómina (${items.length})`} />
        <Tab value="anticipos" label={`Anticipos (${advances.length})`} />
      </Tabs>

      {tab === 'anticipos' && (
        <PayrollAdvancesTab advances={advances} loading={advancesQuery.isLoading} />
      )}

      {/* Anticipos vinculados al periodo */}
      {tab === 'registros' && advances.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
            {advances.length} anticipo(s) vinculado(s) — a descontar {formatCOP(advancesTotal)}
          </Typography>
          {advancesNotDisbursed > 0 && (
            <Typography variant="body2" color="warning.main" sx={{ mb: 0.5 }}>
              No incluye {formatCOP(advancesNotDisbursed)} de {notDisbursedCount} anticipo
              {notDisbursedCount === 1 ? '' : 's'} que Caja no desembolsó: no se descuentan.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Abre el registro de cada empleado para aplicar el descuento de anticipos.{' '}
            <Button size="small" sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline' }} onClick={() => setTab('anticipos')}>
              Ver detalle de cada anticipo
            </Button>
          </Typography>
          <Stack spacing={0.25}>
            {Object.values(advancesByEmployee).map((e) => (
              <Typography key={e.name} variant="body2">
                {e.name}: <strong>{formatCOP(e.total)}</strong>{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  ({e.count} anticipo{e.count > 1 ? 's' : ''})
                </Typography>
                {e.notDisbursed > 0 && (
                  <Typography component="span" variant="caption" color="warning.main">
                    {' '}· {formatCOP(e.notDisbursed)} sin desembolsar
                  </Typography>
                )}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Filtro para trabajar la lista como checklist de pagos */}
      {tab === 'registros' && items.length > 0 && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={paymentFilter}
          onChange={(_, v) => v && setPaymentFilter(v)}
          sx={{ mb: 1.5, flexWrap: 'wrap' }}
        >
          <ToggleButton value="ALL">Todos ({items.length})</ToggleButton>
          <ToggleButton value="PENDING">Pendientes ({statusCount?.PENDING ?? 0})</ToggleButton>
          <ToggleButton value="PARTIAL">Abonados ({statusCount?.PARTIAL ?? 0})</ToggleButton>
          <ToggleButton value="PAID">Pagados ({statusCount?.PAID ?? 0})</ToggleButton>
        </ToggleButtonGroup>
      )}

      {/* Items table */}
      {tab === 'registros' && (
        <DataTable
          density="compact"
          pageSize={20}
          pageSizeOptions={[20, 50, 100]}
          rows={filteredItems}
          columns={columns}
          loading={itemsQuery.isLoading}
          onAdd={canEdit ? () => navigate(PATHS.PAYROLL_ITEM_EDIT.replace(':periodId', id!).replace(':itemId', 'new')) : undefined}
          addButtonText="Agregar Registro"
          searchPlaceholder="Buscar empleado..."
          emptyMessage="No hay registros de nómina. Usa 'Generar para todos los activos' para crearlos automáticamente."
        />
      )}

      <RegisterPayrollPaymentDialog
        periodId={id!}
        item={payItem}
        onClose={() => setPayItem(null)}
      />
      <PayrollPaymentsDialog
        periodId={id!}
        item={paymentsItem}
        canVoid={canVoidPayments}
        onClose={() => setPaymentsItemId(null)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar registro de nómina"
        message={`¿Eliminar el registro de ${toDelete?.employee?.user?.firstName} ${toDelete?.employee?.user?.lastName}?`}
        onConfirm={handleDeleteItem}
        onCancel={() => setToDelete(null)}
        isLoading={deleteMutation.isPending}
        confirmText="Eliminar"
        severity="error"
      />
    </Box>
  );
};

export default PayrollPeriodDetailPage;
