import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Link as MuiLink,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListOffIcon from '@mui/icons-material/FilterListOff';
import type { CashMovement, CashMovementType } from '../../../types/cash-register.types';
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods';
import { PATHS } from '../../../router/paths';
import {
  DEFAULT_MOVEMENT_TABLE_FILTERS,
  MOVEMENT_ORIGIN_LABELS,
  MOVEMENT_STATUS_LABELS,
  countActiveFilters,
  filterMovements,
  isInflow,
  movementOrigin,
  movementReference,
  movementStatus,
  performerName,
  summarizeMovements,
  type MovementOrigin,
  type MovementTableFilters,
} from '../utils/movementsTable';

const TYPE_LABELS: Record<CashMovementType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
  WITHDRAWAL: 'Retiro',
  DEPOSIT: 'Depósito',
};

const TYPE_COLORS: Record<CashMovementType, string> = {
  INCOME: 'success.main',
  EXPENSE: 'error.main',
  WITHDRAWAL: 'warning.main',
  DEPOSIT: 'info.main',
};

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));

const methodLabel = (method: string) => PAYMENT_METHOD_LABELS[method] ?? method;

/** Ruta del documento de origen, cuando la pantalla de detalle existe. */
const referencePath = (m: CashMovement): string | null => {
  if (!m.referenceId) return null;
  switch (m.referenceType) {
    case 'ORDER':
      return PATHS.ORDERS_DETAIL.replace(':id', m.referenceId);
    case 'EXPENSE_ORDER':
      return PATHS.EXPENSE_ORDERS_DETAIL.replace(':id', m.referenceId);
    case 'ACCOUNT_PAYABLE':
      return PATHS.ACCOUNTS_PAYABLE_DETAIL.replace(':id', m.referenceId);
    case 'WORK_ORDER':
      return PATHS.WORK_ORDERS_DETAIL.replace(':id', m.referenceId);
    default:
      return null;
  }
};

type SortKey = 'createdAt' | 'amount';

/** Fecha, recibo, tipo, método, concepto, referencia, usuario, estado, ingreso, egreso. */
const COLUMN_WIDTHS = ['9%', '9.5%', '6.5%', '8.5%', '17%', '15%', '10%', '6.5%', '9%', '9%'];

interface SessionMovementsTableProps {
  movements: CashMovement[];
  isLoading?: boolean;
}

/**
 * Vista en tabla de todos los movimientos de la sesión: una fila por
 * movimiento, filtros combinables y, en el pie, los totales de lo que queda
 * visible, por método de pago. Los anulados y sus reversas se pueden ver, pero
 * no suman (misma regla que el cierre).
 */
