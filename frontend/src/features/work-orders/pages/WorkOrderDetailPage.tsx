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
  alpha,
} from '@mui/material';
import {
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
  AccountTree as AccountTreeIcon,
  ReceiptLong as ReceiptLongIcon,
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
} from '../../../types/work-order.types';
import { ProductionTimelinePanel } from '../components/production-time';
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

const STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.DRAFT]: [WorkOrderStatus.CONFIRMED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.CONFIRMED]: [WorkOrderStatus.IN_PRODUCTION, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.IN_PRODUCTION]: [
    WorkOrderStatus.READY,
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.READY]: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

export const WorkOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { hasPermission } = useAuthStore();

  const { workOrderQuery, updateStatusMutation } = useWorkOrder(id);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<WorkOrderStatus | ''>('');

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
  // «Producto N» como en la lista de productos, para decir a qué ítems aplica cada OG.
  const itemNumberById = new Map(workOrder.items.map((item, index) => [item.id, index + 1]));
  const canCreateItemExpense = !isParentOrderAnulado && canCreateExpenseOrder;
  const pendingOrderItems = workOrder.pendingOrderItems ?? [];
  const canEditItems =
    canUpdate && ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION'].includes(currentStatus);

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

      {/* Ítems que se sumaron a la OP después de crear la OT */}
      {!isParentOrderAnulado && pendingOrderItems.length > 0 && (
        <Alert
          severity="info"
          sx={{ mt: 2, mb: 1 }}
          action={
            canEditItems ? (
              <Button
                color="inherit"
                size="small"
                onClick={() =>
                  navigate(ROUTES.WORK_ORDERS_EDIT.replace(':id', id!), {
                    state: { focusItems: true },
                  })
                }
              >
                Agregar a la OT
              </Button>
            ) : undefined
          }
        >
          <strong>
            La OP tiene {pendingOrderItems.length === 1 ? '1 ítem que no está' : `${pendingOrderItems.length} ítems que no están`} en esta OT:
          </strong>{' '}
          {pendingOrderItems.map((item) => item.description.trim()).join(', ')}.
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
                <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <Typography variant="h6">Productos</Typography>
                  <Chip label={workOrder.items.length} size="small" />
                </Stack>
                <Stack spacing={1.5}>
                  {workOrder.items.map((item, index) => {
                    const annulledQuantity =
                      parseFloat(item.orderItem.annulledQuantity ?? '0') || 0;
                    const fullyAnnulled =
                      annulledQuantity > 0 &&
                      getAliveQuantity(item.orderItem) === 0;
                    const itemExpenseOrders = expenseOrders.filter((eo) =>
                      eo.workOrderItems?.some((woi) => woi.workOrderItemId === item.id),
                    );
                    // Casi siempre es la misma descripción del producto: repetirla es ruido.
                    // Se creó después que la OT (la OP lo sumó luego): el taller tiene
                    // que notarlo, porque aparece en una OT que quizá ya estaba en marcha.
                    const addedAfterCreation =
                      !!item.createdAt &&
                      new Date(item.createdAt).getTime() - new Date(workOrder.createdAt).getTime() >
                        60_000;
                    const showOriginalDescription =
                      item.orderItem.description.trim().toLowerCase() !==
                      item.productDescription.trim().toLowerCase();
                    return (
                    <Box
                      key={item.id}
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 2,
                        p: { xs: 1.5, sm: 2 },
                        bgcolor: alpha(theme.palette.primary.main, 0.03),
                        opacity: fullyAnnulled ? 0.6 : 1,
                      }}
                    >
                      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            flexShrink: 0,
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: alpha(theme.palette.primary.main, 0.15),
                            color: 'primary.main',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                          }}
                        >
                          {index + 1}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                            <Typography
                              variant="subtitle1"
                              fontWeight={600}
                              lineHeight={1.4}
                              sx={{
                                wordBreak: 'break-word',
                                ...(fullyAnnulled && {
                                  textDecoration: 'line-through',
                                  color: 'text.disabled',
                                }),
                              }}
                            >
                              {item.productDescription}
                            </Typography>
                            {canCreateItemExpense && !fullyAnnulled && (
                              <Button
                                size="small"
                                color="warning"
                                startIcon={<ReceiptLongIcon />}
                                onClick={() =>
                                  navigate(
                                    `${ROUTES.EXPENSE_ORDERS_CREATE}?workOrderId=${id}&workOrderItemIds=${item.id}`,
                                  )
                                }
                                sx={{
                                  flexShrink: 0,
                                  minWidth: 0,
                                  px: 1.25,
                                  py: 0.25,
                                  bgcolor: alpha(theme.palette.warning.main, 0.1),
                                  '&:hover': { bgcolor: alpha(theme.palette.warning.main, 0.2) },
                                  // En móvil solo el ícono: el texto le quitaba espacio al nombre.
                                  '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } },
                                }}
                                aria-label="Crear gasto de este producto"
                              >
                                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                                  Gasto
                                </Box>
                              </Button>
                            )}
                          </Stack>
                          {addedAfterCreation && (
                            <Chip
                              label={`Agregado desde la OP · ${formatDate(item.createdAt)}`}
                              size="small"
                              color="info"
                              variant="outlined"
                              sx={{ mt: 0.5, maxWidth: '100%' }}
                            />
                          )}

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
                              sx={{ mt: 0.5 }}
                            />
                          )}

                          <Stack direction="row" spacing={3} mt={1} flexWrap="wrap" useFlexGap>
                            <Box>
                              <Typography variant="caption" color="text.secondary">Cantidad</Typography>
                              <Typography variant="body2" fontWeight={600}>
                                {Number(item.orderItem.quantity)}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">Precio unitario</Typography>
                              <Typography variant="body2" fontWeight={600}>
                                {formatCurrency(item.orderItem.unitPrice)}
                              </Typography>
                            </Box>
                          </Stack>

                          {showOriginalDescription && (
                            <Typography variant="body2" color="text.secondary" mt={1}>
                              Ítem original: {item.orderItem.description}
                            </Typography>
                          )}

                          {(item.productionAreas.length > 0 ||
                            item.supplies.length > 0 ||
                            itemExpenseOrders.length > 0) && (
                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={{ xs: 1.5, sm: 3 }}
                              mt={1.5}
                              pt={1.5}
                              sx={{ borderTop: 1, borderColor: 'divider' }}
                              flexWrap="wrap"
                              useFlexGap
                            >
                              {item.productionAreas.length > 0 && (
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Áreas de producción</Typography>
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mt={0.5}>
                                    {item.productionAreas.map((pa) => (
                                      <Chip key={pa.productionArea.id} label={pa.productionArea.name} size="small" />
                                    ))}
                                  </Stack>
                                </Box>
                              )}

                              {item.supplies.length > 0 && (
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Insumos</Typography>
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mt={0.5}>
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

                              {itemExpenseOrders.length > 0 && (
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Gastos (OG)</Typography>
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mt={0.5}>
                                    {itemExpenseOrders.map((eo) => (
                                      <Chip
                                        key={eo.id}
                                        icon={<ReceiptLongIcon />}
                                        label={eo.ogNumber}
                                        size="small"
                                        color="warning"
                                        variant="outlined"
                                        clickable
                                        onClick={() =>
                                          navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', eo.id))
                                        }
                                      />
                                    ))}
                                  </Stack>
                                </Box>
                              )}
                            </Stack>
                          )}

                          {item.observations && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              mt={1.5}
                              sx={{ pl: 1, borderLeft: 2, borderColor: 'divider', whiteSpace: 'pre-line' }}
                            >
                              {item.observations}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                    );
                  })}
                </Stack>
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
                            Aplica a:{' '}
                            {expenseOrder.workOrderItems?.length
                              ? expenseOrder.workOrderItems
                                  .map((woi) => itemNumberById.get(woi.workOrderItemId))
                                  .filter((n): n is number => n !== undefined)
                                  .sort((a, b) => a - b)
                                  .map((n) => `Producto ${n}`)
                                  .join(', ')
                              : 'Toda la OT'}
                          </Typography>

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

      {/* Producción: temporizador y línea de tiempo, encima de los comentarios */}
      <ProductionTimelinePanel workOrder={workOrder} />

      {/* Comentarios */}
      <CommentSection entityType="WORK_ORDER" entityId={workOrder.id} />

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
            {/* Se listan todos los estados para que se vea el flujo completo;
                solo se habilitan los que admite el estado actual. */}
            {(Object.keys(WORK_ORDER_STATUS_CONFIG) as WorkOrderStatus[]).map((s) => {
              const config = WORK_ORDER_STATUS_CONFIG[s];
              const isCurrent = s === currentStatus;
              const isAllowed = allowedTransitions.includes(s);
              return (
                <MenuItem key={s} value={s} disabled={!isAllowed}>
                  <Chip
                    label={config.label}
                    color={isCurrent || isAllowed ? config.color : 'default'}
                    size="small"
                    variant={isAllowed ? 'outlined' : 'filled'}
                    sx={{
                      ...(!isAllowed && !isCurrent && { opacity: 0.4 }),
                      ...(isCurrent && { fontWeight: 'bold', border: '2px solid' }),
                    }}
                  />
                </MenuItem>
              );
            })}
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
