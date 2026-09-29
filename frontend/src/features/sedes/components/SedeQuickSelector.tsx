import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { ALL_LOCATIONS, useLocationStore } from '../../../store/locationStore';
import { useSwitchSede } from '../hooks/useSwitchSede';

/**
 * Selector rápido `Todas · 104 · 119 · 125 · Matriz` arriba de un listado,
 * para quien ve todas las sedes: salta a una sola sede sin pasar por el
 * Topbar (docs/PLAN_SEDES.md §6.2). Cambia la sede activa, igual que el Topbar.
 */
export const SedeQuickSelector: React.FC = () => {
  const { locations, canViewAll, activeLocationId } = useLocationStore();
  const switchSede = useSwitchSede();

  if (!canViewAll || locations.length === 0) return null;

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={activeLocationId}
      onChange={(_, value: string | null) => {
        if (value && value !== activeLocationId) switchSede(value);
      }}
      aria-label="Sede del listado"
      sx={{ mb: 2, flexWrap: 'wrap' }}
    >
      <ToggleButton value={ALL_LOCATIONS} sx={{ px: 2, fontWeight: 600 }}>
        Todas
      </ToggleButton>
      {locations.map((sede) => (
        <ToggleButton key={sede.id} value={sede.id} sx={{ px: 2, gap: 1, fontWeight: 600 }}>
          <SedeDot color={sede.color} />
          {sede.type === 'HEADQUARTERS' ? sede.name : sede.code}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
