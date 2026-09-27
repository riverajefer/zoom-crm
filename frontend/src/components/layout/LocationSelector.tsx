import React from 'react';
import {
  alpha,
  Box,
  ButtonBase,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckIcon from '@mui/icons-material/Check';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useQueryClient } from '@tanstack/react-query';
import { ALL_LOCATIONS, selectActiveSede, useLocationStore } from '../../store/locationStore';

/** Punto de color que identifica a una sede en todo el sistema. */
export const SedeDot: React.FC<{ color: string; size?: number }> = ({ color, size = 10 }) => (
  <Box
    component="span"
    aria-hidden
    sx={{ width: size, height: size, borderRadius: '50%', bgcolor: color, flexShrink: 0, display: 'inline-block' }}
  />
);

/**
 * Selector de sede del Topbar (docs/PLAN_SEDES.md §5).
 *
 * - Sin sedes y sin "Todas": no se muestra.
 * - Una sola sede: se muestra fija, sin menú, para que siempre se sepa dónde se está.
 * - Varias sedes (o `view_all_locations`): menú para cambiar, con "Todas las sedes"
 *   al final para quien la tenga.
 *
 * Al cambiar de sede se invalidan todas las consultas: lo que se ve es de la
 * sede anterior.
 */
export const LocationSelector: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();
  const { locations, canViewAll, activeLocationId, setActive } = useLocationStore();
  const activeSede = useLocationStore(selectActiveSede);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  if (locations.length === 0 && !canViewAll) return null;

  const isAll = activeLocationId === ALL_LOCATIONS;
  const canSwitch = canViewAll || locations.length > 1;
  const label = isAll ? 'Todas las sedes' : (activeSede?.name ?? 'Sin sede');
  const color = isAll ? theme.palette.text.secondary : (activeSede?.color ?? theme.palette.grey[500]);

  const handleSelect = (locationId: string) => {
    setAnchorEl(null);
    if (locationId === activeLocationId) return;
    setActive(locationId);
    queryClient.invalidateQueries();
  };

  const content = (
    <>
      <SedeDot color={color} />
      {!isMobile && (
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      )}
      {canSwitch && <KeyboardArrowDownIcon sx={{ fontSize: 18, color: alpha(theme.palette.common.white, 0.8) }} />}
    </>
  );

  const chipSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    minHeight: 40,
    px: 1.5,
    borderRadius: '12px',
    border: `1px solid ${alpha(theme.palette.common.white, 0.14)}`,
    background: alpha(theme.palette.common.white, 0.05),
  } as const;

  if (!canSwitch) {
    return (
      <Box sx={chipSx} aria-label={`Sede: ${label}`} title={`Sede: ${label}`}>
        {content}
      </Box>
    );
  }

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={`Sede activa: ${label}. Cambiar sede`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchorEl)}
        sx={{
          ...chipSx,
          transition: 'background 0.2s ease, border-color 0.2s ease',
          '&:hover': {
            background: alpha(theme.palette.common.white, 0.1),
            borderColor: alpha(theme.palette.common.white, 0.28),
          },
        }}
      >
        {content}
      </ButtonBase>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 220 } } }}
      >
        <Typography variant="overline" sx={{ px: 2, color: 'text.secondary' }}>
          Cambiar de sede
        </Typography>
        {locations.map((sede) => (
          <MenuItem key={sede.id} selected={sede.id === activeLocationId} onClick={() => handleSelect(sede.id)}>
            <ListItemIcon>
              <SedeDot color={sede.color} size={12} />
            </ListItemIcon>
            <ListItemText primary={sede.name} />
            {sede.id === activeLocationId && <CheckIcon fontSize="small" sx={{ ml: 1 }} />}
          </MenuItem>
        ))}
        {canViewAll && [
          <Divider key="divider" />,
          <MenuItem key={ALL_LOCATIONS} selected={isAll} onClick={() => handleSelect(ALL_LOCATIONS)}>
            <ListItemIcon>
              <StorefrontIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Todas las sedes" />
            {isAll && <CheckIcon fontSize="small" sx={{ ml: 1 }} />}
          </MenuItem>,
        ]}
      </Menu>
    </>
  );
};
