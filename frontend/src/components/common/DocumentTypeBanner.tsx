import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DocumentType } from './DocumentTypeBadge';

interface BannerConfig {
  label: string;
  fullName: string;
  description: string;
  gradient: string;
  glowColor: string;
}

const BANNER_CONFIG: Record<DocumentType, BannerConfig> = {
  COT: {
    label: 'COT',
    fullName: 'Cotización',
    description: 'Propuesta comercial al cliente',
    gradient: 'linear-gradient(135deg, #2EA7E0 0%, #1B7FB0 50%, #0F4C6B 100%)',
    glowColor: '#2EA7E0',
  },
  OP: {
    label: 'OP',
    fullName: 'Orden de Pedido',
    description: 'Pedido confirmado en producción',
    gradient: 'linear-gradient(135deg, #7FAE1F 0%, #5E8A12 50%, #2F4A08 100%)',
    glowColor: '#A3D33C',
  },
  OT: {
    label: 'OT',
    fullName: 'Orden de Trabajo',
    description: 'Instrucción técnica de fabricación',
    gradient: 'linear-gradient(135deg, #F39200 0%, #D8660A 50%, #A23B0C 100%)',
    glowColor: '#F39200',
  },
  OG: {
    label: 'OG',
    fullName: 'Orden de Gastos',
    description: 'Registro de costos directos de O.T',
    gradient: 'linear-gradient(135deg, #E8465A 0%, #C22A40 50%, #7E1A2A 100%)',
    glowColor: '#E8465A',
  },
};

interface DocumentTypeBannerProps {
  type: DocumentType;
  documentNumber?: string;
}

export const DocumentTypeBanner: React.FC<DocumentTypeBannerProps> = ({ type, documentNumber }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const config = BANNER_CONFIG[type];

  return (
    <Box
      sx={{
        background: config.gradient,
        borderRadius: 3,
        px: { xs: 2.5, md: 4 },
        py: { xs: 2, md: 2.5 },
        mb: 3,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 2, md: 3 },
        boxShadow: isDark
          ? `0 4px 24px ${alpha(config.glowColor, 0.45)}, 0 0 40px ${alpha(config.glowColor, 0.2)}`
          : `0 4px 20px ${alpha(config.glowColor, 0.35)}`,
        overflow: 'hidden',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        },
      }}
    >
      {/* Acrónimo grande */}
      <Box
        sx={{
          borderRight: '1px solid rgba(255,255,255,0.3)',
          pr: { xs: 2, md: 3 },
          flexShrink: 0,
          textAlign: 'center',
          minWidth: { xs: 52, md: 72 },
        }}
      >
        <Typography
          sx={{
            fontSize: { xs: '2rem', md: '2.75rem' },
            fontWeight: 900,
            color: 'white',
            letterSpacing: '0.06em',
            lineHeight: 1,
            textShadow: isDark
              ? `0 0 20px ${alpha(config.glowColor, 0.8)}`
              : '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {config.label}
        </Typography>
      </Box>

      {/* Nombre completo y descripción */}
      <Box sx={{ flex: 1 }}>
        <Typography
          sx={{
            fontSize: { xs: '1rem', md: '1.2rem' },
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.2,
          }}
        >
          {config.fullName}
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: '0.75rem', md: '0.875rem' },
            color: 'rgba(255,255,255,0.85)',
            mt: 0.5,
          }}
        >
          {config.description}
        </Typography>
      </Box>

      {/* Número de documento */}
      {documentNumber && (
        <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
          <Typography
            sx={{
              fontSize: { xs: '1.1rem', md: '1.5rem' },
              fontWeight: 800,
              color: 'white',
              letterSpacing: '0.04em',
              lineHeight: 1,
              textShadow: isDark
                ? `0 0 12px ${alpha(config.glowColor, 0.7)}`
                : '0 2px 6px rgba(0,0,0,0.25)',
              fontFamily: 'monospace',
            }}
          >
            {documentNumber}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
