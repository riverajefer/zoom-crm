import React, { useState, useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { alpha } from '@mui/material/styles';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Divider,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Flag as FlagIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CheckCircle as CheckCircleIcon,
  InfoOutlined as InfoIcon,
  LocalShipping as DeliveredIcon,
} from '@mui/icons-material';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import { computeGoalProgress, type GoalStatusColor } from '../utils/goalProgress';
import { useSalesGoals, useSalesSummary } from '../hooks';
import type { SalesGoal, AdvisorBreakdown } from '../../../types/order.types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1];

const STATUS_ICON: Record<GoalStatusColor, ReactElement> = {
  success: <CheckCircleIcon fontSize="small" />,
  warning: <TrendingUpIcon fontSize="small" />,
  error: <TrendingDownIcon fontSize="small" />,
};

// ─── GoalProgressCard ─────────────────────────────────────────────────────────

interface GoalProgressCardProps {
  goal: SalesGoal;
  sales: AdvisorBreakdown | undefined;
  canManage: boolean;
  /** El enlace al detalle solo se ofrece si el usuario puede abrirlo. */
  canOpenDetail: boolean;
  month: number;
  year: number;
  onEdit: (goal: SalesGoal) => void;
  onDelete: (goal: SalesGoal) => void;
}

const GoalProgressCard: React.FC<GoalProgressCardProps> = ({
  goal, sales, canManage, canOpenDetail, month, year, onEdit, onDelete,
}) => {
  const navigate = useNavigate();
  const progress = computeGoalProgress(sales, goal.targetAmount);
  const { commissionable, sold, target, pct, pctCapped, soldPctCapped, diff } = progress;
  const pctDisplay = pct.toFixed(1);
  const advisorName = `${goal.advisor.firstName ?? ''} ${goal.advisor.lastName ?? ''}`.trim()
    || goal.advisor.email
    || goal.advisorId;

  const barColor =
    progress.statusColor === 'success' ? '#2e7d32'
    : progress.statusColor === 'warning' ? '#ed6c02'
    : '#d32f2f';

  const openDetail = () =>
    navigate(`${ROUTES.SALES_BY_ADVISOR}/${goal.advisorId}?month=${month}&year=${year}`);

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 3 },
      }}
    >
      <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Header: nombre + chip + acciones */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', mb: 2 }}>
          {canOpenDetail ? (
            <Tooltip title={`Ver las OP de ${advisorName}`}>
              <Typography
                fontWeight={700}
                fontSize="1rem"
                noWrap
                onClick={openDetail}
                sx={{
                  maxWidth: 180,
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                }}
              >
                {advisorName}
              </Typography>
            </Tooltip>
          ) : (
            <Typography fontWeight={700} fontSize="1rem" noWrap sx={{ maxWidth: 180 }}>
              {advisorName}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              icon={STATUS_ICON[progress.statusColor]}
              label={progress.statusLabel}
              color={progress.statusColor}
              size="small"
              sx={{ fontWeight: 600 }}
            />
            {canManage && (
              <>
                <Tooltip title="Editar meta">
                  <IconButton size="small" onClick={() => onEdit(goal)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar meta">
                  <IconButton size="small" color="error" onClick={() => onDelete(goal)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>

        {/* Circular + barras centrado */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 2 }}>
          {/* Porcentaje circular */}
          <Box
            sx={{
              position: 'relative',
              width: 100,
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="100" height="100" style={{ position: 'absolute', top: 0, left: 0 }}>
              {/* Track */}
              <circle cx="50" cy="50" r="42" fill="none" stroke="#e0e0e0" strokeWidth="8" />
              {/* Progress */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={barColor}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - Math.min(Number(pctDisplay) / 100, 1))}`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <Typography
              fontWeight={800}
              sx={{ color: barColor, fontSize: '1.05rem', zIndex: 1 }}
            >
              {pctDisplay}%
            </Typography>
          </Box>

          {/* Números + barra (ancho completo, centrado) */}
          <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Tooltip
                title={
                  <Box sx={{ py: 0.5 }}>
                    <Typography variant="caption" display="block" fontWeight={700} sx={{ mb: 0.5 }}>
                      Cómo se calcula
                    </Typography>
                    <Typography variant="caption" display="block">
                      Solo cuentan las OP <strong>entregadas</strong> y{' '}
                      <strong>pagadas al 100%</strong>: son las que comisionan.
                    </Typography>
                    <Typography variant="caption" display="block" fontWeight={700} sx={{ mt: 0.75 }}>
                      Comisionable: {formatCurrency(commissionable)}
                      {' · '}
                      {sales?.commissionableOrders ?? 0} OP
                    </Typography>
                    <Typography variant="caption" display="block">
                      Vendido del mes: {formatCurrency(sold)} · {sales?.totalOrders ?? 0} OP
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ mt: 0.75, opacity: 0.85 }}>
                      Venta neta sin IVA (subtotal − descuentos). No incluye IVA,
                      retenciones ni prueba de color.
                    </Typography>
                  </Box>
                }
                arrow
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                >
                  Comisionable
                </Typography>
              </Tooltip>
              <Typography variant="body2" fontWeight={700} color={barColor}>
                {formatCurrency(commissionable)}
              </Typography>
            </Box>

            {/*
              Barra dual: el vendido total va translúcido de fondo y lo comisionable
              en sólido encima. Con la regla de comisión, una barra sola dejaría casi
              todas las tarjetas en cero sin explicar por qué.
            */}
            <Tooltip
              arrow
              title={`Comisionable ${formatCurrency(commissionable)} de ${formatCurrency(sold)} vendidos`}
            >
              <Box
                sx={{
                  position: 'relative',
                  height: 10,
                  borderRadius: 5,
                  mb: 0.5,
                  bgcolor: 'action.hover',
                  overflow: 'hidden',
                  cursor: 'help',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: `${soldPctCapped}%`,
                    bgcolor: alpha(barColor, 0.3),
                    borderRadius: 5,
                    transition: 'width 0.6s ease',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: `${pctCapped}%`,
                    bgcolor: barColor,
                    borderRadius: 5,
                    transition: 'width 0.6s ease',
                  }}
                />
              </Box>
            </Tooltip>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Vendido (sin IVA)</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatCurrency(sold)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Meta</Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatCurrency(target)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Diferencia */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            bgcolor: diff >= 0 ? 'success.lighter' : 'error.lighter',
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
            width: '100%',
            mt: 0.5,
          }}
        >
          {diff >= 0 ? (
            <TrendingUpIcon fontSize="small" color="success" />
          ) : (
            <TrendingDownIcon fontSize="small" color="error" />
          )}
          <Typography
            variant="body2"
            fontWeight={600}
            color={diff >= 0 ? 'success.dark' : 'error.dark'}
          >
            {diff >= 0
              ? `+${formatCurrency(diff)} sobre la meta`
              : `${formatCurrency(Math.abs(diff))} por alcanzar`}
          </Typography>
        </Box>

        {/*
          La brecha es la palanca accionable de la tarjeta: OP ya cobradas a las
          que solo les falta registrar la entrega para empezar a comisionar.
        */}
        {progress.gapOrders > 0 && (
          <Tooltip
            arrow
            title={
              <Box sx={{ py: 0.5 }}>
                <Typography variant="caption" display="block" fontWeight={700}>
                  {progress.gapOrders} OP pagadas al 100% sin marcar como entregadas
                </Typography>
                <Typography variant="caption" display="block">
                  {formatCurrency(progress.gapAmount)} que aún no comisionan.
                </Typography>
                {canOpenDetail && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.75, opacity: 0.85 }}>
                    Abre el detalle del asesor para revisarlas.
                  </Typography>
                )}
              </Box>
            }
          >
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              icon={<DeliveredIcon fontSize="small" />}
              label={`${progress.gapOrders} OP pagadas sin entregar`}
              onClick={canOpenDetail ? openDetail : undefined}
              sx={{ mt: 1, width: '100%', cursor: canOpenDetail ? 'pointer' : 'help' }}
            />
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
};

// ─── GoalFormDialog ───────────────────────────────────────────────────────────

interface GoalFormDialogProps {
  open: boolean;
  goal: SalesGoal | null;
  month: number;
  year: number;
  advisors: Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null }>;
  existingGoals: SalesGoal[];
  onClose: () => void;
  onSave: (advisorId: string, targetAmount: number) => void;
  saving: boolean;
}

const GoalFormDialog: React.FC<GoalFormDialogProps> = ({
  open, goal, month, year, advisors, existingGoals, onClose, onSave, saving,
}) => {
  const [advisorId, setAdvisorId] = useState('');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    if (open) {
      setAdvisorId(goal?.advisorId ?? '');
      setAmount(goal ? String(Number(goal.targetAmount)) : '');
      setAmountError('');
    }
  }, [open, goal]);

  const availableAdvisors = advisors.filter(
    (a) => a.id === goal?.advisorId || !existingGoals.find((g) => g.advisorId === a.id),
  );

  const handleSave = () => {
    const num = parseFloat(amount.replace(/[^\d.]/g, ''));
    if (!advisorId) return;
    if (!num || num <= 0) {
      setAmountError('Ingresa un monto válido mayor a 0');
      return;
    }
    onSave(advisorId, num);
  };

  const formatInput = (val: string) => {
    const digits = val.replace(/\D/g, '');
    return digits ? new Intl.NumberFormat('es-CO').format(Number(digits)) : '';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FlagIcon color="primary" />
        {goal ? 'Editar meta' : 'Nueva meta'} — {MONTHS[month - 1]} {year}
      </DialogTitle>
      <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          select
          label="Asesor"
          value={advisorId}
          onChange={(e) => setAdvisorId(e.target.value)}
          fullWidth
          size="small"
          disabled={!!goal}
        >
          {(goal ? advisors : availableAdvisors).map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {`${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email || a.id}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Meta de ventas (COP)"
          value={formatInput(amount)}
          onChange={(e) => {
            setAmount(e.target.value.replace(/\D/g, ''));
            setAmountError('');
          }}
          error={!!amountError}
          helperText={amountError}
          fullWidth
          size="small"
          inputProps={{ inputMode: 'numeric' }}
          placeholder="Ej: 10.000.000"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!advisorId || !amount || saving}
          startIcon={<FlagIcon />}
        >
          {saving ? 'Guardando...' : 'Guardar meta'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── SalesGoalsSection (main export) ─────────────────────────────────────────

interface SalesGoalsSectionProps {
  advisors: Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null }>;
}

export const SalesGoalsSection: React.FC<SalesGoalsSectionProps> = ({ advisors }) => {
  const { hasPermission, user } = useAuthStore();
  const canManage = hasPermission(PERMISSIONS.MANAGE_SALES_GOALS);
  // El detalle usa el seguimiento por asesor, que sí está recortado por permiso:
  // ofrecer el enlace sin poder abrirlo llevaría a un 403.
  const canSeeAllAdvisors = hasPermission(PERMISSIONS.READ_ALL_ADVISORS_TRACKING);
  const currentUserId = user?.id;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SalesGoal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<SalesGoal | null>(null);

  const { goalsQuery, upsertMutation, deleteMutation } = useSalesGoals({ month, year });

  // Summary for the selected month (all advisors, date range = full month)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  // `excludeAnulado`: el «Vendido del mes» de cada tarjeta es una cifra de
  // ventas, y una OP anulada no es una venta. Sin esto, anular una orden dejaba
  // el vendido inflado (lo comisionable no se veía afectado porque ya filtra por
  // entregadas, y de ahí que la diferencia pasara desapercibida).
  // La meta es del asesor, sin importar la sede: el vendido suma todas las
  // sedes aunque haya una activa (docs/PLAN_SEDES.md §10).
  const summaryQuery = useSalesSummary({
    orderDateFrom: monthStart,
    orderDateTo: monthEnd,
    excludeAnulado: true,
    acrossLocations: true,
  });

  const goals = goalsQuery.data ?? [];
  const summary = summaryQuery.data;

  // Build a map: advisorId → desglose de ventas del mes.
  // Las metas se miden sobre la venta neta sin IVA (subtotal − descuentos),
  // no sobre el total facturado.
  const salesByAdvisor = new Map<string, AdvisorBreakdown>(
    (summary?.advisorBreakdown ?? []).map((b) => [b.advisorId, b]),
  );

  const openNew = () => { setEditingGoal(null); setDialogOpen(true); };
  const openEdit = (g: SalesGoal) => { setEditingGoal(g); setDialogOpen(true); };

  const handleSave = (advisorId: string, targetAmount: number) => {
    upsertMutation.mutate(
      { advisorId, month, year, targetAmount },
      { onSuccess: () => setDialogOpen(false) },
    );
  };

  const handleDelete = () => {
    if (!deletingGoal) return;
    deleteMutation.mutate(deletingGoal.id, { onSuccess: () => setDeletingGoal(null) });
  };

  const allAdvisorsWithGoals = goals.length === 0;

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardHeader
          avatar={<TrophyIcon color="warning" />}
          title={
            <Typography variant="h6" fontWeight={700}>
              Metas de Ventas
            </Typography>
          }
          subheader="Seguimiento mensual por asesor · el vendido suma todas las sedes"
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pr: 1 }}>
              {/* Selector mes */}
              <TextField
                select
                size="small"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                sx={{ width: 130 }}
              >
                {MONTHS.map((m, i) => (
                  <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
                ))}
              </TextField>
              {/* Selector año */}
              <TextField
                select
                size="small"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                sx={{ width: 90 }}
              >
                {YEAR_OPTIONS.map((y) => (
                  <MenuItem key={y} value={y}>{y}</MenuItem>
                ))}
              </TextField>
              {canManage && (
                <Tooltip title="Agregar meta para un asesor">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={openNew}
                    disabled={advisors.length === 0}
                  >
                    Agregar
                  </Button>
                </Tooltip>
              )}
            </Box>
          }
          sx={{ pb: 0 }}
        />

        <Divider sx={{ mt: 1 }} />

        <CardContent>
          <Alert severity="info" icon={<InfoIcon fontSize="inherit" />} sx={{ mb: 2 }}>
            <Typography variant="body2">
              El avance se mide sobre lo <strong>comisionable</strong>: solo las OP{' '}
              <strong>entregadas</strong> y <strong>pagadas al 100%</strong>, que es la
              condición con la que se liquidan las comisiones. La barra muestra además, en
              tono claro, el total vendido del mes. Las cifras son venta neta sin IVA
              (subtotal − descuentos); no cuentan IVA, retenciones ni prueba de color.
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.75 }}>
              Si una tarjeta va en 0% pero con vendido alto, casi siempre falta{' '}
              <strong>marcar las entregas</strong>: el chip naranja de cada tarjeta dice
              cuántas OP ya están cobradas y solo esperan ese paso.
            </Typography>
          </Alert>

          {goalsQuery.isLoading || summaryQuery.isLoading ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={160} />)}
            </Box>
          ) : allAdvisorsWithGoals ? (
            <Alert
              severity="info"
              action={
                canManage ? (
                  <Button size="small" startIcon={<AddIcon />} onClick={openNew}>
                    Agregar primera meta
                  </Button>
                ) : undefined
              }
            >
              No hay metas configuradas para {MONTHS[month - 1]} {year}.
              {!canManage && ' Contacta a un administrador para configurarlas.'}
            </Alert>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 2,
              }}
            >
              {goals.map((goal) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={goal}
                  sales={salesByAdvisor.get(goal.advisorId)}
                  canManage={canManage}
                  canOpenDetail={canSeeAllAdvisors || goal.advisorId === currentUserId}
                  month={month}
                  year={year}
                  onEdit={openEdit}
                  onDelete={setDeletingGoal}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <GoalFormDialog
        open={dialogOpen}
        goal={editingGoal}
        month={month}
        year={year}
        advisors={advisors.map((a) => ({ ...a, email: null }))}
        existingGoals={goals}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        saving={upsertMutation.isPending}
      />

      {/* Dialog confirmar eliminación */}
      <Dialog open={!!deletingGoal} onClose={() => setDeletingGoal(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar meta</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Eliminar la meta de{' '}
            <strong>
              {`${deletingGoal?.advisor.firstName ?? ''} ${deletingGoal?.advisor.lastName ?? ''}`.trim()}
            </strong>{' '}
            para {deletingGoal ? MONTHS[deletingGoal.month - 1] : ''} {deletingGoal?.year}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingGoal(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
