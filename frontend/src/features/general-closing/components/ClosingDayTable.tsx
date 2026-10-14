import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { SedeDot } from '../../../components/layout/LocationSelector';
import {
  REGISTER_DAY_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  REVIEW_STATUS_LABELS,
  TOTAL_COLUMNS,
  type GeneralClosingDay,
  type GeneralClosingReviewStatus,
  type RegisterDayRow,
  type RegisterDayStatus,
  type RegisterDayTotals,
} from '../../../types/general-closing.types';
import { ROUTES } from '../../../utils/constants';
import { formatCurrency, formatTime, fullName } from '../utils';

const STATUS_COLORS: Record<RegisterDayStatus, 'default' | 'success' | 'warning'> = {
  CLOSED: 'success',
  OPEN: 'warning',
  NO_SESSION: 'default',
};

/** Columnas que solo aparecen si alguna caja tiene algo en ellas. */
const OPTIONAL_FIELDS: (keyof RegisterDayTotals)[] = [
  'incomeOther',
  'deposits',
  'handoversIn',
  'otherExpenses',
];

/** La revisión lleva las acciones: se queda a la vista aunque la tabla se desplace. */
const STICKY_REVIEW = {
  position: 'sticky',
  right: 0,
  bgcolor: 'background.paper',
  borderLeft: 1,
  borderLeftColor: 'divider',
} as const;

const discrepancyColor = (value: number | null) => {
  if (value === null) return 'text.disabled';
  if (value === 0) return 'success.main';
  return value < 0 ? 'error.main' : 'warning.main';
};

const MoneyCell: React.FC<{ field: keyof RegisterDayTotals; value: number | null; bold?: boolean }> = ({
  field,
  value,
  bold,
}) => (
  <TableCell
    align="right"
    sx={{
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: bold || field === 'discrepancy' ? 600 : 400,
      color:
        field === 'discrepancy' ? discrepancyColor(value) : value ? 'text.primary' : 'text.disabled',
    }}
  >
    {value === null ? '—' : formatCurrency(value)}
  </TableCell>
);

interface RowProps {
  row: RegisterDayRow;
  columns: typeof TOTAL_COLUMNS;
  canReview: boolean;
  canOpenSessions: boolean;
  busy: boolean;
  onReview: (row: RegisterDayRow, status: GeneralClosingReviewStatus) => void;
  onHandover: (row: RegisterDayRow) => void;
}

