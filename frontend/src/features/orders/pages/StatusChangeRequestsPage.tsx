import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Badge,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
} from '@mui/material';
import { GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PaymentIcon from '@mui/icons-material/Payment';
import BadgeIcon from '@mui/icons-material/Badge';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import BlockIcon from '@mui/icons-material/Block';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import PercentIcon from '@mui/icons-material/Percent';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { useAuthStore } from '../../../store/authStore';
import { startApprovalQueue, type ApprovalQueueItem } from '../../../hooks/useApprovalQueue';
import { ROUTES } from '../../../utils/constants';
import { orderStatusChangeRequestsApi } from '../../../api/order-status-change-requests.api';
import { editRequestsApi } from '../../../api/edit-requests.api';
import { expenseOrderAuthRequestsApi } from '../../../api/expense-order-auth-requests.api';
import { advancePaymentApprovalsApi } from '../../../api/advance-payment-approvals.api';
import { discountApprovalsApi } from '../../../api/discount-approvals.api';
import { paymentEditApprovalsApi } from '../../../api/payment-edit-approvals.api';
import { ORDER_STATUS_CONFIG, PAYMENT_METHOD_LABELS, type OrderStatus, type PaymentEditApproval } from '../../../types/order.types';
import { EXPENSE_ORDER_STATUS_CONFIG, ExpenseOrderStatus } from '../../../types/expense-order.types';
import type { OrderStatusChangeRequest } from '../../../types/order-status-change-request.types';
import type { OrderEditRequest } from '../../../types/edit-request.types';
import type { ExpenseOrderAuthRequest } from '../../../types/expense-order-auth-request.types';
import type { AdvancePaymentApproval } from '../../../types/advance-payment-approval.types';
import type { DiscountApproval } from '../../../types/discount-approval.types';
import { clientOwnershipAuthRequestsApi } from '../../../api/client-ownership-auth-requests.api';
import type { ClientOwnershipAuthRequest } from '../../../types/client-ownership-auth-request.types';
import { advisorChangeRequestsApi } from '../../../api/advisor-change-requests.api';
import type { AdvisorChangeRequest } from '../../../types/advisor-change-request.types';
import { quoteRestoreRequestsApi } from '../../../api/quote-restore-requests.api';
import type { QuoteRestoreRequest } from '../../../types/quote-restore-request.types';
import { QUOTE_STATUS_CONFIG } from '../../../types/quote.types';
import { LoadingButton } from '../../../components/common/LoadingButton';
import RestoreIcon from '@mui/icons-material/Restore';
import { clientAdvisorRequestsApi } from '../../../api/client-advisor-requests.api';
import type { ClientAdvisorRequest } from '../../../types/client-advisor-request.types';
import { voidRequestsApi } from '../../../api/void-requests.api';
import type { CashMovementVoidRequest } from '../../../types/void-request.types';
import { refundRequestsApi } from '../../../api/refund-requests.api';
import type { RefundRequest } from '../../../types/refund-request.types';
import { apPaymentAuthRequestsApi } from '../../../api/accounts-payable-payment-auth-requests.api';
import type { AccountPayablePaymentAuthRequest } from '../../../types/accounts-payable.types';
import { AP_PAYMENT_AUTH_STATUS_CONFIG } from '../../../types/accounts-payable.types';
import { CajaApprovePaymentDialog } from '../../accounts-payable/components/CajaApprovePaymentDialog';
import { apPaymentReversalRequestsApi } from '../../../api/accounts-payable-payment-reversal-requests.api';
import type { AccountPayablePaymentReversalRequest } from '../../../types/accounts-payable-payment-reversal.types';
import { AP_REVERSAL_STATUS_CONFIG } from '../../../types/accounts-payable-payment-reversal.types';
import UndoIcon from '@mui/icons-material/Undo';
import { paymentMethodLabel } from '../../../utils/paymentMethods';

// ============================================================
// CONSTANTES
// ============================================================

const STATUS_LABELS: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  PENDING: { label: 'Pendiente', color: 'warning' },
  APPROVED: { label: 'Aprobada', color: 'success' },
  REJECTED: { label: 'Rechazada', color: 'error' },
  EXPIRED: { label: 'Expirada', color: 'default' },
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const getUserName = (user?: { firstName?: string | null; lastName?: string | null; email: string }) => {
  if (!user) return '-';
  return user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.email;
};

// ============================================================
// COMPONENTE
// ============================================================

export const StatusChangeRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuthStore();
  const isAdmin = user?.role?.name === 'admin';
  const canApproveOrders = hasPermission('approve_orders') || isAdmin;
  const canApproveAdvancePayments = hasPermission('approve_advance_payments') || isAdmin;
  const canApproveDiscounts = hasPermission('approve_discounts') || isAdmin;
  const canApprovePaymentEdits = hasPermission('approve_payment_edits') || isAdmin;
  const canApproveClientOwnership = hasPermission('approve_client_ownership_auth') || isAdmin;
  const canApproveAdvisorChange = hasPermission('approve_advisor_change') || isAdmin;
  const canApproveClientAdvisor = hasPermission('approve_client_advisor') || isAdmin;
  const canApproveQuoteRestore = hasPermission('approve_quote_restore') || isAdmin;
  const canApproveExpenseOrders = hasPermission('approve_expense_orders') || isAdmin;
  const canApproveVoidRequests = hasPermission('approve_cash_movements') || isAdmin;
  const canApproveRefunds = hasPermission('approve_refunds') || isAdmin;
  const canApproveAccountsPayable = hasPermission('approve_accounts_payable') || isAdmin;
  const canCajaAuthorizeAp = hasPermission('caja_authorize_ap_payment');
  const canGerenciaApproveReversal = hasPermission('gerencia_approve_ap_payment_reversal') || isAdmin;

  const [navWidth, setNavWidth] = useState(220);
  const isResizing = useRef(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = navWidth;

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX;
      setNavWidth(Math.max(160, Math.min(360, startWidth + delta)));
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [navWidth]);

  const [tabValue, setTabValue] = useState<string>(
    canApproveOrders ? 'status' : canApproveAdvancePayments ? 'advance' : canApproveDiscounts ? 'discount' : canApprovePaymentEdits ? 'payment-edit' : canApproveClientOwnership ? 'ownership' : canApproveAdvisorChange ? 'advisor' : canApproveClientAdvisor ? 'client-advisor' : canApproveQuoteRestore ? 'quote-restore' : canApproveExpenseOrders ? 'og' : canApproveVoidRequests ? 'void' : canApproveRefunds ? 'refund' : canApproveAccountsPayable ? 'ap' : canGerenciaApproveReversal ? 'ap-reversal' : 'status',
  );
  
  const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');

  // --- Status Change Requests ---
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    request: OrderStatusChangeRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [reviewNotes, setReviewNotes] = useState('');

  // --- Edit Requests ---
  const [editReviewDialog, setEditReviewDialog] = useState<{
    open: boolean;
    request: OrderEditRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [editReviewNotes, setEditReviewNotes] = useState('');

  // --- Expense Order Auth Requests ---
  const [ogAuthReviewDialog, setOgAuthReviewDialog] = useState<{
    open: boolean;
    request: ExpenseOrderAuthRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [ogAuthReviewNotes, setOgAuthReviewNotes] = useState('');

  // --- Advance Payment Approvals ---
  const [advanceReviewDialog, setAdvanceReviewDialog] = useState<{
    open: boolean;
    request: AdvancePaymentApproval | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [advanceReviewNotes, setAdvanceReviewNotes] = useState('');

  // --- Discount Approvals ---
  const [discountReviewDialog, setDiscountReviewDialog] = useState<{
    open: boolean;
    request: DiscountApproval | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [discountReviewNotes, setDiscountReviewNotes] = useState('');

  // --- Payment Edit Approvals ---
  const [paymentEditReviewDialog, setPaymentEditReviewDialog] = useState<{
    open: boolean;
    request: PaymentEditApproval | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [paymentEditReviewNotes, setPaymentEditReviewNotes] = useState('');

  // --- Client Ownership Auth Requests ---
  const [ownershipReviewDialog, setOwnershipReviewDialog] = useState<{
    open: boolean;
    request: ClientOwnershipAuthRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [ownershipReviewNotes, setOwnershipReviewNotes] = useState('');

  // --- Advisor Change Requests ---
  const [advisorReviewDialog, setAdvisorReviewDialog] = useState<{
    open: boolean;
    request: AdvisorChangeRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [advisorReviewNotes, setAdvisorReviewNotes] = useState('');

  // --- Quote Restore Requests ---
  const [quoteRestoreReviewDialog, setQuoteRestoreReviewDialog] = useState<{
    open: boolean;
    request: QuoteRestoreRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [quoteRestoreReviewNotes, setQuoteRestoreReviewNotes] = useState('');

  // --- Client Advisor Assignment Requests ---
  const [clientAdvisorReviewDialog, setClientAdvisorReviewDialog] = useState<{
    open: boolean;
    request: ClientAdvisorRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [clientAdvisorReviewNotes, setClientAdvisorReviewNotes] = useState('');

  // --- Cash Movement Void Requests ---
  const [voidReviewDialog, setVoidReviewDialog] = useState<{
    open: boolean;
    request: CashMovementVoidRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [voidReviewNotes, setVoidReviewNotes] = useState('');

  // --- Refund Requests ---
  const [refundReviewDialog, setRefundReviewDialog] = useState<{
    open: boolean;
    request: RefundRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [refundReviewNotes, setRefundReviewNotes] = useState('');

  // --- AP Payment Auth Requests (admin step) ---
  const [apAuthReviewDialog, setApAuthReviewDialog] = useState<{
    open: boolean;
    request: AccountPayablePaymentAuthRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [apAuthReviewNotes, setApAuthReviewNotes] = useState('');

  // --- AP Payment Auth Requests (caja step) ---
  const [cajaApRequest, setCajaApRequest] = useState<AccountPayablePaymentAuthRequest | null>(null);

  // --- AP Payment Reversal Requests (gerencia step) ---
  const [reversalReviewDialog, setReversalReviewDialog] = useState<{
    open: boolean;
    request: AccountPayablePaymentReversalRequest | null;
    action: 'approve' | 'reject' | null;
  }>({ open: false, request: null, action: null });
  const [reversalReviewNotes, setReversalReviewNotes] = useState('');

  // ============================================================
  // QUERIES
  // ============================================================

  const { data: statusRequestsData, isLoading: statusLoading } = useQuery({
    queryKey: ['statusChangeRequests', viewMode],
    queryFn: () => viewMode === 'pending' 
      ? orderStatusChangeRequestsApi.findPending()
      : orderStatusChangeRequestsApi.findAll(),
    enabled: canApproveOrders,
  });

  const { data: editRequestsData, isLoading: editLoading } = useQuery({
    queryKey: ['editRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? editRequestsApi.findAllPending()
      : editRequestsApi.findAll(),
    enabled: canApproveOrders,
  });

  const { data: ogAuthRequestsData, isLoading: ogAuthLoading } = useQuery({
    queryKey: ['ogAuthRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? expenseOrderAuthRequestsApi.findPending()
      : expenseOrderAuthRequestsApi.findAll(),
    enabled: canApproveExpenseOrders,
  });

  const { data: advancePaymentRequestsData, isLoading: advanceLoading } = useQuery({
    queryKey: ['advancePaymentApprovals', viewMode],
    queryFn: () => viewMode === 'pending'
      ? advancePaymentApprovalsApi.findPending()
      : advancePaymentApprovalsApi.findAll(),
    enabled: canApproveAdvancePayments,
  });

  const { data: discountRequestsData, isLoading: discountLoading } = useQuery({
    queryKey: ['discountApprovals', viewMode],
    queryFn: () => viewMode === 'pending'
      ? discountApprovalsApi.findPending()
      : discountApprovalsApi.findAll(),
    enabled: canApproveDiscounts,
  });

  const { data: paymentEditRequestsData, isLoading: paymentEditLoading } = useQuery({
    queryKey: ['paymentEditApprovals', viewMode],
    queryFn: () => viewMode === 'pending'
      ? paymentEditApprovalsApi.findPending()
      : paymentEditApprovalsApi.findAll(),
    enabled: canApprovePaymentEdits,
  });

  const { data: ownershipRequestsData, isLoading: ownershipLoading } = useQuery({
    queryKey: ['clientOwnershipAuthRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? clientOwnershipAuthRequestsApi.findPending()
      : clientOwnershipAuthRequestsApi.findAll(),
    enabled: canApproveClientOwnership,
  });

  const { data: advisorRequestsData, isLoading: advisorLoading } = useQuery({
    queryKey: ['advisorChangeRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? advisorChangeRequestsApi.findPending()
      : advisorChangeRequestsApi.findAll(),
    enabled: canApproveAdvisorChange,
  });

  const { data: quoteRestoreRequestsData, isLoading: quoteRestoreLoading } = useQuery({
    queryKey: ['quoteRestoreRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? quoteRestoreRequestsApi.findPending()
      : quoteRestoreRequestsApi.findAll(),
    enabled: canApproveQuoteRestore,
  });

  const { data: clientAdvisorRequestsData, isLoading: clientAdvisorLoading } = useQuery({
    queryKey: ['clientAdvisorRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? clientAdvisorRequestsApi.findPending()
      : clientAdvisorRequestsApi.findAll(),
    enabled: canApproveClientAdvisor,
  });

  const { data: voidRequestsData, isLoading: voidLoading } = useQuery({
    queryKey: ['voidRequests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? voidRequestsApi.getPending()
      : voidRequestsApi.getAll(),
    enabled: canApproveVoidRequests,
  });

  const { data: refundRequestsData, isLoading: refundLoading } = useQuery({
    queryKey: ['refund-requests', viewMode],
    queryFn: () => viewMode === 'pending'
      ? refundRequestsApi.findPending()
      : refundRequestsApi.findAll(),
    enabled: canApproveRefunds,
  });

  const { data: apAuthRequestsData, isLoading: apAuthLoading } = useQuery({
    queryKey: ['ap-payment-auth-requests-admin', viewMode],
    queryFn: () => viewMode === 'pending'
      ? apPaymentAuthRequestsApi.findPendingAdmin()
      : apPaymentAuthRequestsApi.findAll(),
    enabled: canApproveAccountsPayable,
  });

  const { data: cajaApRequestsData, isLoading: cajaApLoading } = useQuery({
    queryKey: ['ap-payment-auth-requests-caja', viewMode],
    queryFn: () => viewMode === 'pending'
      ? apPaymentAuthRequestsApi.findPendingCaja()
      : apPaymentAuthRequestsApi.findAll(),
    enabled: canCajaAuthorizeAp,
  });

  const { data: reversalRequestsData, isLoading: reversalLoading } = useQuery({
    queryKey: ['ap-payment-reversals-gerencia', viewMode],
    queryFn: () => viewMode === 'pending'
      ? apPaymentReversalRequestsApi.findPendingGerencia()
      : apPaymentReversalRequestsApi.findAll(),
    enabled: canGerenciaApproveReversal,
  });

  const statusRequests = viewMode === 'history' ? statusRequestsData?.filter(r => r.status !== 'PENDING') : statusRequestsData;
  const editRequests = viewMode === 'history' ? editRequestsData?.filter(r => r.status !== 'PENDING') : editRequestsData;
  const ogAuthRequests = viewMode === 'history' ? ogAuthRequestsData?.filter(r => r.status !== 'PENDING') : ogAuthRequestsData;
  const advancePaymentRequests = viewMode === 'history' ? advancePaymentRequestsData?.filter(r => r.status !== 'PENDING') : advancePaymentRequestsData;
  const discountRequests = viewMode === 'history' ? discountRequestsData?.filter(r => r.status !== 'PENDING') : discountRequestsData;
  const paymentEditRequests = viewMode === 'history' ? paymentEditRequestsData?.filter(r => r.status !== 'PENDING') : paymentEditRequestsData;
  const ownershipRequests = viewMode === 'history' ? ownershipRequestsData?.filter(r => r.status !== 'PENDING') : ownershipRequestsData;
  const advisorRequests = viewMode === 'history' ? advisorRequestsData?.filter(r => r.status !== 'PENDING') : advisorRequestsData;
  const clientAdvisorRequests = viewMode === 'history' ? clientAdvisorRequestsData?.filter(r => r.status !== 'PENDING') : clientAdvisorRequestsData;
  const quoteRestoreRequests = viewMode === 'history' ? quoteRestoreRequestsData?.filter(r => r.status !== 'PENDING') : quoteRestoreRequestsData;
  const voidRequests = viewMode === 'history' ? voidRequestsData?.filter(r => r.status !== 'PENDING') : voidRequestsData;
  const refundRequests = viewMode === 'history' ? refundRequestsData?.filter(r => r.status !== 'PENDING') : refundRequestsData;
  const apAuthRequests = viewMode === 'history' ? apAuthRequestsData?.filter(r => r.status !== 'PENDING') : apAuthRequestsData;
  const cajaApRequests = viewMode === 'history' ? cajaApRequestsData?.filter(r => r.status === 'COMPLETED' || r.status === 'CAJA_REJECTED') : cajaApRequestsData;
  const reversalRequests = viewMode === 'history' ? reversalRequestsData?.filter(r => r.status !== 'PENDING_GERENCIA') : reversalRequestsData;

  // ============================================================
  // STATUS CHANGE MUTATIONS
  // ============================================================

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      orderStatusChangeRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statusChangeRequests'] });
      enqueueSnackbar('Solicitud aprobada exitosamente', { variant: 'success' });
      handleCloseReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      orderStatusChangeRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statusChangeRequests'] });
      enqueueSnackbar('Solicitud rechazada', { variant: 'info' });
      handleCloseReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar solicitud',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // EDIT REQUEST MUTATIONS
  // ============================================================

  const approveEditMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      editRequestsApi.approveGlobal(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editRequests'] });
      queryClient.invalidateQueries({ queryKey: ['edit-requests'] });
      enqueueSnackbar('Solicitud de edición aprobada exitosamente', { variant: 'success' });
      handleCloseEditReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectEditMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      editRequestsApi.rejectGlobal(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editRequests'] });
      queryClient.invalidateQueries({ queryKey: ['edit-requests'] });
      enqueueSnackbar('Solicitud de edición rechazada', { variant: 'info' });
      handleCloseEditReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar solicitud',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // OG AUTH REQUEST MUTATIONS
  // ============================================================

  const approveOgAuthMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      expenseOrderAuthRequestsApi.approve(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ogAuthRequests'] });
      enqueueSnackbar('Solicitud de autorización aprobada', { variant: 'success' });
      handleCloseOgAuthReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectOgAuthMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      expenseOrderAuthRequestsApi.reject(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ogAuthRequests'] });
      enqueueSnackbar('Solicitud de autorización rechazada', { variant: 'info' });
      handleCloseOgAuthReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar solicitud',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // ADVANCE PAYMENT MUTATIONS
  // ============================================================

  const approveAdvanceMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      advancePaymentApprovalsApi.approve(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advancePaymentApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Anticipo aprobado exitosamente', { variant: 'success' });
      handleCloseAdvanceReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar anticipo',
        { variant: 'error' }
      );
    },
  });

  const rejectAdvanceMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      advancePaymentApprovalsApi.reject(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advancePaymentApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Anticipo rechazado. El pago ha sido revertido.', { variant: 'info' });
      handleCloseAdvanceReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar anticipo',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // DISCOUNT APPROVAL MUTATIONS
  // ============================================================

  const approveDiscountMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      discountApprovalsApi.approve(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discountApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Descuento aprobado exitosamente', { variant: 'success' });
      handleCloseDiscountReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar descuento',
        { variant: 'error' }
      );
    },
  });

  const rejectDiscountMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      discountApprovalsApi.reject(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discountApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Descuento rechazado', { variant: 'info' });
      handleCloseDiscountReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar descuento',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // PAYMENT EDIT MUTATIONS
  // ============================================================

  const approvePaymentEditMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      paymentEditApprovalsApi.approve(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentEditApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['payment-edit-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Edición de pago aprobada y aplicada', { variant: 'success' });
      handleClosePaymentEditReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la edición',
        { variant: 'error' }
      );
    },
  });

  const rejectPaymentEditMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      paymentEditApprovalsApi.reject(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentEditApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['payment-edit-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Edición de pago rechazada. El pago no fue modificado.', { variant: 'info' });
      handleClosePaymentEditReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la edición',
        { variant: 'error' }
      );
    },
  });

  const approveOwnershipMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      clientOwnershipAuthRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientOwnershipAuthRequests'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Autorización de propiedad aprobada', { variant: 'success' });
      handleCloseOwnershipReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectOwnershipMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      clientOwnershipAuthRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientOwnershipAuthRequests'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Autorización de propiedad rechazada', { variant: 'info' });
      handleCloseOwnershipReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const approveAdvisorMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      advisorChangeRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advisorChangeRequests'] });
      queryClient.invalidateQueries({ queryKey: ['advisor-change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Cambio de asesor aprobado y aplicado a la OP', { variant: 'success' });
      handleCloseAdvisorReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectAdvisorMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      advisorChangeRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advisorChangeRequests'] });
      queryClient.invalidateQueries({ queryKey: ['advisor-change-requests'] });
      enqueueSnackbar('Solicitud de cambio de asesor rechazada', { variant: 'info' });
      handleCloseAdvisorReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la solicitud',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // QUOTE RESTORE MUTATIONS
  // ============================================================

  const handleCloseQuoteRestoreReviewDialog = () => {
    setQuoteRestoreReviewDialog({ open: false, request: null, action: null });
    setQuoteRestoreReviewNotes('');
  };

  const invalidateQuoteRestore = () => {
    queryClient.invalidateQueries({ queryKey: ['quoteRestoreRequests'] });
    queryClient.invalidateQueries({ queryKey: ['quote-restore-requests'] });
  };

  const approveQuoteRestoreMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      quoteRestoreRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      invalidateQuoteRestore();
      queryClient.invalidateQueries({ queryKey: ['quote'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-board'] });
      enqueueSnackbar('Cotización restaurada', { variant: 'success' });
      handleCloseQuoteRestoreReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectQuoteRestoreMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      quoteRestoreRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      invalidateQuoteRestore();
      enqueueSnackbar('Solicitud de restauración rechazada', { variant: 'info' });
      handleCloseQuoteRestoreReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const handleConfirmQuoteRestoreReview = () => {
    const { request, action } = quoteRestoreReviewDialog;
    if (!request || !action) return;

    if (action === 'approve') {
      approveQuoteRestoreMutation.mutate({
        id: request.id,
        notes: quoteRestoreReviewNotes.trim() || undefined,
      });
    } else {
      if (!quoteRestoreReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectQuoteRestoreMutation.mutate({
        id: request.id,
        notes: quoteRestoreReviewNotes.trim(),
      });
    }
  };

  // ============================================================
  // CLIENT ADVISOR ASSIGNMENT MUTATIONS
  // ============================================================

  const approveClientAdvisorMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      clientAdvisorRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientAdvisorRequests'] });
      queryClient.invalidateQueries({ queryKey: ['client-advisor-requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      enqueueSnackbar('Asignación de asesor aprobada y aplicada al cliente', { variant: 'success' });
      handleCloseClientAdvisorReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectClientAdvisorMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      clientAdvisorRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientAdvisorRequests'] });
      queryClient.invalidateQueries({ queryKey: ['client-advisor-requests'] });
      enqueueSnackbar('Solicitud de asignación de asesor rechazada', { variant: 'info' });
      handleCloseClientAdvisorReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la solicitud',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // VOID REQUEST MUTATIONS
  // ============================================================

  const approveVoidMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      voidRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voidRequests'] });
      queryClient.invalidateQueries({ queryKey: ['void-requests'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      enqueueSnackbar('Solicitud de anulación aprobada. Movimiento anulado.', { variant: 'success' });
      handleCloseVoidReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar solicitud de anulación',
        { variant: 'error' }
      );
    },
  });

  const rejectVoidMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      voidRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voidRequests'] });
      queryClient.invalidateQueries({ queryKey: ['void-requests'] });
      enqueueSnackbar('Solicitud de anulación rechazada', { variant: 'info' });
      handleCloseVoidReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar solicitud de anulación',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // REFUND REQUEST MUTATIONS
  // ============================================================

  const approveRefundMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      refundRequestsApi.approve(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refund-requests'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Devolución aprobada exitosamente', { variant: 'success' });
      handleCloseRefundReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la devolución',
        { variant: 'error' }
      );
    },
  });

  const rejectRefundMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      refundRequestsApi.reject(id, { reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refund-requests'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      enqueueSnackbar('Devolución rechazada', { variant: 'info' });
      handleCloseRefundReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la devolución',
        { variant: 'error' }
      );
    },
  });

  // ============================================================
  // AP AUTH REQUEST MUTATIONS
  // ============================================================

  const approveApAuthMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apPaymentAuthRequestsApi.adminApprove(id, { adminNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payment-auth-requests-admin'] });
      queryClient.invalidateQueries({ queryKey: ['ap-payment-auth-requests'] });
      enqueueSnackbar('Solicitud aprobada. Caja será notificada para completar el pago.', { variant: 'success' });
      handleCloseApAuthReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al aprobar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const rejectApAuthMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apPaymentAuthRequestsApi.adminReject(id, { adminNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payment-auth-requests-admin'] });
      queryClient.invalidateQueries({ queryKey: ['ap-payment-auth-requests'] });
      enqueueSnackbar('Solicitud de pago rechazada', { variant: 'info' });
      handleCloseApAuthReviewDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Error al rechazar la solicitud',
        { variant: 'error' }
      );
    },
  });

  const cajaApApproveMutation = useMutation({
    mutationFn: (id: string) => apPaymentAuthRequestsApi.cajaApprove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payment-auth-requests-caja'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-payable'] });
      enqueueSnackbar('Pago registrado correctamente por Caja', { variant: 'success' });
      setCajaApRequest(null);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al registrar el pago', { variant: 'error' });
    },
  });

  const cajaApRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apPaymentAuthRequestsApi.cajaReject(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payment-auth-requests-caja'] });
      enqueueSnackbar('Solicitud de pago rechazada por Caja', { variant: 'info' });
      setCajaApRequest(null);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al rechazar el pago', { variant: 'error' });
    },
  });

  const reversalGerenciaApproveMutation = useMutation({
    mutationFn: (id: string) => apPaymentReversalRequestsApi.gerenciaApprove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payment-reversals-gerencia'] });
      enqueueSnackbar('Reversión aprobada por Gerencia — pendiente de Caja', { variant: 'success' });
      setReversalReviewDialog({ open: false, request: null, action: null });
      setReversalReviewNotes('');
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al aprobar la reversión', { variant: 'error' });
    },
  });

  const reversalGerenciaRejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apPaymentReversalRequestsApi.gerenciaReject(id, { rejectionNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payment-reversals-gerencia'] });
      enqueueSnackbar('Reversión rechazada por Gerencia', { variant: 'info' });
      setReversalReviewDialog({ open: false, request: null, action: null });
      setReversalReviewNotes('');
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.message || 'Error al rechazar la reversión', { variant: 'error' });
    },
  });

  // ============================================================
  // HANDLERS - STATUS CHANGE
  // ============================================================

  const handleApprove = (request: OrderStatusChangeRequest) => {
    setReviewDialog({ open: true, request, action: 'approve' });
    setReviewNotes('');
  };

  const handleReject = (request: OrderStatusChangeRequest) => {
    setReviewDialog({ open: true, request, action: 'reject' });
    setReviewNotes('');
  };

  const handleConfirmReview = () => {
    if (!reviewDialog.request) return;

    if (reviewDialog.action === 'approve') {
      approveMutation.mutate({
        id: reviewDialog.request.id,
        notes: reviewNotes || undefined,
      });
    } else if (reviewDialog.action === 'reject') {
      if (!reviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectMutation.mutate({
        id: reviewDialog.request.id,
        notes: reviewNotes,
      });
    }
  };

  const handleCloseReviewDialog = () => {
    setReviewDialog({ open: false, request: null, action: null });
    setReviewNotes('');
  };

  // ============================================================
  // HANDLERS - EDIT REQUESTS
  // ============================================================

  const handleApproveEdit = (request: OrderEditRequest) => {
    setEditReviewDialog({ open: true, request, action: 'approve' });
    setEditReviewNotes('');
  };

  const handleRejectEdit = (request: OrderEditRequest) => {
    setEditReviewDialog({ open: true, request, action: 'reject' });
    setEditReviewNotes('');
  };

  const handleConfirmEditReview = () => {
    if (!editReviewDialog.request) return;

    if (editReviewDialog.action === 'approve') {
      approveEditMutation.mutate({
        id: editReviewDialog.request.id,
        notes: editReviewNotes || undefined,
      });
    } else if (editReviewDialog.action === 'reject') {
      if (!editReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectEditMutation.mutate({
        id: editReviewDialog.request.id,
        notes: editReviewNotes,
      });
    }
  };

  const handleCloseEditReviewDialog = () => {
    setEditReviewDialog({ open: false, request: null, action: null });
    setEditReviewNotes('');
  };

  // ============================================================
  // HANDLERS - OG AUTH REQUESTS
  // ============================================================

  const handleApproveOgAuth = (request: ExpenseOrderAuthRequest) => {
    setOgAuthReviewDialog({ open: true, request, action: 'approve' });
    setOgAuthReviewNotes('');
  };

  const handleRejectOgAuth = (request: ExpenseOrderAuthRequest) => {
    setOgAuthReviewDialog({ open: true, request, action: 'reject' });
    setOgAuthReviewNotes('');
  };

  const handleConfirmOgAuthReview = () => {
    if (!ogAuthReviewDialog.request) return;

    if (ogAuthReviewDialog.action === 'approve') {
      approveOgAuthMutation.mutate({
        id: ogAuthReviewDialog.request.id,
        notes: ogAuthReviewNotes || undefined,
      });
    } else if (ogAuthReviewDialog.action === 'reject') {
      if (!ogAuthReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectOgAuthMutation.mutate({
        id: ogAuthReviewDialog.request.id,
        notes: ogAuthReviewNotes,
      });
    }
  };

  const handleCloseOgAuthReviewDialog = () => {
    setOgAuthReviewDialog({ open: false, request: null, action: null });
    setOgAuthReviewNotes('');
  };

  // ============================================================
  // HANDLERS - ADVANCE PAYMENT
  // ============================================================

  const handleApproveAdvance = (request: AdvancePaymentApproval) => {
    setAdvanceReviewDialog({ open: true, request, action: 'approve' });
    setAdvanceReviewNotes('');
  };

  const handleRejectAdvance = (request: AdvancePaymentApproval) => {
    setAdvanceReviewDialog({ open: true, request, action: 'reject' });
    setAdvanceReviewNotes('');
  };

  const handleConfirmAdvanceReview = () => {
    if (!advanceReviewDialog.request) return;

    if (advanceReviewDialog.action === 'approve') {
      approveAdvanceMutation.mutate({
        id: advanceReviewDialog.request.id,
        notes: advanceReviewNotes || undefined,
      });
    } else if (advanceReviewDialog.action === 'reject') {
      if (!advanceReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectAdvanceMutation.mutate({
        id: advanceReviewDialog.request.id,
        notes: advanceReviewNotes,
      });
    }
  };

  const handleCloseAdvanceReviewDialog = () => {
    setAdvanceReviewDialog({ open: false, request: null, action: null });
    setAdvanceReviewNotes('');
  };

  // ============================================================
  // HANDLERS - DISCOUNT APPROVAL
  // ============================================================

  const handleApproveDiscount = (request: DiscountApproval) => {
    setDiscountReviewDialog({ open: true, request, action: 'approve' });
    setDiscountReviewNotes('');
  };

  const handleRejectDiscount = (request: DiscountApproval) => {
    setDiscountReviewDialog({ open: true, request, action: 'reject' });
    setDiscountReviewNotes('');
  };

  const handleConfirmDiscountReview = () => {
    if (!discountReviewDialog.request) return;

    if (discountReviewDialog.action === 'approve') {
      approveDiscountMutation.mutate({
        id: discountReviewDialog.request.id,
        notes: discountReviewNotes || undefined,
      });
    } else if (discountReviewDialog.action === 'reject') {
      if (!discountReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectDiscountMutation.mutate({
        id: discountReviewDialog.request.id,
        notes: discountReviewNotes,
      });
    }
  };

  const handleCloseDiscountReviewDialog = () => {
    setDiscountReviewDialog({ open: false, request: null, action: null });
    setDiscountReviewNotes('');
  };

  // ============================================================
  // HANDLERS - PAYMENT EDIT
  // ============================================================

  const handleApprovePaymentEdit = (request: PaymentEditApproval) => {
    setPaymentEditReviewDialog({ open: true, request, action: 'approve' });
    setPaymentEditReviewNotes('');
  };

  const handleRejectPaymentEdit = (request: PaymentEditApproval) => {
    setPaymentEditReviewDialog({ open: true, request, action: 'reject' });
    setPaymentEditReviewNotes('');
  };

  const handleConfirmPaymentEditReview = () => {
    if (!paymentEditReviewDialog.request) return;

    if (paymentEditReviewDialog.action === 'approve') {
      approvePaymentEditMutation.mutate({
        id: paymentEditReviewDialog.request.id,
        notes: paymentEditReviewNotes || undefined,
      });
    } else if (paymentEditReviewDialog.action === 'reject') {
      if (!paymentEditReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectPaymentEditMutation.mutate({
        id: paymentEditReviewDialog.request.id,
        notes: paymentEditReviewNotes,
      });
    }
  };

  const handleClosePaymentEditReviewDialog = () => {
    setPaymentEditReviewDialog({ open: false, request: null, action: null });
    setPaymentEditReviewNotes('');
  };

  /**
   * Abre el detalle de una entidad congelando la cola de revisión de su
   * bandeja, para poder resolver las solicitudes una tras otra sin devolverse a
   * esta lista.
   *
   * En modo `pending` las consultas ya traen solo solicitudes pendientes, así
   * que basta con mapear las filas visibles. Si la cola tiene un solo elemento
   * se navega sin cola (no hay nada que recorrer).
   */
  const openWithQueue = <T,>(config: {
    queueKey: string;
    rows: T[] | undefined;
    canApprove: boolean;
    toItem: (row: T) => ApprovalQueueItem | null;
    buildPath: (id: string) => string;
    targetId: string;
  }) => {
    const { queueKey, rows, canApprove, toItem, buildPath, targetId } = config;

    const items =
      viewMode === 'pending' && canApprove
        ? (rows ?? [])
            .map(toItem)
            .filter((item): item is ApprovalQueueItem => !!item)
        : [];

    if (items.length > 1 && items.some((item) => item.id === targetId)) {
      navigate(
        startApprovalQueue({
          queueKey,
          items,
          returnPath: ROUTES.STATUS_CHANGE_REQUESTS,
          startId: targetId,
          buildPath,
        }),
      );
      return;
    }

    navigate(buildPath(targetId));
  };

  const buildOrderPath = (orderId: string) => `/orders/${orderId}`;
  const buildExpenseOrderPath = (ogId: string) => `/expense-orders/${ogId}`;
  const buildAccountPayablePath = (apId: string) => `/accounts-payable/${apId}`;

  const handleViewOrder = (orderId: string) => {
    navigate(buildOrderPath(orderId));
  };

  const handleViewExpenseOrder = (expenseOrderId: string) => {
    openWithQueue({
      queueKey: 'og-auth',
      rows: ogAuthRequests,
      canApprove: canApproveExpenseOrders,
      toItem: (request) =>
        request.expenseOrder
          ? { id: request.expenseOrder.id, label: request.expenseOrder.ogNumber }
          : null,
      buildPath: buildExpenseOrderPath,
      targetId: expenseOrderId,
    });
  };

  /** Edición de Orden — la aprobación se resuelve desde la barra de la cola. */
  const handleViewEditRequestOrder = (request: OrderEditRequest) => {
    openWithQueue({
      queueKey: 'order-edit',
      rows: editRequests,
      canApprove: canApproveOrders,
      toItem: (row) =>
        row.orderId
          ? { id: row.orderId, label: row.order?.orderNumber || '-', requestId: row.id }
          : null,
      buildPath: buildOrderPath,
      targetId: request.orderId,
    });
  };

  /** Propiedad Cliente — la aprobación se resuelve desde la barra de la cola. */
  const handleViewOwnershipOrder = (request: ClientOwnershipAuthRequest) => {
    openWithQueue({
      queueKey: 'client-ownership',
      rows: ownershipRequests,
      canApprove: canApproveClientOwnership,
      toItem: (row) =>
        row.order
          ? { id: row.order.id, label: row.order.orderNumber, requestId: row.id }
          : null,
      buildPath: buildOrderPath,
      targetId: request.order.id,
    });
  };

  /** Autorización CxP y Caja CxP — ambas abren el detalle de la cuenta por pagar. */
  const handleViewAccountPayable = (
    accountPayableId: string,
    step: 'admin' | 'caja',
  ) => {
    openWithQueue({
      queueKey: step === 'admin' ? 'ap-auth' : 'ap-caja',
      rows: step === 'admin' ? apAuthRequests : cajaApRequests,
      canApprove: step === 'admin' ? canApproveAccountsPayable : canCajaAuthorizeAp,
      toItem: (row) =>
        row.accountPayableId
          ? { id: row.accountPayableId, label: row.accountPayable?.apNumber || '-' }
          : null,
      buildPath: buildAccountPayablePath,
      targetId: accountPayableId,
    });
  };

  // ============================================================
  // HANDLERS - CLIENT OWNERSHIP AUTH
  // ============================================================

  const handleApproveOwnership = (request: ClientOwnershipAuthRequest) => {
    setOwnershipReviewDialog({ open: true, request, action: 'approve' });
    setOwnershipReviewNotes('');
  };

  const handleRejectOwnership = (request: ClientOwnershipAuthRequest) => {
    setOwnershipReviewDialog({ open: true, request, action: 'reject' });
    setOwnershipReviewNotes('');
  };

  const handleConfirmOwnershipReview = () => {
    if (!ownershipReviewDialog.request || !ownershipReviewDialog.action) return;

    if (ownershipReviewDialog.action === 'approve') {
      approveOwnershipMutation.mutate({
        id: ownershipReviewDialog.request.id,
        notes: ownershipReviewNotes || undefined,
      });
    } else {
      if (!ownershipReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectOwnershipMutation.mutate({
        id: ownershipReviewDialog.request.id,
        notes: ownershipReviewNotes,
      });
    }
  };

  const handleCloseOwnershipReviewDialog = () => {
    setOwnershipReviewDialog({ open: false, request: null, action: null });
    setOwnershipReviewNotes('');
  };

  // ============================================================
  // HANDLERS - ADVISOR CHANGE
  // ============================================================

  const handleApproveAdvisor = (request: AdvisorChangeRequest) => {
    setAdvisorReviewDialog({ open: true, request, action: 'approve' });
    setAdvisorReviewNotes('');
  };

  const handleRejectAdvisor = (request: AdvisorChangeRequest) => {
    setAdvisorReviewDialog({ open: true, request, action: 'reject' });
    setAdvisorReviewNotes('');
  };

  const handleConfirmAdvisorReview = () => {
    if (!advisorReviewDialog.request || !advisorReviewDialog.action) return;

    if (advisorReviewDialog.action === 'approve') {
      approveAdvisorMutation.mutate({
        id: advisorReviewDialog.request.id,
        notes: advisorReviewNotes || undefined,
      });
    } else {
      if (!advisorReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectAdvisorMutation.mutate({
        id: advisorReviewDialog.request.id,
        notes: advisorReviewNotes,
      });
    }
  };

  const handleCloseAdvisorReviewDialog = () => {
    setAdvisorReviewDialog({ open: false, request: null, action: null });
    setAdvisorReviewNotes('');
  };

  const handleApproveClientAdvisor = (request: ClientAdvisorRequest) => {
    setClientAdvisorReviewDialog({ open: true, request, action: 'approve' });
    setClientAdvisorReviewNotes('');
  };

  const handleRejectClientAdvisor = (request: ClientAdvisorRequest) => {
    setClientAdvisorReviewDialog({ open: true, request, action: 'reject' });
    setClientAdvisorReviewNotes('');
  };

  const handleConfirmClientAdvisorReview = () => {
    if (!clientAdvisorReviewDialog.request || !clientAdvisorReviewDialog.action) return;

    if (clientAdvisorReviewDialog.action === 'approve') {
      approveClientAdvisorMutation.mutate({
        id: clientAdvisorReviewDialog.request.id,
        notes: clientAdvisorReviewNotes || undefined,
      });
    } else {
      if (!clientAdvisorReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectClientAdvisorMutation.mutate({
        id: clientAdvisorReviewDialog.request.id,
        notes: clientAdvisorReviewNotes,
      });
    }
  };

  const handleCloseClientAdvisorReviewDialog = () => {
    setClientAdvisorReviewDialog({ open: false, request: null, action: null });
    setClientAdvisorReviewNotes('');
  };

  // ============================================================
  // HANDLERS - VOID REQUESTS
  // ============================================================

  const handleApproveVoid = (request: CashMovementVoidRequest) => {
    setVoidReviewDialog({ open: true, request, action: 'approve' });
    setVoidReviewNotes('');
  };

  const handleRejectVoid = (request: CashMovementVoidRequest) => {
    setVoidReviewDialog({ open: true, request, action: 'reject' });
    setVoidReviewNotes('');
  };

  const handleConfirmVoidReview = () => {
    if (!voidReviewDialog.request) return;

    if (voidReviewDialog.action === 'approve') {
      approveVoidMutation.mutate({
        id: voidReviewDialog.request.id,
        notes: voidReviewNotes || undefined,
      });
    } else if (voidReviewDialog.action === 'reject') {
      if (!voidReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectVoidMutation.mutate({
        id: voidReviewDialog.request.id,
        notes: voidReviewNotes,
      });
    }
  };

  const handleCloseVoidReviewDialog = () => {
    setVoidReviewDialog({ open: false, request: null, action: null });
    setVoidReviewNotes('');
  };

  // ============================================================
  // HANDLERS - REFUND REQUESTS
  // ============================================================

  const handleApproveRefund = (request: RefundRequest) => {
    setRefundReviewDialog({ open: true, request, action: 'approve' });
    setRefundReviewNotes('');
  };

  const handleRejectRefund = (request: RefundRequest) => {
    setRefundReviewDialog({ open: true, request, action: 'reject' });
    setRefundReviewNotes('');
  };

  const handleConfirmRefundReview = () => {
    if (!refundReviewDialog.request) return;

    if (refundReviewDialog.action === 'approve') {
      approveRefundMutation.mutate({
        id: refundReviewDialog.request.id,
        notes: refundReviewNotes || undefined,
      });
    } else if (refundReviewDialog.action === 'reject') {
      if (!refundReviewNotes.trim()) {
        enqueueSnackbar('Debe proporcionar una razón para rechazar', { variant: 'warning' });
        return;
      }
      rejectRefundMutation.mutate({
        id: refundReviewDialog.request.id,
        notes: refundReviewNotes,
      });
    }
  };

  const handleCloseRefundReviewDialog = () => {
    setRefundReviewDialog({ open: false, request: null, action: null });
    setRefundReviewNotes('');
  };

  // ============================================================
  // HANDLERS - AP AUTH REQUESTS
  // ============================================================

  const handleApproveApAuth = (request: AccountPayablePaymentAuthRequest) => {
    setApAuthReviewDialog({ open: true, request, action: 'approve' });
    setApAuthReviewNotes('');
  };

  const handleRejectApAuth = (request: AccountPayablePaymentAuthRequest) => {
    setApAuthReviewDialog({ open: true, request, action: 'reject' });
    setApAuthReviewNotes('');
  };

  const handleConfirmApAuthReview = () => {
    if (!apAuthReviewDialog.request) return;

    if (apAuthReviewDialog.action === 'approve') {
      approveApAuthMutation.mutate({
        id: apAuthReviewDialog.request.id,
        notes: apAuthReviewNotes || undefined,
      });
    } else if (apAuthReviewDialog.action === 'reject') {
      rejectApAuthMutation.mutate({
        id: apAuthReviewDialog.request.id,
        notes: apAuthReviewNotes || undefined,
      });
    }
  };

  const handleCloseApAuthReviewDialog = () => {
    setApAuthReviewDialog({ open: false, request: null, action: null });
    setApAuthReviewNotes('');
  };

  // ============================================================
  // COLUMNAS - STATUS CHANGE REQUESTS
  // ============================================================

  const statusColumns: GridColDef<OrderStatusChangeRequest>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOrder(params.row.order.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'currentStatus',
      headerName: 'Estado Actual',
      width: 150,
      renderCell: (params) => {
        const value = params.value as OrderStatus;
        const config = ORDER_STATUS_CONFIG[value];
        return (
          <Chip
            label={config?.label || params.value}
            color={config?.color || 'default'}
            size="small"
          />
        );
      },
    },
    {
      field: 'requestedStatus',
      headerName: 'Estado Solicitado',
      width: 170,
      renderCell: (params) => {
        const value = params.value as OrderStatus;
        const config = ORDER_STATUS_CONFIG[value];
        return (
          <Chip
            label={config?.label || params.value}
            color={config?.color || 'default'}
            size="small"
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'reason',
      headerName: 'Razón',
      width: 250,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      // Solo en anulaciones con pagos: el resto de lo pagado queda como saldo a
      // favor del cliente, así que el admin aprueba también esta cifra.
      field: 'retainedAmount',
      headerName: 'Retiene la empresa',
      width: 160,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) =>
        params.row.requestedStatus === 'ANULADO' && params.value != null
          ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(params.value))
          : '-',
    },
    {
      field: 'status',
      headerName: 'Estado Solicitud',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApproveOrders ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') {
          return [];
        }

        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApprove(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleReject(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - EDIT REQUESTS
  // ============================================================

  const editColumns: GridColDef<OrderEditRequest>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.orderId && handleViewEditRequestOrder(params.row)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'observations',
      headerName: 'Observaciones',
      width: 300,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado Solicitud',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 170,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApproveOrders ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') {
          return [];
        }

        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveEdit(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectEdit(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - OG AUTH REQUESTS
  // ============================================================

  const ogAuthColumns: GridColDef<ExpenseOrderAuthRequest>[] = [
    {
      field: 'ogNumber',
      headerName: 'Nº OG',
      width: 150,
      valueGetter: (_, row) => row.expenseOrder?.ogNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.expenseOrder && handleViewExpenseOrder(params.row.expenseOrder.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'ogStatus',
      headerName: 'Estado OG',
      width: 130,
      valueGetter: (_, row) => row.expenseOrder?.status || '-',
      renderCell: (params) => {
        const config = EXPENSE_ORDER_STATUS_CONFIG[params.value as keyof typeof EXPENSE_ORDER_STATUS_CONFIG];
        return config ? (
          <Chip label={config.label} color={config.color} size="small" />
        ) : (
          <Typography variant="body2">{params.value}</Typography>
        );
      },
    },
    {
      field: 'requestedStatus',
      headerName: 'Estado Solicitado',
      width: 150,
      renderCell: () => {
        const config = EXPENSE_ORDER_STATUS_CONFIG[ExpenseOrderStatus.AUTHORIZED];
        return <Chip label={config.label} color={config.color} size="small" variant="outlined" />;
      },
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'reason',
      headerName: 'Razón',
      width: 250,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado Solicitud',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApproveExpenseOrders ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') {
          return [];
        }

        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveOgAuth(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectOgAuth(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - ADVANCE PAYMENT APPROVALS
  // ============================================================

  const advanceColumns: GridColDef<AdvancePaymentApproval>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOrder(params.row.order.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'paymentAmount',
      headerName: 'Monto',
      width: 150,
      valueGetter: (_, row) => row.payment?.amount || '0',
      renderCell: (params) => {
        const amount = parseFloat(params.value);
        return (
          <Typography variant="body2" fontWeight={600}>
            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)}
          </Typography>
        );
      },
    },
    {
      field: 'paymentMethod',
      headerName: 'Método',
      width: 130,
      valueGetter: (_, row) => row.payment?.paymentMethod || '-',
      renderCell: (params) => {
        const label = PAYMENT_METHOD_LABELS[params.value as keyof typeof PAYMENT_METHOD_LABELS];
        return <Chip label={label || params.value} size="small" />;
      },
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'status',
      headerName: 'Estado Solicitud',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') {
          return [];
        }

        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveAdvance(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectAdvance(params.row)}
            showInMenu={false}
          />,
        ];
      },
    },
  ];

  // ============================================================
  // COLUMNAS - DISCOUNT APPROVALS
  // ============================================================

  const discountColumns: GridColDef<DiscountApproval>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOrder(params.row.order.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'discountAmount',
      headerName: 'Descuento',
      width: 150,
      valueGetter: (_, row) => row.discount?.amount || '0',
      renderCell: (params) => {
        const amount = parseFloat(params.value);
        return (
          <Typography variant="body2" fontWeight={600}>
            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)}
          </Typography>
        );
      },
    },
    {
      field: 'discountReason',
      headerName: 'Motivo',
      width: 220,
      valueGetter: (_, row) => row.discount?.reason || '-',
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'status',
      headerName: 'Estado Solicitud',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') {
          return [];
        }

        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveDiscount(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectDiscount(params.row)}
            showInMenu={false}
          />,
        ];
      },
    },
  ];

  // ============================================================
  // COLUMNAS - PAYMENT EDIT APPROVALS
  // ============================================================

  const formatCOPAmount = (v: string | number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v));

  const paymentEditColumns: GridColDef<PaymentEditApproval>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOrder(params.row.order.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'amountChange',
      headerName: 'Cambio de Monto',
      width: 220,
      valueGetter: (_, row) => (row.newAmount != null ? `${row.oldAmount}->${row.newAmount}` : ''),
      renderCell: (params) => {
        const row = params.row;
        if (row.newAmount == null) {
          return <Typography variant="body2" color="text.secondary">Sin cambio de monto</Typography>;
        }
        return (
          <Typography variant="body2" fontWeight={600}>
            {formatCOPAmount(row.oldAmount)} → {formatCOPAmount(row.newAmount)}
          </Typography>
        );
      },
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'reason',
      headerName: 'Motivo',
      width: 250,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado Solicitud',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return <Chip label={statusConfig.label} color={statusConfig.color} size="small" />;
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApprovePaymentEdits ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApprovePaymentEdit(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectPaymentEdit(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - CLIENT OWNERSHIP AUTH REQUESTS
  // ============================================================

  const ownershipColumns: GridColDef<ClientOwnershipAuthRequest>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOwnershipOrder(params.row)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitante',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'advisor',
      headerName: 'Asesor del Cliente',
      width: 200,
      valueGetter: (_, row) => getUserName(row.advisor),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveOwnership(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectOwnership(params.row)}
            showInMenu={false}
          />,
        ];
      },
    },
  ];

  // ============================================================
  // COLUMNAS - ADVISOR CHANGE
  // ============================================================

  const advisorColumns: GridColDef<AdvisorChangeRequest>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOrder(params.row.order.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitante',
      width: 180,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'currentAdvisor',
      headerName: 'Asesor Actual',
      width: 180,
      valueGetter: (_, row) => getUserName(row.currentAdvisor),
    },
    {
      field: 'requestedAdvisor',
      headerName: 'Nuevo Asesor',
      width: 180,
      valueGetter: (_, row) => getUserName(row.requestedAdvisor),
    },
    {
      field: 'reason',
      headerName: 'Motivo',
      width: 220,
      valueGetter: (_, row) => row.reason || '-',
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveAdvisor(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectAdvisor(params.row)}
            showInMenu={false}
          />,
        ];
      },
    },
  ];

  // ============================================================
  // COLUMNAS - QUOTE RESTORE
  // ============================================================

  const quoteRestoreColumns: GridColDef<QuoteRestoreRequest>[] = [
    {
      field: 'quoteNumber',
      headerName: 'Nº Cotización',
      width: 150,
      valueGetter: (_, row) => row.quote?.quoteNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => navigate(`/quotes/${params.row.quoteId}`)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'client',
      headerName: 'Cliente',
      width: 200,
      valueGetter: (_, row) => row.quote?.client?.name || '-',
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitante',
      width: 170,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'restoreToStatus',
      headerName: 'Volverá a',
      width: 130,
      valueGetter: (_, row) => QUOTE_STATUS_CONFIG[row.restoreToStatus]?.label || row.restoreToStatus,
    },
    {
      field: 'previousRejectionReason',
      headerName: 'Motivo del rechazo',
      width: 200,
      valueGetter: (_, row) => row.previousRejectionReason || '-',
    },
    {
      field: 'reason',
      headerName: 'Motivo de restaurar',
      width: 220,
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return <Chip label={statusConfig.label} color={statusConfig.color} size="small" />;
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => {
              setQuoteRestoreReviewDialog({ open: true, request: params.row, action: 'approve' });
              setQuoteRestoreReviewNotes('');
            }}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => {
              setQuoteRestoreReviewDialog({ open: true, request: params.row, action: 'reject' });
              setQuoteRestoreReviewNotes('');
            }}
            showInMenu={false}
          />,
        ];
      },
    },
  ];

  // ============================================================
  // COLUMNAS - CLIENT ADVISOR ASSIGNMENT
  // ============================================================

  const clientAdvisorColumns: GridColDef<ClientAdvisorRequest>[] = [
    {
      field: 'client',
      headerName: 'Cliente',
      width: 200,
      valueGetter: (_, row) => row.client?.name || '-',
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitante',
      width: 180,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'requestedAdvisor',
      headerName: 'Asesor a Asignar',
      width: 180,
      valueGetter: (_, row) => getUserName(row.requestedAdvisor),
    },
    {
      field: 'reason',
      headerName: 'Motivo',
      width: 220,
      valueGetter: (_, row) => row.reason || '-',
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveClientAdvisor(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectClientAdvisor(params.row)}
            showInMenu={false}
          />,
        ];
      },
    },
  ];

  // ============================================================
  // COLUMNAS - VOID REQUESTS
  // ============================================================

  const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    INCOME: 'Ingreso',
    EXPENSE: 'Egreso',
    WITHDRAWAL: 'Retiro',
    DEPOSIT: 'Depósito',
    // Solicitud sobre un pago que nunca pasó por caja.
    PAYMENT: 'Pago de orden',
  };

  const voidColumns: GridColDef<CashMovementVoidRequest>[] = [
    {
      // La solicitud apunta a un movimiento de caja o a un pago suelto (los que
      // se registran sin caja abierta o salen de saldo a favor). Sin el respaldo
      // al pago, esas filas le llegan al admin vacías y con monto $0.
      field: 'receiptNumber',
      headerName: 'Nº Recibo / OP',
      width: 150,
      valueGetter: (_, row) =>
        row.cashMovement?.receiptNumber ||
        row.payment?.order?.orderNumber ||
        '-',
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'movementType',
      headerName: 'Tipo',
      width: 120,
      valueGetter: (_, row) =>
        row.cashMovement?.movementType || (row.payment ? 'PAYMENT' : '-'),
      renderCell: (params) => (
        <Chip
          label={MOVEMENT_TYPE_LABELS[params.value] || params.value}
          size="small"
          color={params.value === 'INCOME' || params.value === 'DEPOSIT' ? 'success' : 'error'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'amount',
      headerName: 'Monto',
      width: 150,
      valueGetter: (_, row) =>
        row.cashMovement?.amount || row.payment?.amount || '0',
      renderCell: (params) => {
        const amount = parseFloat(params.value);
        return (
          <Typography variant="body2" fontWeight={600}>
            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)}
          </Typography>
        );
      },
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'voidReason',
      headerName: 'Razón de Anulación',
      width: 250,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApproveVoidRequests ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveVoid(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectVoid(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - REFUND REQUESTS
  // ============================================================

  const refundColumns: GridColDef<RefundRequest>[] = [
    {
      field: 'orderNumber',
      headerName: 'Nº Orden',
      width: 150,
      valueGetter: (_, row) => row.order?.orderNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => params.row.order && handleViewOrder(params.row.order.id)}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'refundAmount',
      headerName: 'Monto',
      width: 150,
      renderCell: (params) => {
        const amount = parseFloat(params.value);
        return (
          <Typography variant="body2" fontWeight={600}>
            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)}
          </Typography>
        );
      },
    },
    {
      field: 'paymentMethod',
      headerName: 'Método',
      width: 130,
      renderCell: (params) => (
        <Chip label={paymentMethodLabel(params.value)} size="small" />
      ),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 200,
      valueGetter: (_, row) => {
        const u = row.requestedBy;
        if (!u) return '-';
        return u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email || '-';
      },
    },
    {
      field: 'observation',
      headerName: 'Motivo',
      width: 250,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => {
        const statusConfig = STATUS_LABELS[params.value] || { label: params.value, color: 'default' as const };
        return (
          <Chip
            label={statusConfig.label}
            color={statusConfig.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'requestedAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApproveRefunds ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveRefund(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectRefund(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - AP PAYMENT AUTH REQUESTS (admin step)
  // ============================================================

  const formatCOP = (v: string | number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v));

  const apAuthColumns: GridColDef<AccountPayablePaymentAuthRequest>[] = [
    {
      field: 'apNumber',
      headerName: 'Nº CxP',
      width: 130,
      valueGetter: (_, row) => row.accountPayable?.apNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => handleViewAccountPayable(params.row.accountPayableId, 'admin')}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'amount',
      headerName: 'Monto Pago',
      width: 140,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>{formatCOP(params.value)}</Typography>
      ),
    },
    {
      field: 'paymentMethod',
      headerName: 'Método',
      width: 160,
      valueGetter: (_, row) => (PAYMENT_METHOD_LABELS as Record<string, string>)[row.paymentMethod] ?? row.paymentMethod,
    },
    {
      field: 'paymentDate',
      headerName: 'Fecha Pago',
      width: 130,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 180,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'reason',
      headerName: 'Razón',
      width: 220,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>{params.value || '-'}</Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 140,
      renderCell: (params) => {
        const cfg = AP_PAYMENT_AUTH_STATUS_CONFIG[params.value as keyof typeof AP_PAYMENT_AUTH_STATUS_CONFIG];
        return cfg ? <Chip label={cfg.label} color={cfg.color} size="small" /> : <Chip label={params.value} size="small" />;
      },
    },
    {
      field: 'createdAt',
      headerName: 'Fecha Solicitud',
      width: 150,
      valueFormatter: (value) => formatDateTime(value),
    },
    ...(canApproveAccountsPayable ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'PENDING') return [];
        return [
          <GridActionsCellItem
            icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
            label="Aprobar"
            onClick={() => handleApproveApAuth(params.row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CancelIcon sx={{ color: 'error.main' }} />}
            label="Rechazar"
            onClick={() => handleRejectApAuth(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // COLUMNAS - AP PAYMENT AUTH REQUESTS (caja step)
  // ============================================================

  const cajaApColumns: GridColDef<AccountPayablePaymentAuthRequest>[] = [
    {
      field: 'apNumber',
      headerName: 'Nº CxP',
      width: 130,
      valueGetter: (_, row) => row.accountPayable?.apNumber || '-',
      renderCell: (params) => (
        <Box
          sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}
          onClick={() => handleViewAccountPayable(params.row.accountPayableId, 'caja')}
        >
          {params.value}
        </Box>
      ),
    },
    {
      field: 'amount',
      headerName: 'Monto Pago',
      width: 140,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>{formatCOP(params.value)}</Typography>
      ),
    },
    {
      field: 'paymentMethod',
      headerName: 'Método',
      width: 160,
      valueGetter: (_, row) => (PAYMENT_METHOD_LABELS as Record<string, string>)[row.paymentMethod] ?? row.paymentMethod,
    },
    {
      field: 'paymentDate',
      headerName: 'Fecha Pago',
      width: 130,
      valueFormatter: (value) => formatDateTime(value),
    },
    {
      field: 'requestedBy',
      headerName: 'Solicitado por',
      width: 180,
      valueGetter: (_, row) => getUserName(row.requestedBy),
    },
    {
      field: 'adminNotes',
      headerName: 'Notas Admin',
      width: 200,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || ''}>{params.value || '-'}</Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 140,
      renderCell: (params) => {
        const cfg = AP_PAYMENT_AUTH_STATUS_CONFIG[params.value as keyof typeof AP_PAYMENT_AUTH_STATUS_CONFIG];
        return cfg ? <Chip label={cfg.label} color={cfg.color} size="small" /> : <Chip label={params.value} size="small" />;
      },
    },
    ...(canCajaAuthorizeAp ? [{
      field: 'actions',
      type: 'actions' as const,
      headerName: 'Acciones',
      width: 120,
      getActions: (params: any) => {
        if (params.row.status !== 'ADMIN_APPROVED') return [];
        return [
          <GridActionsCellItem
            icon={<PaymentIcon sx={{ color: 'success.main' }} />}
            label="Registrar Pago"
            onClick={() => setCajaApRequest(params.row)}
            showInMenu={false}
          />,
        ];
      },
    }] : []),
  ];

  // ============================================================
  // RENDER
  // ============================================================

  const statusCount = statusRequests?.length || 0;
  const editCount = editRequests?.length || 0;
  const ogAuthCount = ogAuthRequests?.length || 0;
  const advanceCount = advancePaymentRequests?.length || 0;
  const discountCount = discountRequests?.length || 0;
  const paymentEditCount = paymentEditRequests?.length || 0;
  const ownershipCount = ownershipRequests?.length || 0;
  const advisorCount = advisorRequests?.length || 0;
  const clientAdvisorCount = clientAdvisorRequests?.length || 0;
  const quoteRestoreCount = quoteRestoreRequests?.length || 0;
  const voidCount = voidRequests?.length || 0;
  const refundCount = refundRequests?.length || 0;
  const apAuthCount = apAuthRequests?.length || 0;
  const cajaApCount = cajaApRequests?.length || 0;
  const reversalCount = reversalRequests?.length || 0;

  return (
    <Box>
      <PageHeader
        title="Solicitudes"
        subtitle={viewMode === 'pending' ? 'Gestionar solicitudes pendientes de aprobación' : 'Historial de solicitudes procesadas'}
        icon={<PendingActionsIcon />}
        action={
          <ToggleButtonGroup
            color="primary"
            value={viewMode}
            exclusive
            onChange={(_, newMode) => {
              if (newMode !== null) {
                setViewMode(newMode);
              }
            }}
            aria-label="View Mode"
            size="small"
          >
            <ToggleButton value="pending">
              Pendientes
            </ToggleButton>
            <ToggleButton value="history">
              Historial
            </ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* ── Navegación vertical ── */}
        <Paper sx={{ width: navWidth, flexShrink: 0 }}>
          <Typography
            variant="overline"
            sx={{ px: 2, pt: 2, pb: 0.5, display: 'block', color: 'text.secondary', fontSize: '0.65rem', letterSpacing: '0.08em' }}
          >
            Órdenes
          </Typography>
          <List dense disablePadding>
            {canApproveOrders && (
              <ListItemButton selected={tabValue === 'status'} onClick={() => setTabValue('status')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><SwapHorizIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Cambio de Estado" primaryTypographyProps={{ variant: 'body2' }} />
                {statusCount > 0 && <Badge badgeContent={statusCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveOrders && (
              <ListItemButton selected={tabValue === 'edit'} onClick={() => setTabValue('edit')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><EditNoteIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Edición de Orden" primaryTypographyProps={{ variant: 'body2' }} />
                {editCount > 0 && <Badge badgeContent={editCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveAdvancePayments && (
              <ListItemButton selected={tabValue === 'advance'} onClick={() => setTabValue('advance')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><PaymentIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Anticipo OP" primaryTypographyProps={{ variant: 'body2' }} />
                {advanceCount > 0 && <Badge badgeContent={advanceCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveDiscounts && (
              <ListItemButton selected={tabValue === 'discount'} onClick={() => setTabValue('discount')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><PercentIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Descuentos" primaryTypographyProps={{ variant: 'body2' }} />
                {discountCount > 0 && <Badge badgeContent={discountCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApprovePaymentEdits && (
              <ListItemButton selected={tabValue === 'payment-edit'} onClick={() => setTabValue('payment-edit')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><ReceiptLongIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Edición de Pago" primaryTypographyProps={{ variant: 'body2' }} />
                {paymentEditCount > 0 && <Badge badgeContent={paymentEditCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveClientOwnership && (
              <ListItemButton selected={tabValue === 'ownership'} onClick={() => setTabValue('ownership')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><BadgeIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Propiedad Cliente" primaryTypographyProps={{ variant: 'body2' }} />
                {ownershipCount > 0 && <Badge badgeContent={ownershipCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveAdvisorChange && (
              <ListItemButton selected={tabValue === 'advisor'} onClick={() => setTabValue('advisor')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><ManageAccountsIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Cambio de Asesor" primaryTypographyProps={{ variant: 'body2' }} />
                {advisorCount > 0 && <Badge badgeContent={advisorCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveClientAdvisor && (
              <ListItemButton selected={tabValue === 'client-advisor'} onClick={() => setTabValue('client-advisor')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><ManageAccountsIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Asignar Asesor a Cliente" primaryTypographyProps={{ variant: 'body2' }} />
                {clientAdvisorCount > 0 && <Badge badgeContent={clientAdvisorCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveQuoteRestore && (
              <ListItemButton selected={tabValue === 'quote-restore'} onClick={() => setTabValue('quote-restore')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><RestoreIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Restaurar Cotización" primaryTypographyProps={{ variant: 'body2' }} />
                {quoteRestoreCount > 0 && <Badge badgeContent={quoteRestoreCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
          </List>

          <Divider sx={{ my: 1 }} />
          <Typography
            variant="overline"
            sx={{ px: 2, pb: 0.5, display: 'block', color: 'text.secondary', fontSize: '0.65rem', letterSpacing: '0.08em' }}
          >
            Caja
          </Typography>
          <List dense disablePadding>
            {canApproveVoidRequests && (
              <ListItemButton selected={tabValue === 'void'} onClick={() => setTabValue('void')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><BlockIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Anulación de Caja" primaryTypographyProps={{ variant: 'body2' }} />
                {voidCount > 0 && <Badge badgeContent={voidCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveRefunds && (
              <ListItemButton selected={tabValue === 'refund'} onClick={() => setTabValue('refund')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><CurrencyExchangeIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Devoluciones" primaryTypographyProps={{ variant: 'body2' }} />
                {refundCount > 0 && <Badge badgeContent={refundCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
          </List>

          <Divider sx={{ my: 1 }} />
          <Typography
            variant="overline"
            sx={{ px: 2, pb: 0.5, display: 'block', color: 'text.secondary', fontSize: '0.65rem', letterSpacing: '0.08em' }}
          >
            Cuentas por Pagar
          </Typography>
          <List dense disablePadding sx={{ pb: 1 }}>
            {canApproveExpenseOrders && (
              <ListItemButton selected={tabValue === 'og'} onClick={() => setTabValue('og')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><ReceiptLongIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Autorización OG" primaryTypographyProps={{ variant: 'body2' }} />
                {ogAuthCount > 0 && <Badge badgeContent={ogAuthCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canApproveAccountsPayable && (
              <ListItemButton selected={tabValue === 'ap'} onClick={() => setTabValue('ap')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><PaymentIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Autorización CxP" primaryTypographyProps={{ variant: 'body2' }} />
                {apAuthCount > 0 && <Badge badgeContent={apAuthCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canCajaAuthorizeAp && (
              <ListItemButton selected={tabValue === 'caja-ap'} onClick={() => setTabValue('caja-ap')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><PaymentIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Caja CxP" primaryTypographyProps={{ variant: 'body2' }} />
                {cajaApCount > 0 && <Badge badgeContent={cajaApCount} color="warning" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
            {canGerenciaApproveReversal && (
              <ListItemButton selected={tabValue === 'ap-reversal'} onClick={() => setTabValue('ap-reversal')} sx={{ borderRadius: 1, mx: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><UndoIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Reversiones CP" primaryTypographyProps={{ variant: 'body2' }} />
                {reversalCount > 0 && <Badge badgeContent={reversalCount} color="error" sx={{ mr: 1 }} />}
              </ListItemButton>
            )}
          </List>
        </Paper>

        {/* ── Handle de redimensión ── */}
        <Box
          onMouseDown={startResize}
          sx={{
            width: 6,
            flexShrink: 0,
            alignSelf: 'stretch',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover > div, &:active > div': { opacity: 1 },
          }}
        >
          <Box sx={{
            width: 2,
            height: '100%',
            borderRadius: 1,
            bgcolor: 'divider',
            opacity: 0,
            transition: 'opacity 0.15s',
          }} />
        </Box>

        {/* ── Contenido ── */}
        <Paper sx={{ flex: 1, p: 3, minWidth: 0 }}>
          {tabValue === 'status' && canApproveOrders && (
            <DataTable rows={statusRequests || []} columns={statusColumns} loading={statusLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'edit' && canApproveOrders && (
            <DataTable rows={editRequests || []} columns={editColumns} loading={editLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'og' && canApproveExpenseOrders && (
            <DataTable rows={ogAuthRequests || []} columns={ogAuthColumns} loading={ogAuthLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'advance' && canApproveAdvancePayments && (
            <DataTable rows={advancePaymentRequests || []} columns={advanceColumns} loading={advanceLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'discount' && canApproveDiscounts && (
            <DataTable rows={discountRequests || []} columns={discountColumns} loading={discountLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'payment-edit' && canApprovePaymentEdits && (
            <DataTable rows={paymentEditRequests || []} columns={paymentEditColumns} loading={paymentEditLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'ownership' && canApproveClientOwnership && (
            <DataTable rows={ownershipRequests || []} columns={ownershipColumns} loading={ownershipLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'advisor' && canApproveAdvisorChange && (
            <DataTable rows={advisorRequests || []} columns={advisorColumns} loading={advisorLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'quote-restore' && canApproveQuoteRestore && (
            <DataTable rows={quoteRestoreRequests || []} columns={quoteRestoreColumns} loading={quoteRestoreLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'client-advisor' && canApproveClientAdvisor && (
            <DataTable rows={clientAdvisorRequests || []} columns={clientAdvisorColumns} loading={clientAdvisorLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'void' && canApproveVoidRequests && (
            <DataTable rows={voidRequests || []} columns={voidColumns} loading={voidLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'refund' && canApproveRefunds && (
            <DataTable rows={refundRequests || []} columns={refundColumns} loading={refundLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'ap' && canApproveAccountsPayable && (
            <DataTable rows={apAuthRequests || []} columns={apAuthColumns} loading={apAuthLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'caja-ap' && canCajaAuthorizeAp && (
            <DataTable rows={cajaApRequests || []} columns={cajaApColumns} loading={cajaApLoading} getRowId={(row) => row.id} density="compact" pageSize={20} pageSizeOptions={[20, 50, 100]} />
          )}
          {tabValue === 'ap-reversal' && canGerenciaApproveReversal && (
            <DataTable
              rows={reversalRequests || []}
              columns={[
                { field: 'createdAt', headerName: 'Fecha', width: 160, renderCell: (p) => formatDateTime(p.value) },
                {
                  field: 'apNumber', headerName: 'CP', width: 110,
                  valueGetter: (_v: any, row: AccountPayablePaymentReversalRequest) => row.paymentAuthRequest?.accountPayable?.apNumber ?? '—',
                },
                {
                  field: 'amount', headerName: 'Monto', width: 130,
                  valueGetter: (_v: any, row: AccountPayablePaymentReversalRequest) => row.paymentAuthRequest?.amount ?? '0',
                  renderCell: (p: any) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(p.value)),
                },
                { field: 'reason', headerName: 'Motivo', flex: 1, minWidth: 180 },
                {
                  field: 'requestedBy', headerName: 'Solicitado por', width: 160,
                  valueGetter: (_v: any, row: AccountPayablePaymentReversalRequest) => getUserName(row.requestedBy as any),
                },
                {
                  field: 'status', headerName: 'Estado', width: 160,
                  renderCell: (p: any) => {
                    const cfg = AP_REVERSAL_STATUS_CONFIG[p.value as keyof typeof AP_REVERSAL_STATUS_CONFIG];
                    return cfg ? <Chip label={cfg.label} color={cfg.color} size="small" /> : <Chip label={p.value} size="small" />;
                  },
                },
                {
                  field: 'actions', type: 'actions' as const, headerName: 'Acciones', width: 140,
                  getActions: (params: any) => {
                    if (params.row.status !== 'PENDING_GERENCIA') return [];
                    return [
                      <GridActionsCellItem
                        icon={<CheckCircleIcon sx={{ color: 'success.main' }} />}
                        label="Aprobar"
                        onClick={() => setReversalReviewDialog({ open: true, request: params.row, action: 'approve' })}
                        showInMenu={false}
                      />,
                      <GridActionsCellItem
                        icon={<CancelIcon sx={{ color: 'error.main' }} />}
                        label="Rechazar"
                        onClick={() => setReversalReviewDialog({ open: true, request: params.row, action: 'reject' })}
                        showInMenu={false}
                      />,
                    ];
                  },
                },
              ]}
              loading={reversalLoading}
              getRowId={(row) => row.id}
              density="compact"
              pageSize={20}
              pageSizeOptions={[20, 50, 100]}
            />
          )}
        </Paper>
      </Box>

      {/* Dialog: Revisión de Cambio de Estado */}
      <Dialog open={reviewDialog.open} onClose={handleCloseReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {reviewDialog.action === 'approve' ? 'Aprobar Solicitud' : 'Rechazar Solicitud'}
        </DialogTitle>
        <DialogContent>
          {reviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {reviewDialog.request.order?.orderNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Cambio:</strong>{' '}
                {ORDER_STATUS_CONFIG[reviewDialog.request.currentStatus as OrderStatus]?.label} →{' '}
                {ORDER_STATUS_CONFIG[reviewDialog.request.requestedStatus as OrderStatus]?.label}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(reviewDialog.request.requestedBy)}
              </Typography>
              {reviewDialog.request.reason && (
                <Typography variant="body2">
                  <strong>Razón:</strong> {reviewDialog.request.reason}
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={reviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder={
              reviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la solicitud...'
            }
            required={reviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmReview}
            variant="contained"
            color={reviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveMutation.isPending ||
              rejectMutation.isPending ||
              (reviewDialog.action === 'reject' && !reviewNotes.trim())
            }
          >
            {reviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Edición de Orden */}
      <Dialog open={editReviewDialog.open} onClose={handleCloseEditReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editReviewDialog.action === 'approve' ? 'Aprobar Solicitud de Edición' : 'Rechazar Solicitud de Edición'}
        </DialogTitle>
        <DialogContent>
          {editReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {editReviewDialog.request.order?.orderNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(editReviewDialog.request.requestedBy)}
              </Typography>
              {editReviewDialog.request.observations && (
                <Typography variant="body2">
                  <strong>Observaciones:</strong> {editReviewDialog.request.observations}
                </Typography>
              )}
              {editReviewDialog.action === 'approve' && (
                <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
                  Al aprobar, el usuario tendrá 5 minutos para realizar cambios en la orden.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={editReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={editReviewNotes}
            onChange={(e) => setEditReviewNotes(e.target.value)}
            placeholder={
              editReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la solicitud...'
            }
            required={editReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmEditReview}
            variant="contained"
            color={editReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveEditMutation.isPending ||
              rejectEditMutation.isPending ||
              (editReviewDialog.action === 'reject' && !editReviewNotes.trim())
            }
          >
            {editReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Anticipo OP */}
      <Dialog open={discountReviewDialog.open} onClose={handleCloseDiscountReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {discountReviewDialog.action === 'approve'
            ? 'Aprobar Descuento'
            : 'Rechazar Descuento'}
        </DialogTitle>
        <DialogContent>
          {discountReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {discountReviewDialog.request.order?.orderNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Descuento:</strong>{' '}
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                  parseFloat(discountReviewDialog.request.discount?.amount || '0')
                )}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Motivo:</strong>{' '}
                {discountReviewDialog.request.discount?.reason || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(discountReviewDialog.request.requestedBy)}
              </Typography>
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={discountReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={discountReviewNotes}
            onChange={(e) => setDiscountReviewNotes(e.target.value)}
            placeholder={
              discountReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza el descuento...'
            }
            required={discountReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDiscountReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmDiscountReview}
            variant="contained"
            color={discountReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveDiscountMutation.isPending ||
              rejectDiscountMutation.isPending ||
              (discountReviewDialog.action === 'reject' && !discountReviewNotes.trim())
            }
          >
            {discountReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={advanceReviewDialog.open} onClose={handleCloseAdvanceReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {advanceReviewDialog.action === 'approve'
            ? 'Aprobar Anticipo de Orden'
            : 'Rechazar Anticipo de Orden'}
        </DialogTitle>
        <DialogContent>
          {advanceReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {advanceReviewDialog.request.order?.orderNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto:</strong>{' '}
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                  parseFloat(advanceReviewDialog.request.payment?.amount || '0')
                )}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Método:</strong>{' '}
                {PAYMENT_METHOD_LABELS[advanceReviewDialog.request.payment?.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || advanceReviewDialog.request.payment?.paymentMethod}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(advanceReviewDialog.request.requestedBy)}
              </Typography>
              {advanceReviewDialog.action === 'reject' && (
                <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
                  Al rechazar, el pago será eliminado y el saldo de la orden será revertido.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={advanceReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={advanceReviewNotes}
            onChange={(e) => setAdvanceReviewNotes(e.target.value)}
            placeholder={
              advanceReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza el anticipo...'
            }
            required={advanceReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAdvanceReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmAdvanceReview}
            variant="contained"
            color={advanceReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveAdvanceMutation.isPending ||
              rejectAdvanceMutation.isPending ||
              (advanceReviewDialog.action === 'reject' && !advanceReviewNotes.trim())
            }
          >
            {advanceReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Edición de Pago */}
      <Dialog open={paymentEditReviewDialog.open} onClose={handleClosePaymentEditReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {paymentEditReviewDialog.action === 'approve'
            ? 'Aprobar Edición de Pago'
            : 'Rechazar Edición de Pago'}
        </DialogTitle>
        <DialogContent>
          {paymentEditReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {paymentEditReviewDialog.request.order?.orderNumber || '-'}
              </Typography>
              {paymentEditReviewDialog.request.newAmount != null && (
                <Typography variant="body2" gutterBottom>
                  <strong>Monto:</strong>{' '}
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                    parseFloat(paymentEditReviewDialog.request.oldAmount || '0')
                  )}{' '}→{' '}
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                    parseFloat(paymentEditReviewDialog.request.newAmount || '0')
                  )}
                </Typography>
              )}
              {paymentEditReviewDialog.request.newReceiptFileId && (
                <Typography variant="body2" gutterBottom color="info.main">
                  Incluye un nuevo comprobante que reemplazará al actual al aprobar.
                </Typography>
              )}
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(paymentEditReviewDialog.request.requestedBy)}
              </Typography>
              {paymentEditReviewDialog.request.reason && (
                <Typography variant="body2">
                  <strong>Motivo:</strong> {paymentEditReviewDialog.request.reason}
                </Typography>
              )}
              {paymentEditReviewDialog.action === 'approve' && (
                <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
                  Al aprobar, el pago se actualizará y el saldo de la orden se recalculará.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={paymentEditReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={paymentEditReviewNotes}
            onChange={(e) => setPaymentEditReviewNotes(e.target.value)}
            placeholder={
              paymentEditReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la edición...'
            }
            required={paymentEditReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePaymentEditReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmPaymentEditReview}
            variant="contained"
            color={paymentEditReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approvePaymentEditMutation.isPending ||
              rejectPaymentEditMutation.isPending ||
              (paymentEditReviewDialog.action === 'reject' && !paymentEditReviewNotes.trim())
            }
          >
            {paymentEditReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Autorización de OG */}
      <Dialog open={ogAuthReviewDialog.open} onClose={handleCloseOgAuthReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {ogAuthReviewDialog.action === 'approve'
            ? 'Aprobar Solicitud de Autorización de OG'
            : 'Rechazar Solicitud de Autorización de OG'}
        </DialogTitle>
        <DialogContent>
          {ogAuthReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>OG:</strong> {ogAuthReviewDialog.request.expenseOrder?.ogNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Estado solicitado:</strong> Autorizada
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(ogAuthReviewDialog.request.requestedBy)}
              </Typography>
              {ogAuthReviewDialog.request.reason && (
                <Typography variant="body2">
                  <strong>Razón:</strong> {ogAuthReviewDialog.request.reason}
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={ogAuthReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={ogAuthReviewNotes}
            onChange={(e) => setOgAuthReviewNotes(e.target.value)}
            placeholder={
              ogAuthReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la solicitud...'
            }
            required={ogAuthReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseOgAuthReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmOgAuthReview}
            variant="contained"
            color={ogAuthReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveOgAuthMutation.isPending ||
              rejectOgAuthMutation.isPending ||
              (ogAuthReviewDialog.action === 'reject' && !ogAuthReviewNotes.trim())
            }
          >
            {ogAuthReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Autorización de Propiedad de Cliente */}
      <Dialog open={ownershipReviewDialog.open} onClose={handleCloseOwnershipReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {ownershipReviewDialog.action === 'approve'
            ? 'Aprobar Autorización de Propiedad de Cliente'
            : 'Rechazar Autorización de Propiedad de Cliente'}
        </DialogTitle>
        <DialogContent>
          {ownershipReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {ownershipReviewDialog.request.order?.orderNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(ownershipReviewDialog.request.requestedBy)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Asesor del cliente:</strong> {getUserName(ownershipReviewDialog.request.advisor)}
              </Typography>
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={4}
            label={ownershipReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={ownershipReviewNotes}
            onChange={(e) => setOwnershipReviewNotes(e.target.value)}
            required={ownershipReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseOwnershipReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmOwnershipReview}
            variant="contained"
            color={ownershipReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveOwnershipMutation.isPending ||
              rejectOwnershipMutation.isPending ||
              (ownershipReviewDialog.action === 'reject' && !ownershipReviewNotes.trim())
            }
          >
            {ownershipReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Cambio de Asesor */}
      <Dialog open={advisorReviewDialog.open} onClose={handleCloseAdvisorReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {advisorReviewDialog.action === 'approve'
            ? 'Aprobar Cambio de Asesor'
            : 'Rechazar Cambio de Asesor'}
        </DialogTitle>
        <DialogContent>
          {advisorReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {advisorReviewDialog.request.order?.orderNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(advisorReviewDialog.request.requestedBy)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Asesor actual:</strong> {getUserName(advisorReviewDialog.request.currentAdvisor)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Nuevo asesor:</strong> {getUserName(advisorReviewDialog.request.requestedAdvisor)}
              </Typography>
              {advisorReviewDialog.request.reason && (
                <Typography variant="body2" gutterBottom>
                  <strong>Motivo:</strong> {advisorReviewDialog.request.reason}
                </Typography>
              )}
              {advisorReviewDialog.action === 'approve' && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Al aprobar, la orden quedará reasignada al nuevo asesor.
                </Alert>
              )}
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={4}
            label={advisorReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={advisorReviewNotes}
            onChange={(e) => setAdvisorReviewNotes(e.target.value)}
            required={advisorReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAdvisorReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmAdvisorReview}
            variant="contained"
            color={advisorReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveAdvisorMutation.isPending ||
              rejectAdvisorMutation.isPending ||
              (advisorReviewDialog.action === 'reject' && !advisorReviewNotes.trim())
            }
          >
            {advisorReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Restauración de Cotización */}
      <Dialog
        open={quoteRestoreReviewDialog.open}
        onClose={() => {
          if (!approveQuoteRestoreMutation.isPending && !rejectQuoteRestoreMutation.isPending) {
            handleCloseQuoteRestoreReviewDialog();
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {quoteRestoreReviewDialog.action === 'approve'
            ? 'Aprobar Restauración de Cotización'
            : 'Rechazar Restauración de Cotización'}
        </DialogTitle>
        <DialogContent>
          {quoteRestoreReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Cotización:</strong> {quoteRestoreReviewDialog.request.quote?.quoteNumber}
                {quoteRestoreReviewDialog.request.quote?.client?.name
                  ? ` · ${quoteRestoreReviewDialog.request.quote.client.name}`
                  : ''}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(quoteRestoreReviewDialog.request.requestedBy)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Motivo del rechazo:</strong> {quoteRestoreReviewDialog.request.previousRejectionReason || 'Sin motivo registrado'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Motivo para restaurar:</strong> {quoteRestoreReviewDialog.request.reason}
              </Typography>
              {quoteRestoreReviewDialog.action === 'approve' && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Al aprobar, la cotización volverá al estado{' '}
                  <strong>{QUOTE_STATUS_CONFIG[quoteRestoreReviewDialog.request.restoreToStatus]?.label}</strong>{' '}
                  y se borrará el motivo del rechazo.
                </Alert>
              )}
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={4}
            label={quoteRestoreReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={quoteRestoreReviewNotes}
            onChange={(e) => setQuoteRestoreReviewNotes(e.target.value)}
            required={quoteRestoreReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseQuoteRestoreReviewDialog}
            disabled={approveQuoteRestoreMutation.isPending || rejectQuoteRestoreMutation.isPending}
          >
            Cancelar
          </Button>
          <LoadingButton
            onClick={handleConfirmQuoteRestoreReview}
            variant="contained"
            color={quoteRestoreReviewDialog.action === 'approve' ? 'success' : 'error'}
            loading={approveQuoteRestoreMutation.isPending || rejectQuoteRestoreMutation.isPending}
            disabled={quoteRestoreReviewDialog.action === 'reject' && !quoteRestoreReviewNotes.trim()}
          >
            {quoteRestoreReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </LoadingButton>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Asignación de Asesor a Cliente */}
      <Dialog open={clientAdvisorReviewDialog.open} onClose={handleCloseClientAdvisorReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {clientAdvisorReviewDialog.action === 'approve'
            ? 'Aprobar Asignación de Asesor'
            : 'Rechazar Asignación de Asesor'}
        </DialogTitle>
        <DialogContent>
          {clientAdvisorReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Cliente:</strong> {clientAdvisorReviewDialog.request.client?.name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(clientAdvisorReviewDialog.request.requestedBy)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Asesor a asignar:</strong> {getUserName(clientAdvisorReviewDialog.request.requestedAdvisor)}
              </Typography>
              {clientAdvisorReviewDialog.request.reason && (
                <Typography variant="body2" gutterBottom>
                  <strong>Motivo:</strong> {clientAdvisorReviewDialog.request.reason}
                </Typography>
              )}
              {clientAdvisorReviewDialog.action === 'approve' && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Al aprobar, el asesor quedará asignado como co-dueño del cliente.
                </Alert>
              )}
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={4}
            label={clientAdvisorReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={clientAdvisorReviewNotes}
            onChange={(e) => setClientAdvisorReviewNotes(e.target.value)}
            required={clientAdvisorReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseClientAdvisorReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmClientAdvisorReview}
            variant="contained"
            color={clientAdvisorReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveClientAdvisorMutation.isPending ||
              rejectClientAdvisorMutation.isPending ||
              (clientAdvisorReviewDialog.action === 'reject' && !clientAdvisorReviewNotes.trim())
            }
          >
            {clientAdvisorReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión de Anulación de Movimiento de Caja */}
      <Dialog open={voidReviewDialog.open} onClose={handleCloseVoidReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {voidReviewDialog.action === 'approve'
            ? 'Aprobar Anulación de Movimiento'
            : 'Rechazar Anulación de Movimiento'}
        </DialogTitle>
        <DialogContent>
          {voidReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              {/* La solicitud puede venir de un movimiento de caja o de un pago
                  suelto; sin el respaldo el admin decidiría a ciegas. */}
              <Typography variant="body2" gutterBottom>
                <strong>
                  {voidReviewDialog.request.cashMovement ? 'Recibo:' : 'Orden:'}
                </strong>{' '}
                {voidReviewDialog.request.cashMovement?.receiptNumber ||
                  voidReviewDialog.request.payment?.order?.orderNumber ||
                  '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Tipo:</strong>{' '}
                {voidReviewDialog.request.cashMovement
                  ? MOVEMENT_TYPE_LABELS[
                      voidReviewDialog.request.cashMovement.movementType || ''
                    ] || voidReviewDialog.request.cashMovement.movementType
                  : 'Pago de orden (sin movimiento de caja)'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto:</strong>{' '}
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                  parseFloat(
                    voidReviewDialog.request.cashMovement?.amount ||
                      voidReviewDialog.request.payment?.amount ||
                      '0'
                  )
                )}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(voidReviewDialog.request.requestedBy)}
              </Typography>
              <Typography variant="body2">
                <strong>Razón de anulación:</strong> {voidReviewDialog.request.voidReason}
              </Typography>
              {voidReviewDialog.action === 'approve' && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  {voidReviewDialog.request.cashMovement
                    ? 'Al aprobar, el movimiento será anulado y los saldos de la sesión serán actualizados.'
                    : 'Al aprobar, el pago quedará anulado y el saldo de la orden se recalculará. Este pago no pasó por caja, así que no hay arqueo que revertir.'}
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={voidReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={voidReviewNotes}
            onChange={(e) => setVoidReviewNotes(e.target.value)}
            placeholder={
              voidReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la anulación...'
            }
            required={voidReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseVoidReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmVoidReview}
            variant="contained"
            color={voidReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveVoidMutation.isPending ||
              rejectVoidMutation.isPending ||
              (voidReviewDialog.action === 'reject' && !voidReviewNotes.trim())
            }
          >
            {voidReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisión admin de solicitud de pago CxP */}
      <Dialog open={apAuthReviewDialog.open} onClose={handleCloseApAuthReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {apAuthReviewDialog.action === 'approve'
            ? 'Aprobar solicitud de pago'
            : 'Rechazar solicitud de pago'}
        </DialogTitle>
        <DialogContent>
          {apAuthReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>CxP:</strong> {apAuthReviewDialog.request.accountPayable?.apNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto:</strong>{' '}
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(apAuthReviewDialog.request.amount))}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Método:</strong> {(PAYMENT_METHOD_LABELS as Record<string, string>)[apAuthReviewDialog.request.paymentMethod] ?? apAuthReviewDialog.request.paymentMethod}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(apAuthReviewDialog.request.requestedBy)}
              </Typography>
              {apAuthReviewDialog.request.reason && (
                <Typography variant="body2" gutterBottom>
                  <strong>Justificación:</strong> {apAuthReviewDialog.request.reason}
                </Typography>
              )}
              {apAuthReviewDialog.action === 'approve' && (
                <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
                  Al aprobar, Caja recibirá una notificación para completar el pago.
                </Typography>
              )}
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Notas (opcional)"
            value={apAuthReviewNotes}
            onChange={(e) => setApAuthReviewNotes(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseApAuthReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmApAuthReview}
            variant="contained"
            color={apAuthReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={approveApAuthMutation.isPending || rejectApAuthMutation.isPending}
          >
            {apAuthReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Caja aprueba pago CxP */}
      {cajaApRequest && (
        <CajaApprovePaymentDialog
          open={!!cajaApRequest}
          onClose={() => setCajaApRequest(null)}
          request={cajaApRequest}
          onApprove={async () => { await cajaApApproveMutation.mutateAsync(cajaApRequest.id); }}
          onReject={async (reason) => { await cajaApRejectMutation.mutateAsync({ id: cajaApRequest.id, reason }); }}
          loading={cajaApApproveMutation.isPending || cajaApRejectMutation.isPending}
        />
      )}

      {/* Dialog: Revisión de Devolución */}
      <Dialog open={refundReviewDialog.open} onClose={handleCloseRefundReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {refundReviewDialog.action === 'approve'
            ? 'Aprobar Devolución'
            : 'Rechazar Devolución'}
        </DialogTitle>
        <DialogContent>
          {refundReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Orden:</strong> {refundReviewDialog.request.order?.orderNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto a devolver:</strong>{' '}
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                  parseFloat(refundReviewDialog.request.refundAmount || '0')
                )}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Método:</strong>{' '}
                {paymentMethodLabel(refundReviewDialog.request.paymentMethod)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong>{' '}
                {refundReviewDialog.request.requestedBy
                  ? (refundReviewDialog.request.requestedBy.firstName && refundReviewDialog.request.requestedBy.lastName
                    ? `${refundReviewDialog.request.requestedBy.firstName} ${refundReviewDialog.request.requestedBy.lastName}`
                    : refundReviewDialog.request.requestedBy.email || '-')
                  : '-'}
              </Typography>
              <Typography variant="body2">
                <strong>Motivo:</strong> {refundReviewDialog.request.observation}
              </Typography>
              {refundReviewDialog.action === 'approve' && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  Al aprobar, se creará un egreso en la caja y se ajustará el saldo de la orden.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={refundReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Razón del rechazo *'}
            value={refundReviewNotes}
            onChange={(e) => setRefundReviewNotes(e.target.value)}
            placeholder={
              refundReviewDialog.action === 'approve'
                ? 'Agregue notas adicionales...'
                : 'Explique por qué se rechaza la devolución...'
            }
            required={refundReviewDialog.action === 'reject'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRefundReviewDialog}>Cancelar</Button>
          <Button
            onClick={handleConfirmRefundReview}
            variant="contained"
            color={refundReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={
              approveRefundMutation.isPending ||
              rejectRefundMutation.isPending ||
              (refundReviewDialog.action === 'reject' && !refundReviewNotes.trim())
            }
          >
            {refundReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: Revisión de Reversión de Pago CP */}
      <Dialog
        open={reversalReviewDialog.open}
        onClose={() => { setReversalReviewDialog({ open: false, request: null, action: null }); setReversalReviewNotes(''); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {reversalReviewDialog.action === 'approve' ? 'Aprobar Reversión de Pago' : 'Rechazar Reversión de Pago'}
        </DialogTitle>
        <DialogContent>
          {reversalReviewDialog.request && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>CP:</strong> {reversalReviewDialog.request.paymentAuthRequest?.accountPayable?.apNumber ?? '—'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Monto a revertir:</strong>{' '}
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
                  Number(reversalReviewDialog.request.paymentAuthRequest?.amount ?? '0')
                )}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Motivo:</strong> {reversalReviewDialog.request.reason}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Solicitado por:</strong> {getUserName(reversalReviewDialog.request.requestedBy as any)}
              </Typography>
              {reversalReviewDialog.action === 'approve' && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  Al aprobar, Caja recibirá una notificación para confirmar y ejecutar la reversión.
                </Typography>
              )}
            </Box>
          )}
          <TextField
            fullWidth multiline rows={3}
            label={reversalReviewDialog.action === 'approve' ? 'Notas (opcional)' : 'Motivo del rechazo (opcional)'}
            value={reversalReviewNotes}
            onChange={(e) => setReversalReviewNotes(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setReversalReviewDialog({ open: false, request: null, action: null }); setReversalReviewNotes(''); }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={reversalReviewDialog.action === 'approve' ? 'success' : 'error'}
            disabled={reversalGerenciaApproveMutation.isPending || reversalGerenciaRejectMutation.isPending}
            onClick={() => {
              if (!reversalReviewDialog.request) return;
              if (reversalReviewDialog.action === 'approve') {
                reversalGerenciaApproveMutation.mutate(reversalReviewDialog.request.id);
              } else {
                reversalGerenciaRejectMutation.mutate({ id: reversalReviewDialog.request.id, notes: reversalReviewNotes || undefined });
              }
            }}
          >
            {reversalReviewDialog.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StatusChangeRequestsPage;
