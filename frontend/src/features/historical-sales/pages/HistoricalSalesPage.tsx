import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { DatePicker } from '@mui/x-date-pickers';
import { useSnackbar } from 'notistack';
import { historicalSalesApi } from '../../../api/historical-sales.api';
import { DataTable } from '../../../components/common/DataTable';
import { PageHeader } from '../../../components/common/PageHeader';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { useResponsiveColumns, type ResponsiveGridColDef } from '../../../hooks';
import { useAuthStore } from '../../../store/authStore';
import {
  HISTORICAL_STATUS_COLORS,
  HISTORICAL_STATUS_LABELS,
  type FilterHistoricalSalesDto,
  type HistoricalSaleListItem,
  type HistoricalSaleStatus,
} from '../../../types/historical-sale.types';
import { PERMISSIONS } from '../../../utils/constants';
import { parseDateFilter, toDateFilterOrUndefined } from '../../../utils/dateFilters';
import { useActiveSedes } from '../../sedes/hooks/useSedes';
import { HistoricalSaleDetailDialog } from '../components/HistoricalSaleDetailDialog';
import {
  useHistoricalSales,
  useHistoricalSalesFilterOptions,
  useHistoricalSalesSummary,
  withoutPaging,
} from '../hooks/useHistoricalSales';
import { exportHistoricalSales, formatCurrency, formatSaleDate } from '../utils';

const STATUSES = Object.keys(HISTORICAL_STATUS_LABELS) as HistoricalSaleStatus[];

const errorMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  return message || fallback;
};

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </CardContent>
  </Card>
);

/**
 * Histórico de ventas (solo Zoom): las OP de las planillas de Excel que Zoom
 * llevaba antes del CRM. Solo consulta; no son órdenes del sistema.
 */
const HistoricalSalesPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuthStore();
  const canExport = hasPermission(PERMISSIONS.EXPORT_HISTORICAL_SALES);

  const [filters, setFilters] = useState<FilterHistoricalSalesDto>({ page: 1, limit: 25 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const salesQuery = useHistoricalSales(filters);
  const summaryQuery = useHistoricalSalesSummary(filters);
  const optionsQuery = useHistoricalSalesFilterOptions();
  const sedesQuery = useActiveSedes();
  // La Matriz no llevaba planilla de OP.
  const stores = (sedesQuery.data ?? []).filter((sede) => sede.type === 'STORE');

  const sales = salesQuery.data?.data ?? [];
  const meta = salesQuery.data?.meta;
  const summary = summaryQuery.data;

  const updateFilters = (patch: Partial<FilterHistoricalSalesDto>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const rawColumns: ResponsiveGridColDef<HistoricalSaleListItem>[] = useMemo(
    () => [
      {
        field: 'originalNumber',
        headerName: 'OP',
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
            <SedeDot color={row.location.color} />
            <span>
              {row.location.code} · {row.originalNumber}
            </span>
          </Box>
        ),
      },
      {
        field: 'saleDate',
        headerName: 'Fecha',
        width: 105,
        sortable: false,
        valueFormatter: (value: string | null) => formatSaleDate(value),
      },
      { field: 'clientName', headerName: 'Cliente', flex: 1, minWidth: 180, sortable: false },
      {
        field: 'clientNit',
        headerName: 'NIT',
        width: 120,
        sortable: false,
        responsive: 'md',
        valueFormatter: (value: string | null) => value ?? '—',
      },
      {
        field: 'sellerName',
        headerName: 'Vendedor',
        width: 140,
        sortable: false,
        responsive: 'sm',
        valueFormatter: (value: string | null) => value ?? '—',
      },
      {
        field: 'status',
        headerName: 'Estado',
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Chip
            size="small"
            label={HISTORICAL_STATUS_LABELS[row.status]}
            color={HISTORICAL_STATUS_COLORS[row.status]}
            variant="outlined"
          />
        ),
      },
      {
        field: 'total',
        headerName: 'Total',
        width: 125,
        align: 'right',
        headerAlign: 'right',
        sortable: false,
        valueFormatter: (value: string) => formatCurrency(value),
      },
      {
        field: 'receivedAmount',
        headerName: 'Recibido',
        width: 125,
        align: 'right',
        headerAlign: 'right',
        sortable: false,
        responsive: 'md',
        valueFormatter: (value: string) => formatCurrency(value),
      },
      {
        field: 'balance',
        headerName: 'Saldo',
        width: 120,
        align: 'right',
        headerAlign: 'right',
        sortable: false,
        // Solo el de las OP que la planilla dejó con saldo; en las demás es ruido.
        valueGetter: (_, row) => (row.status === 'WITH_BALANCE' ? row.balance : null),
        valueFormatter: (value: string | null) => (value === null ? '—' : formatCurrency(value)),
      },
    ],
    [],
  );
  const columns = useResponsiveColumns(rawColumns);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await historicalSalesApi.findForExport(withoutPaging(filters));
      exportHistoricalSales(data);
    } catch (error) {
      enqueueSnackbar(errorMessage(error, 'No se pudo exportar'), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Histórico de Ventas"
        subtitle="Órdenes de producción de las planillas de Excel (2023-2025). Solo consulta: no son órdenes del sistema."
        action={
          canExport ? (
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExport}
              disabled={exporting || !meta?.total}
            >
              {exporting ? 'Exportando…' : 'Exportar Excel'}
            </Button>
          ) : undefined
        }
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <StatCard
            label="Ventas"
            value={summary ? summary.salesCount.toLocaleString('es-CO') : '—'}
            hint="Sin anuladas ni cotizaciones"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Total vendido" value={summary ? formatCurrency(summary.salesTotal) : '—'} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Recibido" value={summary ? formatCurrency(summary.receivedTotal) : '—'} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            label="Saldo según la planilla"
            value={summary ? formatCurrency(summary.pendingBalance) : '—'}
            hint={
              summary
                ? `${summary.byStatus.WITH_BALANCE.count.toLocaleString('es-CO')} OP con saldo`
                : undefined
            }
          />
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 110 }} size="small">
          <InputLabel>Año</InputLabel>
          <Select
            label="Año"
            value={filters.year ?? ''}
            onChange={(e) => updateFilters({ year: Number(e.target.value) || undefined })}
          >
            <MenuItem value="">Todos</MenuItem>
            {(optionsQuery.data?.years ?? []).map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <DatePicker
          label="Desde"
          value={parseDateFilter(filters.dateFrom) ?? null}
          maxDate={parseDateFilter(filters.dateTo)}
          onChange={(date) => {
            // Mientras se escribe a mano la fecha queda inválida: se espera a que esté completa.
            if (date && Number.isNaN(date.getTime())) return;
            updateFilters({ dateFrom: toDateFilterOrUndefined(date) });
          }}
          slotProps={{ textField: { size: 'small', sx: { width: 190 } }, field: { clearable: true } }}
        />
        <DatePicker
          label="Hasta"
          value={parseDateFilter(filters.dateTo) ?? null}
          minDate={parseDateFilter(filters.dateFrom)}
          onChange={(date) => {
            if (date && Number.isNaN(date.getTime())) return;
            updateFilters({ dateTo: toDateFilterOrUndefined(date) });
          }}
          slotProps={{ textField: { size: 'small', sx: { width: 190 } }, field: { clearable: true } }}
        />
        <FormControl sx={{ minWidth: 130 }} size="small">
          <InputLabel>Sede</InputLabel>
          <Select
            label="Sede"
            value={filters.locationId ?? ''}
            onChange={(e) => updateFilters({ locationId: e.target.value || undefined })}
          >
            <MenuItem value="">Todas</MenuItem>
            {stores.map((sede) => (
              <MenuItem key={sede.id} value={sede.id}>
                {sede.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 140 }} size="small">
          <InputLabel>Estado</InputLabel>
          <Select
            label="Estado"
            value={filters.status ?? ''}
            onChange={(e) =>
              updateFilters({ status: (e.target.value as HistoricalSaleStatus) || undefined })
            }
          >
            <MenuItem value="">Todos</MenuItem>
            {STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {HISTORICAL_STATUS_LABELS[status]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 170 }} size="small">
          <InputLabel>Vendedor</InputLabel>
          <Select
            label="Vendedor"
            value={filters.sellerName ?? ''}
            onChange={(e) => updateFilters({ sellerName: e.target.value || undefined })}
          >
            <MenuItem value="">Todos</MenuItem>
            {(optionsQuery.data?.sellers ?? []).map((seller) => (
              <MenuItem key={seller} value={seller}>
                {seller}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {salesQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage(salesQuery.error, 'No se pudo cargar el histórico')}
        </Alert>
      )}

      <DataTable
        density="compact"
        rows={sales}
        columns={columns}
        loading={salesQuery.isLoading || salesQuery.isFetching}
        rowCount={meta?.total ?? 0}
        currentPage={(filters.page ?? 1) - 1}
        pageSize={filters.limit ?? 25}
        pageSizeOptions={[25, 50, 100]}
        onPaginationModelChange={(model) =>
          setFilters((f) => ({ ...f, page: model.page + 1, limit: model.pageSize }))
        }
        searchValue={filters.search ?? ''}
        onSearchChange={(value) => updateFilters({ search: value.trim() || undefined })}
        serverSideSearch
        searchPlaceholder="Buscar por OP, cliente, NIT o producto..."
        emptyMessage="No hay ventas históricas con estos filtros"
        onRowClick={(row) => setSelectedId(row.id)}
      />

      <HistoricalSaleDetailDialog saleId={selectedId} onClose={() => setSelectedId(null)} />
    </Box>
  );
};

export default HistoricalSalesPage;
