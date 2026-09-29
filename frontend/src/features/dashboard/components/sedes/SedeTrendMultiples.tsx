import React from 'react';
import { Box, Card, CardContent, Stack, Typography, useTheme } from '@mui/material';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SedeDot } from '../../../../components/layout/LocationSelector';
import type { SedesDashboardResponse } from '../../../../types/dashboard.types';
import { ChartTooltip } from './ChartTooltip';
import { formatMoney, salesExpenseColors } from './sedesDashboard.utils';

const weekLabel = (week: string) => {
  const [, m, d] = week.split('-');
  return `${d}/${m}`;
};

/** Eje con cifras cortas: 1,2 M, 850 mil. */
const shortMoney = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M` : v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v);

/**
 * Tendencia de ventas y gastos por semana: un gráfico pequeño por sede, todos
 * con la misma escala, para comparar la forma sin enredar seis líneas en uno
 * solo (docs/PLAN_SEDES.md §7). La sede la dice el título de cada panel.
 */
export const SedeTrendMultiples: React.FC<{ data: SedesDashboardResponse }> = ({ data }) => {
  const theme = useTheme();
  const colors = salesExpenseColors(theme);
  const { weeks, series } = data.trend;

  const max = Math.max(
    1,
    ...Object.values(series).flatMap((s) => [...s.ventas, ...s.gastos]),
  );

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="h6">Ventas y gastos por semana</Typography>
          <Box sx={{ flex: 1 }} />
          {(['ventas', 'gastos'] as const).map((key) => (
            <Stack key={key} direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 16, height: 2, bgcolor: colors[key], borderRadius: 1 }} />
              <Typography variant="caption" color="text.secondary">
                {key === 'ventas' ? 'Ventas' : 'Gastos'}
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${Math.min(data.locations.length, 4)}, 1fr)` },
            gap: 2,
          }}
        >
          {data.locations.map((sede) => {
            const s = series[sede.id] ?? { ventas: [], gastos: [] };
            const rows = weeks.map((week, i) => ({ week, ventas: s.ventas[i] ?? 0, gastos: s.gastos[i] ?? 0 }));
            const isMatriz = sede.type === 'HEADQUARTERS';
            return (
              <Box key={sede.id}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                  <SedeDot color={sede.color} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {sede.name}
                  </Typography>
                </Stack>
                <Box sx={{ height: 160 }} role="img" aria-label={`Ventas y gastos por semana del ${sede.name}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={theme.palette.divider} vertical={false} />
                      <XAxis
                        dataKey="week"
                        tickFormatter={weekLabel}
                        tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={16}
                      />
                      <YAxis
                        domain={[0, max]}
                        tickFormatter={shortMoney}
                        tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <Tooltip
                        content={<ChartTooltip formatLabel={(w) => `Semana del ${weekLabel(w)}`} />}
                        cursor={{ stroke: theme.palette.text.secondary, strokeWidth: 1 }}
                      />
                      {!isMatriz && (
                        <Line
                          type="linear"
                          dataKey="ventas"
                          name="Ventas"
                          stroke={colors.ventas}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, stroke: theme.palette.background.paper, strokeWidth: 2 }}
                        />
                      )}
                      <Line
                        type="linear"
                        dataKey="gastos"
                        name="Gastos"
                        stroke={colors.gastos}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, stroke: theme.palette.background.paper, strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {isMatriz
                    ? `Gastos: ${formatMoney(s.gastos.reduce((a, b) => a + b, 0))}`
                    : `Ventas: ${formatMoney(s.ventas.reduce((a, b) => a + b, 0))} · Gastos: ${formatMoney(s.gastos.reduce((a, b) => a + b, 0))}`}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};
