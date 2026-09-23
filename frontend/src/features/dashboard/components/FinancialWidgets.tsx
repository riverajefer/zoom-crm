import React from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, LinearProgress, alpha,
} from '@mui/material';
import { RecentOrder, PendingOrder, TopClient } from '../../../types/dashboard.types';

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

const ORDER_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }> = {
  DRAFT: { label: 'Borrador', color: 'default' },
  CONFIRMED: { label: 'Confirmada', color: 'primary' },
  IN_PRODUCTION: { label: 'En producción', color: 'info' },
  READY: { label: 'Lista', color: 'warning' },
  DELIVERED: { label: 'Entregada', color: 'success' },
  DELIVERED_ON_CREDIT: { label: 'Crédito', color: 'warning' },
  WARRANTY: { label: 'Garantía', color: 'secondary' },
  PAID: { label: 'Pagada', color: 'success' },
  RETURNED: { label: 'Devuelta', color: 'error' },
};

const widgetCardSx = {
  height: '100%',
  borderRadius: '20px',
  border: '2px solid',
  borderColor: (theme: any) => theme.palette.mode === 'dark' ? 'rgba(46, 167, 224,0.1)' : 'rgba(0,0,0,0.06)',
  background: (theme: any) =>
    theme.palette.mode === 'dark'
      ? 'linear-gradient(145deg, rgba(22, 24, 22,0.6) 0%, rgba(26, 28, 25,1) 100%)'
      : 'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(241,245,249,0.8) 100%)',
};

interface RecentOrdersWidgetProps { orders: RecentOrder[] }

const RecentOrdersWidget: React.FC<RecentOrdersWidgetProps> = ({ orders }) => (
  <Card sx={widgetCardSx}>
    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Últimas Órdenes
      </Typography>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 360 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Orden</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Cliente</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Total</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Estado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center"><Typography variant="caption" color="text.secondary">Sin órdenes</Typography></TableCell></TableRow>
            )}
            {orders.map((o) => {
              const statusInfo = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, color: 'default' as const };
              return (
                <TableRow key={o.id} sx={{ '&:hover': { bgcolor: (theme) => alpha(theme.palette.action.hover, 0.5) } }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 0.8 }}>{o.orderNumber}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.clientName}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatCOP(o.total)}</TableCell>
                  <TableCell align="center" sx={{ py: 0.5 }}>
                    <Chip label={statusInfo.label} color={statusInfo.color} size="small" sx={{ fontSize: '0.68rem', height: 20 }} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </CardContent>
  </Card>
);

interface PendingOrdersWidgetProps { orders: PendingOrder[] }

const PendingOrdersWidget: React.FC<PendingOrdersWidgetProps> = ({ orders }) => (
  <Card sx={widgetCardSx}>
    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Órdenes con Saldo Pendiente
      </Typography>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 360 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Orden</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Cliente</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Saldo</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase' }}>Estado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center"><Typography variant="caption" color="text.secondary">Sin pendientes</Typography></TableCell></TableRow>
            )}
            {orders.map((o) => {
              const statusInfo = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, color: 'default' as const };
              return (
                <TableRow key={o.id} sx={{ '&:hover': { bgcolor: (theme) => alpha(theme.palette.action.hover, 0.5) } }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 0.8 }}>{o.orderNumber}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.clientName}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>{formatCOP(o.balance)}</TableCell>
                  <TableCell align="center" sx={{ py: 0.5 }}>
                    <Chip label={statusInfo.label} color={statusInfo.color} size="small" sx={{ fontSize: '0.68rem', height: 20 }} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </CardContent>
  </Card>
);

interface TopClientsWidgetProps { clients: TopClient[] }

const TopClientsWidget: React.FC<TopClientsWidgetProps> = ({ clients }) => {
  const maxValue = clients.length > 0 ? Math.max(...clients.map((c) => c.totalCompras)) : 1;

  return (
    <Card sx={widgetCardSx}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Top 5 Clientes por Ventas
        </Typography>
        {clients.length === 0 && (
          <Typography variant="caption" color="text.secondary">Sin datos para el período</Typography>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {clients.map((client, idx) => (
            <Box key={client.clientId}>
              {/* Grid: badge | nombre | monto */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto',
                  alignItems: 'center',
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    width: 20, height: 20, borderRadius: '50%',
                    bgcolor: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7f32' : 'rgba(255,255,255,0.1)',
                    color: idx <= 2 ? '#000' : 'text.secondary',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.65rem',
                  }}
                >
                  {idx + 1}
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {client.clientName}
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  sx={{ fontSize: '0.82rem', color: '#22c55e', whiteSpace: 'nowrap' }}
                >
                  {formatCOP(client.totalCompras)}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(client.totalCompras / maxValue) * 100}
                sx={{
                  height: 5, borderRadius: 3,
                  bgcolor: (theme) => alpha('#22c55e', theme.palette.mode === 'dark' ? 0.1 : 0.08),
                  '& .MuiLinearProgress-bar': { bgcolor: '#22c55e', borderRadius: 3 },
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                {client.orderCount} {client.orderCount === 1 ? 'orden' : 'órdenes'}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

interface Props {
  recentOrders: RecentOrder[];
  pendingOrders: PendingOrder[];
  topClients: TopClient[];
}

export const FinancialWidgets: React.FC<Props> = ({ recentOrders, pendingOrders, topClients }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '2fr 2fr 1.5fr' },
      gap: 2,
      alignItems: 'start',
    }}
  >
    <RecentOrdersWidget orders={recentOrders} />
    <PendingOrdersWidget orders={pendingOrders} />
    <TopClientsWidget clients={topClients} />
  </Box>
);
