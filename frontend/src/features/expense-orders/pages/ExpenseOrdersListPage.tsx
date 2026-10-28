import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stack,
  MenuItem,
  TextField,
  Button,
  Chip,
} from '@mui/material';
import { GridRenderCellParams } from '@mui/x-data-grid';
import { useResponsiveColumns, type ResponsiveGridColDef } from '../../../hooks';
import {
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { ActionsCell } from '../../../components/common/DataTable/ActionsCell';
import { useExpenseOrders } from '../hooks';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import {
  ExpenseOrderStatus,
  EXPENSE_ORDER_STATUS_CONFIG,
  type ExpenseOrder,
  type FilterExpenseOrdersDto,
} from '../../../types/expense-order.types';
import { ExportDialog } from '../../../components/common/ExportDialog';
import { fetchAllPages } from '../../../utils/excelExport';
import { EXPENSE_ORDER_EXPORT_COLUMNS } from '../utils/expenseOrderExportColumns';
import {
  EXPENSE_ORDER_ITEM_EXPORT_COLUMNS,
  explodeExpenseOrderItems,
} from '../utils/expenseOrderItemExportColumns';
import { expenseOrdersApi } from '../../../api/expense-orders.api';
import { parseDateFilter } from '../../../utils/dateFilters';
import { formatCurrency } from '../../../utils/formatters';

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));

// Se puede eliminar mientras nadie haya firmado la OG. Desde «Autorizada
// (Admin)» en adelante ya hay aprobaciones y movimiento de caja detrás, así que
// el backend la rechaza; también si ya tuvo la firma y volvió a Creada
// (`authorizedAt`). Debe coincidir con `remove` del servicio.
const DELETABLE_STATUSES: ExpenseOrderStatus[] = [
  ExpenseOrderStatus.DRAFT,
  ExpenseOrderStatus.CREATED,
];

const STATUS_OPTIONS: { value: ExpenseOrderStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: ExpenseOrderStatus.DRAFT, label: 'Borrador' },
  { value: ExpenseOrderStatus.CREATED, label: 'Creada' },
  { value: ExpenseOrderStatus.ADMIN_AUTHORIZED, label: 'Autorizada (Admin)' },
  { value: ExpenseOrderStatus.AUTHORIZED, label: 'Autorizada (Caja)' },
  { value: ExpenseOrderStatus.PAID, label: 'Pagada' },
];

