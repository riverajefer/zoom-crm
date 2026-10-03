import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
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
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  InputAdornment,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
  CheckCircle as CheckCircleIcon,
  Add as AddIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  Receipt as ReceiptIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  OpenInNew as OpenInNewIcon,
  Person as PersonIcon,
  Brush as BrushIcon,
  AccountTree as AccountTreeIcon,
  HourglassTop as HourglassTopIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  Payments as PaymentsIcon,
  TaskAlt as TaskAltIcon,
  MarkEmailRead as MarkEmailReadIcon,
  Block as BlockIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material';
import {
  computeExpenseTotals,
  getWithholdingPercentages,
  withholdingsFromRates,
} from '../../../utils/withholdings';
import { PageHeader } from '../../../components/common/PageHeader';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { BankSelector } from '../../../components/common/BankSelector';
import { ApprovalQueueBar } from '../../../components/common/ApprovalQueueBar';
import { useApprovalQueue } from '../../../hooks/useApprovalQueue';
import { StatusHighlight } from '../../../components/common/StatusHighlight';

import { DocumentTypeBanner } from '../../../components/common/DocumentTypeBanner';
import { ToolbarButton } from '../../orders/components/ToolbarButton';
import { ActionToolbar } from '../../orders/components/ActionToolbar';
import { ExpenseOrderAuthRequestDialog } from '../components/ExpenseOrderAuthRequestDialog';
import { ExpenseOrderAuthHistory } from '../components/ExpenseOrderAuthHistory';
import { expenseOrderAuthRequestsApi } from '../../../api/expense-order-auth-requests.api';
import { ExpenseOrderPdfButton } from '../components/ExpenseOrderPdfButton';
import { useExpenseOrder, expenseOrdersKeys } from '../hooks';
import { expenseOrdersApi } from '../../../api/expense-orders.api';
import { useSuppliers } from '../../suppliers/hooks/useSuppliers';
import { useProductionAreas } from '../../production-areas/hooks/useProductionAreas';
import { useAuthStore } from '../../../store/authStore';
import { storageApi } from '../../../api/storage.api';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import { formatCurrency as formatCurrencyCOP } from '../../../utils/formatters';
import {
  formatCurrencyInput,
  parseCurrencyInput,
  sanitizeCurrencyInput,
} from '../../../utils/currencyInput';
import {
  ExpenseOrderStatus,
  EXPENSE_ORDER_STATUS_CONFIG,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  type CreateExpenseItemDto,
} from '../../../types/expense-order.types';
import { WORK_ORDER_STATUS_CONFIG, WorkOrderStatus } from '../../../types/work-order.types';
import { ORDER_STATUS_CONFIG, type OrderStatus } from '../../../types/order.types';
import { LoadingButton } from '../../../components/common/LoadingButton';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const formatCurrency = (value?: string | number | null): string => {
  if (value == null) return '-';
  return formatCurrencyCOP(value);
};

const STATUS_TRANSITIONS: Record<ExpenseOrderStatus, ExpenseOrderStatus[]> = {
  [ExpenseOrderStatus.DRAFT]: [ExpenseOrderStatus.CREATED, ExpenseOrderStatus.ADMIN_AUTHORIZED],
  [ExpenseOrderStatus.CREATED]: [ExpenseOrderStatus.ADMIN_AUTHORIZED, ExpenseOrderStatus.DRAFT],
  [ExpenseOrderStatus.ADMIN_AUTHORIZED]: [], // La segunda firma usa el botón dedicado
  [ExpenseOrderStatus.AUTHORIZED]: [],
  [ExpenseOrderStatus.PAID]: [],
};

const formatShortDate = (date?: string | null): string => {
  if (!date) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
};

const userName = (user?: { firstName?: string | null; lastName?: string | null; email: string } | null) => {
  if (!user) return '—';
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return full || user.email;
};

// ─── Default item form ────────────────────────────────────────────────────────

interface ItemForm {
  name: string;
  quantity: string;
  unitPrice: string;
  description: string;
  paymentMethod: PaymentMethod;
  bankEntity: string | null;
  supplierId: string;
  productionAreaIds: string[];
}

