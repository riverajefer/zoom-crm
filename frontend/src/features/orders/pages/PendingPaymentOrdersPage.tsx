import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Paper, Typography, useTheme, alpha, Autocomplete, TextField } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import PaymentsIcon from '@mui/icons-material/Payments';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { useOrders } from '../hooks';
import { useClients } from '../../clients/hooks/useClients';
import { OrderStatusChip } from '../components';
import type { Order, OrderStatus } from '../../../types/order.types';
import type { Client } from '../../../types/client.types';
import { neonColors } from '../../../theme';
import { ExportDialog } from '../../../components/common/ExportDialog';
import { fetchAllPages } from '../../../utils/excelExport';
import { ORDER_EXPORT_COLUMNS } from '../utils/orderExportColumns';
import { ordersApi } from '../../../api/orders.api';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';

// ============================================================
// UTILIDADES
// ============================================================

const formatCurrency = (value: string): string => {
  const numValue = parseFloat(value);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue);
};

const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('es-CO').format(new Date(date));
};

// ============================================================
// CONSTANTES
// ============================================================

/**
 * Estados en los que una orden con saldo es cartera por cobrar.
 *
 * `DELIVERED_ON_CREDIT` faltaba: una entrega a crédito es, por definición, una
 * entrega con saldo. El backend tiene la misma lista en
 * `OrdersRepository.RECEIVABLE_STATUSES`, que es la que usa el total del
 * encabezado; las dos consultas de esta pantalla mandan estos mismos estados,
 * así que la tabla y el total no pueden discrepar.
 */
const PENDING_PAYMENT_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'DELIVERED_ON_CREDIT',
  'WARRANTY',
];

// ============================================================
// COMPONENTE
// ============================================================

