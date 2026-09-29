import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LogoutIcon from '@mui/icons-material/Logout';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import SearchIcon from '@mui/icons-material/Search';
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
import DescriptionIcon from '@mui/icons-material/Description';
import { PageHeader } from '../../../components/common/PageHeader';
import { useCashSession } from '../hooks/useCashRegister';
import ConciliationSummary from '../components/ConciliationSummary';
import { PATHS } from '../../../router/paths';
import { exportMovementsPdf, exportMovementsExcel } from '../utils/exportMovements';
import { exportSessionPdf, exportSessionExcel } from '../utils/exportSession';
import { generateMovementReceipt } from '../utils/generateMovementReceipt';
import type { CashMovementType } from '../../../types/cash-register.types';
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

const SessionDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionQuery = useCashSession(id);
  const session = sessionQuery.data;

  const [movementSearch, setMovementSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CashMovementType | 'ALL'>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'type'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [sessionExportAnchorEl, setSessionExportAnchorEl] = useState<null | HTMLElement>(null);

  const movements = useMemo(() => session?.movements || [], [session?.movements]);

  const filteredMovements = useMemo(() => {
    let result = movements;
    if (typeFilter !== 'ALL') {
      result = result.filter((m) => m.movementType === typeFilter);
    }
    if (paymentMethodFilter !== 'ALL') {
      result = result.filter((m) => (m.paymentMethod || 'OTHER') === paymentMethodFilter);
    }
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

  const closingDenominations = session.denominations.filter((d) => d.countType === 'CLOSING');

  // Build conciliation preview from session data (for closed sessions)
  const conciliationPreview = session.status === 'CLOSED' && session.systemBalance
    ? {
        sessionId: session.id,
        status: session.status as 'CLOSED',
        openingAmount: session.openingAmount,
        systemBalance: session.systemBalance,
        totalIncome: String(
          movements
            .filter((m) => m.movementType === 'INCOME' && !m.isVoided)
            .reduce((a, m) => a + Number(m.amount), 0),
        ),
        totalExpense: String(
          movements
            .filter((m) => m.movementType === 'EXPENSE' && !m.isVoided)
            .reduce((a, m) => a + Number(m.amount), 0),
        ),
        totalWithdrawals: String(
          movements
            .filter((m) => m.movementType === 'WITHDRAWAL' && !m.isVoided)
            .reduce((a, m) => a + Number(m.amount), 0),
        ),
        totalDeposits: String(
          movements
            .filter((m) => m.movementType === 'DEPOSIT' && !m.isVoided)
            .reduce((a, m) => a + Number(m.amount), 0),
        ),
        movementCount: movements.filter((m) => !m.isVoided).length,
      }
    : null;

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(PATHS.CASH_SESSION_HISTORY)}
        sx={{ mb: 2 }}
      >
        Volver al Historial
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <PageHeader
          title={`Sesión — ${session.cashRegister.name}`}
          subtitle={`${session.status === 'OPEN' ? 'Abierta' : 'Cerrada'} · ${formatDate(session.openedAt)}`}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<FileDownloadIcon />}
          onClick={(e) => setSessionExportAnchorEl(e.currentTarget)}
          sx={{ mt: { xs: 0, sm: 1 } }}
        >
          Exportar Sesión
        </Button>
        <Menu
          anchorEl={sessionExportAnchorEl}
          open={Boolean(sessionExportAnchorEl)}
          onClose={() => setSessionExportAnchorEl(null)}
        >
          <MenuItem onClick={() => { setSessionExportAnchorEl(null); exportSessionPdf(session); }}>
            <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Exportar PDF</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setSessionExportAnchorEl(null); exportSessionExcel(session); }}>
            <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Exportar Excel</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* ── Session Overview ───────────────────────────────────────── */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
          {/* Row 1: Meta info */}
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 1.5,
            mb: 2.5,
          }}>
            <Chip
              label={session.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
              color={session.status === 'OPEN' ? 'success' : 'default'}
              size="small"
              sx={{ fontWeight: 700, fontSize: '0.75rem' }}
            />
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Typography variant="body2" color="text.secondary">
              <strong>Cajero:</strong> {session.openedBy.firstName} {session.openedBy.lastName}
            </Typography>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Typography variant="body2" color="text.secondary">
              <strong>Apertura:</strong> {formatDate(session.openedAt)}
            </Typography>
            {session.closedAt && (
              <>
                <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
                <Typography variant="body2" color="text.secondary">
                  <strong>Cierre:</strong> {formatDate(session.closedAt)}
                </Typography>
              </>
            )}
          </Box>

          {/* Row 2: Amount cards */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr 1fr',
              sm: `repeat(${[true, !!session.closingAmount, !!session.systemBalance, session.discrepancy !== undefined && session.discrepancy !== null].filter(Boolean).length}, 1fr)`,
            },
            gap: 1.5,
          }}>
            {/* Fondo Inicial */}
            <Box sx={{
              px: 2,
              py: 1.5,
              borderRadius: 2,
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
            }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                Fondo Inicial
              </Typography>
              <Typography variant="h5" fontWeight={800} color="text.primary" sx={{ letterSpacing: '-0.5px' }}>
                {formatCurrency(session.openingAmount)}
              </Typography>
            </Box>

            {/* Conteo Físico */}
            {session.closingAmount && (
              <Box sx={{
                px: 2,
                py: 1.5,
                borderRadius: 2,
                bgcolor: 'action.hover',
                border: '1px solid',
                borderColor: 'divider',
                textAlign: 'center',
              }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                  Conteo Físico
                </Typography>
                <Typography variant="h5" fontWeight={800} color="text.primary" sx={{ letterSpacing: '-0.5px' }}>
                  {formatCurrency(session.closingAmount)}
                </Typography>
              </Box>
            )}

            {/* Saldo Sistema */}
            {session.systemBalance && (
              <Box sx={{
                px: 2,
                py: 1.5,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: '#fff',
                textAlign: 'center',
                border: '1px solid',
                borderColor: 'primary.dark',
              }}>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', mb: 0.5, opacity: 0.85 }}>
                  Saldo Sistema
                </Typography>
                <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
                  {formatCurrency(session.systemBalance)}
                </Typography>
              </Box>
            )}

            {/* Descuadre */}
            {session.discrepancy !== undefined && session.discrepancy !== null && (() => {
              const disc = Number(session.discrepancy);
              const isZero = disc === 0;
              const isPositive = disc > 0;
              const bgColor = isZero ? 'success.main' : isPositive ? 'warning.main' : 'error.main';
              const darkColor = isZero ? 'success.dark' : isPositive ? 'warning.dark' : 'error.dark';
              return (
                <Box sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: bgColor,
                  color: '#fff',
                  textAlign: 'center',
                  border: '1px solid',
                  borderColor: darkColor,
                }}>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', mb: 0.5, opacity: 0.9 }}>
                    {isZero ? 'Cuadrada' : isPositive ? 'Sobrante' : 'Faltante'}
                  </Typography>
                  <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
                    {isZero ? '$0' : `${isPositive ? '+' : ''}${formatCurrency(session.discrepancy)}`}
                  </Typography>
                </Box>
              );
            })()}
          </Box>
        </CardContent>
      </Card>

      {/* ── Movements List (full width) ──────────────────────────────── */}
      <Card>
        <CardContent>
              {/* ── Header + Counts ─────────────────────────── */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ReceiptLongIcon color="action" fontSize="small" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Movimientos ({movements.length})
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
                <Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    onClick={(e) => setExportAnchorEl(e.currentTarget)}
                    sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                  >
                    Exportar
                  </Button>
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

              {movements.length === 0 ? (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                  No hay movimientos en esta sesión.
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

                        {/* ── Right: Amount + Payment method + Print ── */}
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
                        </Box>
                      </Box>
                    </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* ── Movements Summary ────────────────────────────────────── */}
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

          {/* Conciliation (only for closed sessions with denomination data) */}
          {conciliationPreview && closingDenominations.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                Conciliación de Cierre
              </Typography>
              <ConciliationSummary
                denominations={closingDenominations.map((d) => ({
                  denomination: d.denomination as any,
                  quantity: d.quantity,
                }))}
                preview={conciliationPreview}
                readonly
              />
            </Box>
          )}
    </Box>
  );
};

export default SessionDetailPage;
