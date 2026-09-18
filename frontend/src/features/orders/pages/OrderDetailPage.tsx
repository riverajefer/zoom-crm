import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  AlertTitle,
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Divider,
  Stack,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  IconButton,
  CircularProgress,
  FormLabel,
  Tabs,
  Tab,
  Tooltip,
  Link,
  useTheme,
  Paper,
} from '@mui/material';

import {
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Block as BlockIcon,
  Payment as PaymentIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  AttachFile as AttachFileIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  Close as CloseIcon,
  Discount as DiscountIcon,
  Receipt as ReceiptIcon,
  Build as BuildIcon,
  OpenInNew as OpenInNewIcon,
  Image as ImageIcon,
  AccountTree as AccountTreeIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ExpandMore as ExpandMoreIcon,
  CurrencyExchange as CurrencyExchangeIcon,
  HourglassEmpty as HourglassEmptyIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { DatePicker } from '@mui/x-date-pickers';
import { PageHeader } from '../../../components/common/PageHeader';
import { ApprovalQueueBar } from '../../../components/common/ApprovalQueueBar';
import { QueueReviewActions } from '../../../components/common/QueueReviewActions';
import { useApprovalQueue } from '../../../hooks/useApprovalQueue';
import { editRequestsApi } from '../../../api/edit-requests.api';
import { clientOwnershipAuthRequestsApi } from '../../../api/client-ownership-auth-requests.api';
import { parsePhoneValue } from '../../../components/common/PhoneInputWithCountry';
import { StatusHighlight } from '../../../components/common/StatusHighlight';

import { DocumentTypeBanner } from '../../../components/common/DocumentTypeBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { TruncatedText } from '../../../components/common/TruncatedText';
import {
  useOrder,
  useOrderPayments,
  useOrderProfitability,
  usePaymentEditApprovals,
} from '../hooks';
import {
  OrderStatusChip,
  OrderPdfButton,
  ApplyDiscountDialog,
  DiscountsSection,
  ToolbarButton,
  RefundRequestDialog,
} from '../components';
import { generateOrderPdf } from '../utils/generateOrderPdf';
import { getPendingAdvanceInfo } from '../utils/pendingAdvance';
import { ActivePermissionBanner } from '../components/ActivePermissionBanner';
import { RequestEditPermissionButton } from '../components/RequestEditPermissionButton';
import { RequestAdvisorChangeButton } from '../components/RequestAdvisorChangeButton';
import { AdvisorChangeStatusAlert } from '../components/AdvisorChangeStatusAlert';
import { useIsCashOpen } from '../../cash-register/hooks/useCashRegister';
import { EditRequestsList } from '../components/EditRequestsList';
import VoidPaymentDialog from '../components/VoidPaymentDialog';
import { AdvancePaymentApprovalBadge } from '../components/AdvancePaymentApprovalBadge';
import { StatusChangeAuthRequestDialog } from '../components/StatusChangeAuthRequestDialog';
import { OrderChangeHistoryTab } from '../components/OrderChangeHistoryTab';
import { OrderAuthHistory } from '../components/OrderAuthHistory';
import { ordersApi } from '../../../api/orders.api';
import { storageApi } from '../../../api/storage.api';
import axiosInstance from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import { ROUTES } from '../../../utils/constants';
import type {
  OrderStatus,
  PaymentMethod,
  CreatePaymentDto,
  ApplyDiscountDto,
  ExpenseOrderSummary,
  Payment,
  AdvancePaymentApproval,
} from '../../../types/order.types';
import {
  ORDER_STATUS_CONFIG,
  PAYMENT_METHOD_LABELS,
  ALLOWED_TRANSITIONS,
} from '../../../types/order.types';
import { CommentSection } from '../../comments';
import { BankSelector } from '../../../components/common/BankSelector';

const formatCurrency = (value: string | number): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue);
};

const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
};

const formatDateTime = (date: string): string => {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

const PAYMENT_EDIT_STATUS_CONFIG: Record<
  string,
  { label: string; color: 'warning' | 'success' | 'error' | 'default' }
> = {
  PENDING: { label: 'Pendiente de aprobación', color: 'warning' },
  APPROVED: { label: 'Aprobada', color: 'success' },
  REJECTED: { label: 'Rechazada', color: 'error' },
  EXPIRED: { label: 'Expirada', color: 'default' },
};

const formatPhoneForWhatsApp = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith('57')) return digits;
  if (digits.length === 13 && digits.startsWith('057')) return digits.slice(1);
  return digits;
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

// Formatear moneda mientras se escribe (con separadores de miles)
const formatCurrencyInput = (value: string | number): string => {
  // Convertir a string y remover todo excepto números
  const numericValue = value.toString().replace(/\D/g, '');

  if (!numericValue) return '';

  // Convertir a número y formatear con separadores de miles
  const number = parseInt(numericValue, 10);
  return new Intl.NumberFormat('es-CO').format(number);
};

