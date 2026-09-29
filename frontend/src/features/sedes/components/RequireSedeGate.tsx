import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { ALL_LOCATIONS, selectActiveSede, useLocationStore } from '../../../store/locationStore';
import { useSwitchSede } from '../hooks/useSwitchSede';

interface RequireSedeGateProps {
  children: React.ReactNode;
  /**
   * Documentos de venta o producción (COT, OP, DTF): solo nacen en un local.
   * Con la Matriz activa también se pregunta, y solo se ofrecen los locales
   * (el backend responde 400 `LOCATION_NOT_A_STORE`). Ver docs/PLAN_SEDES.md §14.
   */
  storesOnly?: boolean;
}

/**
 * Todo documento nace en una sede. En la vista "Todas" no hay dónde crearlo
 * (el backend responde 400 `LOCATION_REQUIRED`), así que el formulario de
 * creación primero pregunta "¿En qué sede se crea?" y cambia a esa sede.
 * Ver docs/PLAN_SEDES.md §6.2.
 */
export const RequireSedeGate: React.FC<RequireSedeGateProps> = ({ children, storesOnly = false }) => {
  const navigate = useNavigate();
  const activeLocationId = useLocationStore((s) => s.activeLocationId);
  const locations = useLocationStore((s) => s.locations);
  const activeSede = useLocationStore(selectActiveSede);
  const switchSede = useSwitchSede();

  const inHeadquarters = storesOnly && activeSede?.type === 'HEADQUARTERS';
  if (activeLocationId !== ALL_LOCATIONS && !inHeadquarters) return <>{children}</>;

  const options = storesOnly ? locations.filter((l) => l.type === 'STORE') : locations;

  return (
    <Dialog open maxWidth="xs" fullWidth aria-labelledby="require-sede-title">
      <DialogTitle id="require-sede-title">{storesOnly ? '¿En qué local se crea?' : '¿En qué sede se crea?'}</DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        {inHeadquarters && (
          <DialogContentText sx={{ mb: 1 }}>
            La Matriz no vende ni produce. Elige el local donde nace el documento.
          </DialogContentText>
        )}
        {options.length === 0 && <DialogContentText>No tienes ningún local asignado.</DialogContentText>}
        <List disablePadding>
          {options.map((sede) => (
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
