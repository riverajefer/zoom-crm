import React from 'react';
import { Box, Card, CardContent, Typography, useTheme } from '@mui/material';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { MonthlyDataPoint } from '../../../types/dashboard.types';

interface Props {
  data: MonthlyDataPoint[];
}

const formatMonth = (month: string) => {
  const [year, m] = month.split('-');
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return names[parseInt(m, 10) - 1] + ' ' + year.slice(2);
};

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', notation: 'compact', maximumFractionDigits: 1 }).format(value);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        background: 'rgba(17, 24, 39, 0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        p: 1.5,
        minWidth: 180,
      }}
    >
      <Typography variant="caption" color="grey.400" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
        {label}
      </Typography>
      {payload.map((entry: any) => (
        <Box key={entry.name} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="caption" sx={{ color: entry.color }}>
            {entry.name}
          </Typography>
          <Typography variant="caption" fontWeight={700} color="white">
            {formatCOP(entry.value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

const chartCardSx = {
  borderRadius: '20px',
  border: '2px solid',
  borderColor: (theme: any) => theme.palette.mode === 'dark' ? 'rgba(46, 167, 224,0.1)' : 'rgba(0,0,0,0.06)',
  background: (theme: any) =>
    theme.palette.mode === 'dark'
      ? 'linear-gradient(145deg, rgba(22, 24, 22,0.6) 0%, rgba(26, 28, 25,1) 100%)'
      : 'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(241,245,249,0.8) 100%)',
};

export const FinancialCharts: React.FC<Props> = ({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const axisColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  const chartData = data.map((d) => ({ ...d, mes: formatMonth(d.month) }));

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
      {/* Gráfica de área: Tendencia mensual */}
      <Card sx={chartCardSx}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2.5 }}>
            Tendencia Mensual (12 meses)
          </Typography>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUtilidad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} />
              <YAxis tickFormatter={(v) => formatCOP(v)} tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="ventas" name="Ventas" stroke="#22c55e" fill="url(#gradVentas)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" fill="url(#gradGastos)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="utilidad" name="Utilidad" stroke="#F97316" fill="url(#gradUtilidad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfica de barras: Ventas vs Gastos */}
      <Card sx={chartCardSx}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2.5 }}>
            Ventas vs Gastos por Mes
          </Typography>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} />
              <YAxis tickFormatter={(v) => formatCOP(v)} tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ventas" name="Ventas" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Box>
  );
};
