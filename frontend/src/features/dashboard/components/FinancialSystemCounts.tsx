import React from 'react';
import { Box, Card, CardContent, Typography, alpha } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import BusinessIcon from '@mui/icons-material/Business';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import BuildIcon from '@mui/icons-material/Build';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { FinancialIndicators } from '../../../types/dashboard.types';

interface CountCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

const CountCard: React.FC<CountCardProps> = ({ label, value, icon, color }) => (
  <Card
    sx={{
      borderRadius: '16px',
      border: '1px solid',
      borderColor: (theme) => theme.palette.mode === 'dark' ? alpha(color, 0.2) : alpha(color, 0.15),
      background: (theme) =>
        theme.palette.mode === 'dark'
          ? `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, rgba(26, 28, 25,0.8) 100%)`
          : `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, rgba(248,250,252,0.9) 100%)`,
      transition: 'all 0.2s ease',
      '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 4px 16px ${alpha(color, 0.2)}` },
    }}
  >
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ p: 1, borderRadius: '10px', bgcolor: alpha(color, 0.12), color, display: 'flex', flexShrink: 0 }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="h6" fontWeight={700} lineHeight={1}>{value.toLocaleString('es-CO')}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>{label}</Typography>
      </Box>
    </CardContent>
  </Card>
);

interface Props {
  indicators: FinancialIndicators;
}

export const FinancialSystemCounts: React.FC<Props> = ({ indicators }) => {
  const items: CountCardProps[] = [
    { label: 'Clientes', value: indicators.totalClients, icon: <PeopleIcon fontSize="small" />, color: '#3b82f6' },
    { label: 'Productos activos', value: indicators.totalProducts, icon: <Inventory2Icon fontSize="small" />, color: '#2EA7E0' },
    { label: 'Proveedores', value: indicators.totalSuppliers, icon: <BusinessIcon fontSize="small" />, color: '#06b6d4' },
    { label: 'Órdenes de Pedido', value: indicators.totalOP, icon: <ShoppingCartIcon fontSize="small" />, color: '#22c55e' },
    { label: 'Órdenes de Trabajo', value: indicators.totalOT, icon: <BuildIcon fontSize="small" />, color: '#f59e0b' },
    { label: 'Órdenes de Gasto', value: indicators.totalOG, icon: <ReceiptIcon fontSize="small" />, color: '#ef4444' },
  ];

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Indicadores del Sistema
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' },
          gap: { xs: 1, md: 1.5 },
        }}
      >
        {items.map((item) => (
          <CountCard key={item.label} {...item} />
        ))}
      </Box>
    </Box>
  );
};
