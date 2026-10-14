import React from 'react';
import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import type { ClosingConsolidated, ConsolidatedLine } from '../../../types/general-closing.types';
import { formatCurrency } from '../utils';

const money = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

const SummaryLine: React.FC<{ sign?: '+' | '−'; label: string; value: number; bold?: boolean }> = ({
  sign,
  label,
  value,
  bold,
}) => (
  <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
    <Typography variant="body2" fontWeight={bold ? 700 : 400}>
      {sign && (
        <Box component="span" sx={{ color: sign === '+' ? 'success.main' : 'error.main', mr: 0.75 }}>
          ({sign})
        </Box>
      )}
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={bold ? 700 : 500} sx={money}>
      {formatCurrency(value)}
    </Typography>
  </Stack>
);

const DetailTable: React.FC<{
  title: string;
  referenceLabel: string;
  detailLabel: string;
  lines: (ConsolidatedLine & { group?: string })[];
  empty: string;
}> = ({ title, referenceLabel, detailLabel, lines, empty }) => (
  <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
    <Typography variant="subtitle2" sx={{ px: 2, py: 1.25 }}>
      {title}
    </Typography>
    <Divider />
    {lines.length === 0 ? (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        {empty}
      </Typography>
    ) : (
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Sede</TableCell>
            <TableCell>{referenceLabel}</TableCell>
            <TableCell>{detailLabel}</TableCell>
            <TableCell align="right">Valor</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow key={`${line.reference}-${index}`}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <SedeDot color={line.location.color} />
                  <span>{line.location.code}</span>
                </Stack>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{line.reference}</TableCell>
              <TableCell>
                {line.detail}
                {line.group && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {line.group}
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right" sx={money}>
                {formatCurrency(line.amount)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} sx={{ fontWeight: 700, borderBottom: 0 }}>
              Total
            </TableCell>
            <TableCell align="right" sx={{ ...money, fontWeight: 700, borderBottom: 0 }}>
              {formatCurrency(lines.reduce((sum, line) => sum + line.amount, 0))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )}
  </Paper>
);

/**
 * El consolidado de caja de contabilidad, con el formato de su planilla: todas
 * las cajas como una sola y solo en efectivo. La base incluye las bases de los
 * locales y lo que la Matriz recogió de ellos.
 */
export const ConsolidatedSheet: React.FC<{ consolidated: ClosingConsolidated }> = ({ consolidated }) => {
  const { difference } = consolidated;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Consolidado de caja
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Solo efectivo, con todas las cajas sumadas como una sola.
      </Typography>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start">
        <Paper variant="outlined" sx={{ p: 2, width: { xs: '100%', lg: 340 }, flexShrink: 0 }}>
          <SummaryLine sign="+" label="Valor inicial (base)" value={consolidated.base} />
          <SummaryLine sign="+" label="Retiros del banco" value={consolidated.cashDeposits} />
          <SummaryLine sign="+" label="Ventas (abonos y saldos)" value={consolidated.cashSales} />
          {consolidated.expenseGroups.map((group) => (
            <SummaryLine key={group.label} sign="−" label={group.label} value={group.amount} />
          ))}
          {consolidated.cashWithdrawals > 0 && (
            <SummaryLine sign="−" label="Consignaciones" value={consolidated.cashWithdrawals} />
          )}
          <Divider sx={{ my: 1 }} />
          <SummaryLine label="Total en caja" value={consolidated.total} bold />
          {consolidated.counted === null ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
              Efectivo en caja: falta que cierren todas las cajas
            </Typography>
          ) : (
            <SummaryLine label="Efectivo en caja" value={consolidated.counted} bold />
          )}
          {difference !== null && (
            <Chip
              size="small"
              sx={{ mt: 1 }}
              color={difference === 0 ? 'success' : difference < 0 ? 'error' : 'warning'}
              label={
                difference === 0
                  ? 'Caja cuadrada'
                  : `${difference < 0 ? 'Faltante' : 'Sobrante'}: ${formatCurrency(Math.abs(difference))}`
              }
            />
          )}
        </Paper>
        <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          <DetailTable
            title="Recibido en efectivo"
            referenceLabel="OP"
            detailLabel="Cliente"
            lines={consolidated.cashReceived}
            empty="Ninguna caja recibió efectivo ese día"
          />
          <DetailTable
            title="Gastos en efectivo"
            referenceLabel="Documento"
            detailLabel="Proveedor"
            lines={consolidated.cashExpenses}
            empty="No hubo gastos en efectivo ese día"
          />
        </Stack>
      </Stack>
    </Box>
  );
};
