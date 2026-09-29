import { Box, Typography } from '@mui/material';
import { formatMoney } from './sedesDashboard.utils';

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string | number }[];
  /** Cómo se escribe el encabezado (la semana, la sede…). */
  formatLabel?: (label: string) => string;
}

/** Tooltip común de los gráficos del dashboard por sede: encabezado y un monto por serie. */
export const ChartTooltip = ({ active, label, payload, formatLabel }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 1.5,
        py: 1,
        boxShadow: 3,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
        {formatLabel && label ? formatLabel(label) : label}
      </Typography>
      {payload.map((p) => (
        <Box key={String(p.dataKey)} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 10, height: 2, bgcolor: p.color, borderRadius: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {p.name}
          </Typography>
          <Typography variant="caption" sx={{ ml: 'auto', pl: 2, fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(p.value ?? 0)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};
