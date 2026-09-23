import type { FC } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';

interface MaintenancePageProps {
  message?: string;
}

const DEFAULT_MESSAGE =
  'El sistema se encuentra en mantenimiento. Por favor intenta más tarde.';

/**
 * Página de modo mantenimiento.
 * Se renderiza en lugar de toda la aplicación cuando el backend responde 503.
 * No tiene navegación — el usuario debe esperar a que el servicio vuelva.
 */
const MaintenancePage: FC<MaintenancePageProps> = ({ message }) => {
  const displayMessage = message || DEFAULT_MESSAGE;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #0B0F0A 0%, #161816 50%, #1F221E 100%)',
        padding: 3,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: { xs: 4, sm: 6 },
          maxWidth: 480,
          width: '100%',
          background: 'rgba(26, 28, 25, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(163, 211, 60, 0.25)',
          borderRadius: 4,
        }}
      >
        {/* Icono */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(163, 211, 60, 0.15)',
            border: '2px solid rgba(163, 211, 60, 0.4)',
            marginBottom: 3,
            boxShadow: '0 0 24px rgba(163, 211, 60, 0.3)',
          }}
        >
          <BuildIcon
            sx={{
              fontSize: 40,
              color: '#A3D33C',
              filter: 'drop-shadow(0 0 8px rgba(163, 211, 60, 0.6))',
            }}
          />
        </Box>

        {/* Título */}
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 700,
            color: '#A3D33C',
            marginBottom: 2,
            textShadow: '0 0 20px rgba(163, 211, 60, 0.4)',
          }}
        >
          En Mantenimiento
        </Typography>

        {/* Mensaje */}
        <Typography
          variant="body1"
          sx={{
            color: 'rgba(255, 255, 255, 0.75)',
            lineHeight: 1.7,
            marginBottom: 3,
          }}
        >
          {displayMessage}
        </Typography>

        {/* Badge de estado */}
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            padding: '6px 18px',
            borderRadius: '9999px',
            background: 'rgba(163, 211, 60, 0.1)',
            border: '1px solid rgba(163, 211, 60, 0.35)',
            color: '#A3D33C',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          503 — Servicio No Disponible
        </Box>
      </Paper>
    </Box>
  );
};

export default MaintenancePage;
