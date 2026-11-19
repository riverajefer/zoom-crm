import React, { useEffect, useState } from 'react';
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
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useSnackbar } from 'notistack';
import { historicalSalesApi } from '../../../api/historical-sales.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { useAuthStore } from '../../../store/authStore';
import {
  HISTORICAL_STATUS_COLORS,
  HISTORICAL_STATUS_LABELS,
  type FilterHistoricalSalesDto,
  type HistoricalSaleStatus,
} from '../../../types/historical-sale.types';
import { PERMISSIONS } from '../../../utils/constants';
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
  const [searchInput, setSearchInput] = useState('');
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

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) =>
        (f.search ?? '') === searchInput.trim()
          ? f
          : { ...f, search: searchInput.trim() || undefined, page: 1 },
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const updateFilters = (patch: Partial<FilterHistoricalSalesDto>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

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
        <TextField
          label="Buscar"
          placeholder="OP, cliente, NIT o producto"
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ minWidth: 240 }}
        />
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
        <TextField
          label="Desde"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={filters.dateFrom ?? ''}
          onChange={(e) => updateFilters({ dateFrom: e.target.value || undefined })}
        />
        <TextField
          label="Hasta"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={filters.dateTo ?? ''}
          onChange={(e) => updateFilters({ dateTo: e.target.value || undefined })}
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

      <Paper variant="outlined">
        {salesQuery.isFetching && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>OP</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Vendedor</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Recibido</TableCell>
                <TableCell align="right">Saldo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sales.map((sale) => (
                <TableRow
                  key={sale.id}
                  hover
                  onClick={() => setSelectedId(sale.id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SedeDot color={sale.location.color} />
                      <span>
                        {sale.location.code} · {sale.originalNumber}
                      </span>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatSaleDate(sale.saleDate)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{sale.clientName}</Typography>
                    {sale.clientNit && (
                      <Typography variant="caption" color="text.secondary">
                        NIT {sale.clientNit}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{sale.sellerName ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={HISTORICAL_STATUS_LABELS[sale.status]}
                      color={HISTORICAL_STATUS_COLORS[sale.status]}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(sale.total)}</TableCell>
                  <TableCell align="right">{formatCurrency(sale.receivedAmount)}</TableCell>
                  <TableCell align="right">
                    {sale.status === 'WITH_BALANCE' ? formatCurrency(sale.balance) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!salesQuery.isLoading && sales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No hay ventas históricas con estos filtros
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={meta?.total ?? 0}
          page={(filters.page ?? 1) - 1}
          rowsPerPage={filters.limit ?? 25}
          rowsPerPageOptions={[25, 50, 100]}
          onPageChange={(_, page) => setFilters((f) => ({ ...f, page: page + 1 }))}
          onRowsPerPageChange={(e) => updateFilters({ limit: Number(e.target.value) })}
          labelRowsPerPage="Por página"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </Paper>

      <HistoricalSaleDetailDialog saleId={selectedId} onClose={() => setSelectedId(null)} />
    </Box>
  );
};

export default HistoricalSalesPage;
