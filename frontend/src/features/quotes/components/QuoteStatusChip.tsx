import React from 'react';
import { Chip } from '@mui/material';
import { QuoteStatus, QUOTE_STATUS_CONFIG } from '../../../types/quote.types';

interface QuoteStatusChipProps {
  status: QuoteStatus;
  size?: 'small' | 'medium';
}

export const QuoteStatusChip: React.FC<QuoteStatusChipProps> = ({
  status,
  size = 'small',
}) => {
  const config = QUOTE_STATUS_CONFIG[status] || { label: status, color: 'default' };
  const isGradient = config.color === 'gradient';

  return (
    <Chip
      label={config.label}
      color={isGradient ? undefined : (config.color as any)}
      size={size}
      sx={{
        fontWeight: 500,
        minWidth: size === 'small' ? 80 : 100,
        ...(isGradient && {
          background: 'linear-gradient(135deg, #7FAE1F 0%, #1B7FB0 100%)',
          color: 'white',
          border: 'none'
        })
      }}
    />
  );
};
