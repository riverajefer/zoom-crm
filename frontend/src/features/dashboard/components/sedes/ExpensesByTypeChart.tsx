import React from 'react';
import { Box, Card, CardContent, Stack, Typography, useTheme } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SedesDashboardResponse } from '../../../../types/dashboard.types';
import { ChartTooltip } from './ChartTooltip';
import { chartPalette, formatMoney, otherColor } from './sedesDashboard.utils';

/** Tipos con color propio; el resto se junta en "Otros". */
const MAX_TYPES = 5;
const OTHERS = 'Otros';

/**
 * Gastos pagados por tipo, una barra apilada por sede (docs/PLAN_SEDES.md §7).
 * Los tipos de más gasto llevan color propio (asignado por nombre, para que un
 * tipo no cambie de color al cambiar el periodo) y el resto va en "Otros".
 */
export const ExpensesByTypeChart: React.FC<{ data: SedesDashboardResponse }> = ({ data }) => {
  const theme = useTheme();
  const palette = chartPalette(theme);

  const shown = data.expensesByType.slice(0, MAX_TYPES).map((t) => t.type);
  const rest = data.expensesByType.slice(MAX_TYPES);
  const keys = [...[...shown].sort((a, b) => a.localeCompare(b, 'es')), ...(rest.length ? [OTHERS] : [])];
  const colorOf = (key: string, i: number) => (key === OTHERS ? otherColor(theme) : palette[i % palette.length]);

  const rows = data.locations.map((sede) => {
    const row: Record<string, string | number> = { sede: sede.code === 'MAT' ? 'Matriz' : sede.code };
    for (const t of data.expensesByType) {
      const key = shown.includes(t.type) ? t.type : OTHERS;
      row[key] = ((row[key] as number) ?? 0) + (t.byLocation[sede.id] ?? 0);
    }
    return row;
  });

  if (data.expensesByType.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6">Gastos por tipo</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No hay gastos pagados en el periodo.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6">Gastos por tipo</Typography>
        <Stack direction="row" spacing={1.5} sx={{ my: 1.5 }} flexWrap="wrap" useFlexGap>
          {keys.map((key, i) => (
            <Stack key={key} direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: colorOf(key, i) }} />
              <Typography variant="caption" color="text.secondary">
                {key}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Box sx={{ height: 260 }} role="img" aria-label="Gastos pagados por tipo en cada sede">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="sede" tick={{ fontSize: 12, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatMoney(v)}
                tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.palette.action.hover }} />
              {keys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key}
                  stackId="gastos"
                  fill={colorOf(key, i)}
                  stroke={theme.palette.background.paper}
                  strokeWidth={2}
                  radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={56}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};
