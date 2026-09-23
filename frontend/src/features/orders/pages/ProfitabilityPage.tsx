import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
  alpha,
  Paper,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ClearIcon from '@mui/icons-material/Clear';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { DatePicker } from '@mui/x-date-pickers';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { OrderStatusChip } from '../components';
import { useProfitabilityList } from '../hooks';
import type { FilterProfitabilityDto, OrderProfitabilityListItem } from '../../../types/order.types';
import { neonColors } from '../../../theme';
import { ExportDialog } from '../../../components/common/ExportDialog';
import { fetchAllPages } from '../../../utils/excelExport';
import { PROFITABILITY_EXPORT_COLUMNS } from '../utils/profitabilityExportColumns';
import { ordersApi } from '../../../api/orders.api';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';

// ============================================================
// UTILIDADES
// ============================================================

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat('es-CO').format(new Date(date));

// ============================================================
// COMPONENTE
// ============================================================

export const ProfitabilityPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [filters, setFilters] = useState<FilterProfitabilityDto>({
    page: 1,
    limit: 20,
  });
  const [monthDate, setMonthDate] = useState<Date | null>(null);
  const [dateFrom,  setDateFrom]  = useState<Date | null>(null);
  const [dateTo,    setDateTo]    = useState<Date | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const { hasPermission } = useAuthStore();
  const canExport = hasPermission(PERMISSIONS.EXPORT_PROFITABILITY);

  const handleMonthChange = (date: Date | null) => {
    setMonthDate(date);
    if (date) {
      const start = startOfMonth(date);
      const end   = endOfMonth(date);
      setDateFrom(start);
      setDateTo(end);
      setFilters((f) => ({
        ...f,
        orderDateFrom: format(start, 'yyyy-MM-dd'),
        orderDateTo:   format(end,   'yyyy-MM-dd'),
        page: 1,
      }));
    } else {
      setDateFrom(null);
      setDateTo(null);
      setFilters((f) => ({ ...f, orderDateFrom: undefined, orderDateTo: undefined, page: 1 }));
    }
  };

  const handleDateFromChange = (date: Date | null) => {
    setMonthDate(null);
    setDateFrom(date);
    setFilters((f) => ({
      ...f,
      orderDateFrom: date ? format(date, 'yyyy-MM-dd') : undefined,
      page: 1,
    }));
  };

  const handleDateToChange = (date: Date | null) => {
    setMonthDate(null);
    setDateTo(date);
    setFilters((f) => ({
      ...f,
      orderDateTo: date ? format(date, 'yyyy-MM-dd') : undefined,
      page: 1,
    }));
  };

  const handleClearDates = () => {
    setMonthDate(null);
    setDateFrom(null);
    setDateTo(null);
    setFilters((f) => ({ ...f, orderDateFrom: undefined, orderDateTo: undefined, page: 1 }));
  };

  const hasDateFilter = !!(monthDate || dateFrom || dateTo);

  const profitabilityQuery = useProfitabilityList(filters);
  const rows: OrderProfitabilityListItem[] = profitabilityQuery.data?.data ?? [];

  // Métricas de resumen
  const totalUtility = rows.reduce((sum: number, r: OrderProfitabilityListItem) => sum + r.utility, 0);
  const positiveCount = rows.filter((r: OrderProfitabilityListItem) => r.utility >= 0).length;

  const handleRowClick = (row: OrderProfitabilityListItem) => {
    navigate(`/orders/${row.orderId}`);
  };

  // ============================================================
  // COLUMNAS
  // ============================================================

  const columns: GridColDef<OrderProfitabilityListItem>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      renderCell: (params) => (
        <Box sx={{ fontWeight: 600, color: 'secondary.main' }}>
          {params.value}
        </Box>
      ),
    },
    {
      field: 'clientName',
      headerName: 'Cliente',
      flex: 1,
      minWidth: 180,
    },
    {
      field: 'orderTotal',
      headerName: 'Total OP',
      width: 150,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => formatCurrency(params.value as number),
    },
    {
      field: 'totalExpenses',
      headerName: 'Total Gastos',
      width: 150,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => (
        <Box sx={{ color: 'warning.main', fontWeight: 500 }}>
          {formatCurrency(params.value as number)}
        </Box>
      ),
    },
    {
      field: 'utility',
      headerName: 'Utilidad',
      width: 160,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const value = params.value as number;
        const isPositive = value >= 0;
        return (
          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
            {isPositive ? (
              <TrendingUpIcon fontSize="small" color="success" />
            ) : (
              <TrendingDownIcon fontSize="small" color="error" />
            )}
            <Typography
              variant="body2"
              fontWeight={700}
              color={isPositive ? 'success.main' : 'error.main'}
            >
              {formatCurrency(value)}
            </Typography>
          </Stack>
        );
      },
    },
    {
      field: 'utilityPercentage',
      headerName: 'Margen %',
      width: 110,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const value = params.value as number;
        return (
          <Chip
            label={`${value.toFixed(1)}%`}
            size="small"
            color={value >= 0 ? 'success' : 'error'}
            variant="outlined"
            sx={{ fontWeight: 600, minWidth: 70 }}
          />
        );
      },
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 170,
      renderCell: (params) => (
        <OrderStatusChip status={params.value as any} size="small" />
      ),
    },
    {
      field: 'orderDate',
      headerName: 'Fecha',
      width: 120,
      renderCell: (params) => formatDate(params.value as string),
    },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Rentabilidad por Orden"
        breadcrumbs={[
          { label: 'Órdenes', path: '/orders' },
          { label: 'Rentabilidad' },
        ]}
        action={
          canExport && (
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

      {/* ── Summary card ── */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          mt: 2,
          p: 2.5,
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: isDark
            ? `linear-gradient(135deg, rgba(22, 24, 22, 0.9) 0%, rgba(26, 28, 25, 0.8) 100%)`
            : `linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(16, 185, 129, 0.05) 100%)`,
          border: `1px solid ${
            isDark
              ? alpha(neonColors.primary.main, 0.2)
              : alpha('#10B981', 0.2)
          }`,
          boxShadow: isDark
            ? `0 4px 20px ${alpha(neonColors.primary.main, 0.12)}`
            : '0 4px 12px rgba(0, 0, 0, 0.07)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '10px',
            background: isDark ? alpha('#10B981', 0.15) : alpha('#10B981', 0.1),
            flexShrink: 0,
          }}
        >
          {totalUtility >= 0 ? (
            <TrendingUpIcon sx={{ fontSize: 28, color: '#10B981' }} />
          ) : (
            <TrendingDownIcon sx={{ fontSize: 28, color: '#EF4444' }} />
          )}
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem' }}>
            Utilidad total (resultados mostrados)
          </Typography>
          <Typography
            variant="h5"
            fontWeight={700}
            color={totalUtility >= 0 ? 'success.main' : 'error.main'}
          >
            {formatCurrency(totalUtility)}
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {positiveCount} / {rows.length}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            rentables
          </Typography>
        </Box>
      </Paper>

      {/* ── Filtros ── */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <TextField
          label="Buscar"
          size="small"
          placeholder="Nº orden o cliente..."
          value={filters.search ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value || undefined, page: 1 }))
          }
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          label="Estado"
          size="small"
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value || undefined, page: 1 }))
          }
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="DRAFT">Borrador</MenuItem>
          <MenuItem value="CONFIRMED">Confirmada</MenuItem>
          <MenuItem value="IN_PRODUCTION">En Producción</MenuItem>
          <MenuItem value="READY">Lista</MenuItem>
          <MenuItem value="DELIVERED_ON_CREDIT">Entregada a Crédito</MenuItem>
          <MenuItem value="PAID">Pagada</MenuItem>
          <MenuItem value="CANCELLED">Cancelada</MenuItem>
        </TextField>
      </Stack>

      {/* ── Filtros de fecha ── */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <DatePicker
          label="Mes"
          views={['year', 'month']}
          openTo="month"
          value={monthDate}
          onChange={handleMonthChange}
          slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
        />
        <DatePicker
          label="Desde"
          value={dateFrom}
          onChange={handleDateFromChange}
          slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
        />
        <DatePicker
          label="Hasta"
          value={dateTo}
          onChange={handleDateToChange}
          slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
        />
        {hasDateFilter && (
          <Tooltip title="Limpiar fechas">
            <IconButton size="small" onClick={handleClearDates}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* ── Tabla ── */}
      <DataTable
        density="compact"
        rows={rows}
        columns={columns}
        loading={profitabilityQuery.isLoading || profitabilityQuery.isFetching}
        rowCount={profitabilityQuery.data?.total ?? 0}
        currentPage={(filters.page ?? 1) - 1}
        pageSize={filters.limit ?? 20}
        pageSizeOptions={[20, 50, 100]}
        onPaginationModelChange={(model) =>
          setFilters((prev) => ({
            ...prev,
            page: model.page + 1,
            limit: model.pageSize,
          }))
        }
        getRowId={(row) => row.orderId}
        onRowClick={handleRowClick}
        emptyMessage="No hay órdenes con datos de rentabilidad"
      />

      {/* Export to Excel Dialog */}
      {canExport && (
        <ExportDialog<OrderProfitabilityListItem>
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="Exportar Rentabilidad a Excel"
          entityLabel="órdenes"
          fileNamePrefix="Rentabilidad_Por_Orden"
          sheetName="Rentabilidad"
          columns={PROFITABILITY_EXPORT_COLUMNS}
          storageKey="profitability_export_columns"
          dateRangeLabel="Rango de fechas (fecha de orden)"
          helperText="Se respetan los filtros activos de la pantalla (estado y búsqueda)."
          defaultDateFrom={dateFrom ?? undefined}
          defaultDateTo={dateTo ?? undefined}
          fetchRows={async ({ fromDate, toDate }) => {
            const { page: _p, limit: _l, ...activeFilters } = filters;
            return fetchAllPages(async (page, limit) => {
              const response = await ordersApi.getProfitabilityList({
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

export default ProfitabilityPage;
