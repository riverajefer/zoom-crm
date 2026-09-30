import React, { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import { useSnackbar } from 'notistack';
import { selectActiveSede, useLocationStore } from '../../../store/locationStore';
import { useLocationSupportMutations, useMyLocationSupports } from '../hooks/useLocationSupports';
import { apiErrorMessage, formatSupportDay } from '../utils/locationSupport';
import { LocationSupportRequestDialog } from './LocationSupportRequestDialog';

/**
 * Aviso fijo mientras el usuario está de apoyo en otra sede (docs/PLAN_SEDES.md
 * §16): dónde, quién lo autorizó y hasta cuándo. Cambiar de sede antes de que
 * termine es una solicitud a Gerencia, que se pide y se sigue desde aquí.
 */
export const LocationSupportBanner: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const activeSupport = useLocationStore((s) => s.activeSupport);
  const sede = useLocationStore(selectActiveSede);
  const [requestOpen, setRequestOpen] = useState(false);
  const { data: mine = [] } = useMyLocationSupports({ enabled: !!activeSupport });
  const { cancel } = useLocationSupportMutations();

  if (!activeSupport) return null;

  const color = sede?.color ?? '#888';
  const pending = mine.find((s) => s.status === 'PENDING');

  const handleCancel = async () => {
    if (!pending) return;
    try {
      await cancel.mutateAsync(pending.id);
      enqueueSnackbar('Solicitud cancelada', { variant: 'info' });
    } catch (error) {
      enqueueSnackbar(apiErrorMessage(error, 'No se pudo cancelar la solicitud'), { variant: 'error' });
    }
  };

  return (
    <Box
      role="status"
      sx={{
        px: { xs: 2, md: 3 },
        py: 1,
        borderBottom: `2px solid ${color}`,
        bgcolor: (theme) => alpha(color, theme.palette.mode === 'dark' ? 0.18 : 0.1),
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 1, sm: 2 }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <HandshakeOutlinedIcon sx={{ color }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Estás de apoyo en {sede?.name ?? 'otra sede'}
              {activeSupport.authorizedBy ? ` · autorizado por ${activeSupport.authorizedBy}` : ''}
              {activeSupport.overdue ? '' : ` · hasta el ${formatSupportDay(activeSupport.endDate)}`}
            </Typography>
            {activeSupport.overdue && (
              <Typography variant="body2" color="error">
                Tu apoyo terminó el {formatSupportDay(activeSupport.endDate)}. Cierra la caja para volver a tu sede.
              </Typography>
            )}
            {pending && (
              <Typography variant="body2" color="text.secondary">
                Pediste {pending.kind === 'RETURN' ? 'volver a' : 'cambiarte a'} {pending.location.name}: esperando a
                Gerencia.
              </Typography>
            )}
          </Box>
        </Stack>

        {pending ? (
          <Button size="small" onClick={handleCancel} disabled={cancel.isPending}>
            Cancelar solicitud
          </Button>
        ) : (
          !activeSupport.overdue && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<SwapHorizIcon />}
              onClick={() => setRequestOpen(true)}
              sx={{ borderColor: color, color: 'text.primary', whiteSpace: 'nowrap' }}
            >
              Pedir cambio de sede
            </Button>
          )
        )}
      </Stack>

      <LocationSupportRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />
    </Box>
  );
};
