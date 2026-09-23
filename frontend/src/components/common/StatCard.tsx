import React from 'react';
import { Box, Card, CardContent, Skeleton, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';

export interface StatCardProps {
  title: string;
  value: string | number;
  /** Línea secundaria bajo el valor (p. ej. "12 órdenes", "3 vencidas"). */
  subtitle?: string;
  icon: React.ReactNode;
  /** Color de acento en hex (#RRGGBB); se reusa para el icono, el valor y el hover. */
  color: string;
  loading?: boolean;
  /** Si se provee, la tarjeta es clicable y muestra el enlace "Filtrar". */
  onClick?: () => void;
}

/**
 * Tarjeta de indicador para los mini dashboards sobre las listas
 * (Cuentas por Pagar, Órdenes de Pedido, etc.).
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color,
  loading,
  onClick,
}) => (
  <Card
    onClick={onClick}
    sx={{
      height: '100%',
      borderRadius: 3,
      border: '1px solid',
      borderColor: (theme) =>
        theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      background: (theme) =>
        theme.palette.mode === 'dark'
          ? 'linear-gradient(145deg, rgba(22, 24, 22,0.8) 0%, rgba(26, 28, 25,0.9) 100%)'
          : 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.9) 100%)',
      transition: 'all 0.3s ease',
      cursor: onClick ? 'pointer' : 'default',
      '&:hover': onClick
        ? {
            transform: 'translateY(-4px)',
            borderColor: color,
            boxShadow: `0 0 16px ${color}40`,
          }
        : {},
    }}
  >
    <CardContent sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 2,
            backgroundColor: `${color}20`,
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ flex: 1 }}>
          {title}
        </Typography>
        {onClick && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.4,
              color,
              opacity: 0.7,
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.03em',
              '&:hover': { opacity: 1 },
            }}
          >
            <FilterListIcon sx={{ fontSize: 13 }} />
            Filtrar
          </Box>
        )}
      </Box>
      {loading ? (
        <Skeleton width="80%" height={32} />
      ) : (
        <>
          <Typography variant="h6" fontWeight={700} color={color}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </>
      )}
    </CardContent>
  </Card>
);
