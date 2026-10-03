import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LogoutIcon from '@mui/icons-material/Logout';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import LockIcon from '@mui/icons-material/Lock';
import BlockIcon from '@mui/icons-material/Block';
import CalculateIcon from '@mui/icons-material/Calculate';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FilterListIcon from '@mui/icons-material/FilterList';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import PrintIcon from '@mui/icons-material/Print';
import VisibilityIcon from '@mui/icons-material/Visibility';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InboxIcon from '@mui/icons-material/Inbox';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { PageHeader } from '../../../components/common/PageHeader';
import { ToolbarButton } from '../../orders/components/ToolbarButton';
import { ActionToolbar } from '../../orders/components/ActionToolbar';
import { exportMovementsPdf, exportMovementsExcel } from '../utils/exportMovements';
import { generateMovementReceipt } from '../utils/generateMovementReceipt';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';
import { PATHS } from '../../../router/paths';
import { useCashSession, useCashMovements, useCashMutations } from '../hooks/useCashRegister';
import CreateMovementDialog from '../components/CreateMovementDialog';
import VoidMovementDialog from '../components/VoidMovementDialog';
import CalculatorDialog from '../components/CalculatorDialog';
import PendingApprovalsPanel from '../components/PendingApprovalsPanel';
import PendingVoidRequestsPanel from '../components/PendingVoidRequestsPanel';
import PendingOgAuthorizationsPanel from '../components/PendingOgAuthorizationsPanel';
import PendingRefundRequestsPanel from '../components/PendingRefundRequestsPanel';
import ApprovedRefundsToPayPanel from '../components/ApprovedRefundsToPayPanel';
import PendingApAuthorizationsPanel from '../components/PendingApAuthorizationsPanel';
import PendingApReversalsCajaPanel from '../components/PendingApReversalsCajaPanel';
import { useApprovalSocket } from '../hooks/useApprovalSocket';
import { useCreateVoidRequest } from '../../../hooks/useVoidRequests';
import type { CashMovementType, CashMovement } from '../../../types/cash-register.types';
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods';

const MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
  WITHDRAWAL: 'Retiro',
  DEPOSIT: 'Depósito',
};

const MOVEMENT_TYPE_ICONS: Record<CashMovementType, React.ReactElement> = {
  INCOME: <TrendingUpIcon fontSize="small" />,
  EXPENSE: <TrendingDownIcon fontSize="small" />,
  WITHDRAWAL: <LogoutIcon fontSize="small" />,
  DEPOSIT: <MoveToInboxIcon fontSize="small" />,
};

const MOVEMENT_TYPE_COLORS: Record<CashMovementType, 'success' | 'error' | 'warning' | 'info'> = {
  INCOME: 'success',
  EXPENSE: 'error',
  WITHDRAWAL: 'warning',
  DEPOSIT: 'info',
};


const PAYMENT_METHOD_INFO: Record<string, { icon: React.ReactNode, color: string, bgcolor: string }> = {
  CASH: { icon: <LocalAtmIcon fontSize="inherit" />, color: '#2e7d32', bgcolor: 'rgba(46, 125, 50, 0.08)' },
  TRANSFER: { icon: <SyncAltIcon fontSize="inherit" />, color: '#0288d1', bgcolor: 'rgba(2, 136, 209, 0.08)' },
  CARD: { icon: <CreditCardIcon fontSize="inherit" />, color: '#7b1fa2', bgcolor: 'rgba(123, 31, 162, 0.08)' },
  CHECK: { icon: <ReceiptLongIcon fontSize="inherit" />, color: '#ed6c02', bgcolor: 'rgba(237, 108, 2, 0.08)' },
  OTHER: { icon: <MoreHorizIcon fontSize="inherit" />, color: '#424242', bgcolor: 'rgba(66, 66, 66, 0.08)' },
};

