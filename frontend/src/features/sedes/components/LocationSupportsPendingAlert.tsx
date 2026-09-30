import React from 'react';
import { Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import { useLocationSupportsList } from '../hooks/useLocationSupports';

/**
 * Los apoyos entre sedes tienen su propia página (docs/PLAN_SEDES.md §16), pero
 * la campana de aprobaciones los cuenta y lleva a Solicitudes: sin este aviso
 * Gerencia veía el número y no encontraba la solicitud.
 */
export const LocationSupportsPendingAlert: React.FC = () => {
  const navigate = useNavigate();
  const canAuthorize = useAuthStore((s) => s.hasPermission(PERMISSIONS.AUTHORIZE_LOCATION_SUPPORT));
  const { data = [] } = useLocationSupportsList('pending', { enabled: canAuthorize });

  if (!canAuthorize || data.length === 0) return null;

  return (
    <Alert
      severity="warning"
      sx={{ mb: 3 }}
      action={
        <Button color="inherit" size="small" onClick={() => navigate(ROUTES.LOCATION_SUPPORTS)}>
          Ver
        </Button>
      }
    >
      {data.length === 1
        ? 'Hay 1 solicitud de apoyo entre sedes esperando tu autorización.'
        : `Hay ${data.length} solicitudes de apoyo entre sedes esperando tu autorización.`}
    </Alert>
  );
};
