import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { LoadingButton } from '../../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../../hooks/useSingleFlight';
import type { WorkOrderTimeEntry } from '../../../../types/work-order.types';
import {
  useMyRunningTasks,
  useTimeMachines,
  useWorkOrderTimeMutations,
} from '../../hooks/useWorkOrderTime';
import { entryDurationSeconds, formatClock, formatTimer } from '../../utils/timeline';

interface TaskTimerButtonProps {
  workOrderId: string;
  /** `null` = tarea general de la OT. */
  workOrderItemId: string | null;
  rowName: string;
  /** Tarea en curso del usuario en esta fila, si la hay. */
  runningEntry?: WorkOrderTimeEntry;
  now: number;
}

/**
 * Botón grande para la tablet: «▶ Iniciar» o «■ Finalizar · 00:42:13».
 * La hora la pone el servidor; aquí solo se elige máquina y nota.
 */
export const TaskTimerButton: React.FC<TaskTimerButtonProps> = ({
  workOrderId,
  workOrderItemId,
  rowName,
  runningEntry,
  now,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [machineId, setMachineId] = useState('');
  const [notes, setNotes] = useState('');
  const { startMutation, stopMutation } = useWorkOrderTimeMutations();
  const { data: running } = useMyRunningTasks(Boolean(anchor));
  const { data: machines = [] } = useTimeMachines(Boolean(anchor));

  const maxTasks = running?.schedule.maxRunningTasks ?? 3;
  const atLimit = (running?.entries.length ?? 0) >= maxTasks;

  const close = () => {
    setAnchor(null);
    setMachineId('');
    setNotes('');
  };

  const handleStart = useSingleFlight(async () => {
    await startMutation.mutateAsync({
      workOrderId,
      workOrderItemId: workOrderItemId ?? undefined,
      machineId: machineId || undefined,
      notes: notes.trim() || undefined,
    });
    close();
  });

  const handleStop = useSingleFlight(async () => {
    if (runningEntry) await stopMutation.mutateAsync(runningEntry.id);
  });

  if (runningEntry) {
    return (
      <LoadingButton
        fullWidth
        variant="outlined"
        color="error"
        startIcon={<StopIcon />}
        loading={stopMutation.isPending}
        onClick={handleStop}
        sx={{ justifyContent: 'flex-start', minHeight: 40 }}
      >
        <Box component="span" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          Finalizar · {formatTimer(entryDurationSeconds(runningEntry, now))}
        </Box>
      </LoadingButton>
    );
  }

  return (
    <>
      <Button
        fullWidth
        variant="contained"
        startIcon={<PlayArrowIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ justifyContent: 'flex-start', minHeight: 40 }}
      >
        Iniciar
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, width: 340, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">Iniciar · {rowName}</Typography>
          {atLimit ? (
            <Alert severity="warning">
              Ya tienes {maxTasks} tareas en curso. Finaliza una para iniciar otra.
            </Alert>
          ) : (
            <>
              <TextField
                select
                size="small"
                label="Máquina (opcional)"
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
              >
                <MenuItem value="">Sin máquina</MenuItem>
                {machines.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                    {m.productionArea ? ` · ${m.productionArea.name}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="¿Qué vas a hacer? (opcional)"
                placeholder="Ej.: impresión, laminado, armado…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                inputProps={{ maxLength: 120 }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStart();
                }}
              />
              <Typography variant="caption" color="text.secondary">
                La hora de inicio la pone el sistema ({formatClock(new Date(now))}). No se escribe a mano.
              </Typography>
            </>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={close}>Cancelar</Button>
            {!atLimit && (
              <LoadingButton
                variant="contained"
                startIcon={<PlayArrowIcon />}
                loading={startMutation.isPending}
                onClick={handleStart}
              >
                Iniciar ahora
              </LoadingButton>
            )}
          </Stack>
        </Stack>
      </Popover>
    </>
  );
};
