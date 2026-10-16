import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { useCashSessions } from '../hooks/useCashRegister';
import { PATHS } from '../../../router/paths';
import { selectActiveSede, useLocationStore } from '../../../store/locationStore';

const ActiveSessionRedirectPage: React.FC = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  // Llega desde una sesión abierta al cambiar de sede en el Topbar.
  const fromSedeSwitch = Boolean((useLocation().state as { fromSedeSwitch?: boolean } | null)?.fromSedeSwitch);
  const activeSede = useLocationStore(selectActiveSede);

  // Fetch open sessions
  const { data: response, isLoading, isFetching, isError } = useCashSessions({
    status: 'OPEN',
  });

  useEffect(() => {
    // La clave de la consulta no lleva la sede: tras cambiarla, lo que hay en
    // caché es de la anterior hasta que termine de volver a pedirse.
    if (!isLoading && !isFetching) {
      if (isError) {
        return;
      }

      const activeSessions = response?.data || [];
      if (activeSessions.length > 0) {
        // Redirect to the first found active session
        navigate(PATHS.CASH_SESSION_ACTIVE.replace(':id', activeSessions[0].id), { replace: true });
      } else {
        if (fromSedeSwitch) {
          enqueueSnackbar(`${activeSede?.name ?? 'La sede'} no tiene una caja abierta.`, { variant: 'info' });
        }
        // Redirect to cash session history or open session if none is active
        navigate(PATHS.CASH_SESSION_HISTORY, { replace: true });
      }
    }
  }, [response, isLoading, isFetching, isError, navigate, fromSedeSwitch, activeSede, enqueueSnackbar]);

  if (isError) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <Alert severity="error">Error al buscar la sesión activa. Por favor, intente nuevamente.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 2 }}>
      <CircularProgress />
      <Typography variant="body1" color="text.secondary">
        Buscando sesión activa...
      </Typography>
    </Box>
  );
};

export default ActiveSessionRedirectPage;
