import React, { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useSnackbar } from 'notistack';
import { useClientAdvisorRequests } from '../hooks/useClientAdvisorRequests';
import { useAuthStore } from '../../../store/authStore';
import type { ClientDuplicateMatch } from '../../../types';
import { SedeDot } from '../../../components/layout/LocationSelector';

const TIER_LABEL: Record<ClientDuplicateMatch['tier'], string> = {
  ALTA: 'Mismo documento y nombre',
  MEDIA: 'Mismo documento',
  BAJA: 'Mismo nombre',
};

const TIER_COLOR: Record<
  ClientDuplicateMatch['tier'],
  'error' | 'warning' | 'default'
> = {
  ALTA: 'error',
  MEDIA: 'warning',
  BAJA: 'default',
};

interface DuplicateClientDialogProps {
  open: boolean;
  matches: ClientDuplicateMatch[];
  onClose: () => void;
  /**
   * Crear el cliente igual, ignorando el aviso. Se omite cuando el diálogo se
   * abre desde el aviso anticipado: ahí todavía no se envió nada, así que
   * "crear igual" no tiene qué reintentar — el asesor sigue llenando el formulario.
   */
  onCreateAnyway?: () => void;
  creating?: boolean;
}

/**
 * Aviso de posible cliente duplicado, con la salida que el asesor realmente busca.
 *
 * El duplicado casi nunca es un error de dedo: el cliente ya existe pero pertenece
 * a otro asesor, y crear uno nuevo es la forma de poder venderle. Por eso la acción
 * principal no es "cancelar" sino solicitar la co-propiedad del cliente existente,
 * que el admin aprueba y deja a ambos asesores sobre el mismo registro.
 */
export const DuplicateClientDialog: React.FC<DuplicateClientDialogProps> = ({
  open,
  matches,
  onClose,
  onCreateAnyway,
  creating = false,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuthStore();
  const [requestingFor, setRequestingFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [requested, setRequested] = useState<string[]>([]);

  // El botón se deshabilita hasta el siguiente render de React, así que dos clics
  // en el mismo frame enviarían dos solicitudes para el mismo cliente. Se lleva el
  // control por clientId para no bloquear pedir otro cliente mientras uno viaja.
  const submitting = useRef<Set<string>>(new Set());

  const { createMutation } = useClientAdvisorRequests(requestingFor ?? undefined);

  const handleRequest = async (clientId: string) => {
    if (!user?.id) return;
    if (submitting.current.has(clientId)) return;

    submitting.current.add(clientId);
    try {
      await createMutation.mutateAsync({
        clientId,
        requestedAdvisorId: user.id,
        reason: reason || undefined,
      });
      setRequested((prev) => [...prev, clientId]);
      setRequestingFor(null);
      setReason('');
      enqueueSnackbar(
        'Solicitud enviada. El administrador debe aprobarla para asignarte el cliente.',
        { variant: 'success' },
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'No se pudo enviar la solicitud';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      submitting.current.delete(clientId);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Este cliente ya podría existir</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Encontramos {matches.length === 1 ? 'un cliente' : `${matches.length} clientes`} que
          coincide{matches.length === 1 ? '' : 'n'} con los datos que ingresaste. Si es el
          mismo, Solicita que te lo asignen en vez de crear otro registro.
        </Alert>

        <Stack spacing={2}>
          {matches.map((match) => {
            const alreadyRequested = requested.includes(match.id);
            const isRequesting = requestingFor === match.id;

            return (
              <Box
                key={match.id}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  spacing={1}
                >
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {match.name}
                    </Typography>
                    {match.document && (
                      <Typography variant="body2" color="text.secondary">
                        Documento: {match.document}
                      </Typography>
                    )}
                    {match.advisors.length > 0 ? (
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {match.advisors.map((a) => (
                          <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                              Asesor: {a.name}
                            </Typography>
                            {/* Solo Zoom: de qué local es el cliente (docs/PLAN_SEDES.md §5) */}
                            {a.sede && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={a.sede.name}
                                icon={<SedeDot color={a.sede.color} />}
                                sx={{ pl: 0.5 }}
                              />
                            )}
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Sin asesor asignado
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    size="small"
                    label={TIER_LABEL[match.tier]}
                    color={TIER_COLOR[match.tier]}
                  />
                </Stack>

                {alreadyRequested ? (
                  <Alert severity="success" sx={{ mt: 1.5 }}>
                    Solicitud enviada, pendiente de aprobación.
                  </Alert>
                ) : isRequesting ? (
                  <Box sx={{ mt: 1.5 }}>
                    <TextField
                      fullWidth
                      size="small"
                      multiline
                      rows={2}
                      label="Motivo (opcional)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      inputProps={{ maxLength: 500 }}
                    />
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={createMutation.isPending}
                        onClick={() => handleRequest(match.id)}
                      >
                        Enviar solicitud
                      </Button>
                      <Button size="small" onClick={() => setRequestingFor(null)}>
                        Cancelar
                      </Button>
                    </Stack>
                  </Box>
                ) : (
                  <Button
                    size="small"
                    startIcon={<PersonAddIcon />}
                    sx={{ mt: 1 }}
                    onClick={() => {
                      setRequestingFor(match.id);
                      setReason('');
                    }}
                  >
                    Solicitar que me asignen este cliente
                  </Button>
                )}
              </Box>
            );
          })}
        </Stack>

        {onCreateAnyway && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Si de verdad es un cliente distinto, puedes crearlo igual.
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Volver al formulario</Button>
        {onCreateAnyway && (
          <Button color="warning" onClick={onCreateAnyway} disabled={creating}>
            Crear de todas formas
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
