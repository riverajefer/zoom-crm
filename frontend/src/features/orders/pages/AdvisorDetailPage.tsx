import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  EmojiEvents as GoalIcon,
  LocalShipping as DeliveredIcon,
} from '@mui/icons-material';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { OrderStatusChip } from '../components';
import { useAdvisorTracking, useOrders, useSalesGoals, useSalesSummary } from '../hooks';
import {
  DELIVERED_STATUSES,
  MONTHS,
  STATUS_COLUMNS,
  statusLabel,
} from '../utils/orderTrackingPivot';
import { computeGoalProgress } from '../utils/goalProgress';
import { ROUTES } from '../../../utils/constants';
import type {
  AdvisorTrackingRow,
  FilterOrdersDto,
  Order,
  OrderStatus,
} from '../../../types/order.types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1];

const pad = (n: number) => String(n).padStart(2, '0');

/** Los filtros que un chip puede aplicar sobre la tabla. */
type ChipFilter = Pick<FilterOrdersDto, 'status' | 'paymentStatus' | 'deliveryStatus'>;

const EMPTY_FILTER: ChipFilter = {};

const sameFilter = (a: ChipFilter, b: ChipFilter) =>
  a.status === b.status &&
  a.paymentStatus === b.paymentStatus &&
  a.deliveryStatus === b.deliveryStatus;

// ─── página ───────────────────────────────────────────────────────────────────

