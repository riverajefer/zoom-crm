import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  MenuItem,
  TextField,
  Autocomplete,
  Button,
  IconButton,
  Tooltip,
  Alert,
  AlertTitle,
} from '@mui/material';
import { Chip } from '@mui/material';
import { useResponsiveColumns, type ResponsiveGridColDef } from '../../../hooks';
import {
  ShoppingCart as ShoppingCartIcon,
  SwapHoriz as SwapHorizIcon,
  WarningAmber as WarningAmberIcon,
  Today as TodayIcon,
  Build as BuildIcon,
  FileDownload as FileDownloadIcon,
  FilterAlt as FilterAltIcon,
  FilterAltOff as FilterAltOffIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { ActionsCell } from '../../../components/common/DataTable/ActionsCell';
import { useOrders } from '../hooks';
import { useClients } from '../../clients/hooks/useClients';
import { useProductionAreas } from '../../production-areas/hooks/useProductionAreas';
import { useUsers } from '../../users/hooks/useUsers';
import { OrderStatusChip, ChangeStatusDialog, OrdersDashboardCards } from '../components';
import { ExportDialog } from '../../../components/common/ExportDialog';
import { fetchAllPages } from '../../../utils/excelExport';
import { ORDER_EXPORT_COLUMNS } from '../utils/orderExportColumns';
import {
  ORDER_ITEM_EXPORT_COLUMNS,
  explodeOrderItems,
} from '../utils/orderItemExportColumns';
import { ORDER_FLAT_EXPORT_COLUMNS } from '../utils/orderFlatExportColumns';
import {
  ORDER_PAYMENT_EXPORT_COLUMNS,
  explodeOrderPayments,
} from '../utils/orderPaymentExportColumns';
import {
  ORDER_AREA_FLAT_EXPORT_COLUMNS,
  explodeOrderItemAreas,
} from '../utils/orderAreaFlatExportColumns';
import { ordersApi } from '../../../api/orders.api';
import { storageApi } from '../../../api/storage.api';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getDaysSince,
} from '../utils/orderFormatters';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import type {
  Order,
  OrderStatus,
  FilterOrdersDto,
} from '../../../types/order.types';
import { ORDER_STATUS_OPTIONS } from '../../../types/order.types';
import type { Client } from '../../../types/client.types';
import { parseDateFilter, toDateFilterOrUndefined } from '../../../utils/dateFilters';

/**
 * Vigencia de los enlaces al soporte de pago dentro del Excel: 7 días, que es el
 * tope de una URL prefirmada con SigV4. Pasado ese plazo los links dejan de
 * abrir — el archivo es un instrumento de conciliación puntual, no un archivo
 * permanente.
 */
const RECEIPT_URL_EXPIRATION_SECONDS = 604800;

// Estados que se consideran "finalizados" — no se alertan aunque la fecha esté vencida
const CLOSED_STATUSES: OrderStatus[] = [
  'DELIVERED',
  'DELIVERED_ON_CREDIT',
  'WARRANTY',
  'PAID',
  'ANULADO',
];

type DeliveryAlert = 'overdue' | 'due-today' | null;

function getDeliveryAlert(order: Order): DeliveryAlert {
  if (!order.deliveryDate) return null;
  if (CLOSED_STATUSES.includes(order.status)) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const delivery = new Date(order.deliveryDate);
  delivery.setHours(0, 0, 0, 0);

  if (delivery < today) return 'overdue';
  if (delivery.getTime() === today.getTime()) return 'due-today';
  return null;
}

/**
 * Los filtros de esta pantalla se recuerdan entre visitas. El asesor suele
 * trabajar acotado a su área/cliente durante toda la jornada, así que perder la
 * selección cada vez que sale y vuelve era una molestia. Se guarda en
 * localStorage bajo esta llave.
 */
const FILTERS_STORAGE_KEY = 'orders_list_filters';