const RegisterRow: React.FC<RowProps> = ({
  row,
  columns,
  canReview,
  canOpenSessions,
  busy,
  onReview,
  onHandover,
}) => {
  const [open, setOpen] = useState(false);
  const { cashRegister, review, sessions, totals, handover } = row;
  const hasDiscrepancy = (totals.discrepancy ?? 0) !== 0;
  // El efectivo de un local que ya cerró lo recoge la Matriz.
  const canHandover =
    canReview &&
    row.status === 'CLOSED' &&
    cashRegister.location.type === 'STORE' &&
    !handover &&
    (totals.counted ?? 0) > 0;

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: open ? 'unset' : undefined } }}>
        <TableCell padding="checkbox">
          {sessions.length > 0 && (
            <IconButton
              size="small"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Ocultar sesiones' : 'Ver sesiones'}
            >
              {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          )}
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SedeDot color={cashRegister.location.color} />
            <Typography variant="body2" fontWeight={600}>
              {cashRegister.name}
            </Typography>
          </Stack>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            variant="outlined"
            color={STATUS_COLORS[row.status]}
            label={REGISTER_DAY_STATUS_LABELS[row.status]}
          />
        </TableCell>
        {columns.map((column) => (
          <MoneyCell key={column.field} field={column.field} value={totals[column.field]} />
        ))}
        <TableCell sx={{ whiteSpace: 'nowrap', ...STICKY_REVIEW }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {review ? (
              <Tooltip
                title={[review.notes, `Revisó ${fullName(review.reviewedBy)}`].filter(Boolean).join(' · ')}
              >
                <Chip
                  size="small"
                  color={REVIEW_STATUS_COLORS[review.status]}
                  label={REVIEW_STATUS_LABELS[review.status]}
                />
              </Tooltip>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin revisar
              </Typography>
            )}
            {canReview && row.status === 'NO_SESSION' && review?.status !== 'NO_OPERATION' && (
              <Button size="small" disabled={busy} onClick={() => onReview(row, 'NO_OPERATION')}>
                Sin operación
              </Button>
            )}
            {canReview && row.status === 'CLOSED' && (
              <>
                {review?.status !== 'VERIFIED' && (
                  <Tooltip title={hasDiscrepancy ? 'Cerró con diferencia: se observa, con nota' : ''}>
                    <span>
                      <Button
                        size="small"
                        color="success"
                        disabled={busy || hasDiscrepancy}
                        onClick={() => onReview(row, 'VERIFIED')}
                      >
                        Verificar
                      </Button>
                    </span>
                  </Tooltip>
                )}
                <Button
                  size="small"
                  color="warning"
                  disabled={busy}
                  onClick={() => onReview(row, 'OBSERVED')}
                >
                  {review?.status === 'OBSERVED' ? 'Cambiar nota' : 'Observar'}
                </Button>
              </>
            )}
          </Stack>
          {review?.notes && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', maxWidth: 260, whiteSpace: 'normal' }}
            >
              {review.notes}
            </Typography>
          )}
          {handover && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Entregó {formatCurrency(handover.amount)}
              {handover.baseLeft !== null && ` · base ${formatCurrency(handover.baseLeft)}`}
            </Typography>
          )}
          {canHandover && (
            <Button size="small" sx={{ mt: 0.5 }} disabled={busy} onClick={() => onHandover(row)}>
              Recibir efectivo
            </Button>
          )}
        </TableCell>
      </TableRow>
      {sessions.length > 0 && (
        <TableRow>
          <TableCell colSpan={columns.length + 4} sx={{ py: 0, bgcolor: 'action.hover' }}>
            <Collapse in={open} unmountOnExit>
              <Box sx={{ py: 1.5, pl: 6 }}>
                {sessions.map((session) => (
                  <Typography key={session.id} variant="body2" sx={{ mb: 0.5 }}>
                    {formatTime(session.openedAt)} – {session.closedAt ? formatTime(session.closedAt) : 'abierta'} ·
                    abrió {fullName(session.openedBy)}
                    {session.closedAt && ` · cerró ${fullName(session.closedBy)}`}
                    {session.discrepancy !== null &&
                      ` · diferencia ${formatCurrency(session.discrepancy)}`}
                    {session.notes && ` · «${session.notes}»`}
                    {canOpenSessions && (
                      <>
                        {' · '}
                        <Link
                          component={RouterLink}
                          to={ROUTES.CASH_SESSION_HISTORY_DETAIL.replace(':id', session.id)}
                        >
                          ver sesión
                        </Link>
                      </>
                    )}
                  </Typography>
                ))}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

interface Props {
  day: GeneralClosingDay;
  canReview: boolean;
  canOpenSessions: boolean;
  busy: boolean;
  onReview: (row: RegisterDayRow, status: GeneralClosingReviewStatus) => void;
  onHandover: (row: RegisterDayRow) => void;
}

/** Las cajas de todas las sedes en un día, lado a lado, con su revisión. */
export const ClosingDayTable: React.FC<Props> = ({
  day,
  canReview,
  canOpenSessions,
  busy,
  onReview,
  onHandover,
}) => {
  const columns = TOTAL_COLUMNS.filter(
    (column) =>
      !OPTIONAL_FIELDS.includes(column.field) || day.registers.some((row) => row.totals[column.field]),
  );

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" sx={{ '& td, & th': { px: 1.25 } }}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Caja</TableCell>
            <TableCell>Estado</TableCell>
            {columns.map((column) => (
              <TableCell key={column.field} align="right" sx={{ whiteSpace: 'nowrap' }}>
                {column.label}
              </TableCell>
            ))}
            <TableCell sx={STICKY_REVIEW}>Revisión</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {day.registers.map((row) => (
            <RegisterRow
              key={row.cashRegister.id}
              row={row}
              columns={columns}
              canReview={canReview}
              canOpenSessions={canOpenSessions}
              busy={busy}
              onReview={onReview}
              onHandover={onHandover}
            />
          ))}
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell />
            <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
              Total
            </TableCell>
            {columns.map((column) => (
              <MoneyCell key={column.field} field={column.field} value={day.totals[column.field]} bold />
            ))}
            <TableCell sx={STICKY_REVIEW} />
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
};