const defaultItemForm = (): ItemForm => ({
  name: '',
  quantity: '1',
  unitPrice: '',
  description: '',
  paymentMethod: PaymentMethod.CASH,
  bankEntity: null,
  supplierId: '',
  productionAreaIds: [],
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];


// ─── Main Component ───────────────────────────────────────────────────────────

export const ExpenseOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuthStore();

  const {
    expenseOrderQuery,
    updateStatusMutation,
    addExpenseItemMutation,
    cajaAuthorizeMutation,
    deleteExpenseOrderMutation,
  } = useExpenseOrder(id);
  const { suppliersQuery } = useSuppliers();
  const { productionAreasQuery } = useProductionAreas();

  const suppliers = suppliersQuery.data ?? [];
  const productionAreas = productionAreasQuery.data ?? [];

  // ── Status dialog ────────────────────────────────────────────────────────────
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<ExpenseOrderStatus | ''>('');
  const [authRequestDialogOpen, setAuthRequestDialogOpen] = useState(false);

  const { data: myOgAuthRequests } = useQuery({
    queryKey: ['og-auth-requests-mine', id],
    queryFn: () => expenseOrderAuthRequestsApi.findMy(),
    enabled: !!id,
  });
  const hasPendingOgRequest = myOgAuthRequests?.some(
    (r) => r.expenseOrderId === id && r.status === 'PENDING',
  ) ?? false;

  // ── Add item dialog ──────────────────────────────────────────────────────────
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(defaultItemForm());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);

  // ── View receipt dialog ──────────────────────────────────────────────────────
  const [receiptDialog, setReceiptDialog] = useState<{
    open: boolean;
    url: string;
    mimeType: string;
    originalName: string;
    fileId: string;
  }>({ open: false, url: '', mimeType: '', originalName: '', fileId: '' });
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);

  // ── View reference image dialog ───────────────────────────────────────────────
  const [referenceDialog, setReferenceDialog] = useState<{
    open: boolean;
    url: string;
    mimeType: string;
    originalName: string;
    fileId: string;
  }>({ open: false, url: '', mimeType: '', originalName: '', fileId: '' });
  const [loadingReferenceId, setLoadingReferenceId] = useState<string | null>(null);

  // ── Electronic invoice dialog ─────────────────────────────────────────────────
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canUpdate = hasPermission(PERMISSIONS.UPDATE_EXPENSE_ORDERS);
  const canApprove = hasPermission(PERMISSIONS.APPROVE_EXPENSE_ORDERS);
  const canCajaAuthorize = hasPermission(PERMISSIONS.CAJA_AUTHORIZE_EXPENSE_ORDERS);
  const canDelete = hasPermission(PERMISSIONS.DELETE_EXPENSE_ORDERS);

  const og = expenseOrderQuery.data;

  // Mismos estados que acepta el backend: mientras nadie haya firmado la OG.
  // Debe coincidir con `DELETABLE_STATUSES` del servicio y de la lista.
  const isDeletable =
    og?.status === ExpenseOrderStatus.DRAFT ||
    og?.status === ExpenseOrderStatus.CREATED;

  // ── Cola de aprobación ("revisar y siguiente") ────────────────────────────────
  const queryClient = useQueryClient();
  const buildQueuePath = useCallback((ogId: string) => `/expense-orders/${ogId}`, []);
  const approvalQueue = useApprovalQueue({
    currentId: id,
    buildPath: buildQueuePath,
    enabled: canApprove || canCajaAuthorize,
  });

  // Precarga la siguiente OG para que el avance se sienta instantáneo
  const nextQueueId = approvalQueue.nextItem?.id;
  useEffect(() => {
    if (!nextQueueId) return;
    queryClient.prefetchQuery({
      queryKey: expenseOrdersKeys.detail(nextQueueId),
      queryFn: () => expenseOrdersApi.getById(nextQueueId),
    });
  }, [nextQueueId, queryClient]);

  // Auto-salto: si al abrir una OG de la cola resulta que ya no está pendiente
  // de autorización administrativa (se aprobó/rechazó desde Caja, otra pestaña,
  // etc.), se marca como resuelta y se salta a la siguiente pendiente. Así el
  // paginador solo recorre OGs que realmente faltan por aprobar, sin importar
  // desde dónde se resolvieron.
  const isQueueItemResolved =
    approvalQueue.isActive &&
    !approvalQueue.isCurrentProcessed &&
    !!og &&
    og.id === id &&
    og.status !== ExpenseOrderStatus.CREATED;
  useEffect(() => {
    if (isQueueItemResolved) approvalQueue.markProcessedAndNext();
    // markProcessedAndNext es estable respecto a la OG actual; el booleano
    // controla cuándo debe dispararse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueueItemResolved]);

  // ── Caja authorize ───────────────────────────────────────────────────────────
  const handleCajaAuthorize = async () => {
    if (!id) return;
    await cajaAuthorizeMutation.mutateAsync(id);
    approvalQueue.markProcessedAndNext();
  };

  // ── Electronic invoice ─────────────────────────────────────────────────────────
  const handleOpenInvoiceDialog = () => {
    setInvoiceNumber(og?.electronicInvoiceNumber || '');
    setInvoiceDialogOpen(true);
  };

  const handleCloseInvoiceDialog = () => {
    setInvoiceDialogOpen(false);
    setInvoiceNumber('');
  };

  const handleRegisterInvoice = async () => {
    if (!id || !invoiceNumber.trim()) return;
    setInvoiceLoading(true);
    try {
      await expenseOrdersApi.registerElectronicInvoice(id, invoiceNumber.trim());
      await expenseOrderQuery.refetch();
      enqueueSnackbar('Número de factura electrónica registrado correctamente', { variant: 'success' });
      handleCloseInvoiceDialog();
    } catch (error: any) {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al registrar la factura electrónica',
        { variant: 'error' },
      );
    } finally {
      setInvoiceLoading(false);
    }
  };

  // ── Status change ────────────────────────────────────────────────────────────
  const handleStatusChange = async () => {
    if (!id || !newStatus) return;
    try {
      await updateStatusMutation.mutateAsync({ id, dto: { status: newStatus as ExpenseOrderStatus } });
      setStatusDialogOpen(false);
      setNewStatus('');
      // Si venimos de la bandeja de pendientes, saltar directo a la siguiente OG
      if (newStatus === ExpenseOrderStatus.ADMIN_AUTHORIZED || newStatus === ExpenseOrderStatus.AUTHORIZED) {
        approvalQueue.markProcessedAndNext();
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        const message = error.response?.data?.message || '';
        if (message.includes('autorización')) {
          setStatusDialogOpen(false);
          setAuthRequestDialogOpen(true);
        }
      }
    }
  };

  // ── Add item ─────────────────────────────────────────────────────────────────
  const handleOpenItemDialog = () => {
    setItemForm(defaultItemForm());
    setReceiptFile(null);
    setItemDialogOpen(true);
  };

  const handleCloseItemDialog = () => {
    setItemDialogOpen(false);
    setItemForm(defaultItemForm());
    setReceiptFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setReferenceFile(null);
    if (referenceFileInputRef.current) referenceFileInputRef.current.value = '';
  };

  const handleReceiptFileChange = (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    setReceiptFile(file);
  };

  const handleReferenceFileChange = (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    setReferenceFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const newFile = new File([file], `pasted-image-${Date.now()}.${extension}`, { type: file.type });
          handleReceiptFileChange(newFile);
          e.preventDefault();
          break;
        }
      }
    }
  };

  const handlePasteReference = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const newFile = new File([file], `pasted-image-${Date.now()}.${extension}`, { type: file.type });
          handleReferenceFileChange(newFile);
          e.preventDefault();
          break;
        }
      }
    }
  };

  const isItemFormValid =
    itemForm.name.trim().length > 0 &&
    parseFloat(itemForm.quantity) > 0 &&
    parseCurrencyInput(itemForm.unitPrice) > 0;

  const handleDelete = useSingleFlight(async () => {
    if (!id) return;
    await deleteExpenseOrderMutation.mutateAsync(id);
    setConfirmDelete(false);
    navigate(ROUTES.EXPENSE_ORDERS);
  });

  // Sube los adjuntos antes de agregar el ítem: cada clic genera IDs de archivo
  // nuevos, así que dos clics mandan dos cuerpos distintos y la deduplicación de
  // red no puede reconocerlos como la misma acción.
  const handleAddItem = useSingleFlight(async () => {
    if (!id || !isItemFormValid) return;

    let receiptFileId: string | undefined;
    let referenceFileId: string | undefined;

    if (receiptFile) {
      const uploaded = await storageApi.uploadFile(receiptFile, { entityType: 'expense_order' });
      receiptFileId = uploaded.id;
    }

    if (referenceFile) {
      const uploaded = await storageApi.uploadFile(referenceFile, { entityType: 'expense_order' });
      referenceFileId = uploaded.id;
    }

    const dto: CreateExpenseItemDto = {
      name: itemForm.name.trim(),
      quantity: parseFloat(itemForm.quantity),
      unitPrice: parseCurrencyInput(itemForm.unitPrice),
      description: itemForm.description || undefined,
      paymentMethod: itemForm.paymentMethod,
      bankEntity: itemForm.paymentMethod === PaymentMethod.TRANSFER ? itemForm.bankEntity ?? null : null,
      supplierId: itemForm.supplierId || undefined,
      productionAreaIds: itemForm.productionAreaIds.length
        ? itemForm.productionAreaIds
        : undefined,
      receiptFileId,
      referenceFileId,
    };

    await addExpenseItemMutation.mutateAsync({ id, dto });
    handleCloseItemDialog();
  });

  // ── View / download receipt ───────────────────────────────────────────────────
  const handleViewReceipt = async (fileId: string) => {
    setLoadingReceiptId(fileId);
    try {
      const [urlResponse, fileData] = await Promise.all([
        storageApi.getFileUrl(fileId),
        storageApi.getFile(fileId),
      ]);
      setReceiptDialog({
        open: true,
        url: urlResponse.url,
        mimeType: fileData.mimeType,
        originalName: fileData.originalName,
        fileId,
      });
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const handleViewReference = async (fileId: string) => {
    setLoadingReferenceId(fileId);
    try {
      const [urlResponse, fileData] = await Promise.all([
        storageApi.getFileUrl(fileId),
        storageApi.getFile(fileId),
      ]);
      setReferenceDialog({
        open: true,
        url: urlResponse.url,
        mimeType: fileData.mimeType,
        originalName: fileData.originalName,
        fileId,
      });
    } finally {
      setLoadingReferenceId(null);
    }
  };

  const handleDownloadReceipt = async (fileId: string, originalName: string) => {
    try {
      const response = await import('../../../api/axios').then(({ default: axiosInstance }) =>
        axiosInstance.get(`/storage/${fileId}/download`, { responseType: 'blob' }),
      );
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName || 'comprobante';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // silently ignore — user can try again
    }
  };

  // ── Loading / not found ───────────────────────────────────────────────────────
  if (expenseOrderQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (!og) {
    return (
      <Box>
        <PageHeader title="Orden de Gasto" />
        <Alert severity="error">Orden de gasto no encontrada.</Alert>
      </Box>
    );
  }

  const isParentOrderAnulado = og.workOrder?.order?.status === 'ANULADO';
  const statusConfig = EXPENSE_ORDER_STATUS_CONFIG[og.status];
  const allowedTransitions = STATUS_TRANSITIONS[og.status] ?? [];
  const subtotalAmount = og.items.reduce((acc, item) => acc + parseFloat(item.total), 0);
  const totals = computeExpenseTotals(subtotalAmount, {
    applyIva: og.applyIva,
    ivaPercentage: Number(og.ivaRate) * 100,
    withholdings: withholdingsFromRates(og),
  });
  const withholdingPercentages = getWithholdingPercentages(withholdingsFromRates(og));
  const ivaAmount = totals.ivaAmount;
  const totalAmount = totals.total;
  const hasWithholdings =
    totals.retefuenteAmount > 0 || totals.reteICAAmount > 0 || totals.reteIVAAmount > 0;
  const showTotalsBreakdown = og.applyIva || hasWithholdings;
  const isEditable =
    !isParentOrderAnulado &&
    (og.status === ExpenseOrderStatus.DRAFT || og.status === ExpenseOrderStatus.CREATED);
  const canRegisterInvoice =
    !isParentOrderAnulado && canUpdate && og.status !== ExpenseOrderStatus.DRAFT;

  const availableTransitions = isParentOrderAnulado
    ? []
    : allowedTransitions.filter((s) => {
        if (s === ExpenseOrderStatus.AUTHORIZED) return canApprove;
        // ADMIN_AUTHORIZED solo aparece en el dropdown para admins; los comerciales usan el botón dedicado
        if (s === ExpenseOrderStatus.ADMIN_AUTHORIZED) return canApprove;
        return canUpdate;
      });

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <DocumentTypeBanner type="OG" documentNumber={og.ogNumber} />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        gap={1}
      >
        <PageHeader
          title={og.ogNumber}
          hideTitle
          breadcrumbs={[
            { label: 'Costos directos de la O.T', path: ROUTES.EXPENSE_ORDERS },
            { label: og.ogNumber },
          ]}
        />
        {canDelete && isDeletable && (
          <Button
            startIcon={<DeleteOutlineIcon />}
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setConfirmDelete(true)}
          >
            Eliminar OG
          </Button>
        )}
      </Stack>

      <ApprovalQueueBar
        queue={approvalQueue}
        nouns={['OG', 'OGs']}
        nextLabel={approvalQueue.nextItem?.label}
      />

      {/* Banner orden de pedido ANULADA */}
      {isParentOrderAnulado && (
        <Alert severity="error" sx={{ mt: 2, mb: 1 }}>
          <strong>Esta orden de gasto proviene de una OP ANULADA.</strong> La Orden de Pedido relacionada ha sido anulada. Este registro es de solo lectura.
        </Alert>
      )}

      <StatusHighlight
        label={statusConfig.label}
        color={statusConfig.color}
        sx={{ mt: 2 }}
      />

      {/* Banner contextual según estado y rol */}
      {(() => {
        if (og.status === ExpenseOrderStatus.DRAFT) {
          if (canUpdate && !canApprove) {
            return (
              <Alert severity="info" icon={<HourglassTopIcon />} sx={{ mt: 2 }}>
                <AlertTitle>Borrador — completa los ítems y solicita autorización</AlertTitle>
                Esta OG está en borrador. Cuando tengas todos los ítems listos, haz clic en{' '}
                <strong>Solicitar Autorización</strong>: el administrador recibirá una notificación
                por <strong>WhatsApp</strong> y podrá aprobarla desde su celular o desde{' '}
                <strong>Solicitudes Pendientes</strong>.
              </Alert>
            );
          }
          if (canApprove) {
            return (
              <Alert severity="info" icon={<AdminPanelSettingsIcon />} sx={{ mt: 2 }}>
                <AlertTitle>Borrador</AlertTitle>
                Esta OG está en borrador. Puedes cambiar su estado directamente o esperar a que el
                solicitante envíe la solicitud de autorización.
              </Alert>
            );
          }
        }

        if (og.status === ExpenseOrderStatus.CREATED) {
          // Banner de rechazo por Caja (tiene prioridad sobre los demás en estado CREATED)
          if (og.cajaRejectionReason) {
            return (
              <Alert
                severity="error"
                icon={<BlockIcon />}
                sx={{ mt: 2, borderLeft: '4px solid', borderColor: 'error.main' }}
              >
                <AlertTitle>Rechazada por Caja — se requiere nueva autorización</AlertTitle>
                <Box sx={{ mb: 0.5 }}>
                  <strong>Motivo del rechazo:</strong> {og.cajaRejectionReason}
                </Box>
                {og.cajaRejectedBy && (
                  <Box sx={{ mb: 0.5 }}>
                    <strong>Rechazada por:</strong>{' '}
                    {[og.cajaRejectedBy.firstName, og.cajaRejectedBy.lastName]
                      .filter(Boolean)
                      .join(' ') || og.cajaRejectedBy.email}
                  </Box>
                )}
                {!canApprove && (
                  <Box sx={{ mt: 0.5 }}>
                    Para continuar, haz clic en <strong>Solicitar Autorización</strong> y el
                    administrador deberá volver a aprobarla para que Caja pueda firmarla.
                  </Box>
                )}
              </Alert>
            );
          }

          if (canUpdate && !canApprove) {
            if (hasPendingOgRequest) {
              return (
                <Alert
                  severity="info"
                  icon={<MarkEmailReadIcon />}
                  sx={{ mt: 2, borderLeft: '4px solid', borderColor: 'info.main' }}
                >
                  <AlertTitle>Solicitud enviada — esperando respuesta de gerencia</AlertTitle>
                  Tu solicitud fue enviada al administrador. Recibirá una notificación por{' '}
                  <strong>WhatsApp</strong> y podrá aprobarla desde su celular o desde{' '}
                  <strong>Solicitudes Pendientes</strong>. Te avisaremos cuando esté lista para caja.
                </Alert>
              );
            }
            return (
              <Alert severity="warning" icon={<HourglassTopIcon />} sx={{ mt: 2 }}>
                <AlertTitle>Pendiente de autorización — acción requerida</AlertTitle>
                Esta OG está lista pero aún no fue autorizada. Haz clic en{' '}
                <strong>Solicitar Autorización</strong> para enviar la solicitud al administrador.
                Recibirá una notificación por <strong>WhatsApp</strong> y podrá aprobarla desde
                su celular o desde la sección <strong>Solicitudes Pendientes</strong>.
              </Alert>
            );
          }
          if (canApprove) {
            return (
              <Alert severity="warning" icon={<AdminPanelSettingsIcon />} sx={{ mt: 2 }}>
                <AlertTitle>Requiere tu autorización administrativa</AlertTitle>
                Esta OG está pendiente de aprobación. Puedes autorizarla desde la sección{' '}
                <strong>Solicitudes Pendientes</strong>, responder el mensaje de WhatsApp que
                recibiste, o cambiar el estado directamente desde el botón <strong>Estado</strong>.
              </Alert>
            );
          }
        }

        if (og.status === ExpenseOrderStatus.ADMIN_AUTHORIZED) {
          if (canCajaAuthorize) {
            return (
              <Alert severity="success" icon={<PaymentsIcon />} sx={{ mt: 2 }}>
                <AlertTitle>Requiere tu firma de Caja</AlertTitle>
                El administrador ya aprobó esta OG. Haz clic en el botón{' '}
                <strong>Autorizar (Firma Caja)</strong> para registrar el pago y descontarlo
                automáticamente de la caja activa.
              </Alert>
            );
          }
          return (
            <Alert severity="info" icon={<HourglassTopIcon />} sx={{ mt: 2 }}>
              <AlertTitle>Esperando firma de Caja</AlertTitle>
              El administrador aprobó esta OG. Está pendiente de que el área de{' '}
              <strong>Caja</strong> dé la firma final para procesar el pago.
              No se requiere ninguna acción de tu parte en este momento.
            </Alert>
          );
        }

        if (og.status === ExpenseOrderStatus.AUTHORIZED) {
          return (
            <Alert severity="info" icon={<HourglassTopIcon />} sx={{ mt: 2 }}>
              <AlertTitle>Procesando pago</AlertTitle>
              Caja autorizó esta OG. El pago está siendo registrado en el sistema.
            </Alert>
          );
        }

        if (og.status === ExpenseOrderStatus.PAID) {
          return (
            <Alert severity="success" icon={<TaskAltIcon />} sx={{ mt: 2 }}>
              <AlertTitle>Pagada</AlertTitle>
              Esta OG fue pagada exitosamente. El valor fue descontado de la caja y el proceso está
              completo.
            </Alert>
          );
        }

        return null;
      })()}

      {/* Toolbar de Acciones */}
      <ActionToolbar sx={{ mt: 2, mb: 3 }}>
          {canUpdate && isEditable && (
            <ToolbarButton
              icon={<EditIcon />}
              label="Editar"
              onClick={() => navigate(ROUTES.EXPENSE_ORDERS_EDIT.replace(':id', og.id))}
              tooltip="Editar Costo Directo"
            />
          )}

          {availableTransitions.length > 0 && (
            <ToolbarButton
              icon={<SwapHorizIcon />}
              label="Estado"
              secondaryLabel="Cambiar"
              onClick={() => setStatusDialogOpen(true)}
              color={theme.palette.info.main}
              tooltip="Cambiar Estado"
            />
          )}

          {(og.status === ExpenseOrderStatus.DRAFT || og.status === ExpenseOrderStatus.CREATED) &&
            canUpdate && !canApprove && !hasPendingOgRequest && !isParentOrderAnulado && (
            <ToolbarButton
              icon={<HourglassTopIcon />}
              label="Solicitar"
              secondaryLabel="Autorización"
              onClick={() => setAuthRequestDialogOpen(true)}
              color={theme.palette.warning.main}
              tooltip="Solicitar autorización al administrador"
            />
          )}

          {og.status === ExpenseOrderStatus.ADMIN_AUTHORIZED && canCajaAuthorize && !isParentOrderAnulado && (
            <ToolbarButton
              icon={<CheckCircleIcon />}
              label="Autorizar"
              secondaryLabel="Firma Caja"
              onClick={handleCajaAuthorize}
              color={theme.palette.success.main}
              tooltip="Segunda firma Caja — registra el pago"
              disabled={cajaAuthorizeMutation.isPending}
            />
          )}

          {canRegisterInvoice && (
            <ToolbarButton
              icon={<ReceiptIcon />}
              label="Factura"
              secondaryLabel={og.electronicInvoiceNumber ? 'Actualizar' : 'Registrar'}
              onClick={handleOpenInvoiceDialog}
              color={theme.palette.info.main}
              tooltip={og.electronicInvoiceNumber ? 'Actualizar Factura Electrónica' : 'Registrar Factura Electrónica'}
            />
          )}

          <ToolbarButton
            icon={<AccountTreeIcon />}
            label="Trazabilidad"
            onClick={() => navigate(`/orders/flow/expense-order/${og.id}`)}
            tooltip="Ver Trazabilidad"
          />

          <ExpenseOrderPdfButton expenseOrder={og} />
      </ActionToolbar>

      <Grid container spacing={3}>
        {/* Left column */}
        <Grid item xs={12} sm={12} md={8}>
          {/* General info */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                Información General
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Estado</Typography>
                  <Box mt={0.5}>
                    <Chip label={statusConfig.label} color={statusConfig.color} size="small" />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Fecha</Typography>
                  <Typography variant="body2">{formatDate(og.createdAt)}</Typography>
                </Grid>
                {og.workOrder && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">OT Asociada</Typography>
                    <Typography variant="body2">{og.workOrder.workOrderNumber}</Typography>
                  </Grid>
                )}
                {og.areaOrMachine && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Área / Máquina</Typography>
                    <Typography variant="body2">{og.areaOrMachine}</Typography>
                  </Grid>
                )}
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Se autoriza a</Typography>
                  <Typography variant="body2">{userName(og.authorizedTo)}</Typography>
                </Grid>
                {og.responsible && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Responsable</Typography>
                    <Typography variant="body2">{userName(og.responsible)}</Typography>
                  </Grid>
                )}
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Creado por</Typography>
                  <Typography variant="body2">{userName(og.createdBy)}</Typography>
                </Grid>
                {og.authorizedBy && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Autorizado por (Admin)</Typography>
                    <Typography variant="body2">{userName(og.authorizedBy)}</Typography>
                  </Grid>
                )}
                {og.cajaAuthorizedBy && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Autorizado por (Caja)</Typography>
                    <Typography variant="body2">{userName(og.cajaAuthorizedBy)}</Typography>
                  </Grid>
                )}
                {og.electronicInvoiceNumber && (
                  <Grid item xs={6} sm={3}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <ReceiptIcon sx={{ fontSize: 14 }} color="info" />
                      <Typography variant="caption" color="text.secondary">N° Factura Electrónica</Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color="info.main"
                      fontFamily="monospace"
                      sx={{ wordBreak: 'break-all' }}
                    >
                      {og.electronicInvoiceNumber}
                    </Typography>
                  </Grid>
                )}
              </Grid>

              {og.observations && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary">Observaciones</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                    {og.observations}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>

          {/* Items table */}
          <Card variant="outlined">
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                mb={2}
                gap={1}
              >
                <Typography variant="subtitle1" fontWeight={700}>
                  Ítems de Gasto
                </Typography>
                {canUpdate && isEditable && (
                  <Button
                    startIcon={<AddIcon />}
                    size="small"
                    variant="outlined"
                    color="primary"
                    onClick={handleOpenItemDialog}
                  >
                    Agregar Ítem
                  </Button>
                )}
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ítem</TableCell>
                    <TableCell align="center">Cant.</TableCell>
                    <TableCell align="right">Precio Unit.</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Método de Pago</TableCell>
                    <TableCell>Proveedor</TableCell>
                    <TableCell>Área de Producción</TableCell>
                    <TableCell align="center">Comprobante</TableCell>
                    <TableCell align="center">Referencia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {og.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {item.name}
                        </Typography>
                        {item.description && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {item.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">{item.quantity}</TableCell>
                      <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right">
                        <strong>{formatCurrency(item.total)}</strong>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={PAYMENT_METHOD_LABELS[item.paymentMethod]}
                          size="small"
                          variant="outlined"
                        />
                        {item.paymentMethod === PaymentMethod.TRANSFER && item.bankEntity && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            {item.bankEntity}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{item.supplier?.name ?? '—'}</TableCell>
                      <TableCell>
                        {item.productionAreas.length > 0
                          ? item.productionAreas
                              .map((pa) => pa.productionArea.name)
                              .join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell align="center">
                        {item.receiptFileId ? (
                          <Tooltip title="Ver comprobante">
                            <span>
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleViewReceipt(item.receiptFileId!)}
                                disabled={loadingReceiptId === item.receiptFileId}
                              >
                                {loadingReceiptId === item.receiptFileId ? (
                                  <CircularProgress size={16} color="inherit" />
                                ) : (
                                  <VisibilityIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {item.referenceFileId ? (
                          <Tooltip title="Ver imagen de referencia">
                            <span>
                              <IconButton
                                size="small"
                                color="secondary"
                                onClick={() => handleViewReference(item.referenceFileId!)}
                                disabled={loadingReferenceId === item.referenceFileId}
                              >
                                {loadingReferenceId === item.referenceFileId ? (
                                  <CircularProgress size={16} color="inherit" />
                                ) : (
                                  <ImageIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {showTotalsBreakdown && (
                    <>
                      <TableRow>
                        <TableCell colSpan={3} align="right">
                          <Typography variant="body2" color="text.secondary">
                            Subtotal
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatCurrency(subtotalAmount)}
                          </Typography>
                        </TableCell>
                        <TableCell colSpan={5} />
                      </TableRow>
                      {og.applyIva && (
                        <TableRow>
                          <TableCell colSpan={3} align="right">
                            <Typography variant="body2" color="text.secondary">
                              IVA ({Math.round(Number(og.ivaRate) * 100)}%)
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {formatCurrency(ivaAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell colSpan={5} />
                        </TableRow>
                      )}
                      {totals.retefuenteAmount > 0 && (
                        <TableRow>
                          <TableCell colSpan={3} align="right">
                            <Typography variant="body2" color="text.secondary">
                              Retefuente ({withholdingPercentages.retefuente}%)
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="error.main">
                              - {formatCurrency(totals.retefuenteAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell colSpan={5} />
                        </TableRow>
                      )}
                      {totals.reteICAAmount > 0 && (
                        <TableRow>
                          <TableCell colSpan={3} align="right">
                            <Typography variant="body2" color="text.secondary">
                              ReteICA ({withholdingPercentages.reteICA}%)
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="error.main">
                              - {formatCurrency(totals.reteICAAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell colSpan={5} />
                        </TableRow>
                      )}
                      {totals.reteIVAAmount > 0 && (
                        <TableRow>
                          <TableCell colSpan={3} align="right">
                            <Typography variant="body2" color="text.secondary">
                              ReteIVA ({withholdingPercentages.reteIVA}%)
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="error.main">
                              - {formatCurrency(totals.reteIVAAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell colSpan={5} />
                        </TableRow>
                      )}
                    </>
                  )}
                  <TableRow>
                    <TableCell colSpan={3} align="right">
                      {showTotalsBreakdown && (
                        <Typography variant="subtitle2" fontWeight={700}>
                          {hasWithholdings ? 'Total a pagar' : 'Total'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle2" fontWeight={700}>
                        {formatCurrency(totalAmount)}
                      </Typography>
                    </TableCell>
                    <TableCell colSpan={5} />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        {/* Right column: OT details */}
        {og.workOrder && (
          <Grid item xs={12} sm={12} md={4}>
            <Card variant="outlined">
              <CardContent>
                {/* ── Work Order Section ────────────────────────────── */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Orden de Trabajo
                  </Typography>
                  <Chip
                    label={WORK_ORDER_STATUS_CONFIG[og.workOrder.status as WorkOrderStatus]?.label ?? og.workOrder.status}
                    color={WORK_ORDER_STATUS_CONFIG[og.workOrder.status as WorkOrderStatus]?.color ?? 'default'}
                    size="small"
                  />
                </Stack>

                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">Número OT</Typography>
                    <Button
                      component={RouterLink}
                      to={ROUTES.WORK_ORDERS_DETAIL.replace(':id', og.workOrder.id)}
                      size="small"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' }}
                    >
                      {og.workOrder.workOrderNumber}
                    </Button>
                  </Stack>

                  {og.workOrder.advisor && (
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">Asesor</Typography>
                      </Stack>
                      <Typography variant="body2">{userName(og.workOrder.advisor)}</Typography>
                    </Stack>
                  )}

                  {og.workOrder.designer && (
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <BrushIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">Diseñador</Typography>
                      </Stack>
                      <Typography variant="body2">{userName(og.workOrder.designer)}</Typography>
                    </Stack>
                  )}

                  {og.workOrder.observations && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Observaciones</Typography>
                      <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-line' }}>
                        {og.workOrder.observations}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                <Divider sx={{ my: 2 }} />

                {/* ── Order Section ─────────────────────────────────── */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Orden de Producción
                  </Typography>
                  <Chip
                    label={ORDER_STATUS_CONFIG[og.workOrder.order.status as OrderStatus]?.label ?? og.workOrder.order.status}
                    color={ORDER_STATUS_CONFIG[og.workOrder.order.status as OrderStatus]?.color ?? 'default'}
                    size="small"
                  />
                </Stack>

                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">Número OP</Typography>
                    <Button
                      component={RouterLink}
                      to={ROUTES.ORDERS_DETAIL.replace(':id', og.workOrder.order.id)}
                      size="small"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' }}
                    >
                      {og.workOrder.order.orderNumber}
                    </Button>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Cliente</Typography>
                    <Typography variant="body2" fontWeight={500}>{og.workOrder.order.client.name}</Typography>
                  </Stack>

                  {og.workOrder.order.deliveryDate && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">Fecha de entrega</Typography>
                      <Typography variant="body2">{formatShortDate(og.workOrder.order.deliveryDate)}</Typography>
                    </Stack>
                  )}

                  <Divider sx={{ my: 0.5 }} />

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Total OP</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatCurrency(og.workOrder.order.total)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Pagado</Typography>
                    <Typography variant="body2" color="success.main">{formatCurrency(og.workOrder.order.paidAmount)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Saldo</Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={parseFloat(og.workOrder.order.balance || '0') > 0 ? 'warning.main' : 'success.main'}
                    >
                      {formatCurrency(og.workOrder.order.balance)}
                    </Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* ── Historial de aprobaciones y solicitudes de autorización ──────────── */}
      <Box sx={{ mt: 4 }}>
        <ExpenseOrderAuthHistory expenseOrder={og} />
      </Box>

      {/* ── Status change dialog ─────────────────────────────────────────────── */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cambiar Estado de la OG</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Estado actual:{' '}
            <strong>{EXPENSE_ORDER_STATUS_CONFIG[og.status].label}</strong>
          </Typography>
          <TextField
            select
            fullWidth
            label="Nuevo estado"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as ExpenseOrderStatus)}
          >
            {availableTransitions.map((s) => (
              <MenuItem key={s} value={s}>
                {EXPENSE_ORDER_STATUS_CONFIG[s].label}
                {s === ExpenseOrderStatus.ADMIN_AUTHORIZED && ' (Envíar solicitud de autorización a gerencia)'}
                {s === ExpenseOrderStatus.AUTHORIZED && ' (Autorización Caja — registra pago)'}
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

      {/* ── Electronic invoice dialog ────────────────────────────────────────── */}
      <Dialog open={invoiceDialogOpen} onClose={handleCloseInvoiceDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <ReceiptIcon color="info" />
            <span>{og.electronicInvoiceNumber ? 'Actualizar Factura Electrónica' : 'Registrar Factura Electrónica'}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Ingrese el número de factura electrónica del proveedor asociado a esta compra. Es
              alfanumérico y admite un máximo de 30 caracteres.
            </Typography>
            <TextField
              fullWidth
              label="Número de Factura Electrónica"
              value={invoiceNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9\-_./]/g, '');
                if (val.length <= 30) setInvoiceNumber(val);
              }}
              inputProps={{ maxLength: 30 }}
              helperText={`${invoiceNumber.length}/30 caracteres. Solo se permiten letras, números y los símbolos - _ . /`}
              disabled={invoiceLoading}
              autoFocus
              placeholder="Ej: FE-2026-00123"
            />
            {og.electronicInvoiceNumber && (
              <Typography variant="caption" color="text.secondary">
                Número actual: <strong>{og.electronicInvoiceNumber}</strong>
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseInvoiceDialog} disabled={invoiceLoading}>
            Cancelar
          </Button>
          <LoadingButton
            loading={invoiceLoading}
            onClick={handleRegisterInvoice}
            variant="contained"
            color="info"
            disabled={!invoiceNumber.trim()}
            startIcon={<ReceiptIcon />}
          >
            {invoiceLoading ? 'Guardando...' : 'Guardar'}
          </LoadingButton>
        </DialogActions>
      </Dialog>

      {/* ── Add item dialog ──────────────────────────────────────────────────── */}
      <Dialog open={itemDialogOpen} onClose={handleCloseItemDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Agregar Ítem de Gasto</DialogTitle>
        <DialogContent onPaste={handlePaste}>
          <Stack spacing={2.5} sx={{ mt: 1 }}>

            {/* Name */}
            <TextField
              label="Nombre del gasto *"
              value={itemForm.name}
              onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
              inputProps={{ maxLength: 200 }}
              fullWidth
              autoFocus
            />

            {/* Quantity + Unit price */}
            <Stack direction="row" spacing={2}>
              <TextField
                label="Cantidad *"
                type="number"
                value={itemForm.quantity}
                onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
                inputProps={{ min: 0.01, step: 0.01 }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Precio unitario *"
                value={itemForm.unitPrice ? formatCurrencyInput(itemForm.unitPrice) : ''}
                onChange={(e) => {
                  const rawValue = sanitizeCurrencyInput(e.target.value);
                  setItemForm((f) => ({ ...f, unitPrice: rawValue }));
                }}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                inputProps={{ style: { textAlign: 'right' } }}
                sx={{ flex: 1 }}
              />
            </Stack>

            {/* Total preview */}
            {parseFloat(itemForm.quantity) > 0 && parseCurrencyInput(itemForm.unitPrice) > 0 && (
              <Typography variant="body2" color="text.secondary">
                Total:{' '}
                <strong>
                  {formatCurrency(
                    (parseFloat(itemForm.quantity) || 0) * parseCurrencyInput(itemForm.unitPrice),
                  )}
                </strong>
              </Typography>
            )}

            {/* Description */}
            <TextField
              label="Descripción"
              value={itemForm.description}
              onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
              multiline
              rows={2}
              placeholder="Detalle adicional del gasto..."
              fullWidth
            />

            {/* Payment method + Supplier */}
            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Método de pago"
                value={itemForm.paymentMethod}
                onChange={(e) => {
                  const method = e.target.value as PaymentMethod;
                  setItemForm((f) => ({
                    ...f,
                    paymentMethod: method,
                    bankEntity: method === PaymentMethod.TRANSFER ? f.bankEntity : null,
                  }));
                }}
                sx={{ flex: 1 }}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>

              {itemForm.paymentMethod === PaymentMethod.TRANSFER && (
                <Box sx={{ flex: 1 }}>
                  <BankSelector
                    value={itemForm.bankEntity ?? null}
                    onChange={(val) => setItemForm((f) => ({ ...f, bankEntity: val }))}
                  />
                </Box>
              )}

              <TextField
                select
                label="Proveedor"
                value={itemForm.supplierId}
                onChange={(e) => setItemForm((f) => ({ ...f, supplierId: e.target.value }))}
                sx={{ flex: 1 }}
              >
                <MenuItem value="">Sin proveedor</MenuItem>
                {suppliers
                  .filter((s) => s.isActive !== false)
                  .map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
              </TextField>
            </Stack>

            {/* Área de producción */}
            <TextField
              select
              label="Área de producción"
              value={itemForm.productionAreaIds[0] ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setItemForm((f) => ({
                  ...f,
                  productionAreaIds: value ? [value] : [],
                }));
              }}
              fullWidth
            >
              <MenuItem value="">
                <em>Sin área</em>
              </MenuItem>
              {productionAreas
                .filter((pa) => pa.isActive !== false)
                .map((pa) => (
                  <MenuItem key={pa.id} value={pa.id}>
                    {pa.name}
                  </MenuItem>
                ))}
            </TextField>

            {/* Images section */}
            <Box>
              <Divider sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                  Imágenes
                </Typography>
              </Divider>
              <Grid container spacing={2}>
                {/* Comprobante de pago */}
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                    Comprobante de pago
                  </Typography>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    hidden
                    ref={fileInputRef}
                    onChange={(e) => handleReceiptFileChange(e.target.files?.[0] ?? null)}
                  />
                  {!receiptFile ? (
                    <Stack spacing={1}>
                      <Button
                        variant="outlined"
                        startIcon={<AttachFileIcon />}
                        size="small"
                        onClick={() => fileInputRef.current?.click()}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                      >
                        Adjuntar imagen
                      </Button>
                      <Box
                        onPaste={handlePaste}
                        tabIndex={0}
                        sx={{
                          border: '2px dashed',
                          borderColor: 'grey.300',
                          borderRadius: 1,
                          p: 2,
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s, background-color 0.2s',
                          '&:hover, &:focus': {
                            borderColor: 'primary.main',
                            bgcolor: 'action.hover',
                          },
                        }}
                        onClick={() => {
                          (document.activeElement as HTMLElement)?.blur();
                        }}
                      >
                        <ImageIcon sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }} />
                        <Typography variant="caption" color="text.secondary" display="block">
                          O pega una imagen aquí (Ctrl+V / ⌘+V)
                        </Typography>
                      </Box>
                    </Stack>
                  ) : (
                    <Stack spacing={1.5}>
                      <Box
                        sx={{
                          width: 'fit-content',
                          border: '1px solid',
                          borderColor: 'grey.300',
                          borderRadius: 1,
                          overflow: 'hidden',
                          bgcolor: 'grey.50',
                        }}
                      >
                        <Box
                          component="img"
                          src={URL.createObjectURL(receiptFile)}
                          alt="Vista previa comprobante"
                          sx={{ display: 'block', maxWidth: 200, maxHeight: 140, objectFit: 'contain' }}
                          onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                        />
                      </Box>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip
                          icon={<ImageIcon />}
                          label={`${receiptFile.name} (${(receiptFile.size / 1024).toFixed(1)} KB)`}
                          color="primary"
                          variant="outlined"
                          size="small"
                          onDelete={() => {
                            setReceiptFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          deleteIcon={<CloseIcon />}
                          sx={{ maxWidth: 240 }}
                        />
                        <IconButton size="small" onClick={() => fileInputRef.current?.click()} title="Cambiar imagen">
                          <AttachFileIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  )}
                </Grid>

                {/* Imagen de referencia */}
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                    Imagen de referencia
                  </Typography>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    hidden
                    ref={referenceFileInputRef}
                    onChange={(e) => handleReferenceFileChange(e.target.files?.[0] ?? null)}
                  />
                  {!referenceFile ? (
                    <Stack spacing={1}>
                      <Button
                        variant="outlined"
                        startIcon={<AttachFileIcon />}
                        size="small"
                        onClick={() => referenceFileInputRef.current?.click()}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                      >
                        Adjuntar imagen
                      </Button>
                      <Box
                        onPaste={handlePasteReference}
                        tabIndex={0}
                        sx={{
                          border: '2px dashed',
                          borderColor: 'grey.300',
                          borderRadius: 1,
                          p: 2,
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s, background-color 0.2s',
                          '&:hover, &:focus': {
                            borderColor: 'primary.main',
                            bgcolor: 'action.hover',
                          },
                        }}
                        onClick={() => {
                          (document.activeElement as HTMLElement)?.blur();
                        }}
                      >
                        <ImageIcon sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }} />
                        <Typography variant="caption" color="text.secondary" display="block">
                          O pega una imagen aquí (Ctrl+V / ⌘+V)
                        </Typography>
                      </Box>
                    </Stack>
                  ) : (
                    <Stack spacing={1.5}>
                      <Box
                        sx={{
                          width: 'fit-content',
                          border: '1px solid',
                          borderColor: 'grey.300',
                          borderRadius: 1,
                          overflow: 'hidden',
                          bgcolor: 'grey.50',
                        }}
                      >
                        <Box
                          component="img"
                          src={URL.createObjectURL(referenceFile)}
                          alt="Vista previa referencia"
                          sx={{ display: 'block', maxWidth: 200, maxHeight: 140, objectFit: 'contain' }}
                          onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                        />
                      </Box>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip
                          icon={<ImageIcon />}
                          label={`${referenceFile.name} (${(referenceFile.size / 1024).toFixed(1)} KB)`}
                          color="secondary"
                          variant="outlined"
                          size="small"
                          onDelete={() => {
                            setReferenceFile(null);
                            if (referenceFileInputRef.current) referenceFileInputRef.current.value = '';
                          }}
                          deleteIcon={<CloseIcon />}
                          sx={{ maxWidth: 240 }}
                        />
                        <IconButton size="small" onClick={() => referenceFileInputRef.current?.click()} title="Cambiar imagen">
                          <AttachFileIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  )}
                </Grid>
              </Grid>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseItemDialog} disabled={addExpenseItemMutation.isPending}>
            Cancelar
          </Button>
          <LoadingButton
            loading={addExpenseItemMutation.isPending}
            variant="contained"
            color="primary"
            onClick={handleAddItem}
            disabled={!isItemFormValid}
            startIcon={<AddIcon />}
          >
            {addExpenseItemMutation.isPending ? 'Guardando...' : 'Agregar Ítem'}
          </LoadingButton>
        </DialogActions>
      </Dialog>
      {/* ── Auth request dialog ──────────────────────────────────────────────── */}
      <ExpenseOrderAuthRequestDialog
        open={authRequestDialogOpen}
        onClose={() => setAuthRequestDialogOpen(false)}
        expenseOrder={og}
      />

      {/* ── View receipt dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={receiptDialog.open}
        onClose={() => setReceiptDialog((d) => ({ ...d, open: false }))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              <ReceiptIcon color="success" fontSize="small" />
              <Typography variant="subtitle1" fontWeight={600}>
                Comprobante de pago
              </Typography>
              {receiptDialog.originalName && (
                <Typography variant="caption" color="text.secondary">
                  — {receiptDialog.originalName}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Descargar">
                <IconButton
                  size="small"
                  onClick={() =>
                    handleDownloadReceipt(receiptDialog.fileId, receiptDialog.originalName)
                  }
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={() => setReceiptDialog((d) => ({ ...d, open: false }))}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 400,
              bgcolor: 'grey.100',
              p: 2,
            }}
          >
            {receiptDialog.mimeType.startsWith('image/') ? (
              <Box
                component="img"
                src={receiptDialog.url}
                alt="Comprobante de pago"
                sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 1 }}
              />
            ) : receiptDialog.mimeType === 'application/pdf' ? (
              <iframe
                src={receiptDialog.url}
                title="Comprobante de pago"
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            ) : (
              <Typography color="text.secondary">
                No se puede previsualizar este tipo de archivo.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<DownloadIcon />}
            onClick={() =>
              handleDownloadReceipt(receiptDialog.fileId, receiptDialog.originalName)
            }
          >
            Descargar
          </Button>
          <Button
            variant="contained"
            onClick={() => setReceiptDialog((d) => ({ ...d, open: false }))}
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── View reference image dialog ───────────────────────────────────────── */}
      <Dialog
        open={referenceDialog.open}
        onClose={() => setReferenceDialog((d) => ({ ...d, open: false }))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              <ImageIcon color="secondary" fontSize="small" />
              <Typography variant="subtitle1" fontWeight={600}>
                Imagen de referencia
              </Typography>
              {referenceDialog.originalName && (
                <Typography variant="caption" color="text.secondary">
                  — {referenceDialog.originalName}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Descargar">
                <IconButton
                  size="small"
                  onClick={() =>
                    handleDownloadReceipt(referenceDialog.fileId, referenceDialog.originalName)
                  }
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={() => setReferenceDialog((d) => ({ ...d, open: false }))}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 400,
              bgcolor: 'grey.100',
              p: 2,
            }}
          >
            {referenceDialog.mimeType.startsWith('image/') ? (
              <Box
                component="img"
                src={referenceDialog.url}
                alt="Imagen de referencia"
                sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 1 }}
              />
            ) : referenceDialog.mimeType === 'application/pdf' ? (
              <iframe
                src={referenceDialog.url}
                title="Imagen de referencia"
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            ) : (
              <Typography color="text.secondary">
                No se puede previsualizar este tipo de archivo.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<DownloadIcon />}
            onClick={() =>
              handleDownloadReceipt(referenceDialog.fileId, referenceDialog.originalName)
            }
          >
            Descargar
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setReferenceDialog((d) => ({ ...d, open: false }))}
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar Orden de Gasto"
        severity="error"
        message={`¿Está seguro que desea eliminar la OG ${og.ogNumber}? Se elimina también su cuenta por pagar y el consecutivo no se reutiliza. Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        isLoading={deleteExpenseOrderMutation.isPending}
      />
    </Box>
  );
};

export default ExpenseOrderDetailPage;
