import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { ALL_LOCATIONS, useLocationStore } from '../../../store/locationStore';
import { useSwitchSede } from '../hooks/useSwitchSede';

/**
 * Todo documento nace en una sede. En la vista "Todas" no hay dónde crearlo
 * (el backend responde 400 `LOCATION_REQUIRED`), así que el formulario de
 * creación primero pregunta "¿En qué sede se crea?" y cambia a esa sede.
 * Ver docs/PLAN_SEDES.md §6.2.
 */
export const RequireSedeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const activeLocationId = useLocationStore((s) => s.activeLocationId);
  const locations = useLocationStore((s) => s.locations);
  const switchSede = useSwitchSede();

  if (activeLocationId !== ALL_LOCATIONS) return <>{children}</>;

  return (
    <Dialog open maxWidth="xs" fullWidth aria-labelledby="require-sede-title">
      <DialogTitle id="require-sede-title">¿En qué sede se crea?</DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        <List disablePadding>
          {locations.map((sede) => (
            <ListItemButton key={sede.id} onClick={() => switchSede(sede.id)} sx={{ borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <SedeDot color={sede.color} size={12} />
              </ListItemIcon>
              <ListItemText primary={sede.name} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => navigate(-1)}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
};
