import React, { useMemo } from 'react';
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
  Alert,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import type { DenominationCountItemDto, BalancePreview } from '../../../types/cash-register.types';
import { COLOMBIAN_BILLS, COLOMBIAN_COINS } from '../../../types/cash-register.types';

interface Props {
  denominations: DenominationCountItemDto[];
  preview: BalancePreview;
  readonly?: boolean;
}

const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(Number(value));

const ConciliationSummary: React.FC<Props> = ({ denominations, preview, readonly }) => {
  const closingAmount = useMemo(
    () => denominations.reduce((acc, d) => acc + d.denomination * d.quantity, 0),
    [denominations],
  );

  const systemBalance = Number(preview.systemBalance);
  const discrepancy = closingAmount - systemBalance;
  const hasDiscrepancy = discrepancy !== 0;

  const discrepancyColor = discrepancy === 0 ? 'success' : discrepancy > 0 ? 'warning' : 'error';
  const discrepancyLabel =
    discrepancy === 0
      ? 'Caja Cuadrada'
      : discrepancy > 0
      ? `Sobrante: ${formatCurrency(Math.abs(discrepancy))}`
      : `Faltante: ${formatCurrency(Math.abs(discrepancy))}`;

  const DiscrepancyIcon =
    discrepancy === 0 ? RemoveIcon : discrepancy > 0 ? TrendingUpIcon : TrendingDownIcon;

  return (
    <Stack spacing={2}>
      {/* Denomination breakdown */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Conteo de Denominaciones
        </Typography>

        {/* Bills section */}
        {(() => {
          const billRows = COLOMBIAN_BILLS.map((denom) => {
            const row = denominations.find((d) => d.denomination === denom);
            return row && row.quantity > 0 ? { denom, qty: row.quantity } : null;
          }).filter(Boolean) as { denom: number; qty: number }[];

          const coinRows = COLOMBIAN_COINS.map((denom) => {
            const row = denominations.find((d) => d.denomination === denom);
            return row && row.quantity > 0 ? { denom, qty: row.quantity } : null;
          }).filter(Boolean) as { denom: number; qty: number }[];

          return (
            <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Denominación</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Cant.</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Subtotal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Bill group header */}
                {billRows.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ py: 0.3, px: 1, bgcolor: 'action.hover', borderBottom: 'none' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccountBalanceWalletIcon sx={{ fontSize: 14, color: 'success.main' }} />
                        <Typography variant="caption" fontWeight={700} color="success.main" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Billetes
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                {billRows.map(({ denom, qty }) => (
                  <TableRow key={denom} sx={{ '&:last-of-type td': { borderBottom: billRows[billRows.length - 1].denom === denom && coinRows.length > 0 ? undefined : 'none' } }}>
                    <TableCell sx={{ fontSize: '0.8rem', pl: 3 }}>{formatCurrency(denom)}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{qty}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatCurrency(denom * qty)}</TableCell>
                  </TableRow>
                ))}

                {/* Coin group header */}
                {coinRows.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ py: 0.3, px: 1, bgcolor: 'action.hover', borderBottom: 'none' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <MonetizationOnIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                        <Typography variant="caption" fontWeight={700} color="warning.main" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Monedas
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                {coinRows.map(({ denom, qty }) => (
                  <TableRow key={denom}>
                    <TableCell sx={{ fontSize: '0.8rem', pl: 3 }}>{formatCurrency(denom)}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{qty}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatCurrency(denom * qty)}</TableCell>
                  </TableRow>
                ))}

                {/* Total row */}
                <TableRow>
                  <TableCell colSpan={2} sx={{ fontWeight: 700, fontSize: '0.85rem', borderBottom: 'none', pt: 1 }}>
                    Total Conteo
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.95rem', borderBottom: 'none', pt: 1 }}>
                    {formatCurrency(closingAmount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          );
        })()}
      </Paper>

      {/* Comparison table */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Conciliación
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Solo efectivo. Las transferencias y otros métodos no pasan por el cajón.
        </Typography>
        <Divider sx={{ mb: 1.5 }} />

        <Stack spacing={1.5}>
          {/* Breakdown */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Fondo Inicial</Typography>
            <Typography variant="body2">{formatCurrency(preview.openingAmount)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              + Ingresos
            </Typography>
            <Typography variant="body2" color="success.main">
              {formatCurrency(preview.totalIncome)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              + Depósitos
            </Typography>
            <Typography variant="body2" color="info.main">
              {formatCurrency(preview.totalDeposits)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              − Egresos
            </Typography>
            <Typography variant="body2" color="error.main">
              {formatCurrency(preview.totalExpense)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              − Retiros
            </Typography>
            <Typography variant="body2" color="warning.main">
              {formatCurrency(preview.totalWithdrawals)}
            </Typography>
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body1" fontWeight={600}>
              Saldo del Sistema
            </Typography>
            <Typography variant="body1" fontWeight={700}>
              {formatCurrency(systemBalance)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body1" fontWeight={600}>
              Conteo Físico
            </Typography>
            <Typography variant="body1" fontWeight={700}>
              {formatCurrency(closingAmount)}
            </Typography>
          </Box>

          <Divider />

          {/* Discrepancy */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body1" fontWeight={700}>
              Descuadre
            </Typography>
            <Chip
              label={discrepancyLabel}
              color={discrepancyColor}
              icon={<DiscrepancyIcon />}
              variant={hasDiscrepancy ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
          </Box>
        </Stack>
      </Paper>

      {/* Alert for discrepancy */}
      {hasDiscrepancy && !readonly && (
        <Alert severity={discrepancy > 0 ? 'warning' : 'error'}>
          {discrepancy > 0
            ? `Hay un sobrante de ${formatCurrency(Math.abs(discrepancy))} en caja. Verifica el conteo antes de confirmar el cierre.`
            : `Hay un faltante de ${formatCurrency(Math.abs(discrepancy))} en caja. Verifica el conteo antes de confirmar el cierre.`}
        </Alert>
      )}
    </Stack>
  );
};

export default ConciliationSummary;
