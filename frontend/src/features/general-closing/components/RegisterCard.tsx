import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { SedeDot } from '../../../components/layout/LocationSelector';
import {
  REGISTER_DAY_STATUS_LABELS,
  type GeneralClosingReviewStatus,
  type RegisterDayRow,
  type RegisterDayStatus,
} from '../../../types/general-closing.types';
import { ROUTES } from '../../../utils/constants';
import {
  discrepancyColor,
  discrepancyLabel,
  formatCurrency,
  formatTime,
  fullName,
  registerAnchor,
} from '../utils';

const STATUS_COLORS: Record<RegisterDayStatus, 'default' | 'success' | 'warning'> = {
  CLOSED: 'success',
  OPEN: 'warning',
  NO_SESSION: 'default',
};

const money = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

/** Un número del cuadre: la etiqueta arriba, el valor abajo. */
export const Figure: React.FC<{
  label: string;
  value: number | null;
  sign?: '+' | '−' | '=';
  strong?: boolean;
  color?: string;
}> = ({ label, value, sign, strong, color }) => (
  <Box sx={{ minWidth: 92 }}>
    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
      {sign && `${sign} `}
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{ ...money, fontWeight: strong ? 700 : 500, color: color ?? (value ? 'text.primary' : 'text.disabled') }}
    >
      {value === null ? '—' : formatCurrency(value)}
    </Typography>
  </Box>
);

/** Un paso de la revisión de la caja: estado con ícono, una frase y su acción. */
const ClosingStep: React.FC<{
  title: string;
  done: boolean;
  warning?: boolean;
  status: string;
  detail?: string;
  children?: React.ReactNode;
}> = ({ title, done, warning, status, detail, children }) => {
  const Icon = !done ? RadioButtonUncheckedIcon : warning ? ErrorOutlineIcon : CheckCircleIcon;
  const color = !done ? 'text.disabled' : warning ? 'warning.main' : 'success.main';
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Icon sx={{ color, fontSize: 20, mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ lineHeight: 1.4 }}>
          {title}
        </Typography>
        <Typography variant="body2" color={done ? 'text.primary' : 'text.secondary'}>
          {status}
        </Typography>
        {detail && (
          <Typography variant="caption" color="text.secondary" display="block">
            {detail}
          </Typography>
        )}
        {React.Children.count(children) > 0 && (
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {children}
          </Stack>
        )}
      </Box>
    </Stack>
  );
};

/** Todos los botones de los pasos del mismo tamaño; el principal, relleno. */
const StepButton: React.FC<{
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ primary, disabled, onClick, children }) => (
  <Button
    fullWidth
    size="small"
    variant={primary ? 'contained' : 'outlined'}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
);

interface Props {
  row: RegisterDayRow;
  canReview: boolean;
  canOpenSessions: boolean;
  busy: boolean;
  onReview: (row: RegisterDayRow, status: GeneralClosingReviewStatus) => void;
  onHandover: (row: RegisterDayRow) => void;
  onPayments: (row: RegisterDayRow) => void;
  /**
   * El efectivo de un día se recibe en una caja de la Matriz de un día
   * posterior; revisando el día de hoy todavía no se puede.
   */
  canReceiveToday: boolean;
}

/**
 * Una caja en el cierre general. A la izquierda, el cuadre de efectivo como
 * operación (base + entradas − salidas = esperado, contra lo contado); debajo,
 * lo que entró por otros medios, que no se cuenta en el cajón. A la derecha,
 * la revisión de contabilidad y la entrega del efectivo a la Matriz.
 */
