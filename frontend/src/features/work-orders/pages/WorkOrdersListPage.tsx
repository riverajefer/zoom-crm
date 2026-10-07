import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stack,
  MenuItem,
  TextField,
  Button,
  Chip,
  Typography,
} from '@mui/material';
import { GridRenderCellParams } from '@mui/x-data-grid';
import { useResponsiveColumns, type ResponsiveGridColDef } from '../../../hooks';
import {
  Add as AddIcon,
  ReceiptLong as ReceiptLongIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { ActionsCell } from '../../../components/common/DataTable/ActionsCell';
import { useWorkOrders } from '../hooks';
import { WorkOrderStatusChip } from '../components';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import { WorkOrderStatus, WORK_ORDER_STATUS_CONFIG, type WorkOrderLookupItem } from '../../../types/work-order.types';
import { OtherSedesLookupHint } from '../../sedes/components/OtherSedesLookupHint';
import { ALL_LOCATIONS, useLocationStore } from '../../../store/locationStore';
import { sedeColumn } from '../../sedes/components/sedeColumn';
import { SedeQuickSelector } from '../../sedes/components/SedeQuickSelector';
import type { WorkOrder, FilterWorkOrdersDto } from '../../../types/work-order.types';
import { ExportDialog } from '../../../components/common/ExportDialog';
import { fetchAllPages } from '../../../utils/excelExport';
import { WORK_ORDER_EXPORT_COLUMNS } from '../utils/workOrderExportColumns';
import { workOrdersApi } from '../../../api/work-orders.api';
import { parseDateFilter } from '../../../utils/dateFilters';

const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

const getOgChipColor = (
  status: string,
): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'AUTHORIZED':
      return 'warning';
    case 'CREATED':
      return 'info';
    default:
      return 'default';
  }
};

const STATUS_OPTIONS: { value: WorkOrderStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: WorkOrderStatus.DRAFT, label: 'Borrador' },
  { value: WorkOrderStatus.CONFIRMED, label: 'Confirmada' },
  { value: WorkOrderStatus.IN_PRODUCTION, label: 'En Producción' },
  { value: WorkOrderStatus.READY, label: 'Lista para entrega' },
  { value: WorkOrderStatus.COMPLETED, label: 'Completada' },
  { value: WorkOrderStatus.CANCELLED, label: 'Cancelada' },
];

