import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Stack, Typography } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { useAuthStore } from '../../../store/authStore';
import { ALL_LOCATIONS, selectActiveSede, useLocationStore } from '../../../store/locationStore';
import { PERMISSIONS } from '../../../utils/constants';
import type { SedeLookupGroup } from '../../../types';

/** Mismo mínimo que el backend: con menos letras casi todo coincide. */
const MIN_QUERY_LENGTH = 3;

interface OtherSedesLookupHintProps<T extends { id: string }> {
  /** Tipo de documento, para la llave de caché y los textos. */
  type: 'OP' | 'COT' | 'OT';
  search: string | undefined;
  /** Cuántos encontró el listado en la sede activa; el aviso sale solo con 0. */
  localTotal: number | undefined;
  lookup: (q: string) => Promise<SedeLookupGroup<T>[]>;
  /** Número y resumen de cada resultado, y a dónde lleva. */
  describe: (item: T) => { number: string; detail: string; path: string };
}

/**
 * Aviso debajo de un listado cuando la búsqueda no encuentra nada en la sede
 * activa pero sí en otras: "No está en el Local 125 · Hay 2 en el Local 119".
 * No agrega filas a la tabla (los listados nunca mezclan sedes) y cada
 * resultado se abre en modo consulta. Ver docs/PLAN_SEDES.md §8.
 */
export function OtherSedesLookupHint<T extends { id: string }>({
  type,
  search,
  localTotal,
  lookup,
  describe,
}: OtherSedesLookupHintProps<T>) {
  const navigate = useNavigate();
  const canReadOther = useAuthStore((s) => s.hasPermission(PERMISSIONS.READ_OTHER_LOCATIONS));
  const activeLocationId = useLocationStore((s) => s.activeLocationId);
  const activeSede = useLocationStore(selectActiveSede);
  const q = (search ?? '').trim();

  const enabled =
    canReadOther && activeLocationId !== ALL_LOCATIONS && q.length >= MIN_QUERY_LENGTH && localTotal === 0;

  const { data: groups } = useQuery({
    queryKey: ['sede-lookup', type, activeLocationId, q],
    queryFn: () => lookup(q),
    enabled,
    staleTime: 30_000,
  });

  if (!enabled || !groups?.length) return null;

  return (
    <Box
      role="status"
      sx={{ mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: 'divider', borderStyle: 'dashed' }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        No está en el {activeSede?.name ?? 'la sede activa'}, pero hay resultados en otras sedes
      </Typography>
      <Stack spacing={2}>
        {groups.map((group) => (
          <Box key={group.location.id}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <SedeDot color={group.location.color} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {group.total} {group.total === 1 ? 'resultado' : 'resultados'} en el {group.location.name}
                {group.total > group.items.length && ` (se muestran ${group.items.length})`}
              </Typography>
            </Stack>
            <Stack spacing={0.25} sx={{ pl: 2.5 }}>
              {group.items.map((item) => {
                const { number, detail, path } = describe(item);
                return (
                  <Stack key={item.id} direction="row" spacing={1} alignItems="center">
                    <Button
                      size="small"
                      startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                      onClick={() => navigate(path)}
                      sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {number}
                    </Button>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {detail}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Se abren en modo consulta: solo lectura.
      </Typography>
    </Box>
  );
}