export const ExpenseOrdersListPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [filters, setFilters] = useState<FilterExpenseOrdersDto>({ page: 1, limit: 20 });
  const [confirmDelete, setConfirmDelete] = useState<ExpenseOrder | null>(null);

  const { expenseOrdersQuery, deleteExpenseOrderMutation } = useExpenseOrders(filters);

  const canCreate = hasPermission(PERMISSIONS.CREATE_EXPENSE_ORDERS);
  const canUpdate = hasPermission(PERMISSIONS.UPDATE_EXPENSE_ORDERS);
  const canDelete = hasPermission(PERMISSIONS.DELETE_EXPENSE_ORDERS);
  const canExport = hasPermission(PERMISSIONS.EXPORT_EXPENSE_ORDERS);
  const [exportOpen, setExportOpen] = useState(false);

  const handleFilterChange = (key: keyof FilterExpenseOrdersDto, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));
  };

  const handleView = (og: ExpenseOrder) => {
    navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', og.id));
  };

  const handleEdit = (og: ExpenseOrder) => {
    navigate(ROUTES.EXPENSE_ORDERS_EDIT.replace(':id', og.id));
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteExpenseOrderMutation.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
  };

  const expenseOrders = expenseOrdersQuery.data?.data ?? [];

  const rawColumns: ResponsiveGridColDef<ExpenseOrder>[] = useMemo(() => [
    {
      field: 'ogNumber',
      headerName: 'Nº OG',
      width: 140,
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => (
        <Box
          sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }}
          onClick={() => handleView(row)}
        >
          {row.ogNumber}
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => {
        const config = EXPENSE_ORDER_STATUS_CONFIG[row.status];
        return <Chip label={config.label} color={config.color} size="small" />;
      },
    },
    {
      field: 'expenseType',
      headerName: 'Tipo',
      width: 140,
      responsive: 'sm',
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => row.expenseType.name,
    },
    {
      field: 'expenseSubcategory',
      headerName: 'Subcategoría',
      width: 160,
      responsive: 'md',
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => row.expenseSubcategory.name,
    },
    {
      field: 'authorizedTo',
      headerName: 'Autorizado a',
      flex: 1,
      responsive: 'md',
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) =>
        row.authorizedTo
          ? `${row.authorizedTo.firstName ?? ''} ${row.authorizedTo.lastName ?? ''}`.trim() ||
            row.authorizedTo.email
          : '—',
    },
    {
      field: 'workOrder',
      headerName: 'OT',
      width: 130,
      responsive: 'lg',
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => row.workOrder?.workOrderNumber ?? '—',
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 130,
      responsive: 'sm',
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => {
        const total = row.items.reduce((acc: number, item: any) => acc + Number(item.total), 0);
        return formatCurrency(total);
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha',
      width: 120,
      responsive: 'sm',
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => formatDate(row.createdAt),
    },
    {
      field: 'actions',
      headerName: '',
      width: 120,
      sortable: false,
      renderCell: ({ row }: GridRenderCellParams<ExpenseOrder>) => (
        <ActionsCell
          onView={() => handleView(row)}
          onEdit={canUpdate && row.status === ExpenseOrderStatus.DRAFT ? () => handleEdit(row) : undefined}
          onDelete={
            canDelete && DELETABLE_STATUSES.includes(row.status) && !row.authorizedAt
              ? () => setConfirmDelete(row)
              : undefined
          }
        />
      ),
    },
  ], [canUpdate, canDelete]);

  const columns = useResponsiveColumns(rawColumns);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Órdenes de Gastos"
        subtitle="Gestión de gastos de la empresa"
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
                onClick={() => navigate(ROUTES.EXPENSE_ORDERS_CREATE)}
              >
                Nueva OG
              </Button>
            )}
          </Box>
        }
      />

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          select
          label="Estado"
          size="small"
          value={filters.status ?? ''}
          onChange={(e) => handleFilterChange('status', e.target.value as ExpenseOrderStatus)}
          sx={{ minWidth: { xs: '100%', sm: 150 } }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Buscar"
          size="small"
          placeholder="Nº OG o usuario..."
          value={filters.search ?? ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 200 } }}
        />
      </Stack>

      <DataTable
        density="compact"
        columns={columns}
        rows={expenseOrders}
        loading={expenseOrdersQuery.isLoading || expenseOrdersQuery.isFetching}
        rowCount={expenseOrdersQuery.data?.meta?.total ?? 0}
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
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar Orden de Gasto"
        message={`¿Está seguro que desea eliminar la OG ${confirmDelete?.ogNumber}? Se elimina también su cuenta por pagar y el consecutivo no se reutiliza. Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        isLoading={deleteExpenseOrderMutation.isPending}
      />

      {/* Export to Excel Dialog */}
      {canExport && (
        <ExportDialog<ExpenseOrder>
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="Exportar Órdenes de Gasto a Excel"
          entityLabel="órdenes de gasto"
          fileNamePrefix="Ordenes_Gasto"
          sheetName="Órdenes de Gasto"
          columns={EXPENSE_ORDER_EXPORT_COLUMNS}
          storageKey="expense_orders_export_columns"
          dateRangeLabel="Rango de fechas (fecha de creación)"
          helperText="Se respetan los filtros activos de la pantalla (estado, tipo de gasto y búsqueda)."
          defaultDateFrom={
            parseDateFilter(filters.createdAtFrom)
          }
          defaultDateTo={
            parseDateFilter(filters.createdAtTo)
          }
          fetchRows={async ({ fromDate, toDate }) => {
            const { page: _p, limit: _l, ...activeFilters } = filters;
            return fetchAllPages(async (page, limit) => {
              const response = await expenseOrdersApi.getAll({
                ...activeFilters,
                createdAtFrom: fromDate,
                createdAtTo: toDate,
                page,
                limit,
              });
              return response.data ?? [];
            });
          }}
          detailSheets={[
            {
              toggleLabel: 'Incluir detalle de ítems (hoja aparte)',
              sheetName: 'Ítems de Gasto',
              columns: EXPENSE_ORDER_ITEM_EXPORT_COLUMNS,
              explode: explodeExpenseOrderItems,
              storageKey: 'expense_orders_export_include_items',
              defaultChecked: true,
            },
          ]}
        />
      )}
    </Box>
  );
};

export default ExpenseOrdersListPage;
