import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import type { Sede } from '../../../types';

interface SedeChipProps {
  sede: Pick<Sede, 'name' | 'color'>;
  size?: ChipProps['size'];
}

/** Chip con el color y el nombre de una sede: dice de dónde es un documento. */
export const SedeChip: React.FC<SedeChipProps> = ({ sede, size = 'small' }) => (
  <Chip
    size={size}
    variant="outlined"
    icon={<SedeDot color={sede.color} />}
    label={sede.name}
    sx={{ pl: 0.75, borderColor: sede.color, fontWeight: 600 }}
  />
);