export const PendingPaymentOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);

  const { hasPermission } = useAuthStore();
  const canExport = hasPermission(PERMISSIONS.EXPORT_PENDING_PAYMENT_ORDERS);

  const { clientsQuery } = useClients({ includeInactive: false });
  const clients = clientsQuery.data || [];
  const selectedClient = clientId
    ? clients.find((c) => c.id === clientId) || null
    : null;

  // El filtro lo resuelve el backend. Antes se pedían 500 órdenes sin filtrar y
  // se descartaban en el navegador: con 3.209 en producción, la pantalla veía
  // 37 de 324 pendientes y mostraba $16,1 M de $88,5 M reales.
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });

  const { ordersQuery } = useOrders({
    ...pagination,
    clientId,
    statuses: PENDING_PAYMENT_STATUSES,
    paymentStatus: 'PENDING',
  });

  const pendingOrders: Order[] = ordersQuery.data?.data ?? [];

  // Los totales se piden aparte: sumar los saldos de la página visible daría
  // una cifra que cambia al pasar de página.
  const summaryQuery = useQuery({
    queryKey: ['orders', 'pending-payment-summary', clientId],
    queryFn: () => ordersApi.getPendingPaymentSummary({ clientId }),
    placeholderData: keepPreviousData,
  });

  const totalPendiente = parseFloat(summaryQuery.data?.totalBalance ?? '0');
  const totalOrdenes = summaryQuery.data?.count ?? 0;

  // Clic en fila → detalle de la orden existente
  const handleRowClick = (order: Order) => {
    navigate(`/orders/${order.id}`);
  };

  // ============================================================
  // COLUMNAS — mismo conjunto que OrdersListPage sin "Acciones"
  // ============================================================

  const columns: GridColDef<Order>[] = [
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
      field: 'client',
      headerName: 'Cliente',
      width: 250,
      valueGetter: (_, row) => row.client.name,
    },
    {
      field: 'orderDate',
      headerName: 'Fecha Orden',
      width: 130,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'deliveryDate',
      headerName: 'Fecha Entrega',
      width: 130,
      renderCell: (params) =>
        params.value ? formatDate(params.value) : '-',
    },
    {
      field: 'createdBy',
      headerName: 'Creado por',
      width: 150,
      valueGetter: (_, row) =>
        row.createdBy?.firstName + ' ' + row.createdBy?.lastName,
    },
    {
      field: 'taxRate',
      headerName: 'IVA',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const hasIva = parseFloat(params.value) > 0;
        return (
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: hasIva ? 'success.lighter' : 'action.hover',
              color: hasIva ? 'success.dark' : 'text.secondary',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          >
            {hasIva ? 'SÍ' : 'NO'}
          </Box>
        );
      },
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 150,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => formatCurrency(params.value),
    },
    {
      field: 'balance',
      headerName: 'Monto Pendiente',
      width: 170,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => (
        <Box sx={{ color: 'warning.main', fontWeight: 600 }}>
          {formatCurrency(params.value)}
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 150,
      renderCell: (params) => <OrderStatusChip status={params.value} />,
    },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Box sx={{ p: 3 }}>
      {/* Header sin botón de acción — vista de solo lectura */}
      <PageHeader
        title="Órdenes Pendientes por cobrar"
        breadcrumbs={[
          { label: 'Órdenes', path: '/orders' },
          { label: 'Pendientes por cobrar' },
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

      {/* ── Summary card: Total Pendiente por Cobrar ── */}
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
            : `linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(249, 115, 22, 0.05) 100%)`,
          border: `1px solid ${
            isDark
              ? alpha(neonColors.primary.main, 0.2)
              : alpha('#F97316', 0.2)
          }`,
          boxShadow: isDark
            ? `0 4px 20px ${alpha(neonColors.primary.main, 0.12)}`
            : '0 4px 12px rgba(0, 0, 0, 0.07)',
        }}
      >
        {/* Icono */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '10px',
            background: isDark
              ? alpha('#F97316', 0.15)
              : alpha('#F97316', 0.1),
            flexShrink: 0,
          }}
        >
          <PaymentsIcon sx={{ fontSize: 28, color: '#F97316' }} />
        </Box>

        {/* Texto principal */}
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="caption"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
              color: 'text.secondary',
              display: 'block',
            }}
          >
            Total Pendiente por Cobrar
          </Typography>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#F97316',
              mt: 0.25,
            }}
          >
            {formatCurrency(String(totalPendiente))}
          </Typography>
        </Box>

        {/* Cantidad de órdenes (esquina derecha) */}
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontWeight: 500 }}
          >
            {totalOrdenes} {totalOrdenes === 1 ? 'orden' : 'órdenes'}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled' }}
          >
            pendientes
          </Typography>
        </Box>
      </Paper>

      {/* ── Filtros ── */}
      <Box sx={{ mb: 2, width: { xs: '100%', sm: '280px' } }}>
        <Autocomplete
          fullWidth
          size='small'
          options={clients}
          value={selectedClient}
          onChange={(_, newValue) => {
            setClientId(newValue?.id);
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          getOptionLabel={(option: Client) => option.name}
          renderInput={(params) => (
            <TextField
              {...params}
              label='Cliente'
              placeholder='Todos los clientes'
            />
          )}
          loading={clientsQuery.isLoading}
        />
      </Box>

      {/* ── Tabla de datos — solo lectura, sin columna de acciones ── */}
      <DataTable
        density="compact"
        rows={pendingOrders}
        columns={columns}
        loading={ordersQuery.isLoading}
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        pageSize={pagination.limit}
        pageSizeOptions={[20, 50, 100]}
        rowCount={ordersQuery.data?.meta.total ?? 0}
        currentPage={pagination.page - 1}
        onPaginationModelChange={(model) =>
          setPagination({ page: model.page + 1, limit: model.pageSize })
        }
        emptyMessage="No hay órdenes pendientes por cobrar"
      />

      {/* Export to Excel Dialog */}
      {canExport && (
        <ExportDialog<Order>
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="Exportar Pendientes por cobrar a Excel"
          entityLabel="órdenes"
          fileNamePrefix="Pendientes_Por_Cobrar"
          sheetName="Pendientes por cobrar"
          columns={ORDER_EXPORT_COLUMNS}
          storageKey="pending_payment_orders_export_columns"
          dateRangeLabel="Rango de fechas (fecha de orden)"
          helperText="Se respeta el filtro de cliente y solo se incluyen órdenes activas con saldo pendiente."
          fetchRows={async ({ fromDate, toDate }) => {
            // Mismo filtro que la tabla, pero resuelto en el backend.
            return fetchAllPages(async (page, limit) => {
              const response = await ordersApi.getAll({
                clientId,
                orderDateFrom: fromDate,
                orderDateTo: toDate,
                statuses: PENDING_PAYMENT_STATUSES,
                paymentStatus: 'PENDING',
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

export default PendingPaymentOrdersPage;
