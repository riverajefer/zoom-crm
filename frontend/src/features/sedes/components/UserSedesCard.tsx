import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useSnackbar } from 'notistack';
import { User } from '../../../types';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { useActiveSedes, useSetUserLocations } from '../hooks/useSedes';

interface Props {
  user: User;
  canManage: boolean;
}

/**
 * Sedes del usuario en su ficha: en cuáles puede operar y en cuál entra al
 * iniciar sesión. Editarlas exige `manage_user_locations` (admin).
 * Ver docs/PLAN_SEDES.md §6.5.
 */
export const UserSedesCard: React.FC<Props> = ({ user, canManage }) => {
  const { enqueueSnackbar } = useSnackbar();
  const sedesQuery = useActiveSedes({ enabled: canManage });
  const setLocations = useSetUserLocations();

  const current = useMemo(() => (user.locations ?? []).map((ul) => ul.location), [user.locations]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [defaultId, setDefaultId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(current.map((l) => l.id));
    setDefaultId(user.defaultLocationId ?? '');
  }, [current, user.defaultLocationId, editing]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(defaultId)) setDefaultId(next[0] ?? '');
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setError(null);
      await setLocations.mutateAsync({
        userId: user.id,
        data: { locationIds: selected, defaultLocationId: defaultId || null },
      });
      enqueueSnackbar('Sedes actualizadas. El usuario las verá al volver a entrar.', { variant: 'success' });
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las sedes');
    }
  };

  const sedes = sedesQuery.data ?? [];
  const defaultSede = current.find((l) => l.id === user.defaultLocationId);

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorefrontIcon color="action" />
            <Typography variant="h6">Sedes</Typography>
          </Box>
          {canManage && !editing && (
            <Button variant="outlined" onClick={() => setEditing(true)}>
              Editar sedes
            </Button>
          )}
        </Box>

        {!editing && (
          <>
            {current.length === 0 ? (
              <Typography color="text.secondary">
                Sin sedes asignadas. Si su rol permite ver todas las sedes, puede operar en cualquiera.
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {current.map((sede) => (
                  <Chip
                    key={sede.id}
                    icon={<Box sx={{ display: 'flex', pl: 1 }}><SedeDot color={sede.color} /></Box>}
                    label={sede.id === user.defaultLocationId ? `${sede.name} · predeterminada` : sede.name}
                    variant={sede.id === user.defaultLocationId ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
            )}
            {current.length > 0 && !defaultSede && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Sin sede predeterminada: entra a la primera de la lista.
              </Typography>
            )}
          </>
        )}

        {editing && (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Sedes en las que puede operar
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {sedes.map((sede) => (
                <FormControlLabel
                  key={sede.id}
                  control={<Checkbox checked={selected.includes(sede.id)} onChange={() => toggle(sede.id)} />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SedeDot color={sede.color} />
                      {sede.name}
                    </Box>
                  }
                />
              ))}
            </Stack>
            <TextField
              select
              label="Sede predeterminada (en la que entra al iniciar sesión)"
              value={defaultId}
              onChange={(e) => setDefaultId(e.target.value)}
              disabled={selected.length === 0}
              sx={{ maxWidth: 420 }}
            >
              {sedes
                .filter((s) => selected.includes(s.id))
                .map((sede) => (
                  <MenuItem key={sede.id} value={sede.id}>
                    {sede.name}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(false)}>Cancelar</Button>
              <Button variant="contained" onClick={handleSave} disabled={setLocations.isPending}>
                Guardar sedes
              </Button>
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