export const WorkOrdersListPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [filters, setFilters] = useState<FilterWorkOrdersDto>({
    page: 1,
    limit: 20,
  });

  const [confirmDelete, setConfirmDelete] = useState<WorkOrder | null>(null);

  const { workOrdersQuery, deleteWorkOrderMutation } = useWorkOrders(filters);

  const canCreate = hasPermission(PERMISSIONS.CREATE_WORK_ORDERS);
  const canUpdate = hasPermission(PERMISSIONS.UPDATE_WORK_ORDERS);
  const canDelete = hasPermission(PERMISSIONS.DELETE_WORK_ORDERS);
  const canExport = hasPermission(PERMISSIONS.EXPORT_WORK_ORDERS);
  const [exportOpen, setExportOpen] = useState(false);

  // Vista "Todas" del admin: una sola tabla con la columna de la sede de cada OT.
  const isAllSedes = useLocationStore((st) => st.activeLocationId === ALL_LOCATIONS);

  const handleFilterChange = (key: keyof FilterWorkOrdersDto, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));
  };

  const handleView = (workOrder: WorkOrder) => {
    navigate(ROUTES.WORK_ORDERS_DETAIL.replace(':id', workOrder.id));
  };

  const handleEdit = (workOrder: WorkOrder) => {
    navigate(ROUTES.WORK_ORDERS_EDIT.replace(':id', workOrder.id));
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteWorkOrderMutation.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
  };

  const workOrders = workOrdersQuery.data?.data ?? [];

  const rawColumns: ResponsiveGridColDef<WorkOrder>[] = useMemo(() => [
    {
      field: 'workOrderNumber',
      headerName: 'Nº OT',
      width: 150,
    },
    ...sedeColumn<WorkOrder>(isAllSedes),
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      responsive: 'sm',
      valueGetter: (_: any, row: WorkOrder) => row.order?.orderNumber ?? '-',
    },
    {
      field: 'expenseOrders',
      headerName: 'OG',
      width: 280,
      sortable: false,
      filterable: false,
      responsive: 'lg',
      renderCell: (params: GridRenderCellParams<WorkOrder>) => {
        const expenseOrders = params.row.expenseOrders ?? [];

        if (!expenseOrders.length) {
          return <Typography variant="body2" color="text.disabled">—</Typography>;
        }

        return (
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ py: 0.5, maxWidth: '100%' }}
          >
            {expenseOrders.map((og: any) => (
              <Chip
                key={og.id}
                icon={<ReceiptLongIcon sx={{ fontSize: '0.85rem !important' }} />}
                label={og.ogNumber}
                size="small"
                variant="outlined"
                color={getOgChipColor(og.status)}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', og.id));
                }}
                sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}
              />
            ))}
          </Stack>
        );
      },
    },
    {
      field: 'client',
      headerName: 'Cliente',
      width: 220,
      valueGetter: (_: any, row: WorkOrder) => row.order?.client?.name ?? '-',
    },
    {
      field: 'advisor',
      headerName: 'Creado Por',
      width: 180,
      responsive: 'md',
      valueGetter: (_: any, row: WorkOrder) => {
        const a = row.advisor;
        if (!a) return '-';
        return `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email;
      },
    },
    {
      field: 'orderAdvisor',
      headerName: 'Asesor',
      width: 180,
      responsive: 'md',
      valueGetter: (_: any, row: WorkOrder) => {
        const a = row.order?.createdBy;
        if (!a) return '-';
        return `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email;
      },
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 160,
      renderCell: (params: GridRenderCellParams<WorkOrder>) => <WorkOrderStatusChip status={params.value as WorkOrderStatus} />,
    },
    {
      field: 'createdAt',
      headerName: 'Creada',
      width: 170,
      responsive: 'sm',
      valueGetter: (_: any, row: WorkOrder) => (row.createdAt ? formatDate(row.createdAt) : '-'),
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 160,
      sortable: false,
      renderCell: (params: GridRenderCellParams<WorkOrder>) => (
        <ActionsCell
          onView={() => handleView(params.row)}
          onEdit={
            canUpdate && ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION'].includes(params.row.status)
              ? () => handleEdit(params.row)
              : undefined
          }
          onDelete={
            canDelete && params.row.status === 'DRAFT'
              ? () => setConfirmDelete(params.row)
              : undefined
          }
        />
      ),
    },
  ], [navigate, canUpdate, canDelete, isAllSedes]);

  const columns = useResponsiveColumns(rawColumns);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Órdenes de Trabajo"
        subtitle="Gestión de órdenes de trabajo para producción"
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canExport && (
              <Button
                variant="outlined"
                color="success"
                startIcon={<FileDownloadIcon />}
                onClick={() => setExportOpen(true)}
              >
                Exportar a Excel
              </Button>
            )}
            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate(ROUTES.WORK_ORDERS_CREATE)}
              >
                Nueva OT
              </Button>
            )}
          </Box>
        }
      />

      {/* Filtros */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          select
          label="Estado"
          value={filters.status ?? ''}
          onChange={(e) => handleFilterChange('status', e.target.value as WorkOrderStatus)}
          size="small"
          sx={{ minWidth: { xs: '100%', sm: 160 } }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <SedeQuickSelector />
      <DataTable
        density="compact"
        rows={workOrders}
        columns={columns}
        loading={workOrdersQuery.isLoading || workOrdersQuery.isFetching}
        rowCount={workOrdersQuery.data?.meta?.total ?? 0}
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
        searchValue={filters.search ?? ''}
        onSearchChange={(value) => handleFilterChange('search', value)}
        serverSideSearch
        onRowClick={handleView}
      />

      <OtherSedesLookupHint<WorkOrderLookupItem>
        type="OT"
        search={filters.search}
        localTotal={workOrdersQuery.isFetching ? undefined : workOrdersQuery.data?.meta?.total}
        lookup={workOrdersApi.lookup}
        describe={(w) => ({
          number: w.workOrderNumber,
          detail: `${w.order.orderNumber} · ${w.order.client.name} · ${WORK_ORDER_STATUS_CONFIG[w.status]?.label ?? w.status}`,
          path: `/work-orders/${w.id}`,
        })}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar Orden de Trabajo"
        message={`¿Estás seguro de que deseas eliminar la OT ${confirmDelete?.workOrderNumber}? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        isLoading={deleteWorkOrderMutation.isPending}
      />

      {/* Export to Excel Dialog */}
      {canExport && (
        <ExportDialog<WorkOrder>
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="Exportar Órdenes de Trabajo a Excel"
          entityLabel="órdenes de trabajo"
          fileNamePrefix="Ordenes_Trabajo"
          sheetName="Órdenes de Trabajo"
          columns={WORK_ORDER_EXPORT_COLUMNS}
          storageKey="work_orders_export_columns"
          dateRangeLabel="Rango de fechas (fecha de creación)"
          helperText="Se respetan los filtros activos de la pantalla (estado y búsqueda)."
          defaultDateFrom={
            parseDateFilter(filters.createdAtFrom)
          }
          defaultDateTo={
            parseDateFilter(filters.createdAtTo)
          }
          fetchRows={async ({ fromDate, toDate }) => {
            const { page: _p, limit: _l, ...activeFilters } = filters;
            return fetchAllPages(async (page, limit) => {
              const response = await workOrdersApi.getAll({
                ...activeFilters,
                createdAtFrom: fromDate,
                createdAtTo: toDate,
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

export default WorkOrdersListPage;
