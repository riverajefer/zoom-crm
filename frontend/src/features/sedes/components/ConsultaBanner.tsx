import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { selectActiveSede, useLocationStore } from '../../../store/locationStore';
import { useSwitchSede } from '../hooks/useSwitchSede';
import type { SedeSummary } from '../../../types';

export type ConsultaDocumentType = 'OP' | 'COT' | 'OT';

interface ConsultaBannerProps {
  type: ConsultaDocumentType;
  sede: SedeSummary;
}

/**
 * Banner fijo del modo consulta (docs/PLAN_SEDES.md §8): de qué sede es el
 * documento, que solo se puede ver, el teléfono de esa sede para remitir al
 * cliente y, si el usuario la tiene permitida, el botón para cambiarse a ella.
 */
export const ConsultaBanner: React.FC<ConsultaBannerProps> = ({ type, sede }) => {
  const activeSede = useLocationStore(selectActiveSede);
  const canSwitch = useLocationStore((s) => s.locations.some((l) => l.id === sede.id));
  const switchSede = useSwitchSede();

  return (
    <Box
      role="status"
      sx={{
        // El que desplaza es el <main> del layout (debajo del Topbar), no la ventana.
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        mb: 3,
        px: { xs: 2, md: 3 },
        py: 1.5,
        borderRadius: 2,
        border: `1px solid ${sede.color}`,
        // Tapa el padding superior del <main>, para que el contenido no se asome
        // por encima del banner al desplazar.
        '&::before': {
          content: '""',
          position: 'absolute',
          left: -1,
          right: -1,
          bottom: '100%',
          height: { xs: 16, sm: 20, md: 24 },
          bgcolor: 'background.default',
        },
        // Opaco: el contenido pasa por debajo al desplazar.
        bgcolor: 'background.paper',
        backgroundImage: (theme) =>
          `linear-gradient(${alpha(sede.color, theme.palette.mode === 'dark' ? 0.16 : 0.1)}, ${alpha(sede.color, theme.palette.mode === 'dark' ? 0.16 : 0.1)})`,
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 1.5, md: 3 }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <VisibilityOutlinedIcon sx={{ color: sede.color }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {type} del {sede.name} · Solo consulta
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activeSede ? `Tu sede activa es el ${activeSede.name}. ` : ''}
              Para operarla, cámbiate a esa sede o remite al cliente al local.
            </Typography>
          </Box>
        </Stack>

        {sede.phone && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <PhoneOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              {sede.phone}
            </Typography>
          </Stack>
        )}

        {canSwitch && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<SwapHorizIcon />}
            onClick={() => switchSede(sede.id)}
            sx={{ whiteSpace: 'nowrap', borderColor: sede.color, color: 'text.primary' }}
          >
            Cambiar al {sede.name}
          </Button>
        )}
      </Stack>
    </Box>
  );
};