export const RegisterCard: React.FC<Props> = ({
  row,
  canReview,
  canOpenSessions,
  busy,
  onReview,
  onHandover,
  onPayments,
  canReceiveToday,
}) => {
  const [showSessions, setShowSessions] = useState(false);
  const { cashRegister, review, sessions, totals: t, handover, status, payments } = row;
  const isStore = cashRegister.location.type === 'STORE';
  const discrepancy = t.discrepancy;
  const hasDiscrepancy = (discrepancy ?? 0) !== 0;
  const canHandover = canReview && status === 'CLOSED' && isStore && !handover && (t.counted ?? 0) > 0;
  const reviewStatus = (() => {
    if (review?.status === 'VERIFIED') return 'Cuadre verificado';
    if (review?.status === 'OBSERVED') return 'Quedó observada';
    if (review?.status === 'NO_OPERATION') return 'Confirmado: la caja no abrió';
    if (status === 'OPEN') return 'Se revisa cuando la sede cierre la caja';
    if (status === 'NO_SESSION') return 'La caja no abrió este día';
    if (hasDiscrepancy && discrepancy !== null) {
      return `${discrepancyLabel(discrepancy)}: anota qué pasó antes de cerrar el día`;
    }
    return 'Por revisar: el contado coincide con lo esperado';
  })();
  const otherMethods = [
    { label: 'Transferencia', value: t.incomeTransfer },
    { label: 'Tarjeta', value: t.incomeCard },
    { label: 'Otros medios', value: t.incomeOther },
    { label: 'Egresos no efectivo', value: t.otherExpenses },
  ].filter((item) => item.value);

  return (
    <Paper variant="outlined" id={registerAnchor(cashRegister.id)} sx={{ p: 2, scrollMarginTop: 96 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} divider={<Divider orientation="vertical" flexItem />}>
        {/* Caja y cuadre */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            <SedeDot color={cashRegister.location.color} size={12} />
            <Typography variant="subtitle1" fontWeight={700}>
              {cashRegister.name}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color={STATUS_COLORS[status]}
              label={REGISTER_DAY_STATUS_LABELS[status]}
            />
            {discrepancy !== null && (
              <Chip
                size="small"
                label={discrepancyLabel(discrepancy)}
                sx={{ color: discrepancyColor(discrepancy), fontWeight: 600 }}
                variant="outlined"
              />
            )}
            {sessions.length > 0 && (
              <Button
                size="small"
                color="inherit"
                onClick={() => setShowSessions((v) => !v)}
                endIcon={showSessions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ ml: 'auto', color: 'text.secondary' }}
              >
                {sessions.length === 1 ? '1 sesión' : `${sessions.length} sesiones`}
              </Button>
            )}
          </Stack>

          {status === 'NO_SESSION' ? (
            <Typography variant="body2" color="text.secondary">
              La caja no abrió este día.
            </Typography>
          ) : (
            <>
              <Stack direction="row" spacing={2} rowGap={1.5} flexWrap="wrap" useFlexGap alignItems="flex-end">
                <Figure label="Base" value={t.openingAmount} />
                <Figure sign="+" label="Ventas en efectivo" value={t.incomeCash} />
                {t.handoversIn > 0 && <Figure sign="+" label="Recibido de locales" value={t.handoversIn} />}
                {t.deposits > 0 && <Figure sign="+" label="Retiros del banco" value={t.deposits} />}
                <Figure sign="−" label="Egresos" value={t.cashExpenses} />
                {t.withdrawals > 0 && <Figure sign="−" label="Consignaciones" value={t.withdrawals} />}
                <Figure sign="=" label="Esperado" value={t.expected} strong />
                <Figure label="Contado" value={t.counted} strong />
                <Figure
                  label="Diferencia"
                  value={discrepancy}
                  strong
                  color={discrepancyColor(discrepancy)}
                />
              </Stack>
              {otherMethods.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  No entra al cuadre:{' '}
                  {otherMethods.map((item) => `${item.label} ${formatCurrency(item.value)}`).join(' · ')}
                </Typography>
              )}
            </>
          )}

          <Collapse in={showSessions} unmountOnExit>
            <Box sx={{ mt: 1.5, pl: 1.5, borderLeft: 2, borderColor: 'divider' }}>
              {sessions.map((session) => (
                <Typography key={session.id} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {formatTime(session.openedAt)} – {session.closedAt ? formatTime(session.closedAt) : 'abierta'} ·
                  abrió {fullName(session.openedBy)}
                  {session.closedAt && ` · cerró ${fullName(session.closedBy)}`}
                  {session.discrepancy !== null && ` · diferencia ${formatCurrency(session.discrepancy)}`}
                  {session.notes && ` · «${session.notes}»`}
                  {canOpenSessions && (
                    <>
                      {' · '}
                      <Link component={RouterLink} to={ROUTES.CASH_SESSION_HISTORY_DETAIL.replace(':id', session.id)}>
                        ver sesión
                      </Link>
                    </>
                  )}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Box>

        {/* Lo que contabilidad hace con esta caja, en orden */}
        <Stack spacing={2} sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0 }}>
          {/* Los pagos son de la sede; la caja menor de la Matriz no recibe abonos. */}
          {payments && (isStore || payments.total > 0) && (
            <ClosingStep
              title="Pagos del día"
              done={payments.pending === 0}
              status={
                payments.total === 0
                  ? 'No hubo pagos'
                  : payments.pending === 0
                    ? `${payments.total === 1 ? 'El pago está revisado' : `Los ${payments.total} pagos están revisados`}${
                        payments.observed > 0 ? ` (${payments.observed} con observación)` : ''
                      }`
                  : `${payments.pending} de ${payments.total} por verificar · ${formatCurrency(payments.pendingAmount)}`
              }
            >
              {payments.total > 0 && (
                <StepButton
                  primary={canReview && payments.pending > 0}
                  onClick={() => onPayments(row)}
                >
                  {canReview && payments.pending > 0 ? 'Verificar pagos' : 'Ver pagos'}
                </StepButton>
              )}
            </ClosingStep>
          )}

          <ClosingStep
            title={status === 'NO_SESSION' ? 'Día sin operación' : 'Cuadre de la caja'}
            done={!!review}
            warning={review?.status === 'OBSERVED'}
            status={reviewStatus}
            detail={review ? [review.notes, `Revisó ${fullName(review.reviewedBy)}`].filter(Boolean).join(' · ') : undefined}
          >
            {canReview && status === 'NO_SESSION' && !review && (
              <StepButton primary disabled={busy} onClick={() => onReview(row, 'NO_OPERATION')}>
                Confirmar que no abrió
              </StepButton>
            )}
            {canReview && status === 'CLOSED' && review?.status !== 'VERIFIED' && !hasDiscrepancy && (
              <StepButton primary disabled={busy} onClick={() => onReview(row, 'VERIFIED')}>
                Dar por cuadrada
              </StepButton>
            )}
            {canReview && status === 'CLOSED' && (
              <StepButton
                primary={hasDiscrepancy && !review}
                disabled={busy}
                onClick={() => onReview(row, 'OBSERVED')}
              >
                {review?.status === 'OBSERVED'
                  ? 'Editar la nota'
                  : hasDiscrepancy
                    ? `Dejar observada con nota`
                    : 'Dejar una observación'}
              </StepButton>
            )}
          </ClosingStep>

          {isStore && status === 'CLOSED' && (handover || (t.counted ?? 0) > 0) && (
            <ClosingStep
              title="Efectivo a la Matriz"
              done={!!handover}
              status={
                handover
                  ? `Recibido ${formatCurrency(handover.amount)}${
                      handover.baseLeft !== null ? ` · quedó de base ${formatCurrency(handover.baseLeft)}` : ''
                    }`
                  : canReceiveToday
                    ? `Por recoger: ${formatCurrency(t.counted ?? 0)} contados`
                    : `${formatCurrency(t.counted ?? 0)} contados. Se recibe mañana, en la caja de la Matriz`
              }
            >
              {canHandover && canReceiveToday && (
                <StepButton disabled={busy} onClick={() => onHandover(row)}>
                  Recibir efectivo
                </StepButton>
              )}
            </ClosingStep>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};