export const AdvisorDetailPage: React.FC = () => {
  const { advisorId = '' } = useParams<{ advisorId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const now = new Date();
  const [month, setMonth] = useState(
    Number(searchParams.get('month')) || now.getMonth() + 1,
  );
  const [year, setYear] = useState(Number(searchParams.get('year')) || now.getFullYear());

  const [chipFilter, setChipFilter] = useState<ChipFilter>(EMPTY_FILTER);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

  const trackingQuery = useAdvisorTracking({ month, year, advisorId });
  const { goalsQuery } = useSalesGoals({ month, year, advisorId });
  // El avance contra la meta suma las ventas del asesor en todas las sedes
  // (docs/PLAN_SEDES.md §10); el listado de OP de abajo es el de la sede activa.
  const summaryQuery = useSalesSummary({
    createdById: advisorId,
    orderDateFrom: monthStart,
    orderDateTo: monthEnd,
    acrossLocations: true,
  });

  const { ordersQuery } = useOrders({
    createdById: advisorId,
    orderDateFrom: monthStart,
    orderDateTo: monthEnd,
    ...chipFilter,
    search: search || undefined,
    page,
    limit,
  });

  const rows = useMemo<AdvisorTrackingRow[]>(
    () => trackingQuery.data?.rows ?? [],
    [trackingQuery.data],
  );

  const advisorName =
    rows[0]?.advisorName ||
    `${goalsQuery.data?.[0]?.advisor.firstName ?? ''} ${goalsQuery.data?.[0]?.advisor.lastName ?? ''}`.trim() ||
    'Asesor';

  const summary = summaryQuery.data;
  const goal = goalsQuery.data?.[0];

  /**
   * `getSalesSummary` no arma `advisorBreakdown` cuando se filtra por un asesor,
   * pero los totales de la respuesta ya son los suyos: los adaptamos a la misma
   * forma para reusar el cálculo de la tarjeta de metas.
   */
  const progress = computeGoalProgress(
    summary
      ? {
          advisorId,
          advisorName,
          totalRevenue: summary.totalRevenue,
          totalSubtotal: summary.totalSubtotal,
          totalDiscounts: summary.totalDiscounts,
          totalNetSubtotal: summary.totalNetSubtotal,
          totalOrders: summary.totalOrders,
          commissionableNetSubtotal: summary.commissionableNetSubtotal,
          commissionableOrders: summary.commissionableOrders,
          gapNetSubtotal: summary.gapNetSubtotal,
          gapOrders: summary.gapOrders,
        }
      : undefined,
    goal?.targetAmount ?? 0,
  );

  // ── Chips de desglose ───────────────────────────────────────────────────────

  const countBy = (filter: (r: AdvisorTrackingRow) => boolean) =>
    rows.filter(filter).reduce((acc, r) => acc + r.count, 0);

  const totalOrders = countBy(() => true);

  const statusChips = STATUS_COLUMNS.map((c, i) => ({
    key: c.value,
    label: statusLabel(i),
    count: countBy((r) => r.status === c.value),
    filter: { status: c.value as OrderStatus } as ChipFilter,
    color: c.value === 'DELIVERED' ? ('success' as const) : ('default' as const),
  })).filter((c) => c.count > 0);

  const conditionChips = [
    {
      key: 'paid',
      label: 'Pagadas al 100%',
      count: countBy((r) => r.paid),
      filter: { paymentStatus: 'PAID' } as ChipFilter,
      color: 'success' as const,
    },
    {
      key: 'due',
      label: 'Con saldo',
      count: countBy((r) => !r.paid),
      filter: { paymentStatus: 'PENDING' } as ChipFilter,
      color: 'warning' as const,
    },
    {
      key: 'gap',
      label: 'Pagadas sin entregar',
      count: countBy(
        (r) => r.paid && !DELIVERED_STATUSES.includes(r.status) && r.status !== 'ANULADO',
      ),
      filter: { paymentStatus: 'PAID', deliveryStatus: 'PENDING' } as ChipFilter,
      color: 'warning' as const,
    },
  ].filter((c) => c.count > 0);

  /** Cambiar de recorte reinicia la paginación: la página 3 del filtro anterior no existe. */
  const applyFilter = (filter: ChipFilter) => {
    setChipFilter((prev) => (sameFilter(prev, filter) ? EMPTY_FILTER : filter));
    setPage(1);
  };

  // ── Tabla ───────────────────────────────────────────────────────────────────

  const columns: GridColDef<Order>[] = [
    { field: 'orderNumber', headerName: 'N° Orden', width: 140 },
    {
      field: 'orderDate',
      headerName: 'Fecha',
      width: 110,
      valueFormatter: (value: string) =>
        value ? new Date(value).toLocaleDateString('es-CO') : '—',
    },
    {
      field: 'client',
      headerName: 'Cliente',
      flex: 1,
      minWidth: 180,
      valueGetter: (_value, row) => row.client?.name ?? '—',
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 150,
      renderCell: (params) => <OrderStatusChip status={params.row.status} />,
      sortable: false,
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value: string | number) => formatCurrency(Number(value ?? 0)),
    },
    {
      field: 'balance',
      headerName: 'Saldo',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const balance = Number(params.row.balance ?? 0);
        return (
          <Typography
            variant="body2"
            fontWeight={balance > 0 ? 700 : 400}
            color={balance > 0 ? 'warning.main' : 'text.secondary'}
          >
            {balance > 0 ? formatCurrency(balance) : 'Pagada'}
          </Typography>
        );
      },
    },
  ];

  const orders = ordersQuery.data?.data ?? [];
  const isLoadingHeader = trackingQuery.isLoading || summaryQuery.isLoading;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (trackingQuery.isError) {
    return (
      <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
        <Alert
          severity="error"
          action={
            <Button size="small" onClick={() => navigate(ROUTES.SALES_BY_ADVISOR)}>
              Volver
            </Button>
          }
        >
          No tienes permiso para ver el seguimiento de OP de este asesor.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title={advisorName}
        breadcrumbs={[
          { label: 'Comercial' },
          { label: 'Ventas por Asesor', path: ROUTES.SALES_BY_ADVISOR },
          { label: advisorName },
        ]}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              select
              size="small"
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
              sx={{ width: 130 }}
            >
              {MONTHS.map((m, i) => (
                <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
              sx={{ width: 90 }}
            >
              {YEAR_OPTIONS.map((y) => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="outlined"
              startIcon={<BackIcon />}
              onClick={() => navigate(ROUTES.SALES_BY_ADVISOR)}
            >
              Volver
            </Button>
          </Box>
        }
      />

      {/* Meta y avance del mes */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          {isLoadingHeader ? (
            <Skeleton variant="rounded" height={90} />
          ) : !goal ? (
            <Alert severity="info" icon={<GoalIcon fontSize="inherit" />}>
              {advisorName} no tiene meta configurada para {MONTHS[month - 1]} {year}.
              Abajo puedes revisar igualmente sus OP del mes.
            </Alert>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: 2,
                alignItems: 'center',
              }}
            >
              {[
                { t: 'Meta del mes', v: formatCurrency(progress.target), c: 'text.primary' },
                {
                  t: 'Comisionable',
                  v: formatCurrency(progress.commissionable),
                  s: `${summary?.commissionableOrders ?? 0} OP ${
                    (summary?.commissionableOrders ?? 0) === 1
                      ? 'entregada y pagada'
                      : 'entregadas y pagadas'
                  }`,
                  c: 'success.main',
                },
                {
                  t: 'Vendido (sin IVA)',
                  v: formatCurrency(progress.sold),
                  s: `${summary?.totalOrders ?? 0} OP del mes`,
                  c: 'text.secondary',
                },
                {
                  t: 'Avance',
                  v: `${progress.pct.toFixed(1)}%`,
                  s: progress.diff >= 0
                    ? `+${formatCurrency(progress.diff)} sobre la meta`
                    : `${formatCurrency(Math.abs(progress.diff))} por alcanzar`,
                  c: progress.statusColor === 'success' ? 'success.main'
                    : progress.statusColor === 'warning' ? 'warning.main'
                    : 'error.main',
                },
              ].map((k) => (
                <Box key={k.t}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                    {k.t}
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: k.c }}>
                    {k.v}
                  </Typography>
                  {k.s && (
                    <Typography variant="caption" color="text.secondary">{k.s}</Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {!isLoadingHeader && progress.gapOrders > 0 && (
            <Alert severity="warning" icon={<DeliveredIcon />} sx={{ mt: 2 }}>
              <strong>{progress.gapOrders} OP ya pagadas al 100% sin marcar como entregadas</strong>
              {' — '}
              {formatCurrency(progress.gapAmount)} que no comisionan hasta registrar la entrega.
              Usa el chip «Pagadas sin entregar» para verlas.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Desglose por estado y pago: los chips filtran la tabla */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Filtra la tabla por estado o por condición de pago. Vuelve a hacer clic en el
            chip activo para quitar el filtro.
          </Typography>

          {trackingQuery.isLoading ? (
            <Skeleton variant="rounded" height={40} />
          ) : totalOrders === 0 ? (
            <Alert severity="info">
              No hay OP registradas en {MONTHS[month - 1]} de {year}.
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                label={`Todas ${totalOrders}`}
                color={sameFilter(chipFilter, EMPTY_FILTER) ? 'primary' : 'default'}
                variant={sameFilter(chipFilter, EMPTY_FILTER) ? 'filled' : 'outlined'}
                onClick={() => applyFilter(EMPTY_FILTER)}
                sx={{ fontWeight: 700 }}
              />
              <Divider orientation="vertical" flexItem />
              {statusChips.map((c) => (
                <Chip
                  key={c.key}
                  label={`${c.label} ${c.count}`}
                  color={sameFilter(chipFilter, c.filter) ? 'primary' : c.color}
                  variant={sameFilter(chipFilter, c.filter) ? 'filled' : 'outlined'}
                  onClick={() => applyFilter(c.filter)}
                />
              ))}
              <Divider orientation="vertical" flexItem />
              {conditionChips.map((c) => (
                <Tooltip
                  key={c.key}
                  title={
                    c.key === 'gap'
                      ? 'Pagadas al 100% que aún no están marcadas como entregadas'
                      : ''
                  }
                >
                  <Chip
                    label={`${c.label} ${c.count}`}
                    color={sameFilter(chipFilter, c.filter) ? 'primary' : c.color}
                    variant={sameFilter(chipFilter, c.filter) ? 'filled' : 'outlined'}
                    onClick={() => applyFilter(c.filter)}
                    sx={{
                      ...(c.key === 'gap' && !sameFilter(chipFilter, c.filter)
                        ? { bgcolor: (t) => alpha(t.palette.warning.main, 0.08) }
                        : {}),
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Listado de OP del asesor */}
      <DataTable<Order>
        density="compact"
        rows={orders}
        columns={columns}
        loading={ordersQuery.isLoading || ordersQuery.isFetching}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`${ROUTES.ORDERS}/${row.id}`)}
        pageSize={limit}
        pageSizeOptions={[20, 50, 100]}
        rowCount={ordersQuery.data?.meta.total ?? 0}
        currentPage={page - 1}
        onPaginationModelChange={(model) => {
          setPage(model.page + 1);
          setLimit(model.pageSize);
        }}
        searchValue={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        serverSideSearch
        searchPlaceholder="Buscar por N° de orden, cliente, notas..."
        emptyMessage="No hay OP que cumplan el filtro seleccionado"
        columnSettingsKey="advisor_detail_orders"
        lockedColumnFields={['orderNumber']}
      />
    </Box>
  );
};

export default AdvisorDetailPage;
