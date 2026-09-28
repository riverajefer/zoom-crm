import React from 'react';
import { Chip, Stack, Typography } from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import type { SedeSummary } from '../../../types';

interface SedeGroupHeaderProps {
  sede: SedeSummary | null;
  count: number;
  /** Texto del conteo: "3 OP", "1 COT"… */
  unit: string;
  /** Es la sede activa del usuario. */
  isActive: boolean;
  /** Lo de esta sede se abre en modo consulta. */
  consulta?: boolean;
  children?: React.ReactNode;
}

/** Encabezado de un grupo de filas de una sede: color, nombre y cantidad. */
export const SedeGroupHeader: React.FC<SedeGroupHeaderProps> = ({ sede, count, unit, isActive, consulta, children }) => (
  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
    <SedeDot color={sede?.color ?? '#9e9e9e'} size={12} />
    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
      {sede?.name ?? 'Sin sede'}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      · {count} {unit}
    </Typography>
    {isActive && <Chip size="small" label="Tu sede" variant="outlined" />}
    {consulta && <Chip size="small" label="Solo consulta" variant="outlined" color="info" />}
    {children}
  </Stack>
);