const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(Number(value));

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const ActiveSessionPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { hasPermission } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role?.name === 'admin';

  const sessionQuery = useCashSession(id);
  const movementsQuery = useCashMovements({ cashSessionId: id, includeVoided: true });
  const { createMovement, voidMovement } = useCashMutations();
  const createVoidRequest = useCreateVoidRequest();

  // Real-time WebSocket for advance payment approvals
  useApprovalSocket();

  const [pendingPanelsOpen, setPendingPanelsOpen] = useState(true);
  const [dialogType, setDialogType] = useState<CashMovementType | null>(null);
  const [voidTarget, setVoidTarget] = useState<CashMovement | null>(null);
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [movementSearch, setMovementSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CashMovementType | 'ALL'>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'type'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);

  const session = sessionQuery.data;
  const movements = movementsQuery.data?.data || [];

  const filteredMovements = useMemo(() => {
    let result = movements;

    // Type filter
    if (typeFilter !== 'ALL') {
      result = result.filter((m) => m.movementType === typeFilter);
    }

    // Payment method filter
    if (paymentMethodFilter !== 'ALL') {
      result = result.filter((m) => (m.paymentMethod || 'OTHER') === paymentMethodFilter);
    }

    // Text search
    if (movementSearch.trim()) {
      const q = movementSearch.toLowerCase();
      result = result.filter((m) => {
        const label = MOVEMENT_TYPE_LABELS[m.movementType]?.toLowerCase() || '';
        const method = (PAYMENT_METHOD_LABELS[m.paymentMethod] || m.paymentMethod || '').toLowerCase();
        return (
          m.description.toLowerCase().includes(q) ||
          m.receiptNumber.toLowerCase().includes(q) ||
          label.includes(q) ||
          method.includes(q) ||
          String(m.amount).includes(q)
        );
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'amount':
          cmp = Number(a.amount) - Number(b.amount);
          break;
        case 'type': {
          const typeOrder: Record<CashMovementType, number> = { INCOME: 0, DEPOSIT: 1, EXPENSE: 2, WITHDRAWAL: 3 };
          cmp = typeOrder[a.movementType] - typeOrder[b.movementType];
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [movements, movementSearch, typeFilter, paymentMethodFilter, sortBy, sortDir]);

  const activeFilterCount = (typeFilter !== 'ALL' ? 1 : 0) + (paymentMethodFilter !== 'ALL' ? 1 : 0) + (movementSearch.trim() ? 1 : 0);

  const balanceBreakdown = useMemo(() => {
    const summary: Record<string, number> = {
      INCOME: 0,
      EXPENSE: 0,
      WITHDRAWAL: 0,
      DEPOSIT: 0,
    };
    movements
      .filter((m) => !m.isVoided)
      .forEach((m) => {
        summary[m.movementType] += Number(m.amount);
      });
    return summary;
  }, [movements]);

  const movementSummary = useMemo(() => {
    const types: CashMovementType[] = ['INCOME', 'DEPOSIT', 'EXPENSE', 'WITHDRAWAL'];
    const active = movements.filter((m) => !m.isVoided);
    const byType = types.map((t) => {
      const items = active.filter((m) => m.movementType === t);
      return { type: t, count: items.length, total: items.reduce((s, m) => s + Number(m.amount), 0) };
    });
    const totalIncome = byType.filter((b) => b.type === 'INCOME' || b.type === 'DEPOSIT').reduce((s, b) => s + b.total, 0);
    const totalExpense = byType.filter((b) => b.type === 'EXPENSE' || b.type === 'WITHDRAWAL').reduce((s, b) => s + b.total, 0);
    return { byType, totalIncome, totalExpense, net: totalIncome - totalExpense, activeCount: active.length, voidedCount: movements.length - active.length };
  }, [movements]);

  // Compute breakdown by payment method
  const paymentMethodBreakdown = useMemo(() => {
    const summary: Record<string, { income: number; expense: number }> = {};
    movements
      .filter((m) => !m.isVoided)
      .forEach((m) => {
        const method = m.paymentMethod || 'CASH';
        if (!summary[method]) summary[method] = { income: 0, expense: 0 };
        const amt = Number(m.amount);
        if (m.movementType === 'INCOME' || m.movementType === 'DEPOSIT') {
          summary[method].income += amt;
        } else {
          summary[method].expense += amt;
        }
      });
    return summary;
  }, [movements]);

  // Redirect if session is closed
  React.useEffect(() => {
    if (session && session.status === 'CLOSED') {
      navigate(PATHS.CASH_SESSION_HISTORY_DETAIL.replace(':id', id), { replace: true });
    }
  }, [session, id, navigate]);

  // Compute running balance from movements (client-side)
  const runningBalance = useMemo(() => {
    if (!session) return 0;
    const base = Number(session.openingAmount);
    const delta = movements
      .filter((m) => !m.isVoided)
      .reduce((acc, m) => {
        const amt = Number(m.amount);
        if (m.movementType === 'INCOME' || m.movementType === 'DEPOSIT') return acc + amt;
        return acc - amt;
      }, 0);
    return base + delta;
  }, [session, movements]);

  const handleCreateMovement = async (data: Parameters<typeof createMovement.mutateAsync>[0]) => {
    await createMovement.mutateAsync(data);
    setDialogType(null);
  };

  const handleVoidMovement = async (movId: string, voidReason: string) => {
    if (isAdmin) {
      await voidMovement.mutateAsync({ id: movId, dto: { voidReason } });
    } else {
      await createVoidRequest.mutateAsync({ movementId: movId, dto: { voidReason } });
    }
    setVoidTarget(null);
  };

  if (sessionQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!session) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Sesión no encontrada.</Alert>
      </Box>
    );
  }

  const canCreateMovement = hasPermission(PERMISSIONS.CREATE_CASH_MOVEMENTS);
  const canVoidMovement = hasPermission(PERMISSIONS.VOID_CASH_MOVEMENTS);
  const canCloseSession = hasPermission(PERMISSIONS.CLOSE_CASH_SESSION);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title={`Sesión — ${session.cashRegister.name}`}
        subtitle={`Abierta el ${formatDate(session.openedAt)}`}
      />

      {/* ── Session Overview ─────────────────────────────────────── */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          {/* ── Stats ────────────────────── */}
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 2,
            mb: 2,
          }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2, letterSpacing: 1 }}>
                Saldo en Caja
              </Typography>
              <Typography
                variant="h4"
                fontWeight={800}
                lineHeight={1.1}
                color={runningBalance >= 0 ? 'success.main' : 'error.main'}
              >
                {formatCurrency(runningBalance)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {[
                {
                  icon: <PersonIcon sx={{ fontSize: '1rem' }} />,
                  label: 'Cajero',
                  value: `${session.openedBy.firstName} ${session.openedBy.lastName}`,
                },
                {
                  icon: <AccountBalanceIcon sx={{ fontSize: '1rem' }} />,
                  label: 'Fondo Inicial',
                  value: formatCurrency(session.openingAmount),
                },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    bgcolor: 'background.paper',
                    color: 'text.secondary',
                  }}>
                    {item.icon}
                  </Box>
                  <Box sx={{ lineHeight: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1 }}>
                      {item.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                      {item.value}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

        </CardContent>
      </Card>

      {/* ── Toolbar de Acciones ───────────────────────────── */}
      <ActionToolbar sx={{ mb: 2 }}>
        {/* {canCreateMovement && (
            <ToolbarButton icon={<TrendingUpIcon />} label="Ingreso" onClick={() => setDialogType('INCOME')} color={theme.palette.success.main} tooltip="Registrar Ingreso" />
          )}
          {canCreateMovement && (
            <ToolbarButton icon={<TrendingDownIcon />} label="Egreso" onClick={() => setDialogType('EXPENSE')} color={theme.palette.error.main} tooltip="Registrar Egreso" />
          )}
          {canCreateMovement && (
            <ToolbarButton icon={<LogoutIcon />} label="Retiro" onClick={() => setDialogType('WITHDRAWAL')} color={theme.palette.warning.main} tooltip="Registrar Retiro" />
          )} */}
          {canCreateMovement && (
            <ToolbarButton icon={<MoveToInboxIcon />} label="Depósito" onClick={() => setDialogType('DEPOSIT')} color={theme.palette.info.main} tooltip="Registrar Depósito" />
          )}
          <ToolbarButton icon={<CalculateIcon />} label="Calculadora" onClick={() => setIsCalculatorOpen(true)} tooltip="Abrir Calculadora" />
          <ToolbarButton icon={<VisibilityIcon />} label="Balance" onClick={() => setIsBalanceDialogOpen(true)} tooltip="Ver Balance" />
          <ToolbarButton icon={<FileDownloadIcon />} label="Exportar" onClick={(e) => setExportAnchorEl(e.currentTarget)} tooltip="Exportar Movimientos" />
          {canCloseSession && (
            <ToolbarButton icon={<LockIcon />} label="Cerrar Caja" onClick={() => navigate(PATHS.CASH_SESSION_CLOSE.replace(':id', id))} color={theme.palette.warning.main} tooltip="Cerrar Sesión de Caja" />
          )}
      </ActionToolbar>
      <Menu
        anchorEl={exportAnchorEl}
        open={Boolean(exportAnchorEl)}
        onClose={() => setExportAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 180, mt: 0.5 } } }}
      >
        <MenuItem onClick={() => { setExportAnchorEl(null); exportMovementsPdf(session, filteredMovements, runningBalance); }}>
          <ListItemIcon><PictureAsPdfIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Exportar PDF</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setExportAnchorEl(null); exportMovementsExcel(session, filteredMovements); }}>
          <ListItemIcon><TableChartIcon fontSize="small" color="success" /></ListItemIcon>
          <ListItemText>Exportar Excel</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Bandeja de solicitudes ───────────────────────────────────── */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: '12px !important', px: 2 }}>
          {/* Header colapsable */}
          <Box
            onClick={() => setPendingPanelsOpen((v) => !v)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              userSelect: 'none',
              '&:hover .collapse-icon': { color: 'primary.main' },
            }}
          >
            <InboxIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>
              Bandeja de solicitudes
            </Typography>
            <IconButton
              size="small"
              className="collapse-icon"
              sx={{ color: 'text.disabled', transition: 'color 0.2s' }}
            >
              {pendingPanelsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>

          <Collapse in={pendingPanelsOpen}>
            <Box sx={{ mt: 1.5 }}>
              {hasPermission(PERMISSIONS.APPROVE_ADVANCE_PAYMENTS) && (
                <PendingApprovalsPanel hideWhenEmpty />
              )}
              {hasPermission(PERMISSIONS.APPROVE_CASH_MOVEMENTS) && (
                <PendingVoidRequestsPanel hideWhenEmpty />
              )}
              {hasPermission(PERMISSIONS.CAJA_AUTHORIZE_EXPENSE_ORDERS) && (
                <PendingOgAuthorizationsPanel hideWhenEmpty />
              )}
              {hasPermission(PERMISSIONS.APPROVE_REFUNDS) && (
                <PendingRefundRequestsPanel hideWhenEmpty />
              )}
              {hasPermission(PERMISSIONS.EXECUTE_REFUNDS) && (
                <ApprovedRefundsToPayPanel hideWhenEmpty />
              )}
              {hasPermission(PERMISSIONS.REGISTER_AP_PAYMENT) && (
                <PendingApAuthorizationsPanel hideWhenEmpty />
              )}
              {hasPermission(PERMISSIONS.CAJA_CONFIRM_AP_PAYMENT_REVERSAL) && (
                <PendingApReversalsCajaPanel hideWhenEmpty />
              )}

              {/* Fallback sutil cuando no hay nada pendiente */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, color: 'text.disabled' }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 15 }} />
                <Typography variant="caption">
                  Todo en orden — sin solicitudes pendientes
                </Typography>
              </Box>
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      {/* ── Movements List ───────────────────────────────────────────── */}
      <Card>
        <CardContent>
          {/* ── Header + Counts ─────────────────────────── */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon color="action" fontSize="small" />
              <Typography variant="subtitle2" color="text.secondary">
                Lista de movimientos
              </Typography>
              <Chip
                label={`${movements.filter((m) => !m.isVoided).length} activos`}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
              />
              {activeFilterCount > 0 && (
                <Chip
                  icon={<FilterListIcon sx={{ fontSize: '0.8rem !important' }} />}
                  label={`${filteredMovements.length} resultado${filteredMovements.length !== 1 ? 's' : ''}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onDelete={() => { setTypeFilter('ALL'); setPaymentMethodFilter('ALL'); setMovementSearch(''); }}
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          </Box>

          {/* ── Search + Sort row ─────────────────────── */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar movimientos..."
              value={movementSearch}
              onChange={(e) => setMovementSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: 1 }}
            />
            <Tooltip title="Ordenar">
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={(e) => setSortAnchorEl(e.currentTarget)}
                startIcon={<SortIcon fontSize="small" />}
                sx={{
                  minWidth: 'auto',
                  px: 1.5,
                  textTransform: 'none',
                  color: 'text.secondary',
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                }}
              >
                {sortBy === 'date' ? 'Fecha' : sortBy === 'amount' ? 'Monto' : 'Tipo'} {sortDir === 'desc' ? '(Desc.)' : '(Asc.)'}
                {sortDir === 'desc'
                  ? <ArrowDownwardIcon sx={{ fontSize: '0.85rem', ml: 0.25 }} />
                  : <ArrowUpwardIcon sx={{ fontSize: '0.85rem', ml: 0.25 }} />}
              </Button>
            </Tooltip>
            <Menu
              anchorEl={sortAnchorEl}
              open={Boolean(sortAnchorEl)}
              onClose={() => setSortAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { minWidth: 180, mt: 0.5 } } }}
            >
              {[
                { key: 'date' as const, label: 'Fecha', icon: <AccessTimeIcon fontSize="small" /> },
                { key: 'amount' as const, label: 'Monto', icon: <LocalAtmIcon fontSize="small" /> },
                { key: 'type' as const, label: 'Tipo', icon: <ReceiptLongIcon fontSize="small" /> },
              ].map((opt) => (
                <MenuItem
                  key={opt.key}
                  selected={sortBy === opt.key}
                  onClick={() => {
                    if (sortBy === opt.key) {
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                    } else {
                      setSortBy(opt.key);
                      setSortDir('desc');
                    }
                    setSortAnchorEl(null);
                  }}
                >
                  <ListItemIcon>{opt.icon}</ListItemIcon>
                  <ListItemText>{opt.label}</ListItemText>
                  {sortBy === opt.key && (
                    sortDir === 'desc'
                      ? <ArrowDownwardIcon sx={{ fontSize: '1rem', ml: 1, color: 'primary.main' }} />
                      : <ArrowUpwardIcon sx={{ fontSize: '1rem', ml: 1, color: 'primary.main' }} />
                  )}
                </MenuItem>
              ))}
            </Menu>
          </Box>

          {/* ── Type filter chips ─────────────────────── */}
          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
            <ToggleButtonGroup
              value={typeFilter}
              exclusive
              onChange={(_e, val) => val !== null && setTypeFilter(val)}
              size="small"
              sx={{
                flexWrap: 'wrap',
                gap: 0.5,
                '& .MuiToggleButton-root': {
                  borderRadius: '20px !important',
                  border: '1px solid',
                  borderColor: 'divider',
                  px: 1.5,
                  py: 0.25,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  '&.Mui-selected': {
                    borderColor: 'primary.main',
                    bgcolor: 'primary.main',
                    color: '#fff',
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                },
              }}
            >
              <ToggleButton value="ALL">Tipos: Todos</ToggleButton>
              {(['INCOME', 'EXPENSE', 'WITHDRAWAL', 'DEPOSIT'] as CashMovementType[]).map((t) => (
                <ToggleButton key={t} value={t}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    {React.cloneElement(MOVEMENT_TYPE_ICONS[t], { sx: { fontSize: '0.9rem' } })}
                    {MOVEMENT_TYPE_LABELS[t]}
                  </Box>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={paymentMethodFilter}
              exclusive
              onChange={(_e, val) => val !== null && setPaymentMethodFilter(val)}
              size="small"
              sx={{
                flexWrap: 'wrap',
                gap: 0.5,
                '& .MuiToggleButton-root': {
                  borderRadius: '20px !important',
                  border: '1px solid',
                  borderColor: 'divider',
                  px: 1.5,
                  py: 0.25,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  '&.Mui-selected': {
                    borderColor: 'secondary.main',
                    bgcolor: 'secondary.main',
                    color: '#fff',
                    '&:hover': { bgcolor: 'secondary.dark' },
                  },
                },
              }}
            >
              <ToggleButton value="ALL">Métodos: Todos</ToggleButton>
              {(['CASH', 'TRANSFER', 'CARD'] as const).map((t) => {
                const info = PAYMENT_METHOD_INFO[t];
                return (
                  <ToggleButton key={t} value={t}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      {info && React.cloneElement(info.icon as React.ReactElement, { sx: { fontSize: '0.9rem' } })}
                      {PAYMENT_METHOD_LABELS[t] || t}
                    </Box>
                  </ToggleButton>
                );
              })}
            </ToggleButtonGroup>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {movementsQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : movements.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
              No hay movimientos registrados aún.
            </Typography>
          ) : filteredMovements.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
              {movementSearch ? `No se encontraron movimientos para "${movementSearch}".` : 'No se encontraron movimientos con los filtros seleccionados.'}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {filteredMovements.map((mov) => {
                const isPositive = mov.movementType === 'INCOME' || mov.movementType === 'DEPOSIT';
                const typeColor = MOVEMENT_TYPE_COLORS[mov.movementType];
                const pmInfo = PAYMENT_METHOD_INFO[mov.paymentMethod || 'OTHER'];
                return (
                <Box
                  key={mov.id}
                  sx={{
                    display: 'flex',
                    borderRadius: 2,
                    bgcolor: mov.isVoided ? 'action.disabledBackground' : 'background.paper',
                    opacity: mov.isVoided ? 0.55 : 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: mov.isVoided ? 'action.disabledBackground' : 'action.hover',
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                    },
                  }}
                >
                  {/* ── Color accent stripe ──────────────── */}
                  <Box sx={{
                    width: 4,
                    flexShrink: 0,
                    bgcolor: mov.isVoided ? 'action.disabled' : `${typeColor}.main`,
                  }} />

                  {/* ── Content ──────────────────────────── */}
                  <Box sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: { xs: 1, sm: 0 },
                    px: { xs: 1.5, sm: 2 },
                    py: 1.5,
                    minWidth: 0,
                  }}>
                    {/* ── Left: Icon + Description ────────── */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                      <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flexShrink: 0,
                        width: 48,
                        gap: 0.25,
                      }}>
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          bgcolor: mov.isVoided ? 'action.disabledBackground' : `${typeColor}.main`,
                          color: '#fff',
                          '& .MuiSvgIcon-root': { fontSize: '1.1rem' },
                        }}>
                          {MOVEMENT_TYPE_ICONS[mov.movementType]}
                        </Box>
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          sx={{
                            color: mov.isVoided ? 'text.disabled' : `${typeColor}.main`,
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                            fontSize: '0.6rem',
                            lineHeight: 1.2,
                            textAlign: 'center',
                          }}
                        >
                          {MOVEMENT_TYPE_LABELS[mov.movementType]}
                        </Typography>
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ color: 'text.primary' }}>
                            {mov.description}
                          </Typography>
                          {mov.isVoided && (
                            <Chip label="Anulado" size="small" color="default" variant="outlined"
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                          )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {mov.receiptNumber}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">&middot;</Typography>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                            <AccessTimeIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {formatDate(mov.createdAt)}
                            </Typography>
                          </Box>

                          {/* Reference links inline */}
                          {mov.referenceType === 'ORDER' && mov.orderRef && (
                            <>
                              <Typography variant="caption" color="text.disabled">&middot;</Typography>
                              <Chip
                                component={Link}
                                to={PATHS.ORDERS_DETAIL.replace(':id', mov.referenceId!)}
                                target="_blank"
                                clickable
                                icon={<OpenInNewIcon sx={{ fontSize: '0.7rem !important' }} />}
                                label={`${mov.orderRef.orderNumber} — ${mov.orderRef.client.name}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600, maxWidth: 240, '.MuiChip-label': { px: 0.75 }}}
                              />
                              {mov.linkedPayment?.advancePaymentApproval?.status === 'PENDING' && (
                                <Chip
                                  icon={<HourglassEmptyIcon sx={{ fontSize: '0.7rem !important' }} />}
                                  label="Pendiente por autorizar"
                                  size="small"
                                  color="warning"
                                  variant="filled"
                                  sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, '.MuiChip-label': { px: 0.75 } }}
                                />
                              )}
                            </>
                          )}
                          {mov.referenceType === 'EXPENSE_ORDER' && mov.expenseOrderRef && (
                            <>
                              <Typography variant="caption" color="text.disabled">&middot;</Typography>
                              <Chip
                                icon={<AutoAwesomeIcon sx={{ fontSize: '0.65rem !important' }} />}
                                label="Auto"
                                size="small"
                                variant="outlined"
                                color="secondary"
                                sx={{ height: 18, fontSize: '0.65rem', '.MuiChip-label': { px: 0.5 } }}
                              />
                              <Chip
                                component={Link}
                                to={PATHS.EXPENSE_ORDERS_DETAIL.replace(':id', mov.referenceId!)}
                                clickable
                                icon={<OpenInNewIcon sx={{ fontSize: '0.7rem !important' }} />}
                                label={mov.expenseOrderRef.ogNumber}
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600, '.MuiChip-label': { px: 0.75 } }}
                              />
                            </>
                          )}
                        </Box>
                      </Box>
                    </Box>

                    {/* ── Right: Amount + Payment method + Void ── */}
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      pl: { xs: '52px', sm: 2 },
                      flexShrink: 0,
                    }}>
                      {/* Payment method badge */}
                      {!mov.isVoided && pmInfo && (
                        <Box sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          bgcolor: pmInfo.bgcolor,
                          color: pmInfo.color,
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          whiteSpace: 'nowrap',
                        }}>
                          {pmInfo.icon}
                          {PAYMENT_METHOD_LABELS[mov.paymentMethod] || mov.paymentMethod}
                        </Box>
                      )}

                      {/* Amount */}
                      <Typography
                        variant="h6"
                        fontWeight={800}
                        color={mov.isVoided ? 'text.disabled' : isPositive ? 'success.main' : 'error.main'}
                        sx={{ whiteSpace: 'nowrap', letterSpacing: '-0.5px', minWidth: 110, textAlign: 'right' }}
                      >
                        {isPositive ? '+' : '-'}{formatCurrency(mov.amount)}
                      </Typography>

                      {/* Print receipt */}
                      <Tooltip title="Imprimir comprobante">
                        <IconButton
                          size="small"
                          onClick={() => generateMovementReceipt(mov, session.cashRegister)}
                          sx={{ p: 0.5, color: 'text.secondary' }}
                        >
                          <PrintIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Tooltip>

                      {/* Void button */}
                      {!mov.isVoided && canVoidMovement && mov.referenceType !== 'EXPENSE_ORDER' ? (
                        <Tooltip title="Anular movimiento">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setVoidTarget(mov)}
                            sx={{ p: 0.5 }}
                          >
                            <BlockIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Box sx={{ width: 28 }} />
                      )}
                    </Box>
                  </Box>
                </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* ── Movements Summary ────────────────────────────────────────── */}
      {movements.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
              Resumen de movimientos
            </Typography>

            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
              gap: 1.5,
              mb: 2,
            }}>
              {movementSummary.byType.map((item) => {
                const color = MOVEMENT_TYPE_COLORS[item.type];
                const isPos = item.type === 'INCOME' || item.type === 'DEPOSIT';
                return (
                  <Box
                    key={item.type}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: 'action.hover',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      bgcolor: `${color}.main`,
                      color: '#fff',
                      flexShrink: 0,
                      '& .MuiSvgIcon-root': { fontSize: '1rem' },
                    }}>
                      {MOVEMENT_TYPE_ICONS[item.type]}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1, display: 'block' }}>
                        {MOVEMENT_TYPE_LABELS[item.type]} ({item.count})
                      </Typography>
                      <Typography variant="body2" fontWeight={700} color={`${color}.main`} noWrap>
                        {isPos ? '+' : '-'}{formatCurrency(item.total)}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Divider sx={{ mb: 1.5 }} />

            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              gap: 1.5,
            }}>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Total Ingresos</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">
                    +{formatCurrency(movementSummary.totalIncome)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Total Egresos</Typography>
                  <Typography variant="h6" fontWeight={700} color="error.main">
                    -{formatCurrency(movementSummary.totalExpense)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Neto</Typography>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    color={movementSummary.net >= 0 ? 'success.main' : 'error.main'}
                  >
                    {movementSummary.net >= 0 ? '+' : ''}{formatCurrency(movementSummary.net)}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                <Chip
                  label={`${movementSummary.activeCount} activos`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                />
                {movementSummary.voidedCount > 0 && (
                  <Chip
                    label={`${movementSummary.voidedCount} anulados`}
                    size="small"
                    color="default"
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                  />
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      {dialogType && (
        <CreateMovementDialog
          open={!!dialogType}
          movementType={dialogType}
          cashSessionId={id}
          onClose={() => setDialogType(null)}
          onSubmit={handleCreateMovement}
          isLoading={createMovement.isPending}
        />
      )}

      <VoidMovementDialog
        open={!!voidTarget}
        movement={voidTarget}
        onClose={() => setVoidTarget(null)}
        onSubmit={handleVoidMovement}
        isLoading={voidMovement.isPending || createVoidRequest.isPending}
        isRequestMode={!isAdmin}
      />

      <CalculatorDialog
        open={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* ── Balance Detail Dialog ────────────────────────────────────── */}
      <Dialog open={isBalanceDialogOpen} onClose={() => setIsBalanceDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Balance Detallado</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Concepto</TableCell>
                  <TableCell align="right">Monto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Fondo Inicial</TableCell>
                  <TableCell align="right">{formatCurrency(session.openingAmount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Ingresos (+)</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>
                    {formatCurrency(balanceBreakdown.INCOME)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Depósitos (+)</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>
                    {formatCurrency(balanceBreakdown.DEPOSIT)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Egresos (-)</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    {formatCurrency(balanceBreakdown.EXPENSE)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Retiros (-)</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    {formatCurrency(balanceBreakdown.WITHDRAWAL)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={2}>
                    <Divider />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><strong>Saldo Actual</strong></TableCell>
                  <TableCell align="right">
                    <strong>{formatCurrency(runningBalance)}</strong>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <strong>Descuadre</strong>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Diferencia entre saldo actual y fondo inicial
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const discrepancy = runningBalance - Number(session.openingAmount);
                      const isPositive = discrepancy > 0;
                      const isNegative = discrepancy < 0;
                      return (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <Typography
                            variant="h6"
                            fontWeight={700}
                            color={isNegative ? 'error.main' : isPositive ? 'success.main' : 'text.primary'}
                          >
                            {isPositive ? '+' : ''}{formatCurrency(discrepancy)}
                          </Typography>
                          <Chip
                            label={isNegative ? 'Déficit' : isPositive ? 'Superávit' : 'Sin descuadre'}
                            color={isNegative ? 'error' : isPositive ? 'success' : 'default'}
                            size="small"
                            sx={{ mt: 0.5 }}
                          />
                        </Box>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 3, mb: 1 }}>
            Desglose por Método de Pago
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Método</TableCell>
                  <TableCell align="right">Ingresos</TableCell>
                  <TableCell align="right">Egresos</TableCell>
                  <TableCell align="right">Neto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(paymentMethodBreakdown).map(([method, values]) => (
                  <TableRow key={method}>
                    <TableCell>{PAYMENT_METHOD_LABELS[method] || method}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      {formatCurrency(values.income)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>
                      {formatCurrency(values.expense)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 700, color: values.income - values.expense >= 0 ? 'success.main' : 'error.main' }}
                    >
                      {formatCurrency(values.income - values.expense)}
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(paymentMethodBreakdown).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.secondary">Sin movimientos</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsBalanceDialogOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ActiveSessionPage;