const DEFAULT_FILTERS: FilterOrdersDto = { page: 1, limit: 20 };

/**
 * Campos de `FilterOrdersDto` que sí queremos recordar. Dejamos fuera page/limit
 * (paginación efímera) y los rangos por fecha de abono, que solo usa el export.
 */
const PERSISTED_FILTER_KEYS: (keyof FilterOrdersDto)[] = [
  'status',
  'search',
  'clientId',
  'orderDateFrom',
  'orderDateTo',
  'productionAreaId',
  'createdById',
  'hasBalance',
  'paymentStatus',
  'deliveryStatus',
  'advancePaymentStatus',
];

const loadPersistedFilters = (): FilterOrdersDto => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw) as Partial<FilterOrdersDto>;
    const restored: FilterOrdersDto = { ...DEFAULT_FILTERS };
    PERSISTED_FILTER_KEYS.forEach((key) => {
      const value = parsed[key];
      if (value !== undefined && value !== null && value !== '') {
        (restored as any)[key] = value;
      }
    });
    // Siempre arrancamos en la primera página para no caer en una vacía.
    return { ...restored, page: 1 };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
};

export const OrdersListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * El Seguimiento de OP abre esta lista desde una celda de la matriz y manda los
   * filtros por router state. Pisan a los recordados en localStorage: si el usuario
   * hizo clic en «Nicole · Confirmadas · con saldo», eso es lo que espera ver.
   */
  const incomingFilters = (location.state as { orderFilters?: FilterOrdersDto } | null)
    ?.orderFilters;

  // Filtros (se restauran desde localStorage al montar)
  const [filters, setFilters] = useState<FilterOrdersDto>(() =>
    incomingFilters
      ? { ...DEFAULT_FILTERS, ...incomingFilters, page: 1 }
      : loadPersistedFilters(),
  );

  // Cada cambio de filtros se persiste para recordarlo en la próxima visita.
  useEffect(() => {
    try {
      const toPersist: Partial<FilterOrdersDto> = {};
      PERSISTED_FILTER_KEYS.forEach((key) => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          (toPersist as any)[key] = value;
        }
      });
      if (Object.keys(toPersist).length > 0) {
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(toPersist));
      } else {
        localStorage.removeItem(FILTERS_STORAGE_KEY);
      }
    } catch {
      /* localStorage no disponible: seguimos sin persistir */
    }
  }, [filters]);

  // UI state
  const [confirmDelete, setConfirmDelete] = useState<Order | null>(null);
  const [changeStatusOrder, setChangeStatusOrder] = useState<Order | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);

  const { hasPermission } = useAuthStore();
  const canExport = hasPermission(PERMISSIONS.EXPORT_ORDERS);

  // Queries
  const { ordersQuery, deleteOrderMutation, updateStatusMutation } =
    useOrders(filters);
  const { clientsQuery } = useClients({ includeInactive: false });
  const { productionAreasQuery } = useProductionAreas();
  const { usersQuery } = useUsers();

  const orders = ordersQuery.data?.data || [];
  const clients = clientsQuery.data || [];
  const productionAreas = productionAreasQuery.data || [];
  const users = usersQuery.data || [];

  const selectedClient = filters.clientId
    ? clients.find((c) => c.id === filters.clientId)
    : null;
    
  const selectedArea = filters.productionAreaId
    ? productionAreas.find((a: any) => a.id === filters.productionAreaId)
    : null;

  const selectedUser = filters.createdById
    ? users.find((u: any) => u.id === filters.createdById)
    : null;

  // Handlers
  const handleFilterChange = (key: keyof FilterOrdersDto, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset page when filters change
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      page: 1,
      limit: 20,
    });
  };

  const handleViewOrder = (order: Order) => {
    navigate(`/orders/${order.id}`);
  };

  const handleEditOrder = (order: Order) => {
    navigate(`/orders/${order.id}/edit`);
  };

  const handleDeleteOrder = async () => {
    if (!confirmDelete) return;

    try {
      await deleteOrderMutation.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleChangeStatus = async (newStatus: OrderStatus) => {
    if (!changeStatusOrder) return;

    try {
      await updateStatusMutation.mutateAsync({
        id: changeStatusOrder.id,
        status: newStatus,
      });
    } catch (error) {
      // Relanzar el error para que el componente ChangeStatusDialog lo maneje
      // Especialmente importante para errores 403 que requieren autorización
      throw error;
    }
  };

  // Columns definition with responsive breakpoints
  const rawColumns: ResponsiveGridColDef[] = useMemo(() => [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 130,
      minWidth: 100,
      resizable: false,
      headerClassName: 'sticky-column-order-number',
      cellClassName: 'sticky-column-order-number',
      renderCell: (params: any) => (
        <Box sx={{ fontWeight: 600, color: 'secondary.main' }}>
          {params.value}
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 140,
      renderCell: (params: any) => <OrderStatusChip status={params.value} />,
    },
    {
      field: 'client',
      headerName: 'Cliente',
      flex: 1,
      minWidth: 150,
      valueGetter: (_: any, row: any) => row.client.name,
    },
    {
      field: 'workOrders',
      headerName: 'OT',
      width: 140,
      sortable: false,
      filterable: false,
      responsive: 'md',
      renderCell: (params: any) => {
        const workOrder = params.row.workOrders?.[0];
        if (!workOrder)
          return (
            <Box sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>—</Box>
          );
        return (
          <Tooltip title='Ver Orden de Trabajo'>
            <Chip
              icon={<BuildIcon sx={{ fontSize: '0.85rem !important' }} />}
              label={workOrder.workOrderNumber}
              size='small'
              variant='outlined'
              color='primary'
              onClick={(e: any) => {
                e.stopPropagation();
                navigate(
                  ROUTES.WORK_ORDERS_DETAIL.replace(':id', workOrder.id),
                );
              }}
              sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: 'orderDate',
      headerName: 'Fecha Orden',
      width: 150,
      responsive: 'md',
      renderCell: (params: any) => formatDateTime(params.value),
    },
    {
      field: 'deliveryDate',
      headerName: 'F. Entrega',
      width: 140,
      responsive: 'sm',
      renderCell: (params: any) => {
        if (!params.value) return '-';

        const alert = getDeliveryAlert(params.row);
        const dateStr = formatDate(params.value);

        if (alert === 'overdue') {
          return (
            <Tooltip title='Retraso en la entrega o el cliente no ha recogido el producto'>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'error.main',
                  fontWeight: 600,
                }}
              >
                <WarningAmberIcon fontSize='small' />
                <span>{dateStr}</span>
              </Box>
            </Tooltip>
          );
        }

        if (alert === 'due-today') {
          return (
            <Tooltip title='Se entrega hoy'>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'info.main',
                  fontWeight: 600,
                }}
              >
                <TodayIcon fontSize='small' />
                <span>{dateStr}</span>
              </Box>
            </Tooltip>
          );
        }

        return dateStr;
      },
    },
    {
      field: 'daysSinceCreation',
      headerName: 'Días',
      width: 90,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      responsive: 'lg',
      valueGetter: (_: any, row: any) => getDaysSince(row.createdAt),
      renderCell: (params: any) => {
        const days = params.value as number;
        let text = `${days} días`;
        if (days === 0) text = 'Hoy';
        else if (days === 1) text = '1 día';

        return (
          <Tooltip title={`Creado el ${formatDateTime(params.row.createdAt)}`}>
            <span style={{ cursor: 'help', borderBottom: '1px dotted #888' }}>{text}</span>
          </Tooltip>
        );
      },
    },
    {
      field: 'createdBy',
      headerName: 'Asesor',
      width: 140,
      responsive: 'lg',
      valueGetter: (_: any, row: any) =>
        row.createdBy?.firstName + ' ' + row.createdBy?.lastName,
    },
    {
      field: 'productionAreas',
      headerName: 'Áreas',
      width: 150,
      responsive: 'md',
      sortable: false,
      renderCell: (params: any) => {
        const areas = new Set<string>();
        params.row.items?.forEach((item: any) => {
          item.productionAreas?.forEach((pa: any) => {
            if (pa.productionArea?.name) {
              areas.add(pa.productionArea.name);
            }
          });
        });
        
        if (areas.size === 0) return <span style={{ color: '#aaa' }}>-</span>;
        
        const areasList = Array.from(areas);
        return (
          <Tooltip title={areasList.join(', ')}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxHeight: '100%', overflow: 'hidden' }}>
              {areasList.slice(0, 2).map((area, idx) => (
                <Chip key={idx} label={area} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
              ))}
              {areasList.length > 2 && (
                <Chip label={`+${areasList.length - 2}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
              )}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'taxRate',
      headerName: 'IVA',
      width: 70,
      align: 'center',
      headerAlign: 'center',
      responsive: 'lg',
      renderCell: (params: any) => {
        const hasIva = parseFloat(params.value) > 0;
        return (
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
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
      field: 'requiresColorProof',
      headerName: 'P. Color',
      width: 100,
      responsive: 'lg',
      renderCell: (params: any) => (
        <Box
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 1,
            color: params.value ? 'success.dark' : 'text.secondary',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        >
          {params.value ? 'Sí' : 'No'}
        </Box>
      ),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params: any) => formatCurrency(params.value),
    },
    {
      field: 'paidAmount',
      headerName: 'Anticipo',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      responsive: 'md',
      renderCell: (params: any) => {
        const paid = parseFloat(params.value);
        return (
          <Box
            sx={{
              color: paid > 0 ? 'info.main' : 'text.disabled',
              fontWeight: 500,
            }}
          >
            {formatCurrency(params.value)}
          </Box>
        );
      },
    },
    {
      field: 'balance',
      headerName: 'Saldo',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      responsive: 'md',
      renderCell: (params: any) => {
        const balance = parseFloat(params.value);
        return (
          <Box
            sx={{
              color: balance > 0 ? 'warning.main' : 'success.main',
              fontWeight: 500,
            }}
          >
            {formatCurrency(params.value)}
          </Box>
        );
      },
    },
    {
      field: 'advancePaymentStatus',
      headerName: 'Estado Anticipo',
      width: 165,
      responsive: 'md',
      renderCell: (params: any) => {
        const status = params.value;
        if (!status) return <Box sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>—</Box>;
        const config: Record<string, { label: string; color: 'warning' | 'success' | 'error' }> = {
          PENDING: { label: 'Pendiente', color: 'warning' },
          APPROVED: { label: 'Aprobado', color: 'success' },
          REJECTED: { label: 'Rechazado', color: 'error' },
        };
        const c = config[status];
        return c ? <Chip label={c.label} color={c.color} size='small' /> : <>{status}</>;
      },
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 160,
      sortable: false,
      renderCell: (params: any) => {
        const canEdit = !['DELIVERED'].includes(params.row.status);
        const canDelete = ['DRAFT'].includes(params.row.status);

        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <ActionsCell
              onView={() => handleViewOrder(params.row)}
              onEdit={canEdit ? () => handleEditOrder(params.row) : undefined}
              onDelete={
                canDelete ? () => setConfirmDelete(params.row) : undefined
              }
            />
            <Tooltip title='Cambiar estado'>
              <IconButton
                size='small'
                color='primary'
                onClick={(e: any) => {
                  e.stopPropagation();
                  setChangeStatusOrder(params.row);
                }}
              >
                <SwapHorizIcon fontSize='small' />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ], [navigate]);

  const columns = useResponsiveColumns(rawColumns);

  const hasActiveFilters =
    filters.status ||
    filters.clientId ||
    filters.orderDateFrom ||
    filters.orderDateTo ||
    filters.search ||
    filters.productionAreaId ||
    filters.createdById ||
    filters.hasBalance ||
    filters.advancePaymentStatus;

  // Elimina uno o varios filtros de la selección activa (usado por los chips).
  const clearFilterKeys = (keys: (keyof FilterOrdersDto)[]) => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      keys.forEach((key) => delete next[key]);
      return next;
    });
  };

  const formatDateLabel = (value?: string) => {
    const date = parseDateFilter(value);
    return date ? date.toLocaleDateString('es-CO') : '';
  };

  // Resumen legible de TODOS los filtros activos. Se muestra en el aviso
  // superior como chips que el usuario puede quitar uno a uno.
  const activeFilterChips: Array<{
    label: string;
    keys: (keyof FilterOrdersDto)[];
  }> = [
    ...(filters.status
      ? [
          {
            label: `Estado: ${
              ORDER_STATUS_OPTIONS.find((o) => o.value === filters.status)
                ?.label ?? filters.status
            }`,
            keys: ['status' as const],
          },
        ]
      : []),
    ...(selectedArea
      ? [{ label: `Área: ${selectedArea.name}`, keys: ['productionAreaId' as const] }]
      : []),
    ...(selectedUser
      ? [
          {
            label: `Asesor: ${selectedUser.firstName ?? ''} ${
              selectedUser.lastName ?? ''
            }`.trim(),
            keys: ['createdById' as const],
          },
        ]
      : []),
    ...(selectedClient
      ? [{ label: `Cliente: ${selectedClient.name}`, keys: ['clientId' as const] }]
      : []),
    ...(filters.orderDateFrom || filters.orderDateTo
      ? [
          {
            label: `Fecha: ${formatDateLabel(filters.orderDateFrom) || '…'} — ${
              formatDateLabel(filters.orderDateTo) || '…'
            }`,
            keys: ['orderDateFrom' as const, 'orderDateTo' as const],
          },
        ]
      : []),
    ...(filters.search
      ? [{ label: `Búsqueda: "${filters.search}"`, keys: ['search' as const] }]
      : []),
    ...(filters.deliveryStatus
      ? [
          {
            label:
              filters.deliveryStatus === 'DELIVERED'
                ? 'Ya entregadas'
                : 'Sin marcar entrega',
            keys: ['deliveryStatus' as const],
          },
        ]
      : []),
    ...(filters.paymentStatus
      ? [
          {
            label:
              filters.paymentStatus === 'PAID'
                ? 'Pagadas al 100%'
                : 'Con saldo pendiente',
            keys: ['paymentStatus' as const],
          },
        ]
      : []),
    ...(filters.hasBalance
      ? [{ label: 'Con saldo por cobrar', keys: ['hasBalance' as const] }]
      : []),
    ...(filters.advancePaymentStatus
      ? [
          {
            label: `Anticipo: ${filters.advancePaymentStatus}`,
            keys: ['advancePaymentStatus' as const],
          },
        ]
      : []),
  ];

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title='Órdenes de Pedido'
        breadcrumbs={[{ label: 'Órdenes' }]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canExport && (
              <Button
                variant='outlined'
                startIcon={<FileDownloadIcon />}
                onClick={() => setExportOpen(true)}
              >
                Exportar a Excel
              </Button>
            )}
            <Button
              variant='contained'
              startIcon={<ShoppingCartIcon />}
              onClick={() => navigate('/orders/new')}
            >
              Nueva Orden
            </Button>
          </Box>
        }
      />

      {/* Mini dashboard */}
      {hasPermission(PERMISSIONS.READ_ORDERS_DASHBOARD) && (
        <OrdersDashboardCards
          onFilterClick={(params) =>
            setFilters((prev) => ({ ...prev, ...params, page: 1 }))
          }
        />
      )}

      {/* Aviso de filtros activos (se recuerdan entre visitas) */}
      {hasActiveFilters && (
        <Alert
          severity='info'
          icon={<FilterAltIcon />}
          sx={{
            mb: 2,
            mt: 2,
            '& .MuiAlert-message': { width: '100%' },
          }}
          action={
            <Button
              color='inherit'
              size='small'
              startIcon={<FilterAltOffIcon />}
              onClick={handleClearFilters}
            >
              Limpiar filtros
            </Button>
          }
        >
          <AlertTitle sx={{ fontWeight: 700 }}>
            Tienes filtros activos
          </AlertTitle>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            {activeFilterChips.map((chip) => (
              <Chip
                key={chip.label}
                label={chip.label}
                size='small'
                color='info'
                onDelete={() => clearFilterKeys(chip.keys)}
              />
            ))}
          </Box>
          <Box sx={{ fontSize: '0.8rem', opacity: 0.85 }}>
            Esta selección se recordará la próxima vez que ingreses a esta
            pantalla. Usa «Limpiar filtros» o la ✕ de cada etiqueta para
            quitarla.
          </Box>
        </Alert>
      )}

      {/* Filtros */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '1fr 1fr',
            md: 'repeat(3, 1fr)',
            lg: '1fr 1fr 1fr 1.5fr 1fr 1fr auto',
          },
          gap: 2,
          mb: 3,
          mt: 2,
        }}
      >
        {/* Estado */}
        <TextField
          select
          label='Estado'
          value={filters.status || ''}
          onChange={(e) =>
            handleFilterChange('status', e.target.value || undefined)
          }
          fullWidth
          size='small'
        >
          <MenuItem value=''>Todos los estados</MenuItem>
          {ORDER_STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {/* Área de producción */}
        <Autocomplete
          /* Remonta al terminar de cargar las áreas para que un filtro
             restaurado de localStorage se muestre dentro del campo. */
          key={`area-${productionAreasQuery.isLoading ? 'loading' : 'ready'}`}
          fullWidth
          size='small'
          options={productionAreas}
          value={selectedArea}
          onChange={(_, newValue) =>
            handleFilterChange('productionAreaId', newValue?.id)
          }
          isOptionEqualToValue={(option: any, value: any) =>
            option.id === value?.id
          }
          getOptionLabel={(option: any) => option.name}
          renderInput={(params) => (
            <TextField
              {...params}
              label='Área Producción'
              placeholder='Todas las áreas'
            />
          )}
          loading={productionAreasQuery.isLoading}
        />

        {/* Asesor */}
        <Autocomplete
          key={`user-${usersQuery.isLoading ? 'loading' : 'ready'}`}
          fullWidth
          size='small'
          options={users}
          value={selectedUser}
          onChange={(_, newValue) =>
            handleFilterChange('createdById', newValue?.id)
          }
          isOptionEqualToValue={(option: any, value: any) =>
            option.id === value?.id
          }
          getOptionLabel={(option: any) => `${option.firstName} ${option.lastName}`}
          renderInput={(params) => (
            <TextField
              {...params}
              label='Asesor'
              placeholder='Todos los asesores'
            />
          )}
          loading={usersQuery.isLoading}
        />

        {/* Cliente */}
        <Autocomplete
          key={`client-${clientsQuery.isLoading ? 'loading' : 'ready'}`}
          fullWidth
          size='small'
          options={clients}
          value={selectedClient}
          onChange={(_, newValue) =>
            handleFilterChange('clientId', newValue?.id)
          }
          isOptionEqualToValue={(option: Client, value: Client) =>
            option.id === value?.id
          }
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

        {/* Fecha Desde */}
        <DatePicker
          label='Fecha Desde'
          value={parseDateFilter(filters.orderDateFrom) ?? null}
          onChange={(date) =>
            handleFilterChange('orderDateFrom', toDateFilterOrUndefined(date))
          }
          slotProps={{
            textField: { size: 'small', fullWidth: true },
          }}
        />

        {/* Fecha Hasta */}
        <DatePicker
          label='Fecha Hasta'
          value={parseDateFilter(filters.orderDateTo) ?? null}
          onChange={(date) =>
            handleFilterChange('orderDateTo', toDateFilterOrUndefined(date))
          }
          slotProps={{
            textField: { size: 'small', fullWidth: true },
          }}
        />

        {/* Limpiar Filtros */}
        {hasActiveFilters && (
          <Button
            variant='outlined'
            onClick={handleClearFilters}
            size='large'
            sx={{ height: 40 }}
          >
            Limpiar Filtros
          </Button>
        )}
      </Box>

      {/* Tabla */}
      <DataTable
        density='compact'
        rows={orders}
        columns={columns}
        loading={ordersQuery.isLoading || ordersQuery.isFetching}
        getRowId={(row) => row.id}
        onRowClick={handleViewOrder}
        pageSize={filters.limit ?? 20}
        pageSizeOptions={[20, 50, 100]}
        rowCount={ordersQuery.data?.meta.total ?? 0}
        currentPage={(filters.page ?? 1) - 1}
        onPaginationModelChange={(model) =>
          setFilters((prev) => ({
            ...prev,
            page: model.page + 1,
            limit: model.pageSize,
          }))
        }
        searchValue={filters.search || ''}
        onSearchChange={(value) => handleFilterChange('search', value)}
        serverSideSearch={true}
        columnSettingsKey='orders'
        lockedColumnFields={['orderNumber', 'actions']}
        searchPlaceholder='Buscar por número, cliente, notas...'
        emptyMessage='No se encontraron órdenes'
        getRowClassName={(params) => {
          if (params.row.status === 'ANULADO') return 'row-anulado';
          // Anticipo pendiente/rechazado tiene prioridad visual
          if (params.row.advancePaymentStatus === 'PENDING') return 'row-advance-pending';
          if (params.row.advancePaymentStatus === 'REJECTED') return 'row-advance-rejected';
          const alert = getDeliveryAlert(params.row);
          if (alert === 'overdue') return 'row-overdue';
          if (alert === 'due-today') return 'row-due-today';
          return '';
        }}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={!!confirmDelete}
        title='Eliminar Orden'
        message={`¿Está seguro que desea eliminar la orden ${confirmDelete?.orderNumber}? Esta acción no se puede deshacer.`}
        onConfirm={handleDeleteOrder}
        onCancel={() => setConfirmDelete(null)}
        isLoading={deleteOrderMutation.isPending}
      />

      {/* Change Status Dialog */}
      <ChangeStatusDialog
        open={!!changeStatusOrder}
        order={changeStatusOrder}
        onClose={() => setChangeStatusOrder(null)}
        onConfirm={handleChangeStatus}
        isLoading={updateStatusMutation.isPending}
      />

      {/* Export to Excel Dialog */}
      {canExport && (
        <ExportDialog<Order>
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title='Exportar Órdenes a Excel'
          entityLabel='órdenes'
          fileNamePrefix='Ordenes_Pedido'
          sheetName='Órdenes de Pedido'
          columns={ORDER_EXPORT_COLUMNS}
          storageKey='orders_export_columns'
          dateRangeLabel='Rango de fechas'
          dateFieldOptions={[
            { value: 'order', label: 'Por fecha de orden' },
            {
              value: 'payment',
              label: 'Por fecha de pago (conciliación bancaria)',
              fileNameTag: 'por-fecha-de-pago',
            },
          ]}
          defaultDateField='order'
          helperText='Se respetan los filtros activos de la pantalla (estado, cliente, asesor, área y búsqueda). «Por fecha de pago» trae las órdenes con abonos en el rango, aunque la orden sea anterior, y deja fuera las que todavía no tienen ningún abono; la hoja «Pagos» solo incluye esos abonos. Para un informe de ventas del mes usa «Por fecha de orden». Esa hoja trae una fila por abono con «Registrado por», «¿En Caja?» (filtrar por «No» aísla los pagos que nunca llegaron al historial de caja), «Recibo Caja» y un enlace al soporte válido por 7 días.'
          defaultDateFrom={
            parseDateFilter(filters.orderDateFrom)
          }
          defaultDateTo={
            parseDateFilter(filters.orderDateTo)
          }
          fetchRows={async ({ fromDate, toDate, dateField }) => {
            // Se descartan page/limit de la pantalla para usar los del export.
            const { page: _p, limit: _l, ...activeFilters } = filters;
            // El rango se aplica a la fecha de orden o a la de abono según lo
            // elegido en el diálogo; nunca a las dos a la vez.
            const dateRangeFilter =
              dateField === 'payment'
                ? { paymentDateFrom: fromDate, paymentDateTo: toDate }
                : { orderDateFrom: fromDate, orderDateTo: toDate };
            const orders = await fetchAllPages(async (page, limit) => {
              const response = await ordersApi.getAll({
                ...activeFilters,
                orderDateFrom: undefined,
                orderDateTo: undefined,
                ...dateRangeFilter,
                page,
                limit,
              });
              return response.data ?? [];
            });

            // La hoja «Pagos» enlaza el soporte de cada abono. Las URLs se piden
            // en UN solo request (no una por pago) y se adjuntan al pago para
            // que `explodeOrderPayments` siga siendo síncrono.
            const receiptFileIds = [
              ...new Set(
                orders
                  .flatMap((order) => order.payments ?? [])
                  .map((payment) => payment.receiptFileId)
                  .filter((id): id is string => Boolean(id)),
              ),
            ];

            if (receiptFileIds.length === 0) return orders;

            let receiptUrls: Record<string, string> = {};
            try {
              receiptUrls = await storageApi.getSignedUrls(
                receiptFileIds,
                RECEIPT_URL_EXPIRATION_SECONDS,
              );
            } catch {
              // Si falla la firma, el Excel sale igual: la columna «Soporte»
              // dirá "No disponible" en vez de abortar toda la exportación.
              return orders;
            }

            return orders.map((order) => ({
              ...order,
              payments: (order.payments ?? []).map((payment) => ({
                ...payment,
                receiptUrl: payment.receiptFileId
                  ? receiptUrls[payment.receiptFileId]
                  : undefined,
              })),
            }));
          }}
          detailSheets={[
            {
              toggleLabel: 'Incluir detalle de productos (hoja «Items»)',
              sheetName: 'Items',
              columns: ORDER_ITEM_EXPORT_COLUMNS,
              explode: explodeOrderItems,
              storageKey: 'orders_export_include_items',
              defaultChecked: true,
            },
            {
              toggleLabel:
                'Incluir detalle de abonos (hoja «Pagos», una fila por pago)',
              sheetName: 'Pagos',
              columns: ORDER_PAYMENT_EXPORT_COLUMNS,
              explode: explodeOrderPayments,
              storageKey: 'orders_export_include_payments',
              defaultChecked: true,
            },
            {
              toggleLabel:
                'Incluir hoja aplanada (orden + producto por fila)',
              sheetName: 'Aplanado',
              columns: ORDER_FLAT_EXPORT_COLUMNS,
              explode: explodeOrderItems,
              storageKey: 'orders_export_include_flat',
              defaultChecked: false,
            },
            {
              toggleLabel:
                'Incluir hoja aplanada por área (orden + producto + área)',
              sheetName: 'Aplanado por Área',
              columns: ORDER_AREA_FLAT_EXPORT_COLUMNS,
              explode: explodeOrderItemAreas,
              storageKey: 'orders_export_include_area_flat',
              defaultChecked: false,
            },
          ]}
        />
      )}
    </Box>
  );
};

export default OrdersListPage;
