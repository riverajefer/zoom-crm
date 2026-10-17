import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Link,
  Popover,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import TimerIcon from '@mui/icons-material/Timer';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { LoadingButton } from '../../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../../hooks/useSingleFlight';
import { ROUTES } from '../../../../utils/constants';
import type { WorkOrderTimeEntry } from '../../../../types/work-order.types';
import { useMyRunningTasks, useWorkOrderTimeMutations } from '../../hooks/useWorkOrderTime';
import { useNow } from '../../hooks/useNow';
import { entryDurationSeconds, formatTimer, minutesUntil } from '../../utils/timeline';

/**
 * Chip «2 en curso» de la barra superior. Deja finalizar una tarea sin volver
 * a la OT, que es lo normal cuando hay varias en paralelo en OT distintas, y
 * avisa antes del cierre de la jornada para tocar «Sigo trabajando».
 */
export const RunningTasksChip: React.FC = () => {
  const { data } = useMyRunningTasks();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const entries = data?.entries ?? [];
  const now = useNow(entries.length ? 1000 : 60_000);
  const schedule = data?.schedule;

  const minutesLeft = schedule ? minutesUntil(schedule.workdayEnd, new Date(now)) : null;
  const inWarning =
    minutesLeft !== null && schedule !== undefined && minutesLeft >= 0 && minutesLeft <= schedule.warningMinutes;
  const unextended = entries.filter((e) => !e.extendedAt);
  const warn = inWarning && unextended.length > 0;

  // Un solo aviso por día, cuando entra en la ventana previa al cierre.
  const warnedDay = useRef<string | null>(null);
  useEffect(() => {
    const today = new Date(now).toDateString();
    if (warn && schedule && warnedDay.current !== today) {
      warnedDay.current = today;
      enqueueSnackbar(
        `La jornada cierra a las ${schedule.workdayEnd}. Si sigues trabajando, toca «Sigo trabajando» en tus tareas en curso.`,
        { variant: 'warning', autoHideDuration: 10_000 },
      );
    }
  }, [warn, schedule, now, enqueueSnackbar]);

  if (entries.length === 0) return null;

  return (
    <>
      <Chip
        icon={<TimerIcon />}
        label={warn ? `Cierre ${schedule!.workdayEnd} · ${entries.length} en curso` : `${entries.length} en curso`}
        color={warn ? 'warning' : 'success'}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        sx={{ fontWeight: 700, '& .MuiChip-icon': { color: 'inherit' } }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 32px)', p: 2 } } }}
      >
        <Typography variant="subtitle2" gutterBottom>
          Tus tareas en curso
        </Typography>
        <Stack divider={<Divider flexItem />} spacing={1}>
          {entries.map((entry) => (
            <RunningTaskRow
              key={entry.id}
              entry={entry}
              now={now}
              canExtend={inWarning && !entry.extendedAt}
              onNavigate={() => setAnchor(null)}
            />
          ))}
        </Stack>
        {schedule && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            Puedes tener hasta {schedule.maxRunningTasks} a la vez. A las {schedule.workdayEnd} se cierran solas las
            que no marques con «Sigo trabajando»; esas se cierran a las {schedule.overtimeCap}.
          </Typography>
        )}
      </Popover>
    </>
  );
};

const RunningTaskRow: React.FC<{
  entry: WorkOrderTimeEntry;
  now: number;
  canExtend: boolean;
  onNavigate: () => void;
}> = ({ entry, now, canExtend, onNavigate }) => {
  const { stopMutation, extendMutation } = useWorkOrderTimeMutations();
  const handleStop = useSingleFlight(() => stopMutation.mutateAsync(entry.id));
  const handleExtend = useSingleFlight(() => extendMutation.mutateAsync(entry.id));

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {entry.notes || entry.workOrderItem?.productDescription || 'Tarea general'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            <Link
              component={RouterLink}
              to={ROUTES.WORK_ORDERS_DETAIL.replace(':id', entry.workOrderId)}
              onClick={onNavigate}
            >
              {entry.workOrder?.workOrderNumber ?? 'Ver OT'}
            </Link>
            {entry.workOrderItem ? ` · ${entry.workOrderItem.productDescription}` : ' · General'}
            {entry.machine ? ` · ${entry.machine.name}` : ''}
          </Typography>
        </Box>
        <Box
          sx={{
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: (t) => alpha(t.palette.success.main, 0.12),
          }}
        >
          {formatTimer(entryDurationSeconds(entry, now))}
        </Box>
      </Stack>
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        {canExtend && (
          <LoadingButton size="small" variant="outlined" color="warning" loading={extendMutation.isPending} onClick={handleExtend}>
            Sigo trabajando
          </LoadingButton>
        )}
        {entry.extendedAt && (
          <Button size="small" disabled>
            Extendida
          </Button>
        )}
        <LoadingButton size="small" variant="contained" color="error" loading={stopMutation.isPending} onClick={handleStop}>
          Finalizar
        </LoadingButton>
      </Stack>
    </Stack>
  );
};
