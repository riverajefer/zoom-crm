import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

export type DocumentType = 'COT' | 'OP' | 'OT' | 'OG';

const DOCUMENT_TYPE_CONFIG: Record<DocumentType, { label: string; color: string }> = {
  COT: { label: 'COT', color: '#2EA7E0' },
  OP:  { label: 'OP',  color: '#A3D33C' },
  OT:  { label: 'OT',  color: '#F39200' },
  OG:  { label: 'OG',  color: '#E8465A' },
};

interface DocumentTypeBadgeProps {
  type: DocumentType;
}

export const DocumentTypeBadge: React.FC<DocumentTypeBadgeProps> = ({ type }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { label, color } = DOCUMENT_TYPE_CONFIG[type];

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        px: 1.25,
        py: 0.5,
        borderRadius: '8px',
        border: `1.5px solid ${color}`,
        backgroundColor: alpha(color, isDark ? 0.15 : 0.1),
        boxShadow: isDark
          ? `0 0 8px ${alpha(color, 0.5)}, 0 0 16px ${alpha(color, 0.25)}`
          : `0 2px 8px ${alpha(color, 0.2)}`,
        flexShrink: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.8rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: color,
          lineHeight: 1,
          textShadow: isDark ? `0 0 6px ${alpha(color, 0.7)}` : 'none',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
};
