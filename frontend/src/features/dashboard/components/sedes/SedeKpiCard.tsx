import React from 'react';
import { Box, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material';
import { formatChange, formatMoney } from './sedesDashboard.utils';

export interface KpiSplit {
  id: string;
  code: string;
  name: string;
  color: string;
  value: number;
}

interface SedeKpiCardProps {
  label: string;
  value: number;
  /** Variación contra el periodo anterior (0,12 = +12 %). `undefined`: la cifra no se compara. */
  change?: number | null;
  /** Línea extra bajo la cifra (p. ej. el saldo a favor aplicado). */
  note?: React.ReactNode;
  /** Reparto por sede: una barra dividida, con el código de cada sede debajo. */
  split?: KpiSplit[];
}

/**
 * Tarjeta de resumen del dashboard por sede: el total de la empresa y cómo se
 * reparte entre las sedes. La barra no depende del color: cada tramo lleva el
 * código de su sede y el porcentaje debajo, y el detalle al pasar el mouse.
 */
export const SedeKpiCard: React.FC<SedeKpiCardProps> = ({ label, value, change, note, split }) => {
  const parts = (split ?? []).filter((p) => p.value > 0);
  const base = parts.reduce((acc, p) => acc + p.value, 0);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(value)}
        </Typography>
        {change !== undefined && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {formatChange(change)}
          </Typography>
        )}
        {note && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
            {note}
          </Typography>
        )}

        {base > 0 && (
          <Box sx={{ mt: 2 }}>
            <Box
              role="img"
              aria-label={`Reparto por sede: ${parts.map((p) => `${p.name} ${Math.round((p.value / base) * 100)} %`).join(', ')}`}
              sx={{ display: 'flex', gap: '2px', height: 8, borderRadius: 1, overflow: 'hidden' }}
            >
              {parts.map((p) => (
                <Tooltip key={p.id} title={`${p.name}: ${formatMoney(p.value)}`}>
                  <Box sx={{ flexGrow: p.value, flexBasis: 0, bgcolor: p.color, minWidth: 4 }} />
                </Tooltip>
              ))}
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
              {parts.map((p) => (
                <Typography key={p.id} variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {p.code} · {Math.round((p.value / base) * 100)} %
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
