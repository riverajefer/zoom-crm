import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Typography,
  MenuItem,
  TextField,
  Autocomplete,
  Button,
  Skeleton,
  Tab,
  Tabs,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Receipt as ReceiptIcon,
  BarChart as BarChartIcon,
  Visibility as VisibilityIcon,
  BarChart as SalesIcon,
  EmojiEvents as GoalsIcon,
  FactCheck as TrackingIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { useOrders, useSalesSummary } from '../hooks';
import { ordersApi } from '../../../api';
import { useClients } from '../../clients/hooks/useClients';
import { useProductionAreas } from '../../production-areas/hooks/useProductionAreas';
import { useUsers } from '../../users/hooks/useUsers';
import { OrderStatusChip, SalesGoalsSection, OrderTrackingSection } from '../components';
import { ExportDialog } from '../../../components/common/ExportDialog';
import { fetchAllPages } from '../../../utils/excelExport';
import { ORDER_EXPORT_COLUMNS } from '../utils/orderExportColumns';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import type { FilterOrdersDto, Order } from '../../../types/order.types';
import { ORDER_STATUS_OPTIONS } from '../../../types/order.types';
import type { Client } from '../../../types/client.types';
import { parseDateFilter, toDateFilterOrUndefined } from '../../../utils/dateFilters';

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatCurrencyStr = (value: string): string =>
  formatCurrency(parseFloat(value));

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat('es-CO').format(new Date(date));

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  loading?: boolean;
  color?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, loading, color }) => (
  <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: color ? `${color}.light` : 'primary.light',
          color: color ? `${color}.dark` : 'primary.dark',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        {loading ? (
          <Skeleton width={120} height={28} />
        ) : (
          <Typography variant="h6" fontWeight={700}>
            {value}
          </Typography>
        )}
      </Box>
    </CardContent>
  </Card>
);