const SessionMovementsTable: React.FC<SessionMovementsTableProps> = ({ movements, isLoading }) => {
  const [filters, setFilters] = useState<MovementTableFilters>(DEFAULT_MOVEMENT_TABLE_FILTERS);
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const setFilter = <K extends keyof MovementTableFilters>(key: K, value: MovementTableFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  // Las opciones salen de lo que hay en la sesión: no ofrece filtrar por un
  // método o un usuario que no aparece en ningún movimiento.
  const methodOptions = useMemo(
    () => [...new Set(movements.map((m) => m.paymentMethod || 'CASH'))].sort((a, b) =>
      methodLabel(a).localeCompare(methodLabel(b)),
    ),
    [movements],
  );
  const originOptions = useMemo(
    () => [...new Set(movements.map(movementOrigin))].sort((a, b) =>
      MOVEMENT_ORIGIN_LABELS[a].localeCompare(MOVEMENT_ORIGIN_LABELS[b]),
    ),
    [movements],
  );
  const performerOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const m of movements) byId.set(m.performedById, performerName(m) || 'Sin nombre');
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movements]);

  // Si la sesión cruza la medianoche, la hora sola no alcanza para ubicar la fila.
  const spansSeveralDays = useMemo(
    () => new Set(movements.map((m) => new Date(m.createdAt).toDateString())).size > 1,
    [movements],
  );
  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', {
      ...(spansSeveralDays && { day: '2-digit', month: '2-digit' }),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

  const rows = useMemo(() => {
    const filtered = filterMovements(movements, filters);
    return [...filtered].sort((a, b) => {
      const cmp =
        sortBy === 'amount'
          ? Number(a.amount) - Number(b.amount)
          : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [movements, filters, sortBy, sortDir]);

  const totals = useMemo(() => summarizeMovements(rows), [rows]);
  const activeFilters = countActiveFilters(filters);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'amount' ? 'desc' : 'asc');
    }
  };

  const filterFieldSx = { minWidth: { xs: '100%', sm: 150 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } };
  const footerCellSx = { py: 0.5, fontSize: '0.8rem', color: 'text.primary', borderBottom: 'none' };

  return (
    <Box>
      {/* ── Filtros ──────────────────────────────────── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar recibo, concepto, cliente, usuario o monto…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ flex: { xs: '1 1 100%', md: '1 1 260px' }, minWidth: 0 }}
        />
        <TextField
          select
          size="small"
          label="Tipo"
          value={filters.type}
          onChange={(e) => setFilter('type', e.target.value as MovementTableFilters['type'])}
          sx={filterFieldSx}
        >
          <MenuItem value="ALL">Todos</MenuItem>
          {(Object.keys(TYPE_LABELS) as CashMovementType[]).map((t) => (
            <MenuItem key={t} value={t}>{TYPE_LABELS[t]}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Método de pago"
          value={filters.method}
          onChange={(e) => setFilter('method', e.target.value)}
          sx={filterFieldSx}
        >
          <MenuItem value="ALL">Todos</MenuItem>
          {methodOptions.map((m) => (
            <MenuItem key={m} value={m}>{methodLabel(m)}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Origen"
          value={filters.origin}
          onChange={(e) => setFilter('origin', e.target.value as MovementOrigin | 'ALL')}
          sx={filterFieldSx}
        >
          <MenuItem value="ALL">Todos</MenuItem>
          {originOptions.map((o) => (
            <MenuItem key={o} value={o}>{MOVEMENT_ORIGIN_LABELS[o]}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Realizado por"
          value={filters.performedById}
          onChange={(e) => setFilter('performedById', e.target.value)}
          sx={filterFieldSx}
        >
          <MenuItem value="ALL">Todos</MenuItem>
          {performerOptions.map(([id, name]) => (
            <MenuItem key={id} value={id}>{name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Estado"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as MovementTableFilters['status'])}
          sx={filterFieldSx}
        >
          <MenuItem value="ACTIVE">Activos</MenuItem>
          <MenuItem value="VOIDED">Anulados y reversas</MenuItem>
          <MenuItem value="ALL">Todos</MenuItem>
        </TextField>
        {activeFilters > 0 && (
          <Button
            size="small"
            color="inherit"
            startIcon={<FilterListOffIcon fontSize="small" />}
            onClick={() => setFilters(DEFAULT_MOVEMENT_TABLE_FILTERS)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Limpiar filtros ({activeFilters})
          </Button>
        )}
      </Box>

      {/* ── Tabla ────────────────────────────────────── */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <TableContainer
          sx={{
            maxHeight: '65vh',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Table
            size="small"
            stickyHeader
            sx={{
              // Anchos fijos: los textos largos se recortan con tooltip y los
              // montos del pie quedan siempre a la vista sin desplazar.
              tableLayout: 'fixed',
              minWidth: 980,
              '& .MuiTableCell-root': {
                px: 1,
                py: 0.5,
                fontSize: '0.8rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
              '& .MuiTableCell-head': { fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.default' },
            }}
          >
            <colgroup>
              {COLUMN_WIDTHS.map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortBy === 'createdAt' ? sortDir : false}>
                  <TableSortLabel
                    active={sortBy === 'createdAt'}
                    direction={sortBy === 'createdAt' ? sortDir : 'asc'}
                    onClick={() => toggleSort('createdAt')}
                  >
                    {spansSeveralDays ? 'Fecha' : 'Hora'}
                  </TableSortLabel>
                </TableCell>
                <TableCell>Recibo</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Método</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Referencia</TableCell>
                <TableCell>Realizado por</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right" sortDirection={sortBy === 'amount' ? sortDir : false}>
                  <TableSortLabel
                    active={sortBy === 'amount'}
                    direction={sortBy === 'amount' ? sortDir : 'desc'}
                    onClick={() => toggleSort('amount')}
                  >
                    Ingreso
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sortDirection={sortBy === 'amount' ? sortDir : false}>
                  <TableSortLabel
                    active={sortBy === 'amount'}
                    direction={sortBy === 'amount' ? sortDir : 'desc'}
                    onClick={() => toggleSort('amount')}
                  >
                    Egreso
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {movements.length === 0
                        ? 'No hay movimientos registrados aún.'
                        : 'No hay movimientos con los filtros seleccionados.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((m) => {
                  const status = movementStatus(m);
                  const counts = status === 'ACTIVE';
                  const inflow = isInflow(m.movementType);
                  const reference = movementReference(m);
                  const path = referencePath(m);
                  const amountSx = {
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    ...(counts ? {} : { textDecoration: 'line-through', color: 'text.disabled' }),
                  };
                  return (
                    <TableRow
                      key={m.id}
                      hover
                      sx={counts ? undefined : { '& .MuiTableCell-root': { color: 'text.disabled' } }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWhen(m.createdAt)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{m.receiptNumber}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600, color: counts ? TYPE_COLORS[m.movementType] : undefined }}>
                        {TYPE_LABELS[m.movementType]}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{methodLabel(m.paymentMethod || 'CASH')}</TableCell>
                      <TableCell>
                        <Tooltip title={m.voidReason ? `${m.description} — Motivo de anulación: ${m.voidReason}` : m.description}>
                          <Typography variant="inherit" noWrap>{m.description}</Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {reference || path ? (
                          path ? (
                            <MuiLink component={Link} to={path} target="_blank" underline="hover" noWrap sx={{ display: 'block' }}>
                              {reference ?? MOVEMENT_ORIGIN_LABELS[movementOrigin(m)]}
                            </MuiLink>
                          ) : (
                            <Typography variant="inherit" noWrap>{reference}</Typography>
                          )
                        ) : (
                          <Typography variant="inherit" color="text.secondary" noWrap>
                            {MOVEMENT_ORIGIN_LABELS[movementOrigin(m)]}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell title={performerName(m)}>{performerName(m)}</TableCell>
                      <TableCell>
                        {counts ? (
                          <Typography variant="inherit" color="text.secondary">{MOVEMENT_STATUS_LABELS[status]}</Typography>
                        ) : (
                          <Chip
                            label={MOVEMENT_STATUS_LABELS[status]}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ ...amountSx, color: counts ? 'success.main' : amountSx.color }}>
                        {inflow ? formatCurrency(m.amount) : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ ...amountSx, color: counts ? 'error.main' : amountSx.color }}>
                        {inflow ? '' : formatCurrency(m.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>

            {/* ── Totales de lo visible ───────────────────── */}
            <TableFooter
              sx={{
                position: 'sticky',
                bottom: 0,
                zIndex: 2,
                bgcolor: 'background.default',
                boxShadow: (t) => `0 -1px 0 ${t.palette.divider}`,
                '& .MuiTableCell-footer': footerCellSx,
              }}
            >
              {totals.byMethod.map((t) => (
                <TableRow key={t.method}>
                  <TableCell colSpan={8} align="right">
                    {methodLabel(t.method)} · {t.count} movimiento{t.count === 1 ? '' : 's'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'success.main !important', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(t.income)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'error.main !important', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(t.expense)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={8} align="right" sx={{ fontWeight: '700 !important', borderTop: '1px solid', borderColor: 'divider' }}>
                  Total · {totals.count} movimiento{totals.count === 1 ? '' : 's'}
                  {totals.excludedCount > 0 && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      ({totals.excludedCount} anulado{totals.excludedCount === 1 ? '' : 's'} o reversa{totals.excludedCount === 1 ? '' : 's'} no suman)
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: '700 !important', color: 'success.main !important', borderTop: '1px solid', borderColor: 'divider', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(totals.income)}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: '700 !important', color: 'error.main !important', borderTop: '1px solid', borderColor: 'divider', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(totals.expense)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={8} align="right" sx={{ fontWeight: '700 !important' }}>
                  Neto (ingresos − egresos)
                </TableCell>
                <TableCell
                  colSpan={2}
                  align="right"
                  sx={{
                    whiteSpace: 'nowrap',
                    fontWeight: '800 !important',
                    fontSize: '0.9rem !important',
                    color: `${totals.net >= 0 ? 'success.main' : 'error.main'} !important`,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {totals.net > 0 ? '+' : ''}{formatCurrency(totals.net)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Los totales corresponden a los movimientos visibles con los filtros actuales. El efectivo en caja
        del encabezado cuenta solo efectivo, desde el fondo inicial.
      </Typography>
    </Box>
  );
};

export default SessionMovementsTable;