export const OrderDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, permissions } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();

  const { orderQuery, updateStatusMutation, deleteOrderMutation } = useOrder(
    id!,
  );
  const {
    paymentsQuery,
    addPaymentMutation,
    updatePaymentMutation,
    voidPaymentMutation,
  } = useOrderPayments(id!);
  const {
    approvalsQuery: paymentEditApprovalsQuery,
    approveMutation: approvePaymentEditMutation,
    rejectMutation: rejectPaymentEditMutation,
  } = usePaymentEditApprovals(id!);
  const { data: profitabilityData, isLoading: profitabilityLoading } =
    useOrderProfitability(id!);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  // Define si un abono nuevo entra directo al arqueo o queda en cola.
  const { data: isCashOpen } = useIsCashOpen();
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  // El candado contra el doble clic tiene que ser un `ref`: dos clics en el
  // mismo frame leen ambos `paymentSubmitting` en `false`, porque el estado no
  // se actualiza hasta el siguiente render. Con dinero de por medio, esa carrera
  // registraba el abono dos veces. Se declara aquí arriba, junto al resto de
  // hooks, porque más abajo la página tiene `return` tempranos.
  const paymentLockRef = useRef(false);
  // El candado de arriba solo cubre el doble clic dentro de esta pestaña. La
  // llave de idempotencia cubre además el reintento de red y dos pestañas
  // abiertas: viaja en el POST y el backend devuelve el abono ya registrado en
  // vez de inflar el saldo pagado y el arqueo. Se regenera cada vez que se abre
  // el diálogo, porque dos abonos distintos a la misma orden son legítimos.
  const paymentIdempotencyKeyRef = useRef(crypto.randomUUID());
  const openPaymentDialog = () => {
    paymentIdempotencyKeyRef.current = crypto.randomUUID();
    setPaymentDialogOpen(true);
  };
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [paymentData, setPaymentData] = useState<CreatePaymentDto>({
    amount: 0,
    paymentMethod: 'CASH',
    paymentDate: new Date().toISOString(),
  });
  // Edición de pago: id del pago en edición (null = modo "agregar")
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  // Monto original del pago antes de editar (para calcular correctamente el saldo disponible)
  const [originalPaymentAmount, setOriginalPaymentAmount] = useState<number>(0);
  const [editReason, setEditReason] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<string | null>(null);
  // Pago cuyo comprobante se va a eliminar (controla el modal de confirmación)
  const [receiptToDelete, setReceiptToDelete] = useState<string | null>(null);
  const [paymentToVoid, setPaymentToVoid] = useState<Payment | null>(null);

  const handleReceiptPaste = (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.indexOf('image') !== -1) {
        const file = clipItems[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const newFile = new File(
            [file],
            `pasted-receipt-${Date.now()}.${extension}`,
            { type: file.type },
          );
          setReceiptFile(newFile);
          e.preventDefault();
          break;
        }
      }
    }
  };
  const [deletingDiscount, setDeletingDiscount] = useState(false);
  const [viewReceiptDialog, setViewReceiptDialog] = useState<{
    open: boolean;
    url: string;
    mimeType: string;
  }>({ open: false, url: '', mimeType: '' });
  const [viewSampleImageDialog, setViewSampleImageDialog] = useState<{
    open: boolean;
    url: string;
  }>({ open: false, url: '' });
  const [notesImageUrl, setNotesImageUrl] = useState<string | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [statusAuthDialogOpen, setStatusAuthDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);

  // ── Cola de aprobación ("revisar y siguiente") ────────────────────────────
  // Las bandejas de Edición de Orden y Propiedad Cliente no tienen botón de
  // aprobación en esta página, así que la resolución vive en la propia barra.
  const queryClient = useQueryClient();
  const buildQueuePath = useCallback(
    (orderId: string) => `/orders/${orderId}`,
    [],
  );
  const isAdminUser = user?.role?.name === 'admin';
  const canReviewEditRequests =
    isAdminUser || permissions.includes('approve_orders');
  const canReviewOwnership =
    isAdminUser || permissions.includes('approve_client_ownership_auth');

  const approvalQueue = useApprovalQueue({
    currentId: id,
    buildPath: buildQueuePath,
    enabled: canReviewEditRequests || canReviewOwnership,
  });

  const queueRequestId = approvalQueue.currentItem?.requestId;
  const queueKey = approvalQueue.queueKey;
  const canResolveQueue =
    !!queueRequestId &&
    ((queueKey === 'order-edit' && canReviewEditRequests) ||
      (queueKey === 'client-ownership' && canReviewOwnership));

  const reviewQueueMutation = useMutation({
    mutationFn: async ({
      action,
      notes,
    }: {
      action: 'approve' | 'reject';
      notes?: string;
    }) => {
      if (!queueRequestId) throw new Error('Solicitud no disponible');

      if (queueKey === 'order-edit') {
        return action === 'approve'
          ? editRequestsApi.approveGlobal(queueRequestId, {
              reviewNotes: notes,
            })
          : editRequestsApi.rejectGlobal(queueRequestId, {
              reviewNotes: notes,
            });
      }
      return action === 'approve'
        ? clientOwnershipAuthRequestsApi.approve(queueRequestId, {
            reviewNotes: notes,
          })
        : clientOwnershipAuthRequestsApi.reject(queueRequestId, {
            reviewNotes: notes ?? '',
          });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['editRequests'] });
      queryClient.invalidateQueries({
        queryKey: ['clientOwnershipAuthRequests'],
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-queue-pending'] });
      enqueueSnackbar(
        variables.action === 'approve'
          ? 'Solicitud aprobada'
          : 'Solicitud rechazada',
        { variant: 'success' },
      );
      approvalQueue.markProcessedAndNext();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error?.response?.data?.message || 'Error al procesar la solicitud',
        { variant: 'error' },
      );
    },
  });

  // Auto-salto: si al abrir una orden de la cola su solicitud ya fue resuelta
  // (aprobada/rechazada desde la bandeja, otra pestaña, etc.), se marca como
  // revisada y se salta a la siguiente pendiente. Así el paginador solo recorre
  // solicitudes realmente pendientes, sin importar desde dónde se resolvieron.
  // Se comprueba contra la lista de pendientes en vivo (por tipo de cola).
  const { data: queuePendingRequestIds } = useQuery({
    queryKey: ['approval-queue-pending', queueKey],
    queryFn: async () => {
      const rows =
        queueKey === 'order-edit'
          ? await editRequestsApi.findAllPending()
          : await clientOwnershipAuthRequestsApi.findPending();
      return new Set((rows as Array<{ id: string }>).map((row) => row.id));
    },
    enabled: approvalQueue.isActive && canResolveQueue,
  });

  const isQueueItemResolved =
    approvalQueue.isActive &&
    !approvalQueue.isCurrentProcessed &&
    !!queueRequestId &&
    !!queuePendingRequestIds &&
    !queuePendingRequestIds.has(queueRequestId);

  useEffect(() => {
    if (isQueueItemResolved) approvalQueue.markProcessedAndNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueueItemResolved]);

  const order = orderQuery.data;
  const payments = paymentsQuery.data || [];
  const discounts = order?.discounts || [];
  const paymentEditApprovals = paymentEditApprovalsQuery.data || [];
  // Mapa paymentId -> solicitud PENDING (para badge "Edición pendiente")
  const pendingEditByPayment = React.useMemo(() => {
    const map: Record<string, (typeof paymentEditApprovals)[number]> = {};
    for (const req of paymentEditApprovals) {
      if (req.status === 'PENDING') map[req.paymentId] = req;
    }
    return map;
  }, [paymentEditApprovals]);

  // Mapa paymentId -> autorización de anticipo más reciente (badge con detalle
  // de la aprobación en el historial de pagos).
  const advanceApprovalByPayment = React.useMemo(() => {
    const map: Record<string, AdvancePaymentApproval> = {};
    for (const approval of order?.advancePaymentApprovals || []) {
      // paymentId es null cuando el pago fue eliminado por un rechazo: esa
      // solicitud vive en el historial de autorizaciones, no en esta tabla.
      if (!approval.paymentId) continue;
      const current = map[approval.paymentId];
      if (
        !current ||
        new Date(approval.createdAt) > new Date(current.createdAt)
      ) {
        map[approval.paymentId] = approval;
      }
    }
    return map;
  }, [order?.advancePaymentApprovals]);

  // Cargar URL firmada de la imagen de observaciones
  useEffect(() => {
    let active = true;
    const notesImageId = order?.notesImageId;
    if (notesImageId) {
      storageApi
        .getFileUrl(notesImageId)
        .then(({ url }) => {
          if (active) setNotesImageUrl(url);
        })
        .catch(() => {
          /* ignore */
        });
    } else {
      setNotesImageUrl(null);
    }
    return () => {
      active = false;
    };
  }, [order?.notesImageId]);

  const openMenu = Boolean(anchorEl);

  if (orderQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (!order) {
    return (
      <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
        <Typography>Orden no encontrada</Typography>
      </Box>
    );
  }

  const isAnulado = order.status === 'ANULADO';
  const canEdit =
    !isAnulado &&
    [
      'DRAFT',
      'CONFIRMED',
      'IN_PRODUCTION',
      'READY',
      'DELIVERED',
      'WARRANTY',
    ].includes(order.status);
  const canAddPayment =
    !isAnulado &&
    permissions.includes('register_order_payments') &&
    [
      'CONFIRMED',
      'IN_PRODUCTION',
      'READY',
      'DELIVERED',
      'DELIVERED_ON_CREDIT',
      'PAID',
    ].includes(order.status);
  const isAdmin = user?.role?.name === 'admin';
  const canApplyDiscount =
    !isAnulado &&
    permissions.includes('apply_discounts') &&
    [
      'CONFIRMED',
      'IN_PRODUCTION',
      'READY',
      'DELIVERED',
      'DELIVERED_ON_CREDIT',
      'PAID',
      'WARRANTY',
    ].includes(order.status);
  const canDeleteDiscount =
    !isAnulado && permissions.includes('delete_discounts');
  const canEditPayment =
    !isAnulado && permissions.includes('edit_order_payments');
  // Anular un pago es la vía correcta para quitar plata mal registrada. Pedirla
  // y ejecutarla son permisos distintos: el comercial solicita y el admin
  // autoriza; caja y contabilidad anulan de una si su caja sigue abierta.
  const canVoidPayment =
    !isAnulado && permissions.includes('request_payment_void');
  const voidsDirectly = permissions.includes('void_cash_movements');
  // Usuario que puede aplicar la edición sin solicitud de aprobación
  const canApprovePaymentEdit =
    isAdmin || permissions.includes('approve_payment_edits');
  const canDeleteReceipt =
    isAdmin || permissions.includes('delete_payment_receipts');
  // Quién puede ver el historial/estado de solicitudes de edición de pago
  const canSeePaymentEdits =
    permissions.includes('edit_order_payments') || canApprovePaymentEdit;
  const hasIva = parseFloat(order.tax) > 0;
  const canRegisterInvoice =
    !isAnulado &&
    hasIva &&
    order.status !== 'DRAFT' &&
    permissions.includes('update_orders');
  const canChangeStatus =
    !isAnulado && (isAdmin || permissions.includes('change_order_status'));

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    if (updateStatusMutation.isPending) return;
    setAnchorEl(null);
  };

  const handleChangeStatus = async (newStatus: OrderStatus) => {
    try {
      await updateStatusMutation.mutateAsync(newStatus);
      handleMenuClose();
    } catch (error: any) {
      handleMenuClose();
      if (error?.response?.status === 403) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes('autorización')) {
          setPendingStatus(newStatus);
          setStatusAuthDialogOpen(true);
          return;
        }
      }
      // Otros errores ya se manejan en el hook
    }
  };

  const handleDelete = async () => {
    await deleteOrderMutation.mutateAsync();
    navigate('/orders');
  };

  const handleShareWhatsApp = async () => {
    if (!order) return;

    if (!order.client?.phone) {
      enqueueSnackbar('El cliente no tiene número de teléfono registrado', {
        variant: 'info',
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfDoc = await generateOrderPdf(order);
      pdfDoc.save(`Orden_${order.orderNumber}.pdf`);

      const whatsappPhone = formatPhoneForWhatsApp(order.client.phone);

      const totalFormatted = formatCurrency(order.total);
      const balanceFormatted = formatCurrency(order.balance);

      const message = [
        `Hola ${order.client.name},`,
        ``,
        `Adjunto encontrará la Orden de Pedido *${order.orderNumber}* de Zoom Publicidad.`,
        ``,
        `*Resumen:*`,
        `• Total: ${totalFormatted}`,
        `• Saldo Pendiente: ${balanceFormatted}`,
        ``,
        `Quedamos atentos a cualquier pregunta. ¡Gracias por preferirnos!`,
      ].join('\\n');

      const encodedMessage = encodeURIComponent(message);
      window.open(
        `https://wa.me/${whatsappPhone}?text=${encodedMessage}`,
        '_blank',
        'noopener,noreferrer',
      );

      enqueueSnackbar(
        'PDF descargado. Adjúntalo en la conversación de WhatsApp que se abrió.',
        { variant: 'success' },
      );
    } catch (error) {
      console.error('Error al compartir por WhatsApp:', error);
      enqueueSnackbar('Error al generar el PDF para compartir', {
        variant: 'error',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleAddPayment = async () => {
    if (paymentLockRef.current) return;
    paymentLockRef.current = true;

    setPaymentSubmitting(true);
    try {
      const payment = await addPaymentMutation.mutateAsync({
        ...paymentData,
        idempotencyKey: paymentIdempotencyKeyRef.current,
      });

      // Si hay archivo, subirlo
      if (receiptFile && payment) {
        try {
          await ordersApi.uploadPaymentReceipt(id!, payment.id, receiptFile);
          await paymentsQuery.refetch();
          enqueueSnackbar('Pago registrado con comprobante exitosamente', {
            variant: 'success',
          });
        } catch (error) {
          console.error('Error uploading receipt:', error);
          enqueueSnackbar(
            'Pago registrado pero hubo un error al subir el comprobante',
            {
              variant: 'warning',
            },
          );
        }
      } else {
        enqueueSnackbar('Pago registrado exitosamente', { variant: 'success' });
      }

      setPaymentDialogOpen(false);
      setPaymentData({
        amount: 0,
        paymentMethod: 'CASH',
        paymentDate: new Date().toISOString(),
      });
      setReceiptFile(null);
    } catch (error) {
      console.error('Error adding payment:', error);
      enqueueSnackbar('Error al registrar el pago', { variant: 'error' });
    } finally {
      setPaymentSubmitting(false);
      paymentLockRef.current = false;
    }
  };

  const resetPaymentDialog = () => {
    setPaymentDialogOpen(false);
    setEditingPaymentId(null);
    setOriginalPaymentAmount(0);
    setEditReason('');
    setPaymentData({
      amount: 0,
      paymentMethod: 'CASH',
      paymentDate: new Date().toISOString(),
    });
    setReceiptFile(null);
  };

  const handleVoidPayment = async (paymentId: string, voidReason: string) => {
    await voidPaymentMutation.mutateAsync({ paymentId, voidReason, voidsDirectly });
    setPaymentToVoid(null);
  };

  const handleOpenEditPayment = (payment: Payment) => {
    setEditingPaymentId(payment.id);
    setOriginalPaymentAmount(parseFloat(payment.amount));
    setEditReason('');
    setReceiptFile(null);
    setPaymentData({
      amount: parseFloat(payment.amount),
      paymentMethod: payment.paymentMethod,
      paymentDate: payment.paymentDate,
      reference: payment.reference ?? undefined,
      notes: payment.notes ?? undefined,
      bankEntity: payment.bankEntity ?? null,
    });
    setPaymentDialogOpen(true);
  };

  // Mismo candado que en `handleAddPayment`. Aquí además el envío puede llevar
  // un archivo, que la capa de red no deduplica por cuerpo.
  const handleUpdatePayment = async () => {
    if (paymentLockRef.current || !editingPaymentId) return;
    paymentLockRef.current = true;

    setPaymentSubmitting(true);
    try {
      await updatePaymentMutation.mutateAsync({
        paymentId: editingPaymentId,
        data: {
          amount: paymentData.amount,
          paymentMethod: paymentData.paymentMethod,
          paymentDate: paymentData.paymentDate,
          reference: paymentData.reference,
          notes: paymentData.notes,
          bankEntity:
            paymentData.paymentMethod === 'TRANSFER'
              ? (paymentData.bankEntity ?? null)
              : null,
          reason: editReason || undefined,
        },
        file: receiptFile ?? undefined,
      });
      resetPaymentDialog();
    } catch (error) {
      console.error('Error updating payment:', error);
    } finally {
      setPaymentSubmitting(false);
      paymentLockRef.current = false;
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleViewReceipt = async (receiptFileId: string) => {
    try {
      const [urlResponse, fileData] = await Promise.all([
        storageApi.getFileUrl(receiptFileId),
        storageApi.getFile(receiptFileId),
      ]);

      setViewReceiptDialog({
        open: true,
        url: urlResponse.url,
        mimeType: fileData.mimeType,
      });
    } catch (error) {
      console.error('Error viewing receipt:', error);
      enqueueSnackbar('Error al ver el comprobante', { variant: 'error' });
    }
  };

  const handleCloseViewReceipt = () => {
    setViewReceiptDialog({ open: false, url: '', mimeType: '' });
  };

  const handleViewSampleImage = async (sampleImageId: string) => {
    try {
      const { data } = await axiosInstance.get(`/storage/${sampleImageId}/url`);
      setViewSampleImageDialog({ open: true, url: data.url });
    } catch (error) {
      console.error('Error loading image:', error);
      enqueueSnackbar('Error al cargar la imagen', { variant: 'error' });
    }
  };

  const handleOpenInvoiceDialog = () => {
    setInvoiceNumber(order.electronicInvoiceNumber || '');
    setInvoiceDialogOpen(true);
  };

  const handleCloseInvoiceDialog = () => {
    setInvoiceDialogOpen(false);
    setInvoiceNumber('');
  };

  const handleRegisterInvoice = async () => {
    if (!invoiceNumber.trim()) return;
    setInvoiceLoading(true);
    try {
      await ordersApi.registerElectronicInvoice(id!, invoiceNumber.trim());
      await orderQuery.refetch();
      enqueueSnackbar('Número de factura electrónica registrado exitosamente', {
        variant: 'success',
      });
      handleCloseInvoiceDialog();
    } catch (error: any) {
      enqueueSnackbar(
        error?.response?.data?.message ||
          'Error al registrar la factura electrónica',
        { variant: 'error' },
      );
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleDownloadReceipt = async (receiptFileId: string) => {
    try {
      // Usar axiosInstance para descargar con el token
      const downloadUrl = `/storage/${receiptFileId}/download`;

      const response = await axiosInstance.get(downloadUrl, {
        responseType: 'blob', // Important: Get as blob
      });

      // Obtener nombre del archivo del header Content-Disposition
      const contentDisposition = response.headers['content-disposition'];

      let fileName = 'comprobante';

      if (contentDisposition) {
        // Primero intentar con filename* (RFC 5987) que soporta UTF-8
        const rfc5987Match = /filename\*=UTF-8''([^;\n]+)/i.exec(
          contentDisposition,
        );
        if (rfc5987Match && rfc5987Match[1]) {
          fileName = decodeURIComponent(rfc5987Match[1]);
        } else {
          // Fallback a filename regular
          const regularMatch = /filename="([^"]+)"/i.exec(contentDisposition);
          if (regularMatch && regularMatch[1]) {
            fileName = regularMatch[1];
          }
        }
      }

      // Crear blob URL y descargar
      const blob = new Blob([response.data]);
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Limpiar blob URL
      window.URL.revokeObjectURL(blobUrl);

      enqueueSnackbar('Archivo descargado', { variant: 'success' });
    } catch (error) {
      console.error('Error downloading receipt:', error);
      enqueueSnackbar('Error al descargar el comprobante', {
        variant: 'error',
      });
    }
  };

  const handleApplyDiscount = async (discountDto: ApplyDiscountDto) => {
    await ordersApi.applyDiscount(id!, discountDto);
    await orderQuery.refetch();
  };

  const handleRemoveDiscount = async (discountId: string) => {
    setDeletingDiscount(true);
    try {
      await ordersApi.removeDiscount(id!, discountId);
      await orderQuery.refetch();
      enqueueSnackbar('Descuento eliminado exitosamente', {
        variant: 'success',
      });
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al eliminar descuento',
        { variant: 'error' },
      );
    } finally {
      setDeletingDiscount(false);
    }
  };

  const handleDeleteReceipt = async (paymentId: string) => {
    try {
      setDeletingReceipt(paymentId);
      await ordersApi.deletePaymentReceipt(id!, paymentId);
      await paymentsQuery.refetch();
      enqueueSnackbar('Comprobante eliminado exitosamente', {
        variant: 'success',
      });
    } catch (error) {
      console.error('Error deleting receipt:', error);
      enqueueSnackbar('Error al eliminar el comprobante', { variant: 'error' });
    } finally {
      setDeletingReceipt(null);
      setReceiptToDelete(null);
    }
  };

  // const balance = parseFloat(order.balance);

  // Abonos registrados pero aún no aprobados por Caja: no deben mostrarse como
  // aplicados al total (el backend sí los suma a paidAmount desde el registro).
  const pendingAdvance = getPendingAdvanceInfo(order);

  // Solicitud de anticipo rechazada más reciente (su pago ya no existe)
  const rejectedAdvance = [...(order.advancePaymentApprovals || [])]
    .filter((approval) => approval.status === 'REJECTED')
    .sort(
      (a, b) =>
        new Date(b.reviewedAt ?? b.createdAt).getTime() -
        new Date(a.reviewedAt ?? a.createdAt).getTime(),
    )[0];

  // Diálogo de pago (registrar/editar): saldo disponible contra el que se compara
  // el monto ingresado. En edición se "devuelve" el monto original del pago para
  // razonar como si ese pago aún no existiera.
  const paymentEntered = paymentData.amount || 0;
  const availableForPayment =
    parseFloat(order.balance) + (editingPaymentId ? originalPaymentAmount : 0);
  const isPaymentOverpay = paymentEntered > availableForPayment;
  // El crédito es el único método que se registra en $0: no es un abono, es la
  // marca de "se entrega y el cliente paga después". Los demás exigen monto.
  const isPaymentAmountValid =
    paymentData.paymentMethod === 'CREDIT'
      ? paymentEntered === 0
      : paymentEntered > 0;
  // Saldo pendiente que quedará tras aplicar el monto (negativo = saldo a favor)
  const saldoDespues = availableForPayment - paymentEntered;

  // Saldo a favor (overpayment) = abono aplicado - total. Los abonos pendientes
  // de aprobación no cuentan hasta que Caja los apruebe.
  const overpayment = Math.max(0, -pendingAdvance.effectiveBalance);
  const hasOverpayment = overpayment > 0;
  const pendingRefund = order.refundRequests?.find(
    (r) => r.status === 'PENDING',
  );
  const hasPendingRefund = !!pendingRefund;
  // Autorizada por gerencia pero todavía sin pagar en Caja. La OP conserva su
  // estado en esta ventana: el dinero aún no se ha movido.
  const authorizedRefund = order.refundRequests?.find(
    (r) => r.status === 'APPROVED' && !r.executedAt,
  );

  // Venta ya anulada por devoluciones anteriores, y lo que queda vivo de la OP.
  const reversedAmount = parseFloat(order.reversedAmount ?? '0') || 0;
  const pendingSaleValue = Math.max(0, parseFloat(order.total) - reversedAmount);
  const netPaidAmount = parseFloat(order.paidAmount) || 0;
  const isReturned = order.status === 'RETURNED';

  // La devolución ya no exige saldo a favor: una OP sin excedente puede
  // devolverse anulando parte de la venta (el trabajo no cumplió, no se
  // entregó, se fue la luz). Lo único que la impide es que no haya nada que
  // devolver —ni excedente ni abono— o que la orden ya esté cerrada.
  const canCreateRefund =
    !isAnulado &&
    !isReturned &&
    (hasOverpayment || (netPaidAmount > 0 && pendingSaleValue > 0)) &&
    !hasPendingRefund &&
    permissions.includes('create_refund_requests');

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <DocumentTypeBanner type='OP' documentNumber={order.orderNumber} />
      <PageHeader
        title={`Orden ${order.orderNumber}`}
        hideTitle
        breadcrumbs={[
          { label: 'Órdenes', path: '/orders' },
          { label: order.orderNumber },
        ]}
      />

      <ApprovalQueueBar
        queue={approvalQueue}
        nouns={['orden', 'órdenes']}
        nextLabel={approvalQueue.nextItem?.label}
        actions={
          canResolveQueue ? (
            <QueueReviewActions
              title={
                queueKey === 'order-edit'
                  ? `Solicitud de edición de la orden ${order.orderNumber}`
                  : `Solicitud de propiedad de cliente de la orden ${order.orderNumber}`
              }
              isPending={reviewQueueMutation.isPending}
              isProcessed={approvalQueue.isCurrentProcessed}
              onApprove={async (notes) => {
                await reviewQueueMutation.mutateAsync({
                  action: 'approve',
                  notes,
                });
              }}
              onReject={async (notes) => {
                await reviewQueueMutation.mutateAsync({
                  action: 'reject',
                  notes,
                });
              }}
            />
          ) : undefined
        }
      />

      {/* Banner de permiso activo */}
      <ActivePermissionBanner orderId={id!} />

      {/* Banner de origen DTF */}
      {order.notes?.startsWith('[DTF]') && (
        <Alert severity='info' sx={{ mt: 2, mb: 1 }}>
          Esta orden fue generada desde el registro DTF{' '}
          <strong>{order.notes.replace('[DTF] ', '')}</strong>.
        </Alert>
      )}

      {/* Banner de orden ANULADA */}
      {isAnulado && (
        <Alert severity='error' icon={<WarningIcon />} sx={{ mt: 2, mb: 1 }}>
          <strong>Orden Anulada.</strong> Esta orden ha sido anulada
          definitivamente. No se pueden realizar modificaciones, pagos ni
          cambios de estado.
        </Alert>
      )}

      {/* Alertas de anticipo */}
      {order.advancePaymentStatus === 'PENDING' && (
        <Alert severity='warning' icon={<WarningIcon />} sx={{ mt: 2 }}>
          <strong>Pago pendiente de aprobación.</strong> El pago registrado en
          esta orden está siendo revisado por Caja. No se puede cambiar el
          estado hasta que sea aprobado.
          {pendingAdvance.hasPendingAdvance && (
            <Box sx={{ mt: 0.5 }}>
              El abono de{' '}
              <strong>{formatCurrency(pendingAdvance.pendingAmount)}</strong>{' '}
              aún no se descuenta del total: se aplicará al saldo cuando Caja lo
              apruebe.
            </Box>
          )}
        </Alert>
      )}
      {order.advancePaymentStatus === 'REJECTED' && (
        <Alert severity='error' sx={{ mt: 2 }}>
          <strong>Pago rechazado.</strong>{' '}
          {rejectedAdvance?.paymentAmount ? (
            <>
              El pago de{' '}
              <strong>{formatCurrency(rejectedAdvance.paymentAmount)}</strong>{' '}
              fue rechazado por Caja y eliminado del historial de pagos.
            </>
          ) : (
            <>
              El pago registrado en esta orden fue rechazado por Caja. El pago
              ha sido revertido.
            </>
          )}
          {order.advancePaymentRejectedReason && (
            <Box sx={{ mt: 0.5 }}>
              <strong>Motivo del rechazo:</strong>{' '}
              {order.advancePaymentRejectedReason}
            </Box>
          )}
          {pendingAdvance.appliedPaidAmount > 0 && (
            <Box sx={{ mt: 0.5 }}>
              Los demás abonos de esta orden (
              {formatCurrency(pendingAdvance.appliedPaidAmount)}) siguen
              aplicados al saldo.
            </Box>
          )}
        </Alert>
      )}

      {/* Alertas de descuento */}
      {order.discountApprovalStatus === 'PENDING' && (
        <Alert severity='warning' icon={<WarningIcon />} sx={{ mt: 2 }}>
          <strong>Descuento pendiente de aprobación.</strong> El descuento
          aplicado en esta orden está siendo revisado. No se puede cambiar el
          estado hasta que sea aprobado o rechazado.
        </Alert>
      )}
      {order.discountApprovalStatus === 'REJECTED' && (
        <Alert severity='error' sx={{ mt: 2 }}>
          <strong>Descuento rechazado.</strong> El descuento aplicado en esta
          orden fue rechazado. Verifique con administración.
        </Alert>
      )}

      {/* Alertas de devolución (saldo a favor) */}
      {hasPendingRefund && pendingRefund && (
        <Alert severity='warning' icon={<HourglassEmptyIcon />} sx={{ mt: 2 }}>
          <strong>Devolución pendiente de aprobación.</strong> Monto:{' '}
          {formatCurrency(pendingRefund.refundAmount)} ·{' '}
          {PAYMENT_METHOD_LABELS[
            pendingRefund.paymentMethod as PaymentMethod
          ] ?? pendingRefund.paymentMethod}
          {pendingRefund.paymentMethod === 'TRANSFER' &&
          pendingRefund.bankEntity
            ? ` · ${pendingRefund.bankEntity}`
            : ''}
        </Alert>
      )}
      {authorizedRefund && (
        <Alert severity='info' icon={<HourglassEmptyIcon />} sx={{ mt: 2 }}>
          <strong>Devolución autorizada, pendiente de pago.</strong> Gerencia
          aprobó devolver {formatCurrency(authorizedRefund.refundAmount)}. Caja
          debe registrar el pago para que el dinero salga.
        </Alert>
      )}
      {isReturned && (
        <Alert severity='error' sx={{ mt: 2 }}>
          <strong>Devolución de dinero.</strong> Se anuló la venta completa de
          esta orden y el dinero fue devuelto al cliente. No admite más cambios.
        </Alert>
      )}
      {reversedAmount > 0 && !isReturned && (
        <Alert severity='warning' sx={{ mt: 2 }}>
          <strong>Devolución parcial.</strong> Se anularon{' '}
          {formatCurrency(reversedAmount.toString())} de esta orden. Su valor
          vigente es {formatCurrency(pendingSaleValue.toString())}.
        </Alert>
      )}
      {hasOverpayment && !hasPendingRefund && (
        <Alert severity='info' sx={{ mt: 2 }}>
          <strong>Saldo a favor:</strong>{' '}
          {formatCurrency(overpayment.toString())}. Puede registrar una
          devolución al cliente.
        </Alert>
      )}

      {/* Alertas de propiedad de cliente */}
      {order.clientOwnershipAuthStatus === 'PENDING' && (
        <Alert severity='warning' icon={<WarningIcon />} sx={{ mt: 2 }}>
          <strong>Autorización de propiedad pendiente.</strong> El cliente de
          esta orden pertenece a otro asesor. La orden está en revisión por
          administración y no se puede cambiar el estado hasta que sea aprobada.
        </Alert>
      )}
      {order.clientOwnershipAuthStatus === 'REJECTED' && (
        <Alert severity='error' sx={{ mt: 2 }}>
          <strong>Autorización de propiedad rechazada.</strong> La solicitud
          para crear esta orden con el cliente de otro asesor fue rechazada. No
          se puede modificar el estado de la orden.
        </Alert>
      )}
      {order.client?.advisor && (
        <Alert severity='info' icon={<PersonIcon />} sx={{ mt: 2 }}>
          <strong>Asesor del cliente:</strong>{' '}
          {order.client.advisor.firstName && order.client.advisor.lastName
            ? `${order.client.advisor.firstName} ${order.client.advisor.lastName}`
            : order.client.advisor.email}
        </Alert>
      )}

      {/* Aviso de solicitud de cambio de asesor pendiente */}
      <AdvisorChangeStatusAlert orderId={id!} />

      <StatusHighlight
        label={ORDER_STATUS_CONFIG[order.status].label}
        color={ORDER_STATUS_CONFIG[order.status].color}
        sx={{ mt: 2 }}
      />

      {/* Toolbar de Acciones */}
      <Paper
        elevation={0}
        sx={{
          mt: 2,
          mb: 3,
          p: 0,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.04)'
              : 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(8px)',
          border: (theme) =>
            `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}
      >
        <Stack
          direction='row'
          spacing={0}
          alignItems='stretch'
          sx={{
            flexWrap: { xs: 'wrap', md: 'nowrap' },
            gap: { xs: 0.5, sm: 0 },
            minWidth: 0,
          }}
          divider={
            <Divider
              orientation='vertical'
              flexItem
              sx={{
                my: 1.5,
                opacity: 0.5,
                display: { xs: 'none', sm: 'block' },
              }}
            />
          }
        >
          {canEdit && (
            <ToolbarButton
              icon={<EditIcon />}
              label='Editar'
              onClick={() => navigate(`/orders/${id}/edit`)}
              tooltip='Editar Orden'
            />
          )}

          <RequestEditPermissionButton
            orderId={id!}
            orderStatus={order.status}
          />

          {(permissions.includes('request_advisor_change') ||
            permissions.includes('approve_advisor_change')) && (
            <RequestAdvisorChangeButton
              orderId={id!}
              currentAdvisorId={order.createdBy.id}
              currentAdvisorName={
                order.createdBy.firstName && order.createdBy.lastName
                  ? `${order.createdBy.firstName} ${order.createdBy.lastName}`
                  : order.createdBy.email
              }
            />
          )}

          {canAddPayment && (
            <ToolbarButton
              icon={<PaymentIcon />}
              label='Pago'
              secondaryLabel='Registrar'
              onClick={openPaymentDialog}
              color={theme.palette.success.main}
              tooltip='Registrar Pago'
            />
          )}

          {canApplyDiscount && (
            <ToolbarButton
              icon={<DiscountIcon />}
              label='Descuento'
              onClick={() => setDiscountDialogOpen(true)}
              color={theme.palette.warning.main}
              tooltip='Aplicar Descuento'
            />
          )}

          {canCreateRefund && (
            <ToolbarButton
              icon={<CurrencyExchangeIcon />}
              label='Devolución'
              secondaryLabel='Registrar'
              onClick={() => setRefundDialogOpen(true)}
              color={theme.palette.warning.main}
              tooltip={
                hasOverpayment
                  ? `Registrar devolución al cliente (saldo a favor: ${formatCurrency(overpayment.toString())})`
                  : 'Registrar devolución al cliente anulando parte de la venta'
              }
            />
          )}

          {canRegisterInvoice && (
            <ToolbarButton
              icon={<ReceiptIcon />}
              label='Factura'
              secondaryLabel={
                order.electronicInvoiceNumber ? 'Actualizar' : 'Registrar'
              }
              onClick={handleOpenInvoiceDialog}
              color={theme.palette.info.main}
              tooltip={
                order.electronicInvoiceNumber
                  ? 'Actualizar Factura Electrónica'
                  : 'Registrar Factura Electrónica'
              }
            />
          )}

          {canChangeStatus && (
            <ToolbarButton
              icon={<RefreshIcon />}
              label='Estado'
              onClick={handleMenuOpen}
              disabled={
                updateStatusMutation.isPending ||
                order.clientOwnershipAuthStatus === 'PENDING' ||
                order.clientOwnershipAuthStatus === 'REJECTED'
              }
              tooltip={
                order.clientOwnershipAuthStatus === 'PENDING'
                  ? 'Bloqueado — autorización de propiedad pendiente'
                  : order.clientOwnershipAuthStatus === 'REJECTED'
                    ? 'Bloqueado — autorización de propiedad rechazada'
                    : 'Cambiar Estado'
              }
            />
          )}

          <OrderPdfButton order={order} />

          <ToolbarButton
            icon={<WhatsAppIcon />}
            label='WhatsApp'
            secondaryLabel='Compartir'
            onClick={handleShareWhatsApp}
            disabled={isGeneratingPdf}
            color={theme.palette.success.main}
            tooltip='Compartir por WhatsApp'
          />

          {order.workOrders?.[0] ? (
            <ToolbarButton
              icon={<OpenInNewIcon />}
              label='OT'
              secondaryLabel='Ver'
              onClick={() =>
                navigate(
                  ROUTES.WORK_ORDERS_DETAIL.replace(
                    ':id',
                    order.workOrders![0].id,
                  ),
                )
              }
              color={theme.palette.info.main}
              tooltip={`Ver Orden de Trabajo ${order.workOrders[0].workOrderNumber}`}
            />
          ) : ['CONFIRMED', 'IN_PRODUCTION', 'READY'].includes(order.status) &&
            permissions.includes('create_work_orders') ? (
            <ToolbarButton
              icon={<BuildIcon />}
              label='OT'
              secondaryLabel='Crear'
              onClick={() =>
                navigate(`${ROUTES.WORK_ORDERS_CREATE}?orderId=${id}`, {
                  // La OP ya está cargada aquí; la pasamos por state para que la
                  // OT la use al instante y no reespere el GET /orders/:id (lento).
                  state: { prefillOrder: order },
                })
              }
              color={theme.palette.info.main}
              tooltip='Crear Orden de Trabajo'
            />
          ) : (
            <ToolbarButton
              icon={<BuildIcon />}
              label='OT'
              secondaryLabel='No disponible'
              onClick={() => {}}
              disabled
              color={theme.palette.info.main}
              tooltip={
                !permissions.includes('create_work_orders')
                  ? 'No tienes permiso para crear Órdenes de Trabajo'
                  : 'Solo se puede crear una OT cuando la orden está Confirmada, En producción o Lista'
              }
            />
          )}

          <ToolbarButton
            icon={<AccountTreeIcon />}
            label='Trazabilidad'
            onClick={() => navigate(`/orders/flow/order/${id}`)}
            tooltip='Ver Trazabilidad'
          />

          <ToolbarButton
            icon={<AddIcon />}
            label='Nueva'
            onClick={() => navigate('/orders/new')}
            tooltip='Nueva Orden'
          />
        </Stack>
      </Paper>

      <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mt: 1 }}>
        {/* Info General */}
        <Grid item xs={12} sm={12} md={12}>
          <Stack spacing={{ xs: 2, sm: 2.5, md: 3 }}>
            {/* Estado y Fechas y Cliente/Info Adicional */}
            <Card variant='outlined'>
              <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 2.5 } }}>
                <Grid container spacing={{ xs: 1.5, sm: 2 }} alignItems="flex-start">
                  {/* Columna Izquierda: Estado y Fechas */}
                  <Grid item xs={12} md={5}>
                    <Stack spacing={1.25}>
                      <Stack direction='row' spacing={1} alignItems='center'>
                        <CalendarIcon color='primary' sx={{ fontSize: '1.1rem' }} />
                        <Typography
                          variant='caption'
                          color='text.secondary'
                          fontWeight={700}
                          textTransform='uppercase'
                          letterSpacing={0.5}
                        >
                          Estado y fechas
                        </Typography>
                      </Stack>
                      <Divider />
                    <Grid container spacing={{ xs: 2, sm: 3 }}>
                      {/* Estado */}
                      <Grid item xs={12} sm={3}>
                        <Typography
                          variant='caption'
                          color='textSecondary'
                          fontWeight={600}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                          gutterBottom
                          sx={{ display: 'block' }}
                        >
                          Estado
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>
                          <OrderStatusChip
                            status={order.status}
                            size='medium'
                            variant='outlined'
                          />
                        </Box>
                      </Grid>

                      {/* Fecha de Orden */}
                      <Grid item xs={12} sm={5}>
                        <Typography
                          variant='caption'
                          color='textSecondary'
                          fontWeight={600}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                          gutterBottom
                          sx={{ display: 'block' }}
                        >
                          Fecha de creación
                        </Typography>
                        <Stack
                          direction='row'
                          spacing={1}
                          alignItems='flex-start'
                          sx={{ mt: 0.5 }}
                        >
                          <CalendarIcon
                            fontSize='small'
                            color='action'
                            sx={{ fontSize: '1rem' }}
                          />
                          <Typography variant='body2' fontWeight={300}>
                            {formatDateTime(order.orderDate)}
                          </Typography>
                        </Stack>
                      </Grid>

                      {/* Fecha de Entrega */}
                      <Grid item xs={12} sm={4}>
                        <Typography
                          variant='caption'
                          color='textSecondary'
                          fontWeight={600}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                          gutterBottom
                          sx={{ display: 'block' }}
                        >
                          Fecha de Entrega
                        </Typography>
                        <Stack
                          direction='row'
                          spacing={1}
                          alignItems='flex-start'
                          sx={{ mt: 0.5 }}
                        >
                          <CalendarIcon
                            fontSize='small'
                            color='action'
                            sx={{ fontSize: '1rem' }}
                          />
                          <Typography variant='body2' fontWeight={300}>
                            {order.deliveryDate
                              ? formatDate(order.deliveryDate)
                              : 'No especificada'}
                          </Typography>
                        </Stack>
                      </Grid>

                      {/* Información de cambio de fecha (si existe) */}
                      {order.deliveryDateReason && (
                        <Grid item xs={12}>
                          <Paper
                            elevation={0}
                            sx={{
                              mt: 1,
                              p: 2,
                              bgcolor: 'warning.lighter',
                              border: '1px solid',
                              borderColor: 'warning.light',
                              borderRadius: 2,
                            }}
                          >
                            <Stack spacing={1}>
                              {/* Header con ícono */}
                              <Stack
                                direction='row'
                                spacing={1}
                                alignItems='center'
                              >
                                <CalendarIcon fontSize='small' color='warning' sx={{ fontSize: '1rem' }} />
                                <Typography
                                  variant='caption'
                                  color='warning.dark'
                                  fontWeight={700}
                                  textTransform="uppercase"
                                  letterSpacing={0.5}
                                >
                                  Historial de Cambio de Fecha
                                </Typography>
                              </Stack>

                              {/* Fechas anterior y nueva */}
                              <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                  <Typography
                                    variant='caption'
                                    color='text.secondary'
                                    display='block'
                                    sx={{ fontSize: '0.7rem' }}
                                  >
                                    Fecha anterior:
                                  </Typography>
                                  <Typography
                                    variant='body2'
                                    fontWeight={600}
                                    color='text.primary'
                                  >
                                    {order.previousDeliveryDate
                                      ? formatDate(order.previousDeliveryDate)
                                      : '-'}
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                  <Typography
                                    variant='caption'
                                    color='text.secondary'
                                    display='block'
                                    sx={{ fontSize: '0.7rem' }}
                                  >
                                    Nueva fecha:
                                  </Typography>
                                  <Typography
                                    variant='body2'
                                    fontWeight={600}
                                    color='text.primary'
                                  >
                                    {order.deliveryDate
                                      ? formatDate(order.deliveryDate)
                                      : '-'}
                                  </Typography>
                                </Grid>
                              </Grid>

                              {/* Razón del cambio */}
                              <Box>
                                <Typography
                                  variant='caption'
                                  color='text.secondary'
                                  display='block'
                                  gutterBottom
                                  sx={{ fontSize: '0.7rem' }}
                                >
                                  Razón del cambio:
                                </Typography>
                                <TruncatedText
                                  variant='caption'
                                  color='text.primary'
                                  maxLines={2}
                                  text={`"${order.deliveryDateReason}"`}
                                  tooltipTitle={order.deliveryDateReason}
                                  sx={{
                                    bgcolor: 'background.paper',
                                    p: 1,
                                    borderRadius: 1,
                                    fontStyle: 'italic',
                                  }}
                                />
                              </Box>

                              {/* Footer con fecha y usuario de modificación */}
                              {order.deliveryDateChangedAt && (
                                <Stack
                                  direction={{ xs: 'column', sm: 'row' }}
                                  spacing={1}
                                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                                  justifyContent='space-between'
                                  sx={{ pt: 0.5, borderTop: '1px dashed', borderColor: 'warning.light' }}
                                >
                                  {order.deliveryDateChangedByUser && (
                                    <Typography
                                      variant='caption'
                                      color='text.secondary'
                                      sx={{ fontSize: '0.65rem' }}
                                    >
                                      Modificada por:{' '}
                                      {order.deliveryDateChangedByUser
                                        .firstName ||
                                      order.deliveryDateChangedByUser.lastName
                                        ? `${order.deliveryDateChangedByUser.firstName || ''} ${order.deliveryDateChangedByUser.lastName || ''}`.trim()
                                        : order.deliveryDateChangedByUser.email}
                                    </Typography>
                                  )}
                                  <Typography
                                    variant='caption'
                                    color='text.secondary'
                                    sx={{ fontSize: '0.65rem' }}
                                  >
                                    El: {formatDate(order.deliveryDateChangedAt)}
                                  </Typography>
                                </Stack>
                              )}
                            </Stack>
                          </Paper>
                        </Grid>
                      )}
                    </Grid>
                    </Stack>
                  </Grid>

                  <Grid item xs={12} sx={{ display: { xs: 'block', md: 'none' }, py: 0 }}>
                    <Divider />
                  </Grid>

                  {/* Separador Vertical (Oculto en móvil) */}
                  <Grid 
                    item 
                    xs={false} 
                    md={0.5} 
                    sx={{ 
                      display: { xs: 'none', md: 'flex' }, 
                      justifyContent: 'center',
                      alignItems: 'stretch',
                      alignSelf: 'stretch',
                    }}
                  >
                    <Divider
                      orientation='vertical'
                      flexItem
                      sx={{ borderColor: 'divider', borderRightWidth: 1.5, opacity: 0.8 }}
                    />
                  </Grid>

                  {/* Columna Centro: Cliente */}
                  <Grid item xs={12} md={3.5}>
                    <Stack spacing={1.25}>
                        <Stack
                          direction='row'
                          spacing={1}
                          alignItems='center'
                        >
                          <PersonIcon color='primary' sx={{ fontSize: '1.1rem' }} />
                          <Typography
                            variant='caption'
                            color='text.secondary'
                            fontWeight={700}
                            textTransform='uppercase'
                            letterSpacing={0.5}
                          >
                            Cliente
                          </Typography>
                        </Stack>
                        <Divider />
                        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                          <Link
                            href={`/clients/${order.client.id}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            underline='hover'
                            sx={{ minWidth: 0, color: 'primary.main' }}
                          >
                            <TruncatedText
                              text={order.client.name}
                              variant='body2'
                              fontWeight={700}
                              component='span'
                              tooltipTitle='Ver detalle del cliente en una nueva pestaña'
                              sx={{ color: 'inherit', cursor: 'pointer' }}
                            />
                          </Link>
                          {(() => {
                            const docLabel =
                              order.client.personType === 'EMPRESA'
                                ? 'NIT'
                                : 'C.C.';
                            const docValue =
                              order.client.personType === 'EMPRESA'
                                ? order.client.nit
                                : order.client.cedula;
                            if (!docValue) return null;
                            return (
                              <TruncatedText
                                text={`${docLabel}: ${docValue}`}
                                variant='caption'
                                color='textSecondary'
                              />
                            );
                          })()}
                          {order.client.email && (
                            <TruncatedText
                              text={order.client.email}
                              variant='caption'
                              color='textSecondary'
                            />
                          )}
                          {order.client.phone &&
                            (() => {
                              const { country, local } = parsePhoneValue(
                                order.client.phone,
                              );
                              const waNumber = `${country.dialCode}${local}`;
                              return (
                                <Stack
                                  direction='row'
                                  spacing={1}
                                  alignItems='center'
                                  flexWrap='wrap'
                                  sx={{ mt: 0.5 }}
                                >
                                  <Stack
                                    direction='row'
                                    spacing={0.5}
                                    alignItems='center'
                                  >
                                    <span
                                      title={country.name}
                                      style={{ fontSize: '0.85rem', lineHeight: 1 }}
                                    >
                                      {country.flag}
                                    </span>
                                    <Typography variant='caption' color='textSecondary' fontWeight={500}>
                                      +{country.dialCode} {local}
                                    </Typography>
                                  </Stack>
                                  <Tooltip title='Escribirle al cliente por WhatsApp'>
                                    <Button
                                      size='small'
                                      variant='outlined'
                                      href={`https://wa.me/${waNumber}`}
                                      target='_blank'
                                      rel='noopener noreferrer'
                                      startIcon={
                                        <WhatsAppIcon
                                          sx={{ fontSize: '0.8rem !important' }}
                                        />
                                      }
                                      sx={{
                                        borderColor: '#25D366',
                                        color: '#25D366',
                                        fontSize: '0.6rem',
                                        py: 0.1,
                                        px: 0.5,
                                        minHeight: '20px',
                                        lineHeight: 1,
                                        borderRadius: 1,
                                        '&:hover': {
                                          borderColor: '#128C7E',
                                          backgroundColor: 'rgba(37,211,102,0.08)',
                                          color: '#128C7E',
                                        },
                                      }}
                                    >
                                      Escribir
                                    </Button>
                                  </Tooltip>
                                </Stack>
                              );
                            })()}
                        </Stack>
                    </Stack>
                  </Grid>

                  <Grid item xs={12} sx={{ display: { xs: 'block', md: 'none' }, py: 0 }}>
                    <Divider />
                  </Grid>

                  {/* Separador Vertical (Oculto en móvil) */}
                  <Grid 
                    item 
                    xs={false} 
                    md={0.5} 
                    sx={{ 
                      display: { xs: 'none', md: 'flex' }, 
                      justifyContent: 'center',
                      alignItems: 'stretch',
                      alignSelf: 'stretch',
                    }}
                  >
                    <Divider
                      orientation='vertical'
                      flexItem
                      sx={{ borderColor: 'divider', borderRightWidth: 1.5, opacity: 0.8 }}
                    />
                  </Grid>

                  {/* Columna Derecha: Info Adicional */}
                  <Grid item xs={12} md={2.5}>
                    <Stack spacing={1.25}>
                      <Stack direction='row' spacing={1} alignItems='center'>
                        <ReceiptIcon color='primary' sx={{ fontSize: '1.1rem' }} />
                         <Typography
                            variant='caption'
                            color='text.secondary'
                            fontWeight={700}
                            textTransform='uppercase'
                            letterSpacing={0.5}
                          >
                            Información Adicional
                          </Typography>
                      </Stack>
                      <Divider />
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                <Typography variant='caption' color='textSecondary' sx={{ fontSize: '0.65rem' }}>
                                  Creado por:
                                </Typography>
                                <TruncatedText
                                  variant='caption'
                                  fontWeight={500}
                                  text={
                                    order.createdBy.firstName && order.createdBy.lastName
                                      ? `${order.createdBy.firstName} ${order.createdBy.lastName}`
                                      : order.createdBy.email
                                  }
                                />
                              </Box>
                            
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                <Typography variant='caption' color='textSecondary' sx={{ fontSize: '0.65rem' }}>
                                  Canal de Venta:
                                </Typography>
                                <TruncatedText
                                  variant='caption'
                                  fontWeight={600}
                                  text={order.commercialChannel?.name || 'No especificado'}
                                />
                              </Box>
                            
                            {(order.electronicInvoiceNumber || true) && (
                              <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.5 }}>
                                {/* Orden de Trabajo vinculada */}
                                <BuildIcon
                                  color={order.workOrders?.[0] ? 'action' : 'disabled'}
                                  sx={{ fontSize: '0.8rem' }}
                                />
                                  <Typography variant='caption' color='textSecondary' sx={{ fontSize: '0.65rem' }}>
                                    OT:
                                  </Typography>
                                  {order.workOrders?.[0] ? (
                                    <Box>
                                      <Chip
                                        icon={
                                          <OpenInNewIcon
                                            sx={{ fontSize: '0.7rem !important' }}
                                          />
                                        }
                                        label={order.workOrders[0].workOrderNumber}
                                        size='small'
                                        variant='outlined'
                                        color='primary'
                                        onClick={() =>
                                          navigate(
                                            ROUTES.WORK_ORDERS_DETAIL.replace(
                                              ':id',
                                              order.workOrders![0].id,
                                            ),
                                          )
                                        }
                                        sx={{
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                          fontSize: '0.65rem',
                                          height: 20
                                        }}
                                      />
                                    </Box>
                                  ) : (
                                    <Stack direction='row' spacing={1} alignItems='center'>
                                      <Typography variant='caption' color='text.disabled' sx={{ fontSize: '0.7rem' }}>
                                        Sin OT
                                      </Typography>
                                      {['CONFIRMED', 'IN_PRODUCTION', 'READY'].includes(
                                        order.status,
                                      ) &&
                                        permissions.includes('create_work_orders') && (
                                          <Chip
                                            icon={
                                              <BuildIcon
                                                sx={{ fontSize: '0.7rem !important' }}
                                              />
                                            }
                                            label='Crear OT'
                                            size='small'
                                            variant='outlined'
                                            color='info'
                                            onClick={() =>
                                              navigate(
                                                `${ROUTES.WORK_ORDERS_CREATE}?orderId=${id}`,
                                                { state: { prefillOrder: order } },
                                              )
                                            }
                                            sx={{
                                              cursor: 'pointer',
                                              fontWeight: 600,
                                              fontSize: '0.65rem',
                                              height: 20
                                            }}
                                          />
                                        )}
                                    </Stack>
                                  )}
                                </Box>
                            )}
                            
                            {order.electronicInvoiceNumber && (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                  <Typography variant='caption' color='textSecondary' sx={{ fontSize: '0.65rem' }}>
                                    Factura Electrónica:
                                  </Typography>
                                  <Typography
                                    variant='caption'
                                    fontWeight={600}
                                    color='info.dark'
                                    fontFamily='monospace'
                                    sx={{ wordBreak: 'break-all' }}
                                  >
                                    {order.electronicInvoiceNumber}
                                  </Typography>
                                </Box>
                            )}
                          </Stack>
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Items */}
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
                <Typography
                  variant='h6'
                  gutterBottom
                  sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                >
                  Items de la Orden
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <TableContainer
                  sx={{
                    overflowX: 'auto',
                    '&::-webkit-scrollbar': {
                      height: 8,
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: 'transparent',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      borderRadius: 4,
                    },
                  }}
                >
                  <Table
                    size='small'
                    sx={{ minWidth: { xs: 600, sm: 'auto' } }}
                  >
                    <TableHead>
                      <TableRow>
                        {order.items?.some((i) => i.sampleImageId) && (
                          <TableCell width='60px' align='center'>
                            Imagen
                          </TableCell>
                        )}
                        <TableCell>Descripción</TableCell>
                        <TableCell>Áreas de Producción</TableCell>
                        <TableCell align='right'>Cantidad</TableCell>
                        <TableCell align='right'>Precio Unit.</TableCell>
                        <TableCell align='right'>Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {order.items.map((item) => (
                        <TableRow key={item.id}>
                          {order.items?.some((i) => i.sampleImageId) && (
                            <TableCell align='center'>
                              {item.sampleImageId && (
                                <IconButton
                                  size='small'
                                  onClick={() =>
                                    handleViewSampleImage(item.sampleImageId!)
                                  }
                                  color='primary'
                                >
                                  <VisibilityIcon fontSize='small' />
                                </IconButton>
                              )}
                            </TableCell>
                          )}
                          <TableCell sx={{ maxWidth: 260 }}>
                            {item.product && (
                              <Chip
                                label={item.product.name}
                                size='small'
                                sx={{ mr: 1, mb: 0.5, maxWidth: '100%' }}
                              />
                            )}
                            {item.description && (
                              <TruncatedText
                                variant='body2'
                                maxLines={2}
                                text={item.description}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {item.productionAreas &&
                            item.productionAreas.length > 0 ? (
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 0.5,
                                }}
                              >
                                {item.productionAreas.map((pa) => (
                                  <Chip
                                    key={pa.productionArea.id}
                                    label={pa.productionArea.name}
                                    title={pa.productionArea.name}
                                    size='small'
                                    variant='outlined'
                                    sx={{ maxWidth: 140 }}
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Typography variant='body2' color='text.disabled'>
                                —
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align='right'>{item.quantity}</TableCell>
                          <TableCell align='right'>
                            {formatCurrency(item.unitPrice)}
                          </TableCell>
                          <TableCell align='right'>
                            <Typography fontWeight={500}>
                              {formatCurrency(item.total)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Totales */}
                <Box sx={{ mt: 3 }}>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={1}>
                    <Box display='flex' justifyContent='space-between'>
                      <Typography>Subtotal:</Typography>
                      <Typography fontWeight={500}>
                        {formatCurrency(parseFloat(order.subtotal))}
                      </Typography>
                    </Box>
                    {parseFloat(order.retefuenteRate) > 0 && (
                      <Box display='flex' justifyContent='space-between'>
                        <Typography color='error.main'>
                          Retefuente (
                          {(parseFloat(order.retefuenteRate) * 100)
                            .toFixed(3)
                            .replace(/\.?0+$/, '')}
                          %):
                        </Typography>
                        <Typography fontWeight={500} color='error.main'>
                          -
                          {formatCurrency(
                            parseFloat(order.subtotal) *
                              parseFloat(order.retefuenteRate),
                          )}
                        </Typography>
                      </Box>
                    )}
                    {parseFloat(order.reteICARate) > 0 && (
                      <Box display='flex' justifyContent='space-between'>
                        <Typography color='error.main'>
                          ReteICA (
                          {(parseFloat(order.reteICARate) * 100)
                            .toFixed(3)
                            .replace(/\.?0+$/, '')}
                          %):
                        </Typography>
                        <Typography fontWeight={500} color='error.main'>
                          -
                          {formatCurrency(
                            parseFloat(order.subtotal) *
                              parseFloat(order.reteICARate),
                          )}
                        </Typography>
                      </Box>
                    )}
                    {parseFloat(order.tax) > 0 && (
                      <Box display='flex' justifyContent='space-between'>
                        <Typography>
                          IVA ({(parseFloat(order.taxRate) * 100).toFixed(1)}%):
                        </Typography>
                        <Typography fontWeight={500}>
                          {formatCurrency(parseFloat(order.tax))}
                        </Typography>
                      </Box>
                    )}
                    {parseFloat(order.reteIVARate) > 0 &&
                      parseFloat(order.tax) > 0 && (
                        <Box display='flex' justifyContent='space-between'>
                          <Typography color='error.main'>
                            ReteIVA (
                            {(parseFloat(order.reteIVARate) * 100).toFixed(0)}
                            %):
                          </Typography>
                          <Typography fontWeight={500} color='error.main'>
                            -
                            {formatCurrency(
                              parseFloat(order.tax) *
                                parseFloat(order.reteIVARate),
                            )}
                          </Typography>
                        </Box>
                      )}
                    {order.requiresColorProof && (
                      <Box display='flex' justifyContent='space-between'>
                        <Typography>Prueba de Color:</Typography>
                        <Typography fontWeight={500}>
                          {formatCurrency(
                            parseFloat((order.colorProofPrice as any) || 0),
                          )}
                        </Typography>
                      </Box>
                    )}
                    {parseFloat(order.discountAmount) > 0 && (
                      <Box display='flex' justifyContent='space-between'>
                        <Typography color='error.main'>Descuentos:</Typography>
                        <Typography fontWeight={500} color='error.main'>
                          -{formatCurrency(parseFloat(order.discountAmount))}
                        </Typography>
                      </Box>
                    )}
                    <Divider />
                    <Box display='flex' justifyContent='space-between'>
                      <Typography
                        variant='h6'
                        sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                      >
                        Total:
                      </Typography>
                      <Typography
                        variant='h6'
                        color='primary.main'
                        sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                      >
                        {formatCurrency(parseFloat(order.total))}
                      </Typography>
                    </Box>
                    {reversedAmount > 0 && (
                      <>
                        {/* Sin esta línea el usuario ve un total que no cuadra
                            con lo que el cliente pagó. */}
                        <Box display='flex' justifyContent='space-between'>
                          <Typography color='error.main'>
                            Devolución:
                          </Typography>
                          <Typography fontWeight={500} color='error.main'>
                            -{formatCurrency(reversedAmount)}
                          </Typography>
                        </Box>
                        <Box display='flex' justifyContent='space-between'>
                          <Typography fontWeight={600}>Valor neto:</Typography>
                          <Typography fontWeight={600} color='primary.main'>
                            {formatCurrency(pendingSaleValue)}
                          </Typography>
                        </Box>
                      </>
                    )}
                    <Box display='flex' justifyContent='space-between'>
                      <Typography>Abono:</Typography>
                      <Typography fontWeight={500} color='success.main'>
                        {formatCurrency(pendingAdvance.appliedPaidAmount)}
                      </Typography>
                    </Box>
                    {pendingAdvance.hasPendingAdvance && (
                      <Box
                        display='flex'
                        justifyContent='space-between'
                        alignItems='center'
                        gap={1}
                      >
                        <Stack
                          direction='row'
                          spacing={0.75}
                          alignItems='center'
                          flexWrap='wrap'
                          sx={{ minWidth: 0 }}
                        >
                          <Typography color='warning.main'>
                            Abono por aprobar:
                          </Typography>
                          <Chip
                            icon={<HourglassEmptyIcon />}
                            label='Pendiente de aprobación'
                            color='warning'
                            size='small'
                            variant='outlined'
                          />
                        </Stack>
                        <Typography
                          fontWeight={500}
                          color='warning.main'
                          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          {formatCurrency(pendingAdvance.pendingAmount)}
                        </Typography>
                      </Box>
                    )}
                    <Box
                      display='flex'
                      justifyContent='space-between'
                      alignItems='baseline'
                      gap={1}
                      mt={1}
                    >
                      <Typography
                        variant='h6'
                        sx={{
                          fontSize: { xs: '1rem', sm: '1.25rem' },
                          minWidth: 0,
                        }}
                      >
                        {pendingAdvance.effectiveBalance < 0
                          ? 'Saldo a favor del cliente:'
                          : 'Saldo a cobrar:'}
                      </Typography>
                      <Typography
                        variant='h6'
                        color={
                          pendingAdvance.effectiveBalance < 0
                            ? 'warning.main'
                            : pendingAdvance.effectiveBalance > 0
                              ? 'error.main'
                              : 'success.main'
                        }
                        sx={{
                          fontSize: { xs: '1rem', sm: '1.25rem' },
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {formatCurrency(
                          Math.abs(pendingAdvance.effectiveBalance),
                        )}
                      </Typography>
                    </Box>
                    {pendingAdvance.hasPendingAdvance && (
                      <Typography
                        variant='caption'
                        color='text.secondary'
                        sx={{ display: 'block', textAlign: 'right' }}
                      >
                        No incluye el abono de{' '}
                        {formatCurrency(pendingAdvance.pendingAmount)}: se
                        aplicará cuando Caja lo apruebe.
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </CardContent>
            </Card>

            {/* Historial de Pagos */}
            {payments.length > 0 && (
              <Card>
                <CardContent>
                  <Typography
                    variant='h6'
                    gutterBottom
                    sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                  >
                    Historial de Pagos
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <TableContainer
                    sx={{
                      overflowX: 'auto',
                      '&::-webkit-scrollbar': {
                        height: 8,
                      },
                      '&::-webkit-scrollbar-track': {
                        backgroundColor: 'transparent',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: 'rgba(0,0,0,0.1)',
                        borderRadius: 4,
                      },
                    }}
                  >
                    <Table
                      size='small'
                      sx={{ width: '100%', minWidth: { xs: 560, md: 0 } }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>Fecha</TableCell>
                          <TableCell>Método</TableCell>
                          <TableCell align='right'>Monto</TableCell>
                          <TableCell>Recibido por</TableCell>
                          <TableCell align='center'>Comprobante</TableCell>
                          {(canEditPayment || canVoidPayment) && (
                            <TableCell align='center'>Acciones</TableCell>
                          )}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {payments.map((payment) => (
                          <TableRow
                            key={payment.id}
                            // El pago anulado se queda a la vista pero apagado:
                            // sigue siendo historia, ya no es dinero.
                            sx={payment.isVoided ? { opacity: 0.6 } : undefined}
                          >
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {(() => {
                                const [datePart, timePart] = formatDateTime(
                                  payment.paymentDate,
                                ).split(', ');
                                return (
                                  <>
                                    <Typography variant='body2'>
                                      {datePart}
                                    </Typography>
                                    {timePart && (
                                      <Typography
                                        variant='caption'
                                        color='text.secondary'
                                      >
                                        {timePart}
                                      </Typography>
                                    )}
                                  </>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={
                                  PAYMENT_METHOD_LABELS[payment.paymentMethod]
                                }
                                size='small'
                              />
                              {payment.paymentMethod === 'TRANSFER' &&
                                payment.bankEntity && (
                                  <Typography
                                    variant='caption'
                                    color='text.secondary'
                                    display='block'
                                    sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                                  >
                                    {payment.bankEntity}
                                  </Typography>
                                )}
                            </TableCell>
                            <TableCell align='right'>
                              <Typography
                                fontWeight={500}
                                color={
                                  payment.isVoided
                                    ? 'text.disabled'
                                    : pendingAdvance.pendingPaymentIds.includes(
                                          payment.id,
                                        )
                                      ? 'warning.main'
                                      : undefined
                                }
                                sx={
                                  payment.isVoided
                                    ? { textDecoration: 'line-through' }
                                    : undefined
                                }
                              >
                                {formatCurrency(payment.amount)}
                              </Typography>
                              {payment.isVoided && (
                                // La columna de monto es angosta: sin un ancho
                                // mínimo el motivo cae a una palabra por línea.
                                <Box sx={{ mt: 0.5, minWidth: 180, ml: 'auto' }}>
                                  <Chip
                                    label='Anulado'
                                    color='error'
                                    size='small'
                                    variant='outlined'
                                  />
                                  {payment.voidReason && (
                                    <Typography
                                      variant='caption'
                                      color='text.secondary'
                                      display='block'
                                      sx={{ mt: 0.5, whiteSpace: 'normal' }}
                                    >
                                      {payment.voidReason}
                                    </Typography>
                                  )}
                                  {payment.voidedBy && (
                                    <Typography
                                      variant='caption'
                                      color='text.secondary'
                                      display='block'
                                    >
                                      Anulado por {payment.voidedBy.firstName}{' '}
                                      {payment.voidedBy.lastName}
                                    </Typography>
                                  )}
                                </Box>
                              )}
                              {advanceApprovalByPayment[payment.id] && (
                                <Box>
                                  <AdvancePaymentApprovalBadge
                                    approval={
                                      advanceApprovalByPayment[payment.id]
                                    }
                                  />
                                </Box>
                              )}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 160 }}>
                              <TruncatedText
                                variant='body2'
                                text={`${payment.receivedBy.firstName} ${payment.receivedBy.lastName}`}
                              />
                            </TableCell>
                            <TableCell align='center'>
                              {payment.receiptFileId ? (
                                <Stack
                                  direction='row'
                                  spacing={0.5}
                                  justifyContent='center'
                                >
                                  <IconButton
                                    size='small'
                                    onClick={() =>
                                      handleViewReceipt(payment.receiptFileId!)
                                    }
                                    color='info'
                                    title='Ver comprobante'
                                  >
                                    <VisibilityIcon fontSize='small' />
                                  </IconButton>
                                  <IconButton
                                    size='small'
                                    onClick={() =>
                                      handleDownloadReceipt(
                                        payment.receiptFileId!,
                                      )
                                    }
                                    color='primary'
                                    title='Descargar comprobante'
                                  >
                                    <DownloadIcon fontSize='small' />
                                  </IconButton>
                                  {canDeleteReceipt && (
                                    <IconButton
                                      size='small'
                                      onClick={() =>
                                        setReceiptToDelete(payment.id)
                                      }
                                      color='error'
                                      disabled={deletingReceipt === payment.id}
                                      title='Eliminar comprobante'
                                    >
                                      <DeleteIcon fontSize='small' />
                                    </IconButton>
                                  )}
                                </Stack>
                              ) : (
                                <Typography
                                  variant='body2'
                                  color='text.secondary'
                                >
                                  -
                                </Typography>
                              )}
                            </TableCell>
                            {(canEditPayment || canVoidPayment) && (
                              <TableCell align='center'>
                                {payment.isVoided ? (
                                  <Typography
                                    variant='body2'
                                    color='text.secondary'
                                  >
                                    -
                                  </Typography>
                                ) : pendingEditByPayment[payment.id] ? (
                                  <Chip
                                    label='Edición pendiente'
                                    color='warning'
                                    size='small'
                                    variant='outlined'
                                  />
                                ) : (
                                  <Stack
                                    direction='row'
                                    spacing={0.5}
                                    justifyContent='center'
                                  >
                                    {canEditPayment && (
                                      <IconButton
                                        size='small'
                                        onClick={() =>
                                          handleOpenEditPayment(payment)
                                        }
                                        color='primary'
                                        title='Editar pago'
                                      >
                                        <EditIcon fontSize='small' />
                                      </IconButton>
                                    )}
                                    {canVoidPayment && (
                                      <IconButton
                                        size='small'
                                        onClick={() => setPaymentToVoid(payment)}
                                        color='error'
                                        title={
                                          voidsDirectly
                                            ? 'Anular pago'
                                            : 'Solicitar anulación del pago'
                                        }
                                      >
                                        <BlockIcon fontSize='small' />
                                      </IconButton>
                                    )}
                                  </Stack>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            )}

            {/* Solicitudes de edición de pago (estado e historial) */}
            {canSeePaymentEdits && paymentEditApprovals.length > 0 && (
              <Card>
                <CardContent>
                  <Typography
                    variant='h6'
                    gutterBottom
                    sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                  >
                    Solicitudes de edición de pago
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={2}>
                    {paymentEditApprovals.map((req) => {
                      const statusCfg = PAYMENT_EDIT_STATUS_CONFIG[
                        req.status
                      ] ?? {
                        label: req.status,
                        color: 'default' as const,
                      };
                      const reviewer = req.reviewedBy
                        ? `${req.reviewedBy.firstName ?? ''} ${req.reviewedBy.lastName ?? ''}`.trim() ||
                          req.reviewedBy.email
                        : null;
                      return (
                        <Box
                          key={req.id}
                          sx={{
                            p: 2,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderLeft: '4px solid',
                            borderLeftColor:
                              req.status === 'PENDING'
                                ? 'warning.main'
                                : req.status === 'APPROVED'
                                  ? 'success.main'
                                  : 'error.main',
                          }}
                        >
                          <Stack
                            direction='row'
                            alignItems='center'
                            justifyContent='space-between'
                            sx={{ mb: 1 }}
                          >
                            <Chip
                              label={statusCfg.label}
                              color={statusCfg.color}
                              size='small'
                            />
                            <Typography
                              variant='caption'
                              color='text.secondary'
                            >
                              Solicitado por {req.requestedBy?.firstName}{' '}
                              {req.requestedBy?.lastName} ·{' '}
                              {formatDateTime(req.createdAt)}
                            </Typography>
                          </Stack>

                          {/* Cambios solicitados: antes → después */}
                          <Stack spacing={0.25}>
                            {req.newAmount != null && (
                              <Typography variant='body2'>
                                <strong>Monto:</strong>{' '}
                                {formatCurrency(req.oldAmount)} →{' '}
                                <strong>{formatCurrency(req.newAmount)}</strong>
                              </Typography>
                            )}
                            {req.newPaymentMethod != null && (
                              <Typography variant='body2'>
                                <strong>Método:</strong>{' '}
                                {PAYMENT_METHOD_LABELS[req.oldPaymentMethod]} →{' '}
                                <strong>
                                  {PAYMENT_METHOD_LABELS[req.newPaymentMethod]}
                                </strong>
                              </Typography>
                            )}
                            {req.newPaymentDate != null && (
                              <Typography variant='body2'>
                                <strong>Fecha:</strong>{' '}
                                {formatDateTime(req.oldPaymentDate)} →{' '}
                                <strong>
                                  {formatDateTime(req.newPaymentDate)}
                                </strong>
                              </Typography>
                            )}
                            {req.newReference != null && (
                              <Typography variant='body2'>
                                <strong>Referencia:</strong>{' '}
                                {req.oldReference || '—'} →{' '}
                                <strong>{req.newReference || '—'}</strong>
                              </Typography>
                            )}
                            {req.newNotes != null && (
                              <Typography variant='body2'>
                                <strong>Notas:</strong> {req.oldNotes || '—'} →{' '}
                                <strong>{req.newNotes || '—'}</strong>
                              </Typography>
                            )}
                            {req.newReceiptFileId != null && (
                              <Typography variant='body2' color='info.main'>
                                Incluye un nuevo comprobante
                                {req.status === 'PENDING'
                                  ? ' (se aplicará al aprobar).'
                                  : req.status === 'APPROVED'
                                    ? ' (aplicado).'
                                    : '.'}
                              </Typography>
                            )}
                          </Stack>

                          {req.reason && (
                            <Typography
                              variant='body2'
                              color='text.secondary'
                              sx={{ mt: 0.5 }}
                            >
                              Motivo: {req.reason}
                            </Typography>
                          )}

                          {/* Resolución */}
                          {req.status !== 'PENDING' && (
                            <Typography
                              variant='caption'
                              color='text.secondary'
                              sx={{ display: 'block', mt: 1 }}
                            >
                              {req.status === 'APPROVED'
                                ? 'Aprobada'
                                : 'Rechazada'}
                              {reviewer ? ` por ${reviewer}` : ''}
                              {req.reviewedAt
                                ? ` · ${formatDateTime(req.reviewedAt)}`
                                : ''}
                              {req.reviewNotes ? ` — ${req.reviewNotes}` : ''}
                            </Typography>
                          )}

                          {/* Acciones de aprobación (solo aprobadores, solo pendientes) */}
                          {req.status === 'PENDING' &&
                            canApprovePaymentEdit && (
                              <Stack
                                direction='row'
                                spacing={1}
                                sx={{ mt: 1.5 }}
                              >
                                <Button
                                  size='small'
                                  variant='contained'
                                  color='success'
                                  disabled={
                                    approvePaymentEditMutation.isPending
                                  }
                                  onClick={() =>
                                    approvePaymentEditMutation.mutate({
                                      id: req.id,
                                    })
                                  }
                                >
                                  Autorizar
                                </Button>
                                <Button
                                  size='small'
                                  variant='outlined'
                                  color='error'
                                  disabled={rejectPaymentEditMutation.isPending}
                                  onClick={() =>
                                    rejectPaymentEditMutation.mutate({
                                      id: req.id,
                                    })
                                  }
                                >
                                  Rechazar
                                </Button>
                              </Stack>
                            )}

                          {/* Aviso para el solicitante cuando está pendiente */}
                          {req.status === 'PENDING' &&
                            !canApprovePaymentEdit && (
                              <Typography
                                variant='caption'
                                color='warning.main'
                                sx={{ display: 'block', mt: 1 }}
                              >
                                Pendiente de autorización del administrador.
                              </Typography>
                            )}
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Historial de aprobaciones y solicitudes de autorización */}
            <Box sx={{ mt: 4 }}>
              <OrderAuthHistory orderId={id!} />
            </Box>

            {/* Descuentos Aplicados */}
            <DiscountsSection
              discounts={discounts}
              canDelete={canDeleteDiscount}
              onDelete={handleRemoveDiscount}
              isDeleting={deletingDiscount}
            />            

            {/* Resumen Financiero / Rentabilidad */}
            <Accordion
              defaultExpanded={false}
              variant='outlined'
              sx={{
                borderRadius: '12px !important',
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction='row' spacing={1} alignItems='center'>
                  {profitabilityData && profitabilityData.utility >= 0 ? (
                    <TrendingUpIcon sx={{ color: 'success.main' }} />
                  ) : (
                    <TrendingDownIcon
                      sx={{
                        color: profitabilityData
                          ? 'error.main'
                          : 'text.disabled',
                      }}
                    />
                  )}
                  <Typography variant='subtitle1' fontWeight={600}>
                    Resumen Financiero
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                {profitabilityLoading ? (
                  <Box
                    sx={{ display: 'flex', justifyContent: 'center', py: 2 }}
                  >
                    <CircularProgress size={24} />
                  </Box>
                ) : profitabilityData ? (
                  <Stack spacing={2}>
                    {/* KPI boxes */}
                    <Grid container spacing={2}>
                      {[
                        {
                          label: 'Total OP',
                          value: formatCurrency(
                            profitabilityData.orderTotal.toString(),
                          ),
                          color: 'text.primary',
                        },
                        {
                          label: 'Total Gastos',
                          value: formatCurrency(
                            profitabilityData.totalExpenses.toString(),
                          ),
                          color: 'warning.main',
                        },
                        {
                          label: 'Utilidad',
                          value: formatCurrency(
                            profitabilityData.utility.toString(),
                          ),
                          color:
                            profitabilityData.utility >= 0
                              ? 'success.main'
                              : 'error.main',
                        },
                        {
                          label: 'Margen %',
                          value: `${profitabilityData.utilityPercentage.toFixed(1)}%`,
                          color:
                            profitabilityData.utilityPercentage >= 0
                              ? 'success.main'
                              : 'error.main',
                        },
                      ].map((kpi) => (
                        <Grid item xs={6} sm={3} key={kpi.label}>
                          <Box
                            sx={{
                              textAlign: 'center',
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Typography
                              variant='caption'
                              color='text.secondary'
                              display='block'
                            >
                              {kpi.label}
                            </Typography>
                            <Typography
                              variant='body1'
                              fontWeight={700}
                              color={kpi.color}
                            >
                              {kpi.value}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>

                    {/* Linked expense orders */}
                    {profitabilityData.expenseOrders.length > 0 ? (
                      <>
                        <Divider />
                        <Typography
                          variant='body2'
                          color='text.secondary'
                          fontWeight={600}
                        >
                          Órdenes de Gasto Vinculadas
                        </Typography>
                        <TableContainer>
                          <Table size='small'>
                            <TableHead>
                              <TableRow>
                                <TableCell>OG</TableCell>
                                <TableCell>OT</TableCell>
                                <TableCell>Estado</TableCell>
                                <TableCell align='right'>Total</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {profitabilityData.expenseOrders.map(
                                (eg: ExpenseOrderSummary) => (
                                  <TableRow key={eg.id}>
                                    <TableCell sx={{ fontWeight: 600 }}>
                                      {eg.ogNumber}
                                    </TableCell>
                                    <TableCell>
                                      {eg.workOrderNumber ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        label={eg.status}
                                        size='small'
                                        variant='outlined'
                                      />
                                    </TableCell>
                                    <TableCell align='right'>
                                      {formatCurrency(eg.itemsTotal.toString())}
                                    </TableCell>
                                  </TableRow>
                                ),
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </>
                    ) : (
                      <Typography variant='body2' color='text.secondary'>
                        No hay órdenes de gasto vinculadas a esta OP.
                      </Typography>
                    )}
                  </Stack>
                ) : null}
              </AccordionDetails>
            </Accordion>
            {/* Notas y Detalles Adicionales */}
            {((order.notes && !order.notes.startsWith('[DTF]')) ||
              order.requiresColorProof ||
              order.notesImageId) && (
              <Card>
                <CardContent>
                  <Typography
                    variant='h6'
                    gutterBottom
                    sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                  >
                    Observaciones y Detalles
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  {order.requiresColorProof && (
                    <Typography
                      variant='body2'
                      sx={{
                        mb: order.notes ? 1 : 0,
                        fontWeight: 500,
                        color: 'primary.main',
                      }}
                    >
                      ✓ Requiere prueba de color
                    </Typography>
                  )}
                  {order.notes && (
                    <Typography variant='body2'>{order.notes}</Typography>
                  )}
                  {order.notesImageId && (
                    <Box
                      sx={{
                        mt: order.notes || order.requiresColorProof ? 2 : 0,
                      }}
                    >
                      <Typography
                        variant='caption'
                        color='text.secondary'
                        sx={{ display: 'block', mb: 0.5 }}
                      >
                        Imagen de referencia
                      </Typography>
                      {notesImageUrl ? (
                        <Box
                          component='img'
                          src={notesImageUrl}
                          alt='Imagen de observaciones'
                          onClick={() =>
                            handleViewSampleImage(order.notesImageId!)
                          }
                          sx={{
                            width: 120,
                            height: 120,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'grey.300',
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                            '&:hover': { opacity: 0.8 },
                          }}
                        />
                      ) : (
                        <CircularProgress size={20} />
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}
          </Stack>
        </Grid>
      </Grid>

      {/* Solicitudes de Edición e Historial de Cambios */}
      <Box sx={{ mt: 4 }}>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label='Solicitudes de Edición' />
          <Tab label='Historial de Cambios' />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <EditRequestsList orderId={id!} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <OrderChangeHistoryTab
            orderId={id!}
            orderNumber={order.orderNumber}
          />
        </TabPanel>
      </Box>


      {/* Comentarios */}
      <CommentSection entityType='ORDER' entityId={order.id} />

      {/* Menu de Acciones */}
      <Menu anchorEl={anchorEl} open={openMenu} onClose={handleMenuClose}>
        <MenuItem disabled>
          <Stack direction='row' spacing={1} alignItems='center'>
            {updateStatusMutation.isPending && <CircularProgress size={14} />}
            <Typography variant='caption' color='textSecondary'>
              {updateStatusMutation.isPending
                ? 'Actualizando estado...'
                : 'Cambiar Estado de la Orden'}
            </Typography>
          </Stack>
        </MenuItem>
        {Object.entries(ORDER_STATUS_CONFIG).map(([status, config]) => {
          const validNextStatuses = ALLOWED_TRANSITIONS[order.status] || [];
          const isCurrentStatus = order.status === status;
          const isAllowed = validNextStatuses.includes(status as OrderStatus);
          return (
            <MenuItem
              key={status}
              onClick={() => handleChangeStatus(status as OrderStatus)}
              disabled={!isAllowed || updateStatusMutation.isPending}
            >
              <Chip
                label={config.label}
                color={isCurrentStatus || isAllowed ? config.color : 'default'}
                size='small'
                variant={
                  isCurrentStatus ? 'filled' : isAllowed ? 'outlined' : 'filled'
                }
                sx={{
                  mr: 1,
                  ...(!isAllowed && !isCurrentStatus && { opacity: 0.4 }),
                  ...(isCurrentStatus && {
                    fontWeight: 'bold',
                    border: '2px solid',
                  }),
                }}
              />
            </MenuItem>
          );
        })}
        {/*         <Divider />
        {canDelete && (
          <MenuItem onClick={() => setConfirmDelete(true)} sx={{ color: 'error.main' }}>
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            Eliminar Orden
          </MenuItem>
        )} */}
      </Menu>

      {/* Dialog: Registrar / Editar Pago */}
      <Dialog
        open={paymentDialogOpen}
        onClose={() => {
          if (!paymentSubmitting) {
            resetPaymentDialog();
          }
        }}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>
          {editingPaymentId ? 'Editar Pago' : 'Registrar Pago'}
        </DialogTitle>
        <DialogContent onPaste={handleReceiptPaste}>
          <Stack spacing={3} sx={{ mt: 2 }}>
            {/* Solo al registrar: un abono nuevo sin caja abierta queda en cola
                en vez de entrar al arqueo. Al editar no aplica, porque el
                movimiento ya existe y se sincroniza solo. */}
            {!editingPaymentId && isCashOpen?.isOpen === false && (
              <Alert severity='warning'>
                <AlertTitle>La caja está cerrada en este momento</AlertTitle>
                El abono se registra igual y queda en espera. Entrará al arqueo
                automáticamente cuando se abra la próxima caja.
              </Alert>
            )}

            <TextField
              fullWidth
              label='Monto'
              disabled={paymentData.paymentMethod === 'CREDIT'}
              value={
                paymentData.paymentMethod === 'CREDIT'
                  ? '0'
                  : paymentData.amount
                  ? formatCurrencyInput(paymentData.amount)
                  : ''
              }
              onChange={(e) => {
                const rawValue = e.target.value.replace(/\D/g, '');
                const amount = rawValue ? parseInt(rawValue, 10) : 0;
                setPaymentData({
                  ...paymentData,
                  amount,
                });
              }}
              color={isPaymentOverpay ? 'warning' : 'primary'}
              InputProps={{
                startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
              }}
              inputProps={{
                style: { textAlign: 'right' },
              }}
              helperText={
                paymentData.paymentMethod === 'CREDIT' ? (
                  `El crédito no registra dinero: quedan ${formatCurrency(availableForPayment)} como saldo pendiente por cobrar`
                ) : editingPaymentId ? (
                  <>
                    <Box component='span' sx={{ display: 'block' }}>
                      Saldo pendiente antes: {formatCurrency(order.balance)}
                    </Box>
                    <Box
                      component='span'
                      sx={{
                        display: 'block',
                        color: isPaymentOverpay
                          ? 'warning.main'
                          : 'success.main',
                        fontWeight: 600,
                      }}
                    >
                      {isPaymentOverpay
                        ? `Saldo a favor después: ${formatCurrency(-saldoDespues)}`
                        : `Saldo pendiente después: ${formatCurrency(saldoDespues)}`}
                    </Box>
                  </>
                ) : isPaymentOverpay ? (
                  `Quedará un saldo a favor al cliente de ${formatCurrency(paymentEntered - availableForPayment)}`
                ) : (
                  `Saldo pendiente: ${formatCurrency(availableForPayment)}`
                )
              }
              FormHelperTextProps={{
                sx: {
                  color:
                    !editingPaymentId && isPaymentOverpay
                      ? 'warning.main'
                      : 'text.secondary',
                  fontWeight: !editingPaymentId && isPaymentOverpay ? 600 : 400,
                },
              }}
            />

            <FormControl fullWidth>
              <InputLabel>Método de Pago</InputLabel>
              <Select
                value={paymentData.paymentMethod}
                onChange={(e) => {
                  const method = e.target
                    .value as import('../../../types/order.types').PaymentMethod;
                  setPaymentData({
                    ...paymentData,
                    paymentMethod: method,
                    // El crédito no registra dinero: es la marca de "paga
                    // después". Con monto, la OP se ve pagada sin que entre un
                    // peso y el abono real posterior queda duplicado.
                    amount: method === 'CREDIT' ? 0 : paymentData.amount,
                    // Limpiar banco de origen si deja de ser transferencia
                    bankEntity:
                      method === 'TRANSFER'
                        ? (paymentData.bankEntity ?? null)
                        : null,
                  });
                }}
              >
                {(
                  Object.entries(PAYMENT_METHOD_LABELS) as [
                    PaymentMethod,
                    string,
                  ][]
                ).map(([method, label]) => (
                  <MenuItem key={method} value={method}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {paymentData.paymentMethod === 'TRANSFER' && (
              <BankSelector
                value={paymentData.bankEntity ?? null}
                onChange={(val) =>
                  setPaymentData({ ...paymentData, bankEntity: val })
                }
              />
            )}

            <DatePicker
              label='Fecha de Pago'
              value={new Date(paymentData.paymentDate || new Date())}
              onChange={(date) =>
                setPaymentData({
                  ...paymentData,
                  paymentDate: date?.toISOString() || new Date().toISOString(),
                })
              }
              slotProps={{
                textField: { fullWidth: true },
              }}
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label='Notas'
              value={paymentData.notes || ''}
              onChange={(e) =>
                setPaymentData({ ...paymentData, notes: e.target.value })
              }
            />

            {editingPaymentId && (
              <>
                <TextField
                  fullWidth
                  label='Motivo de la edición'
                  placeholder='Ej: El valor consignado fue $107.000, no $258.000'
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
                <Alert severity={canApprovePaymentEdit ? 'info' : 'warning'}>
                  {canApprovePaymentEdit
                    ? 'El cambio se aplicará de inmediato y se recalculará el saldo de la orden.'
                    : 'La edición de un pago requiere autorización del administrador. El saldo no cambiará hasta que sea aprobada.'}
                </Alert>
              </>
            )}

            <Box>
              <FormLabel sx={{ mb: 1, display: 'block' }}>
                {editingPaymentId
                  ? 'Reemplazar comprobante (Opcional)'
                  : 'Comprobante de Pago (Opcional)'}
              </FormLabel>
              <input
                type='file'
                hidden
                accept='image/jpeg,image/png,image/gif,image/webp,.pdf'
                ref={receiptFileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setReceiptFile(file);
                  if (e.target) e.target.value = '';
                }}
              />

              {!receiptFile ? (
                <Stack spacing={1}>
                  <Button
                    variant='outlined'
                    startIcon={<AttachFileIcon />}
                    size='small'
                    onClick={() => receiptFileInputRef.current?.click()}
                    sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                  >
                    Adjuntar imagen o PDF
                  </Button>
                  <Box
                    onPaste={handleReceiptPaste}
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
                  >
                    <ImageIcon
                      sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }}
                    />
                    <Typography
                      variant='caption'
                      color='text.secondary'
                      display='block'
                    >
                      O pega una imagen aquí (Ctrl+V / ⌘+V)
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  {/* Thumbnail preview (only for images) */}
                  {receiptFile.type.startsWith('image/') && (
                    <Box
                      sx={{
                        position: 'relative',
                        width: 'fit-content',
                        border: '1px solid',
                        borderColor: 'grey.300',
                        borderRadius: 1,
                        overflow: 'hidden',
                        bgcolor: 'grey.50',
                      }}
                    >
                      <Box
                        component='img'
                        src={URL.createObjectURL(receiptFile)}
                        alt='Vista previa'
                        sx={{
                          display: 'block',
                          maxWidth: 200,
                          maxHeight: 140,
                          objectFit: 'contain',
                        }}
                        onLoad={(e) => {
                          URL.revokeObjectURL(
                            (e.target as HTMLImageElement).src,
                          );
                        }}
                      />
                    </Box>
                  )}
                  <Stack direction='row' alignItems='center' spacing={1}>
                    <Chip
                      icon={
                        receiptFile.type.startsWith('image/') ? (
                          <ImageIcon />
                        ) : (
                          <AttachFileIcon />
                        )
                      }
                      label={`${receiptFile.name} (${(receiptFile.size / 1024).toFixed(1)} KB)`}
                      color='primary'
                      variant='outlined'
                      size='small'
                      onDelete={() => {
                        setReceiptFile(null);
                        if (receiptFileInputRef.current)
                          receiptFileInputRef.current.value = '';
                      }}
                      deleteIcon={<CloseIcon />}
                      sx={{ maxWidth: 320 }}
                    />
                    <IconButton
                      size='small'
                      onClick={() => receiptFileInputRef.current?.click()}
                      title='Cambiar archivo'
                    >
                      <AttachFileIcon fontSize='small' />
                    </IconButton>
                  </Stack>
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetPaymentDialog} disabled={paymentSubmitting}>
            Cancelar
          </Button>
          {editingPaymentId ? (
            <Button
              onClick={handleUpdatePayment}
              variant='contained'
              disabled={
                paymentSubmitting ||
                updatePaymentMutation.isPending ||
                !isPaymentAmountValid
              }
            >
              {paymentSubmitting
                ? 'Guardando...'
                : canApprovePaymentEdit
                  ? 'Guardar cambios'
                  : 'Solicitar edición'}
            </Button>
          ) : (
            <Button
              onClick={handleAddPayment}
              variant='contained'
              disabled={
                paymentSubmitting ||
                addPaymentMutation.isPending ||
                !isPaymentAmountValid
              }
            >
              {paymentSubmitting ? 'Registrando...' : 'Registrar Pago'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={confirmDelete}
        title='Eliminar Orden'
        message={`¿Está seguro que desea eliminar la orden ${order.orderNumber}? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        isLoading={deleteOrderMutation.isPending}
      />

      {/* Dialog: Anular pago */}
      <VoidPaymentDialog
        open={!!paymentToVoid}
        payment={paymentToVoid}
        onClose={() => setPaymentToVoid(null)}
        onSubmit={handleVoidPayment}
        voidsDirectly={voidsDirectly}
        isLoading={voidPaymentMutation.isPending}
      />

      {/* Confirmar eliminación de comprobante de pago */}
      <ConfirmDialog
        open={!!receiptToDelete}
        title='Eliminar comprobante'
        message='¿Estás seguro que deseas eliminar este comprobante? Esta acción eliminará el comprobante de forma permanente y no podrás recuperarlo.'
        confirmText='Eliminar'
        severity='error'
        onConfirm={() =>
          receiptToDelete && handleDeleteReceipt(receiptToDelete)
        }
        onCancel={() => setReceiptToDelete(null)}
        isLoading={!!deletingReceipt}
      />

      {/* Dialog: Aplicar Descuento */}
      <ApplyDiscountDialog
        open={discountDialogOpen}
        onClose={() => setDiscountDialogOpen(false)}
        onApply={handleApplyDiscount}
        maxAmount={parseFloat(order.subtotal) + parseFloat(order.tax)}
      />

      {/* Dialog: Registrar Devolución */}
      <RefundRequestDialog
        open={refundDialogOpen}
        onClose={() => setRefundDialogOpen(false)}
        orderId={id!}
        orderNumber={order.orderNumber}
        maxAmount={overpayment}
        pendingSaleValue={pendingSaleValue}
        paidAmount={netPaidAmount}
        currentBalance={pendingAdvance.effectiveBalance}
      />

      {/* Dialog: Ver Comprobante */}
      <Dialog
        open={viewReceiptDialog.open}
        onClose={handleCloseViewReceipt}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>
          Comprobante de Pago
          <IconButton
            onClick={handleCloseViewReceipt}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: { xs: 250, sm: 400 },
              bgcolor: 'grey.100',
              borderRadius: 1,
              p: 2,
            }}
          >
            {viewReceiptDialog.mimeType.startsWith('image/') ? (
              <Box
                component='img'
                src={viewReceiptDialog.url}
                alt='Comprobante de pago'
                sx={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                }}
              />
            ) : viewReceiptDialog.mimeType === 'application/pdf' ? (
              <iframe
                src={viewReceiptDialog.url}
                title='Comprobante de pago PDF'
                style={{
                  width: '100%',
                  height: '70vh',
                  border: 'none',
                }}
              />
            ) : (
              <Typography color='text.secondary'>
                No se puede visualizar este tipo de archivo
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseViewReceipt}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Registrar Número de Factura Electrónica */}
      <Dialog
        open={invoiceDialogOpen}
        onClose={handleCloseInvoiceDialog}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>
          <Stack direction='row' spacing={1} alignItems='center'>
            <ReceiptIcon color='info' />
            <span>
              {order.electronicInvoiceNumber
                ? 'Actualizar Factura Electrónica'
                : 'Registrar Factura Electrónica'}
            </span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='body2' color='text.secondary'>
              Ingrese el número de factura electrónica asociado a esta orden.
              Este número es alfanumérico y tiene un máximo de 30 caracteres.
            </Typography>
            <TextField
              fullWidth
              label='Número de Factura Electrónica'
              value={invoiceNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9\-_./]/g, '');
                if (val.length <= 30) setInvoiceNumber(val);
              }}
              inputProps={{ maxLength: 30 }}
              helperText={`${invoiceNumber.length}/30 caracteres. Solo se permiten letras, números y los símbolos - _ . /`}
              disabled={invoiceLoading}
              autoFocus
              placeholder='Ej: FE-2026-00123'
            />
            {order.electronicInvoiceNumber && (
              <Typography variant='caption' color='text.secondary'>
                Número actual: <strong>{order.electronicInvoiceNumber}</strong>
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseInvoiceDialog} disabled={invoiceLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleRegisterInvoice}
            variant='contained'
            color='info'
            disabled={invoiceLoading || !invoiceNumber.trim()}
            startIcon={<ReceiptIcon />}
          >
            {invoiceLoading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: Ver Imagen de Muestra de Item */}
      <Dialog
        open={viewSampleImageDialog.open}
        onClose={() => setViewSampleImageDialog({ open: false, url: '' })}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Imagen de Muestra
          <IconButton
            onClick={() => setViewSampleImageDialog({ open: false, url: '' })}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {viewSampleImageDialog.url && (
            <Box
              component='img'
              src={viewSampleImageDialog.url}
              alt='Imagen de muestra'
              sx={{
                width: '100%',
                height: 'auto',
                maxHeight: '70vh',
                objectFit: 'contain',
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Solicitar Autorización de Cambio de Estado */}
      {statusAuthDialogOpen && pendingStatus && order && (
        <StatusChangeAuthRequestDialog
          open={statusAuthDialogOpen}
          onClose={() => {
            setStatusAuthDialogOpen(false);
            setPendingStatus(null);
          }}
          order={order}
          requestedStatus={pendingStatus}
        />
      )}
    </Box>
  );
};

export default OrderDetailPage;
