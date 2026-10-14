import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Link,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { useAuthStore } from '../../../store/authStore';
import type { LocationPeriodRow } from '../../../types/general-closing.types';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import { useGeneralClosingByLocation } from '../hooks/useGeneralClosing';
import { businessToday, formatCurrency } from '../utils';

const money = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

const Money: React.FC<{ value: number; color?: string; bold?: boolean }> = ({ value, color, bold }) => (
  <Typography
    variant="body2"
    component="span"
    sx={{ ...money, fontWeight: bold ? 600 : 400, color: value ? color ?? 'text.primary' : 'text.disabled' }}
  >
    {formatCurrency(value)}
  </Typography>
);

/** Monto de faltantes o sobrantes con la cantidad de días debajo. */
const DiffCell: React.FC<{ days: number; total: number; color: string }> = ({ days, total, color }) => (
  <TableCell align="right">
    <Money value={total} color={color} bold={total > 0} />
    {days > 0 && (
      <Typography variant="caption" color="text.secondary" display="block">
        {days === 1 ? '1 día' : `${days} días`}
      </Typography>
    )}
  </TableCell>
);

const PaymentsCell: React.FC<{ payments: LocationPeriodRow['payments'] }> = ({ payments }) => (
  <TableCell align="right">
    {payments.total === 0 ? (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    ) : (
      <>
        <Typography variant="body2" sx={{ color: payments.observed ? 'warning.main' : 'text.primary', fontWeight: payments.observed ? 600 : 400 }}>
          {payments.observed} de {payments.total}
        </Typography>
        {payments.pending > 0 && (
          <Typography variant="caption" color="text.secondary" display="block">
            {payments.pending} sin verificar
          </Typography>
        )}
      </>
    )}
  </TableCell>
);

const firstDayOfMonth = (day: string) => `${day.slice(0, 8)}01`;

/**
 * Comparativo de las cajas por sede en un periodo, desde el control de caja:
 * qué tan seguido cuadra cada local, cuánto le faltó o sobró, qué dinero manejó
 * y cuánto le entregó a la Matriz. Las ventas y los gastos del negocio están en
 * el Dashboard por sede; aquí no se repiten para no tener dos cifras distintas.
 */
export const ByLocationView: React.FC = () => {
  const today = businessToday();
  const [from, setFrom] = useState(firstDayOfMonth(today));
  const [to, setTo] = useState(today);
  const query = useGeneralClosingByLocation(from, to, true);
  const { hasPermission } = useAuthStore();
  const canSeeDashboard =
    hasPermission(PERMISSIONS.READ_FINANCIAL_DASHBOARD) && hasPermission(PERMISSIONS.VIEW_ALL_LOCATIONS);

  const data = query.data;
  const showCard = !!data?.rows.some((row) => row.incomeCard > 0);
  const invalid = !!from && !!to && from > to;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField
          type="date"
          size="small"
          label="Desde"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          inputProps={{ max: today }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          size="small"
          label="Hasta"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          inputProps={{ max: today }}
          InputLabelProps={{ shrink: true }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>
          Cómo cuadró cada caja y qué efectivo manejó en el periodo.
          {canSeeDashboard && (
            <>
              {' '}Ventas y gastos por sede:{' '}
              <Link component={RouterLink} to={ROUTES.DASHBOARD_SEDES}>
                Dashboard por sede
              </Link>
              .
            </>
          )}
        </Typography>
      </Stack>

      {invalid && <Alert severity="warning" sx={{ mb: 2 }}>La fecha inicial es posterior a la final.</Alert>}
      {query.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(query.error as { message?: string })?.message || 'No se pudo cargar el comparativo'}
        </Alert>
      )}

      <Paper variant="outlined">
        {query.isFetching && <LinearProgress />}
        <TableContainer>
          <Table size="small" sx={{ '& td, & th': { px: 1.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Caja</TableCell>
                <TableCell align="right">
                  <Tooltip title="Días cuadrados de los días en que la caja abrió">
                    <span>Días cuadrados</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">Faltantes</TableCell>
                <TableCell align="right">Sobrantes</TableCell>
                <TableCell align="right">Efectivo recibido</TableCell>
                <TableCell align="right">Transferencias</TableCell>
                {showCard && <TableCell align="right">Tarjeta</TableCell>}
                <TableCell align="right">Egresos en efectivo</TableCell>
                <TableCell align="right">Entregado a la Matriz</TableCell>
                <TableCell align="right">
                  <Tooltip title="Pagos que contabilidad dejó observados, de los pagos de la sede en el periodo">
                    <span>Pagos observados</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.rows.map((row) => {
                const isStore = row.cashRegister.location.type === 'STORE';
                const allBalanced = row.daysBalanced === row.daysWithCash;
                return (
                  <TableRow key={row.cashRegister.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <SedeDot color={row.cashRegister.location.color} />
                        <Typography variant="body2" fontWeight={600}>
                          {row.cashRegister.name}
                        </Typography>
                      </Stack>
                      {row.openSessions > 0 && (
                        <Typography variant="caption" color="warning.main" display="block">
                          {row.openSessions === 1 ? '1 sesión abierta' : `${row.openSessions} sesiones abiertas`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {row.daysWithCash === 0 ? (
                        <Typography variant="body2" color="text.disabled">
                          No abrió
                        </Typography>
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: allBalanced ? 'success.main' : 'text.primary',
                          }}
                        >
                          {row.daysBalanced} de {row.daysWithCash}
                        </Typography>
                      )}
                    </TableCell>
                    <DiffCell days={row.daysShort} total={row.shortTotal} color="error.main" />
                    <DiffCell days={row.daysOver} total={row.overTotal} color="warning.main" />
                    <TableCell align="right"><Money value={row.incomeCash} /></TableCell>
                    <TableCell align="right"><Money value={row.incomeTransfer} /></TableCell>
                    {showCard && <TableCell align="right"><Money value={row.incomeCard} /></TableCell>}
                    <TableCell align="right"><Money value={row.cashExpenses} /></TableCell>
                    <TableCell align="right">
                      {isStore ? (
                        <Money value={row.handedOver} />
                      ) : (
                        <Tooltip title="Lo que la Matriz recibió de los locales">
                          <Typography variant="body2" color="text.secondary" component="span" sx={money}>
                            recibió {formatCurrency(row.handoversIn)}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <PaymentsCell payments={row.payments} />
                  </TableRow>
                );
              })}
              {data && (
                <TableRow sx={{ bgcolor: 'action.hover', '& td': { fontWeight: 700 } }}>
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <DiffCell days={0} total={data.totals.shortTotal} color="error.main" />
                  <DiffCell days={0} total={data.totals.overTotal} color="warning.main" />
                  <TableCell align="right"><Money value={data.totals.incomeCash} bold /></TableCell>
                  <TableCell align="right"><Money value={data.totals.incomeTransfer} bold /></TableCell>
                  {showCard && <TableCell align="right"><Money value={data.totals.incomeCard} bold /></TableCell>}
                  <TableCell align="right"><Money value={data.totals.cashExpenses} bold /></TableCell>
                  <TableCell align="right"><Money value={data.totals.handedOver} bold /></TableCell>
                  <PaymentsCell payments={data.totals.payments} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Un día cuenta como cuadrado si todas las sesiones de ese día cerraron y la diferencia del día dio $0.
        Los pagos son los de cada sede por su fecha de pago.
      </Typography>
    </Box>
  );
};
