import React from 'react';
import { Box, Card, CardContent, Typography, Chip, alpha } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RemoveShoppingCartIcon from '@mui/icons-material/RemoveShoppingCart';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import { FinancialSummary } from '../../../types/dashboard.types';

interface KPICardProps {
  title: string;
  value: number;
  prevValue: number;
  icon: React.ReactNode;
  color: string;
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

const calcVariation = (current: number, prev: number) => {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
};

const KPICard: React.FC<KPICardProps> = ({ title, value, prevValue, icon, color }) => {
  const variation = calcVariation(value, prevValue);
  const isPositive = variation !== null && variation >= 0;

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: '20px',
        border: '2px solid',
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 167, 224,0.1)' : 'rgba(0,0,0,0.06)',
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? 'linear-gradient(145deg, rgba(22, 24, 22,0.6) 0%, rgba(26, 28, 25,1) 100%)'
            : 'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(241,245,249,0.8) 100%)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: color,
          boxShadow: `0 8px 24px ${alpha(color, 0.25)}`,
        },
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {title}
          </Typography>
          <Box sx={{ p: 1, borderRadius: '12px', bgcolor: alpha(color, 0.12), color, display: 'flex' }}>
            {icon}
          </Box>
        </Box>

        <Typography variant="h5" fontWeight={700} sx={{ mb: 1, fontSize: { xs: '1.1rem', md: '1.4rem' } }}>
          {formatCOP(value)}
        </Typography>

        {variation !== null && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              size="small"
              icon={isPositive ? <TrendingUpIcon sx={{ fontSize: '0.9rem !important' }} /> : <TrendingDownIcon sx={{ fontSize: '0.9rem !important' }} />}
              label={`${isPositive ? '+' : ''}${variation.toFixed(1)}%`}
              sx={{
                fontSize: '0.72rem',
                fontWeight: 700,
                bgcolor: isPositive ? alpha('#22c55e', 0.12) : alpha('#ef4444', 0.12),
                color: isPositive ? '#22c55e' : '#ef4444',
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
            <Typography variant="caption" color="text.secondary">vs período ant.</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

interface Props {
  summary: FinancialSummary;
}

export const FinancialKPICards: React.FC<Props> = ({ summary }) => {
  const cards: KPICardProps[] = [
    {
      title: 'Ventas Totales',
      value: summary.totalVentas,
      prevValue: summary.totalVentasPrev,
      icon: <AttachMoneyIcon fontSize="small" />,
      color: '#22c55e',
    },
    {
      title: 'Gastos Totales',
      value: summary.totalGastos,
      prevValue: summary.totalGastosPrev,
      icon: <RemoveShoppingCartIcon fontSize="small" />,
      color: '#ef4444',
    },
    {
      title: 'Utilidad',
      value: summary.utilidad,
      prevValue: summary.utilidadPrev,
      icon: <AccountBalanceIcon fontSize="small" />,
      color: summary.utilidad >= 0 ? '#F97316' : '#ef4444',
    },
    {
      title: 'Cuentas por Pagar',
      value: summary.cuentasPorPagar,
      prevValue: 0,
      icon: <PaymentsIcon fontSize="small" />,
      color: '#a855f7',
    },
    {
      title: 'Cuentas por Cobrar',
      value: summary.cuentasPorCobrar,
      prevValue: 0,
      icon: <RequestQuoteIcon fontSize="small" />,
      color: '#0ea5e9',
    },
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' },
        gap: { xs: 1.5, md: 2 },
      }}
    >
      {cards.map((card) => (
        <KPICard key={card.title} {...card} />
      ))}
    </Box>
  );
};
