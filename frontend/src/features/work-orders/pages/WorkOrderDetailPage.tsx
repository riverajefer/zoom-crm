import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Stack,
  Card,
  CardContent,
  Typography,
  Button,
  Divider,
  Chip,
  Grid,
  MenuItem,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import {
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
  AccountTree as AccountTreeIcon,
  ReceiptLong as ReceiptLongIcon,
  AccessTime as AccessTimeIcon,
  PrecisionManufacturing as PrecisionManufacturingIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { PageHeader } from '../../../components/common/PageHeader';
import { StatusHighlight } from '../../../components/common/StatusHighlight';

import { DocumentTypeBanner } from '../../../components/common/DocumentTypeBanner';
import { ToolbarButton } from '../../orders/components/ToolbarButton';
import { ActionToolbar } from '../../orders/components/ActionToolbar';
import { getAliveQuantity } from '../../orders/utils/partialAnnulment';
import { useWorkOrder } from '../hooks';
import { WorkOrderStatusChip, WorkOrderPdfButton } from '../components';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import {
  WorkOrderStatus,
  WORK_ORDER_STATUS_CONFIG,
  WorkOrderTimeEntry,
  WorkOrderTimeEntryType,
} from '../../../types/work-order.types';
import { EXPENSE_ORDER_STATUS_CONFIG } from '../../../types/expense-order.types';
import { CommentSection } from '../../comments';
import { storageApi } from '../../../api/storage.api';

const formatDate = (date?: string | null): string => {
  if (!date) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

const formatCurrency = (value?: string | null): string => {
  if (!value) return '-';
  const num = parseFloat(value);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
};

const formatHours = (value?: string | null): string => {
  if (!value) return '-';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return '-';
  return `${num.toFixed(2)} h`;
};

const getUserDisplayName = (entry: WorkOrderTimeEntry): string => {
  const fullName = `${entry.user.firstName ?? ''} ${entry.user.lastName ?? ''}`.trim();
  return fullName || entry.user.email;
};

const toDateTimeLocalValue = (iso?: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toIsoOrUndefined = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.DRAFT]: [WorkOrderStatus.CONFIRMED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.CONFIRMED]: [WorkOrderStatus.IN_PRODUCTION, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.IN_PRODUCTION]: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

export const WorkOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { hasPermission } = useAuthStore();

  const {
    workOrderQuery,
    updateStatusMutation,
    createTimeEntryMutation,
    updateTimeEntryMutation,
  } = useWorkOrder(id);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<WorkOrderStatus | ''>('');
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [editingTimeEntry, setEditingTimeEntry] = useState<WorkOrderTimeEntry | null>(null);
  const [timeEntryType, setTimeEntryType] = useState<WorkOrderTimeEntryType>(WorkOrderTimeEntryType.HOURS);
  const [selectedWorkOrderItemId, setSelectedWorkOrderItemId] = useState<string>('');
  const [workedDate, setWorkedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [hoursWorked, setHoursWorked] = useState<string>('');
  const [startAt, setStartAt] = useState<string>('');
  const [endAt, setEndAt] = useState<string>('');
  const [timeEntryNotes, setTimeEntryNotes] = useState<string>('');

  const canUpdate = hasPermission(PERMISSIONS.UPDATE_WORK_ORDERS);
  const canCreateExpenseOrder = hasPermission(PERMISSIONS.CREATE_EXPENSE_ORDERS);
  const canCreateProductionOrder = hasPermission(PERMISSIONS.CREATE_PRODUCTION_ORDERS);

  const workOrder = workOrderQuery.data;

  const handleStatusChange = async () => {
    if (!id || !newStatus) return;
    await updateStatusMutation.mutateAsync({ id, dto: { status: newStatus as WorkOrderStatus } });
    setStatusDialogOpen(false);
    setNewStatus('');
  };

  const resetTimeForm = () => {
    setEditingTimeEntry(null);
    setTimeEntryType(WorkOrderTimeEntryType.HOURS);
    setSelectedWorkOrderItemId('');
    setWorkedDate(new Date().toISOString().slice(0, 10));
    setHoursWorked('');
    setStartAt('');
    setEndAt('');
    setTimeEntryNotes('');
  };

  const openCreateTimeDialog = (itemId?: string) => {
    resetTimeForm();
    setSelectedWorkOrderItemId(itemId ?? '');
    setTimeDialogOpen(true);
  };

  const openEditTimeDialog = (entry: WorkOrderTimeEntry) => {
    setEditingTimeEntry(entry);
    setTimeEntryType(entry.entryType);
    setSelectedWorkOrderItemId(entry.workOrderItem?.id ?? '');
    setWorkedDate(entry.workedDate.slice(0, 10));
    setHoursWorked(entry.entryType === WorkOrderTimeEntryType.HOURS ? String(entry.hoursWorked) : '');
    setStartAt(entry.entryType === WorkOrderTimeEntryType.RANGE ? toDateTimeLocalValue(entry.startAt) : '');
    setEndAt(entry.entryType === WorkOrderTimeEntryType.RANGE ? toDateTimeLocalValue(entry.endAt) : '');
    setTimeEntryNotes(entry.notes ?? '');
    setTimeDialogOpen(true);
  };

  const handleSaveTimeEntry = async () => {
    if (!id || !workedDate) return;

    const payload = {
      entryType: timeEntryType,
      workOrderItemId: selectedWorkOrderItemId || undefined,
      workedDate,
      hoursWorked:
        timeEntryType === WorkOrderTimeEntryType.HOURS && hoursWorked
          ? Number(hoursWorked)
          : undefined,
      startAt: timeEntryType === WorkOrderTimeEntryType.RANGE ? toIsoOrUndefined(startAt) : undefined,
      endAt: timeEntryType === WorkOrderTimeEntryType.RANGE ? toIsoOrUndefined(endAt) : undefined,
      notes: timeEntryNotes || undefined,
    };

    if (editingTimeEntry) {
      await updateTimeEntryMutation.mutateAsync({
        workOrderId: id,
        timeEntryId: editingTimeEntry.id,
        dto: payload,
      });
    } else {
      await createTimeEntryMutation.mutateAsync({
        workOrderId: id,
        dto: payload,
      });
    }

    setTimeDialogOpen(false);
    resetTimeForm();
  };

  if (workOrderQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (!workOrder) {
    return (
      <Alert severity="error">Orden de trabajo no encontrada</Alert>
    );
  }

  const isParentOrderAnulado = workOrder.order?.status === 'ANULADO';
  const currentStatus = workOrder.status as WorkOrderStatus;
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] ?? [];
  const advisorName = `${workOrder.advisor.firstName ?? ''} ${workOrder.advisor.lastName ?? ''}`.trim() || workOrder.advisor.email;
  const designerName = workOrder.designer
    ? `${workOrder.designer.firstName ?? ''} ${workOrder.designer.lastName ?? ''}`.trim() || workOrder.designer.email
    : '-';
  const expenseOrders = workOrder.expenseOrders ?? [];
  const timeEntries = [...(workOrder.timeEntries ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <DocumentTypeBanner type="OT" documentNumber={workOrder.workOrderNumber} />
      <PageHeader
        title={workOrder.workOrderNumber}
        hideTitle
        breadcrumbs={[
          { label: 'Órdenes de Trabajo', path: ROUTES.WORK_ORDERS },
          { label: workOrder.workOrderNumber },
        ]}
      />

      {/* Ítems anulados en la OP: el ítem sigue en la OT, pero ya no se produce */}
      {!isParentOrderAnulado &&
        workOrder.items.some(
          (item) => parseFloat(item.orderItem.annulledQuantity ?? '0') > 0,
        ) && (
          <Alert severity="warning" sx={{ mt: 2, mb: 1 }}>
            <strong>La OP anuló ítems de esta orden de trabajo.</strong> Los
            productos marcados como anulados ya no deben producirse; revisa las
            cantidades antes de continuar.
          </Alert>
        )}

      {/* Banner orden de pedido ANULADA */}
      {isParentOrderAnulado && (
        <Alert severity="error" sx={{ mt: 2, mb: 1 }}>
          <strong>Esta orden proviene de una OP ANULADA.</strong> La Orden de Pedido relacionada ha sido anulada. Esta Orden de Trabajo es de solo lectura.
        </Alert>
      )}

      <StatusHighlight
        label={WORK_ORDER_STATUS_CONFIG[workOrder.status].label}
        color={WORK_ORDER_STATUS_CONFIG[workOrder.status].color}
        sx={{ mt: 2 }}
      />

      {/* Toolbar de Acciones */}
      <ActionToolbar sx={{ mt: 2, mb: 3 }}>
          {!isParentOrderAnulado && canUpdate && ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION'].includes(currentStatus) && (
            <ToolbarButton
              icon={<EditIcon />}
              label="Editar"
              onClick={() => navigate(ROUTES.WORK_ORDERS_EDIT.replace(':id', id!))}
              tooltip="Editar Orden de Trabajo"
            />
          )}

          {!isParentOrderAnulado && canUpdate && allowedTransitions.length > 0 && (
            <ToolbarButton
              icon={<SwapHorizIcon />}
              label="Estado"
              secondaryLabel="Cambiar"
              onClick={() => setStatusDialogOpen(true)}
              color={theme.palette.info.main}
              tooltip="Cambiar Estado"
            />
          )}

          <ToolbarButton
            icon={<AccountTreeIcon />}
            label="Trazabilidad"
            onClick={() => navigate(`/orders/flow/work-order/${id}`)}
            tooltip="Ver Trazabilidad"
          />

          {!isParentOrderAnulado && (
            <ToolbarButton
              icon={<AccessTimeIcon />}
              label="Horas"
              secondaryLabel="Registrar"
              onClick={() => openCreateTimeDialog()}
              color={theme.palette.success.main}
              tooltip="Registrar Horas Trabajadas"
            />
          )}

          {!isParentOrderAnulado && canCreateExpenseOrder && (
            <ToolbarButton
              icon={<ReceiptLongIcon />}
              label="Gasto"
              secondaryLabel="Nuevo"
              onClick={() =>
                navigate(`${ROUTES.EXPENSE_ORDERS_CREATE}?workOrderId=${id}`)
              }
              color={theme.palette.warning.main}
              tooltip="Crear Orden de Gasto"
            />
          )}

          {!isParentOrderAnulado && canCreateProductionOrder && (
            <ToolbarButton
              icon={<PrecisionManufacturingIcon />}
              label="Producción"
              secondaryLabel="Nueva"
              onClick={() =>
                navigate(`${ROUTES.PRODUCTION_ORDERS_CREATE}?workOrderId=${id}`)
              }
              color={theme.palette.info.main}
              tooltip="Crear Orden de Producción"
            />
          )}

          <WorkOrderPdfButton workOrder={workOrder} />
      </ActionToolbar>

      <Grid container spacing={3}>
        {/* Columna principal */}
        <Grid item xs={12} sm={12} md={8}>
          <Stack spacing={3}>
            {/* Info general */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Información General
                </Typography>
                <Stack spacing={1.5} divider={<Divider />}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Estado</Typography>
                    <Box mt={0.5}>
                      <WorkOrderStatusChip status={workOrder.status} size="medium" />
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Asesor</Typography>
                    <Typography variant="body1">{advisorName}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Diseñador</Typography>
                    <Typography variant="body1">{designerName}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Nombre de archivo</Typography>
                    <Typography variant="body1">{workOrder.fileName || '-'}</Typography>
                  </Box>
                  {workOrder.attachment && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Archivo Adjunto</Typography>
                      <Box mt={0.5} display="flex" gap={2} flexWrap="wrap">
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<DownloadIcon />}
                          onClick={async () => {
                            try {
                              const { url } = await storageApi.getFileUrl(workOrder.attachment!.id);
                              window.open(url, '_blank', 'noopener,noreferrer');
                            } catch (error) {
                              console.error('Error opening file:', error);
                            }
                          }}
                        >
                          {workOrder.attachment.originalName} ({(workOrder.attachment.size / 1024 / 1024).toFixed(2)} MB)
                        </Button>
                      </Box>
                    </Box>
                  )}
                  {workOrder.attachment2 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Archivo Adjunto Adicional</Typography>
                      <Box mt={0.5} display="flex" gap={2} flexWrap="wrap">
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<DownloadIcon />}
                          onClick={async () => {
                            try {
                              const { url } = await storageApi.getFileUrl(workOrder.attachment2!.id);
                              window.open(url, '_blank', 'noopener,noreferrer');
                            } catch (error) {
                              console.error('Error opening file:', error);
                            }
                          }}
                        >
                          {workOrder.attachment2.originalName} ({(workOrder.attachment2.size / 1024 / 1024).toFixed(2)} MB)
                        </Button>
                      </Box>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="caption" color="text.secondary">Creada</Typography>
                    <Typography variant="body1">{formatDate(workOrder.createdAt)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Última actualización</Typography>
                    <Typography variant="body1">{formatDate(workOrder.updatedAt)}</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Items / Productos */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Productos ({workOrder.items.length})
                </Typography>
                <Stack spacing={2} divider={<Divider />}>
                  {workOrder.items.map((item, index) => {
                    const annulledQuantity =
                      parseFloat(item.orderItem.annulledQuantity ?? '0') || 0;
                    const fullyAnnulled =
                      annulledQuantity > 0 &&
                      getAliveQuantity(item.orderItem) === 0;
                    return (
                    <Box key={item.id}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
                          <Typography
                            variant="subtitle1"
                            fontWeight="bold"
                            sx={
                              fullyAnnulled
                                ? { textDecoration: 'line-through', color: 'text.disabled' }
                                : undefined
                            }
                          >
                            Producto {index + 1}: {item.productDescription}
                          </Typography>
                          {annulledQuantity > 0 && (
                            <Chip
                              label={
                                fullyAnnulled
                                  ? 'Anulado en la OP — no producir'
                                  : `Anuladas ${annulledQuantity} de ${Number(item.orderItem.quantity)} — producir ${getAliveQuantity(item.orderItem)}`
                              }
                              size="small"
                              color="error"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        <Button
                          size="small"
                          startIcon={<AccessTimeIcon fontSize="small" />}
                          onClick={() => openCreateTimeDialog(item.id)}
                        >
                          Registrar horas
                        </Button>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Item original: {item.orderItem.description} · Cant: {item.orderItem.quantity} · Precio: {formatCurrency(item.orderItem.unitPrice)}
                      </Typography>

                      {item.productionAreas.length > 0 && (
                        <Box mt={1}>
                          <Typography variant="caption" color="text.secondary">Áreas de producción</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" mt={0.5}>
                            {item.productionAreas.map((pa) => (
                              <Chip key={pa.productionArea.id} label={pa.productionArea.name} size="small" />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {item.supplies.length > 0 && (
                        <Box mt={1}>
                          <Typography variant="caption" color="text.secondary">Insumos</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" mt={0.5}>
                            {item.supplies.map((s) => (
                              <Chip
                                key={s.supply.id}
                                label={s.supply.sku ? `${s.supply.name} (${s.supply.sku})` : s.supply.name}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {item.observations && (
                        <Typography variant="body2" mt={1} color="text.secondary">
                          Obs: {item.observations}
                        </Typography>
                      )}
                    </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>

            {/* Observaciones */}
            <Card>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  mb={2}
                  gap={1}
                >
                  <Typography variant="h6">Timeline de Horas Trabajadas</Typography>
                  <Button
                    size="small"
                    startIcon={<AccessTimeIcon fontSize="small" />}
                    onClick={() => openCreateTimeDialog()}
                  >
                    Registrar
                  </Button>
                </Stack>

                {timeEntries.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Aún no hay horas registradas para esta OT.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {timeEntries.map((entry) => (
                      <Box
                        key={entry.id}
                        sx={{
                          pl: 2,
                          borderLeft: (theme) => `2px solid ${theme.palette.divider}`,
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                          <Box>
                            <Typography variant="subtitle2">{getUserDisplayName(entry)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Registrado: {formatDate(entry.createdAt)}
                            </Typography>
                          </Box>
                          <Button size="small" onClick={() => openEditTimeDialog(entry)}>
                            Editar
                          </Button>
                        </Stack>

                        <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
                          <Chip
                            size="small"
                            label={
                              entry.entryType === WorkOrderTimeEntryType.HOURS
                                ? 'Cantidad'
                                : 'Rango'
                            }
                            color={entry.entryType === WorkOrderTimeEntryType.HOURS ? 'info' : 'warning'}
                            variant="outlined"
                          />
                          <Chip size="small" label={formatHours(entry.hoursWorked)} color="success" />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={entry.workOrderItem ? `Item: ${entry.workOrderItem.productDescription}` : 'Nivel OT'}
                          />
                        </Stack>

                        <Typography variant="body2" mt={1}>
                          Fecha de trabajo: {formatDate(entry.workedDate)}
                        </Typography>

                        {entry.entryType === WorkOrderTimeEntryType.RANGE && entry.startAt && entry.endAt && (
                          <Typography variant="body2" color="text.secondary">
                            Rango: {formatDate(entry.startAt)} → {formatDate(entry.endAt)}
                          </Typography>
                        )}

                        {entry.notes && (
                          <Typography variant="body2" color="text.secondary" mt={0.5}>
                            Nota: {entry.notes}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>

            {workOrder.observations && (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Observaciones Generales</Typography>
                  <Typography variant="body1">{workOrder.observations}</Typography>
                </CardContent>
              </Card>
            )}
          </Stack>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} sm={12} md={4}>
          <Stack spacing={3}>
            {/* Orden de pedido vinculada */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Orden de Pedido Vinculada
                </Typography>
                <Stack spacing={1.5} divider={<Divider />}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Número de orden</Typography>
                    <Typography
                      variant="body1"
                      component="span"
                      sx={{ cursor: 'pointer', color: 'primary.main', display: 'block' }}
                      onClick={() => navigate(ROUTES.ORDERS_DETAIL.replace(':id', workOrder.order.id))}
                    >
                      {workOrder.order.orderNumber}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Cliente</Typography>
                    <Typography variant="body1">{workOrder.order.client.name}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Total de la orden</Typography>
                    <Typography variant="body1">{formatCurrency(workOrder.order.total)}</Typography>
                  </Box>
                  {workOrder.order.deliveryDate && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Fecha de entrega</Typography>
                      <Typography variant="body1">{formatDate(workOrder.order.deliveryDate)}</Typography>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {/* Gastos asociados (OG) */}
            {expenseOrders.length > 0 && (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Gastos Asociados (OG)
                  </Typography>
                  <Stack spacing={1.5} divider={<Divider />}>
                    {expenseOrders.map((expenseOrder) => (
                      <Box key={expenseOrder.id}>
                        <Stack spacing={0.75}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Orden de Gasto
                            </Typography>
                            <Typography
                              variant="body1"
                              component="span"
                              sx={{ cursor: 'pointer', color: 'primary.main', display: 'block' }}
                              onClick={() =>
                                navigate(
                                  ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', expenseOrder.id),
                                )
                              }
                            >
                              {expenseOrder.ogNumber}
                            </Typography>
                          </Box>

                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Chip
                              size="small"
                              label={
                                EXPENSE_ORDER_STATUS_CONFIG[
                                  expenseOrder.status as keyof typeof EXPENSE_ORDER_STATUS_CONFIG
                                ]?.label || expenseOrder.status
                              }
                              color={
                                EXPENSE_ORDER_STATUS_CONFIG[
                                  expenseOrder.status as keyof typeof EXPENSE_ORDER_STATUS_CONFIG
                                ]?.color || 'default'
                              }
                              variant="outlined"
                            />
                            <Typography variant="caption" color="text.secondary">
                              {expenseOrder.expenseType?.name} · {expenseOrder.expenseSubcategory?.name}
                            </Typography>
                          </Stack>

                          <Typography variant="caption" color="text.secondary">
                            Creada: {formatDate(expenseOrder.createdAt)}
                          </Typography>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </Grid>
      </Grid>

      {/* Comentarios */}
      <CommentSection entityType="WORK_ORDER" entityId={workOrder.id} />

      {/* Dialog: Registrar/Editar Horas */}
      <Dialog
        open={timeDialogOpen}
        onClose={() => {
          setTimeDialogOpen(false);
          resetTimeForm();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingTimeEntry ? 'Editar Registro de Horas' : 'Registrar Horas Trabajadas'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            <TextField
              select
              label="Tipo de registro"
              value={timeEntryType}
              onChange={(e) => setTimeEntryType(e.target.value as WorkOrderTimeEntryType)}
              fullWidth
            >
              <MenuItem value={WorkOrderTimeEntryType.HOURS}>Cantidad de horas</MenuItem>
              <MenuItem value={WorkOrderTimeEntryType.RANGE}>Rango (inicio y fin)</MenuItem>
            </TextField>

            <TextField
              select
              label="Alcance"
              value={selectedWorkOrderItemId}
              onChange={(e) => setSelectedWorkOrderItemId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Nivel OT (general)</MenuItem>
              {workOrder.items.map((item, index) => (
                <MenuItem key={item.id} value={item.id}>
                  Producto {index + 1}: {item.productDescription}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Fecha de trabajo"
              type="date"
              value={workedDate}
              onChange={(e) => setWorkedDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            {timeEntryType === WorkOrderTimeEntryType.HOURS ? (
              <TextField
                label="Horas trabajadas"
                type="number"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                fullWidth
                inputProps={{ min: 0.01, step: 0.25 }}
              />
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Inicio"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Fin"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            )}

            <TextField
              label="Nota (opcional)"
              value={timeEntryNotes}
              onChange={(e) => setTimeEntryNotes(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setTimeDialogOpen(false);
              resetTimeForm();
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveTimeEntry}
            disabled={createTimeEntryMutation.isPending || updateTimeEntryMutation.isPending}
          >
            {createTimeEntryMutation.isPending || updateTimeEntryMutation.isPending ? (
              <CircularProgress size={20} />
            ) : editingTimeEntry ? (
              'Guardar cambios'
            ) : (
              'Registrar'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Cambiar Estado */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cambiar Estado de la OT</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Estado actual: <WorkOrderStatusChip status={currentStatus} />
          </Typography>
          <TextField
            select
            label="Nuevo estado"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as WorkOrderStatus)}
            fullWidth
            sx={{ mt: 2 }}
          >
            {allowedTransitions.map((s) => (
              <MenuItem key={s} value={s}>
                {WORK_ORDER_STATUS_CONFIG[s]?.label ?? s}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleStatusChange}
            disabled={!newStatus || updateStatusMutation.isPending}
          >
            {updateStatusMutation.isPending ? <CircularProgress size={20} /> : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WorkOrderDetailPage;