export const SalesByAdvisorPage: React.FC = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(0);
  // `excludeAnulado` es propio de esta pantalla: es un informe de ventas y una
  // orden anulada no es una venta. Va en los filtros base (no en cada llamada)
  // para que la tarjeta de totales, la tabla y el Excel usen exactamente el
  // mismo criterio. Elegir "Anulada" en el filtro de Estado lo anula.
  const [filters, setFilters] = useState<FilterOrdersDto>({
    page: 1,
    limit: 20,
    excludeAnulado: true,
  });
  const [exportOpen, setExportOpen] = useState(false);
  const { hasPermission } = useAuthStore();
  const canExport = hasPermission(PERMISSIONS.EXPORT_SALES_BY_ADVISOR);

  const { ordersQuery } = useOrders(filters);
  const summaryQuery = useSalesSummary(filters);
  const { clientsQuery } = useClients({ includeInactive: false });
  const { productionAreasQuery } = useProductionAreas();
  const { usersQuery } = useUsers();

  const orders = ordersQuery.data?.data || [];
  const clients = clientsQuery.data || [];
  const productionAreas = productionAreasQuery.data || [];
  const users = usersQuery.data || [];
  const summary = summaryQuery.data;

  const selectedClient = filters.clientId
    ? clients.find((c: Client) => c.id === filters.clientId) ?? null
    : null;

  const selectedArea = filters.productionAreaId
    ? productionAreas.find((a: any) => a.id === filters.productionAreaId) ?? null
    : null;

  const selectedUser = filters.createdById
    ? users.find((u: any) => u.id === filters.createdById) ?? null
    : null;

  // Los asesores con órdenes los resuelve el backend con un `groupBy`.
  //
  // Antes esto se traía las primeras 1.000 órdenes completas solo para deducir
  // la lista. Con 3.209 órdenes en producción, un asesor cuyas órdenes
  // estuvieran todas entre las 2.209 más antiguas no aparecía en el filtro, y
  // no había forma de notarlo desde la pantalla.
  const advisorsWithOrdersQuery = useQuery({
    queryKey: ['orders', 'advisors'],
    queryFn: () => ordersApi.getAdvisors(),
    staleTime: 5 * 60 * 1000,
  });

  const orderCreatorIds = useMemo(
    () => new Set((advisorsWithOrdersQuery.data ?? []).map((a) => a.id)),
    [advisorsWithOrdersQuery.data],
  );

  // Users who have role "Comercial" OR have created at least one order
  const advisorOptions = useMemo(() => {
    return users.filter((u: any) =>
      u.role?.name?.toLowerCase().includes('comercial') ||
      orderCreatorIds.has(u.id),
    );
  }, [users, orderCreatorIds]);

  const handleFilterChange = (key: keyof FilterOrdersDto, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleClearFilters = () =>
    setFilters({ page: 1, limit: 20, excludeAnulado: true });

  const columns = useMemo(() => [
    {
      field: 'orderNumber',
      headerName: 'N° Orden',
      width: 130,
      renderCell: (params: any) => (
        <Box sx={{ fontWeight: 600, color: 'secondary.main' }}>{params.value}</Box>
      ),
    },
    {
      field: 'orderDate',
      headerName: 'Fecha',
      width: 130,
      renderCell: (params: any) => formatDate(params.value),
    },
    {
      field: 'client',
      headerName: 'Cliente',
      flex: 1,
      minWidth: 150,
      valueGetter: (_: any, row: any) => row.client?.name ?? '—',
    },
    {
      field: 'createdBy',
      headerName: 'Asesor',
      width: 160,
      valueGetter: (_: any, row: any) =>
        `${row.createdBy?.firstName ?? ''} ${row.createdBy?.lastName ?? ''}`.trim() || '—',
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 150,
      renderCell: (params: any) => <OrderStatusChip status={params.value} />,
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 140,
      align: 'right' as const,
      headerAlign: 'right' as const,
      renderCell: (params: any) => (
        <Box sx={{ fontWeight: 600 }}>{formatCurrencyStr(params.value)}</Box>
      ),
    },
    {
      field: 'balance',
      headerName: 'Saldo',
      width: 140,
      align: 'right' as const,
      headerAlign: 'right' as const,
      renderCell: (params: any) => {
        const balance = parseFloat(params.value);
        return (
          <Box sx={{ color: balance > 0 ? 'warning.main' : 'success.main', fontWeight: 500 }}>
            {formatCurrencyStr(params.value)}
          </Box>
        );
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (params: any) => (
        <Button
          size="small"
          startIcon={<VisibilityIcon />}
          onClick={() => navigate(ROUTES.ORDERS_DETAIL.replace(':id', params.row.id))}
        >
          Ver
        </Button>
      ),
    },
  ], [navigate]);

  const hasActiveFilters =
    filters.status ||
    filters.clientId ||
    filters.orderDateFrom ||
    filters.orderDateTo ||
    filters.search ||
    filters.productionAreaId ||
    filters.createdById;

  const advisors = users.map((u: any) => ({
    id: u.id,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    email: u.email ?? null,
  }));

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Ventas por Asesor"
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Ventas por Asesor' }]}
        action={
          canExport &&
          activeTab === 0 && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<FileDownloadIcon />}
              onClick={() => setExportOpen(true)}
            >
              Exportar a Excel
            </Button>
          )
        }
      />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, mt: 1 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab
            icon={<SalesIcon fontSize="small" />}
            iconPosition="start"
            label="Ventas"
          />
          <Tab
            icon={<GoalsIcon fontSize="small" />}
            iconPosition="start"
            label="Metas de Ventas"
          />
          <Tab
            icon={<TrackingIcon fontSize="small" />}
            iconPosition="start"
            label="Seguimiento de OP"
          />
        </Tabs>
      </Box>

      {/* Tab 0 — Ventas */}
      {activeTab === 0 && (
        <>
          {/* Métricas */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mb: 3,
              flexDirection: { xs: 'column', sm: 'row' },
            }}
          >
            <MetricCard
              title="Total Vendido"
              value={summary ? formatCurrency(summary.totalRevenue) : '—'}
              icon={<TrendingUpIcon />}
              loading={summaryQuery.isLoading}
              color="success"
            />
            <MetricCard
              title="Venta Neta (sin IVA)"
              value={summary ? formatCurrency(summary.totalNetSubtotal) : '—'}
              icon={<SalesIcon />}
              loading={summaryQuery.isLoading}
              color="info"
            />
            <MetricCard
              title="Número de Órdenes"
              value={summary ? summary.totalOrders.toString() : '—'}
              icon={<ReceiptIcon />}
              loading={summaryQuery.isLoading}
              color="primary"
            />
            <MetricCard
              title="Valor Promedio por OP"
              value={summary ? formatCurrency(summary.averageOrderValue) : '—'}
              icon={<BarChartIcon />}
              loading={summaryQuery.isLoading}
              color="warning"
            />
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: -2, mb: 3 }}
          >
            <strong>Total Vendido</strong> = total facturado de las órdenes (incluye
            IVA, retenciones y prueba de color).{' '}
            <strong>Venta Neta (sin IVA)</strong> = subtotal de las órdenes − descuentos
            aplicados; es la cifra que cuenta para las metas de ventas
            {summary
              ? ` (${formatCurrency(summary.totalSubtotal)} − ${formatCurrency(summary.totalDiscounts)})`
              : ''}
            . Los totales, la tabla y el Excel excluyen las órdenes anuladas. Para
            verlas, selecciona «Anulada» en el filtro de Estado.
          </Typography>

          {/* Filtros */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: '1fr 1fr',
                md: 'repeat(3, 1fr)',
                lg: '1fr 1fr 1.5fr 1.5fr 1fr 1fr auto',
              },
              gap: 2,
              mb: 3,
            }}
          >
            <Autocomplete
              options={advisorOptions}
              getOptionLabel={(u: any) =>
                `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
              }
              value={selectedUser}
              onChange={(_: any, newValue: any) =>
                handleFilterChange('createdById', newValue?.id ?? undefined)
              }
              size="small"
              renderInput={(params) => <TextField {...params} label="Asesor" />}
            />

            <TextField
              select
              label="Estado"
              value={filters.status || ''}
              onChange={(e) =>
                handleFilterChange('status', e.target.value || undefined)
              }
              fullWidth
              size="small"
            >
              <MenuItem value="">Todos los estados</MenuItem>
              {ORDER_STATUS_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <DatePicker
              label="Fecha desde"
              value={parseDateFilter(filters.orderDateFrom) ?? null}
              onChange={(date) =>
                handleFilterChange(
                  'orderDateFrom',
                  toDateFilterOrUndefined(date),
                )
              }
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />

            <DatePicker
              label="Fecha hasta"
              value={parseDateFilter(filters.orderDateTo) ?? null}
              onChange={(date) =>
                handleFilterChange(
                  'orderDateTo',
                  toDateFilterOrUndefined(date),
                )
              }
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />

            <Autocomplete
              options={clients}
              getOptionLabel={(c: Client) => c.name}
              value={selectedClient}
              onChange={(_: any, newValue: Client | null) =>
                handleFilterChange('clientId', newValue?.id ?? undefined)
              }
              size="small"
              renderInput={(params) => <TextField {...params} label="Cliente" />}
            />

            <Autocomplete
              options={productionAreas}
              getOptionLabel={(a: any) => a.name}
              value={selectedArea}
              onChange={(_: any, newValue: any) =>
                handleFilterChange('productionAreaId', newValue?.id ?? undefined)
              }
              size="small"
              renderInput={(params) => (
                <TextField {...params} label="Área de Producción" />
              )}
            />

            {hasActiveFilters && (
              <Button
                variant="text"
                onClick={handleClearFilters}
                size="small"
                sx={{ alignSelf: 'center' }}
              >
                Limpiar
              </Button>
            )}
          </Box>

          {/* Búsqueda */}
          <Box sx={{ mb: 2 }}>
            <TextField
              label="Buscar (N° orden, cliente...)"
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
              size="small"
              sx={{ width: { xs: '100%', sm: 320 } }}
            />
          </Box>

          {/* Tabla */}
          <DataTable
            density="compact"
            rows={orders}
            columns={columns}
            loading={ordersQuery.isLoading || ordersQuery.isFetching}
            rowCount={ordersQuery.data?.meta?.total ?? 0}
            currentPage={(filters.page ?? 1) - 1}
            pageSize={filters.limit ?? 20}
            pageSizeOptions={[20, 50, 100]}
            // No usar `handleFilterChange`: ese helper fuerza `page: 1` en cada
            // cambio, así que anularía el cambio de página.
            onPaginationModelChange={(model) =>
              setFilters((prev) => ({
                ...prev,
                page: model.page + 1,
                limit: model.pageSize,
              }))
            }
          />
        </>
      )}

      {/* Tab 1 — Metas de Ventas */}
      {activeTab === 1 && (
        <SalesGoalsSection advisors={advisors} />
      )}

      {/* Tab 2 — Seguimiento de OP */}
      {activeTab === 2 && <OrderTrackingSection />}

      {/* Export to Excel Dialog */}
      {canExport && (
        <ExportDialog<Order>
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="Exportar Ventas por Asesor a Excel"
          entityLabel="órdenes"
          fileNamePrefix="Ventas_Por_Asesor"
          sheetName="Ventas por Asesor"
          columns={ORDER_EXPORT_COLUMNS}
          storageKey="sales_by_advisor_export_columns"
          dateRangeLabel="Rango de fechas (fecha de orden)"
          helperText="Se respetan los filtros activos de la pantalla (estado, cliente, asesor y búsqueda). No incluye órdenes anuladas, igual que los totales de arriba."
          defaultDateFrom={
            parseDateFilter(filters.orderDateFrom)
          }
          defaultDateTo={
            parseDateFilter(filters.orderDateTo)
          }
          fetchRows={async ({ fromDate, toDate }) => {
            const { page: _p, limit: _l, ...activeFilters } = filters;
            return fetchAllPages(async (page, limit) => {
              const response = await ordersApi.getAll({
                ...activeFilters,
                orderDateFrom: fromDate,
                orderDateTo: toDate,
                page,
                limit,
              });
              return response.data ?? [];
            });
          }}
        />
      )}
    </Box>
  );
};

export default SalesByAdvisorPage;
