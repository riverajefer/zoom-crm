import React from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import StopIcon from '@mui/icons-material/Stop';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingButton } from '../../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../../hooks/useSingleFlight';
import type { WorkOrderTimeEntry } from '../../../../types/work-order.types';
import { useWorkOrderTimeMutations } from '../../hooks/useWorkOrderTime';
import {
  entryDurationSeconds,
  formatClock,
  formatDuration,
  formatTimer,
  isRunning,
  needsReview,
  operatorColor,
  userInitials,
  userName,
} from '../../utils/timeline';

interface TimeEntryDrawerProps {
  entry: WorkOrderTimeEntry | null;
  /** Número de OT, para registros que no lo traen. */
  workOrderNumber?: string;
  now: number;
  currentUserId?: string;
  /** El admin sí puede corregir sus propias horas (igual que en el backend). */
  isAdmin?: boolean;
  canSupervise: boolean;
  onClose: () => void;
  onAdjust: (entry: WorkOrderTimeEntry) => void;
  onVoid: (entry: WorkOrderTimeEntry) => void;
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={500} sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
      {children}
    </Typography>
  </>
);

/** Detalle de un registro: quién, qué, cuándo y su historial de ajustes. */
export const TimeEntryDrawer: React.FC<TimeEntryDrawerProps> = ({
  entry,
  workOrderNumber,
  now,
  currentUserId,
  isAdmin = false,
  canSupervise,
  onClose,
  onAdjust,
  onVoid,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { stopMutation, reviewMutation } = useWorkOrderTimeMutations();

  const handleStop = useSingleFlight(async () => {
    if (entry) await stopMutation.mutateAsync(entry.id);
    onClose();
  });
  const handleReview = useSingleFlight(async () => {
    if (entry) await reviewMutation.mutateAsync(entry.id);
    onClose();
  });

  const running = entry ? isRunning(entry) : false;
  const isOwn = entry?.user.id === currentUserId;
  const day = (iso?: string | null) => (iso ? format(new Date(iso), "d 'de' MMMM", { locale: es }) : '');

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={Boolean(entry)}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 420,
          maxHeight: isMobile ? '88vh' : '100%',
          borderRadius: isMobile ? '16px 16px 0 0' : 0,
        },
      }}
    >
      {entry && (
        <>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 2 }}>
            <Avatar sx={{ bgcolor: operatorColor(entry.user.id), width: 36, height: 36, fontSize: 14 }}>
              {userInitials(entry.user)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {userName(entry.user)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {entry.workOrder?.workOrderNumber ?? workOrderNumber ?? 'Registro de tiempo'}
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Cerrar">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Divider />
          <Stack spacing={2} sx={{ p: 2.5, overflowY: 'auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
              <Fact label="Ítem">{entry.workOrderItem?.productDescription ?? 'General de la OT'}</Fact>
              <Fact label="Tarea">{entry.notes || 'Sin nota'}</Fact>
              <Fact label="Máquina">{entry.machine?.name ?? '—'}</Fact>
              {entry.startAt ? (
                <>
                  <Fact label="Inicio">
                    {day(entry.startAt)} · {formatClock(entry.startAt)}
                  </Fact>
                  <Fact label="Fin">{running ? 'En curso' : entry.endAt ? formatClock(entry.endAt) : '—'}</Fact>
                </>
              ) : (
                <Fact label="Fecha">{day(entry.workedDate)}</Fact>
              )}
              <Fact label="Duración">
                {running ? (
                  <Box component="span" sx={{ fontFamily: 'monospace' }}>
                    {formatTimer(entryDurationSeconds(entry, now))}
                  </Box>
                ) : (
                  formatDuration(entryDurationSeconds(entry, now))
                )}
              </Fact>
            </Box>

            {running && entry.extendedAt && (
              <Alert severity="info">
                Marcada «Sigo trabajando» a las {formatClock(entry.extendedAt)}: no se cierra al fin de la jornada.
              </Alert>
            )}
            {needsReview(entry) && (
              <Alert severity="error">
                <strong>No la finalizaron.</strong> El sistema la cerró a las {formatClock(entry.endAt!)}.
                Revisa a qué hora terminó de verdad y ajústala, o dala por buena.
              </Alert>
            )}
            {entry.closedBySystem && entry.reviewedAt && (
              <Alert severity="success">
                La cerró el sistema y {entry.reviewedBy ? userName(entry.reviewedBy) : 'un supervisor'} ya la revisó.
              </Alert>
            )}
            {entry.adjustedAt && (
              <Alert severity="warning">
                <strong>
                  {entry.createdBy ? 'Agregado' : 'Ajustado'} por {userName(entry.adjustedBy) || 'un supervisor'}
                </strong>
                {entry.createdBy
                  ? '. El operario no lo marcó con el temporizador.'
                  : entry.originalStartAt
                    ? `. Antes: ${formatClock(entry.originalStartAt)} – ${
                        entry.originalEndAt ? formatClock(entry.originalEndAt) : 'en curso'
                      }.`
                    : '.'}
                <br />
                Motivo: {entry.adjustReason}
              </Alert>
            )}
            {entry.voidedAt && (
              <Alert severity="info" icon={false}>
                <strong>Anulado por {userName(entry.voidedBy) || 'un supervisor'}.</strong> No cuenta en las horas.
                <br />
                Motivo: {entry.voidReason}
              </Alert>
            )}

            {running && isOwn && (
              <LoadingButton
                variant="outlined"
                color="error"
                startIcon={<StopIcon />}
                loading={stopMutation.isPending}
                onClick={handleStop}
                fullWidth
              >
                Finalizar ahora
              </LoadingButton>
            )}

            {canSupervise && !entry.voidedAt && (
              isOwn && !isAdmin ? (
                <Typography variant="body2" color="text.secondary">
                  Son tus propias horas: las ajusta otro supervisor.
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="contained" onClick={() => onAdjust(entry)}>
                    Ajustar horas
                  </Button>
                  {needsReview(entry) && (
                    <LoadingButton variant="outlined" loading={reviewMutation.isPending} onClick={handleReview}>
                      Está bien así
                    </LoadingButton>
                  )}
                  <Button variant="outlined" color="error" onClick={() => onVoid(entry)}>
                    Anular
                  </Button>
                </Stack>
              )
            )}

            {!canSupervise && (
              <Typography variant="body2" color="text.secondary">
                Si ves un error en las horas, pídele a un supervisor que lo ajuste.
              </Typography>
            )}
          </Stack>
        </>
      )}
    </Drawer>
  );
};
