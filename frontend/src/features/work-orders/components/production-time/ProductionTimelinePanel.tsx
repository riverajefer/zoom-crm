import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  Chip,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '../../../../store/authStore';
import { PERMISSIONS } from '../../../../utils/constants';
import {
  WorkOrderStatus,
  type WorkOrder,
  type WorkOrderTimeEntry,
} from '../../../../types/work-order.types';
import { getAliveQuantity } from '../../../orders/utils/partialAnnulment';
import { useNow } from '../../hooks/useNow';
import {
  activityDays,
  buildAxis,
  dayKey,
  entryDurationSeconds,
  formatDuration,
  hasTimeRange,
  isRunning,
  operatorColor,
  userName,
} from '../../utils/timeline';
import { TimelineGrid, type TimelineRow } from './TimelineGrid';
import { TaskTimerButton } from './TaskTimerButton';
import { TimeEntryDrawer } from './TimeEntryDrawer';
import {
  AdjustTimeEntryDialog,
  ManualTimeEntryDialog,
  VoidTimeEntryDialog,
} from './TimeEntryFormDialogs';

const TRACKABLE: WorkOrderStatus[] = [
  WorkOrderStatus.CONFIRMED,
  WorkOrderStatus.IN_PRODUCTION,
  WorkOrderStatus.READY,
];

const ALL_DAYS = 'all';

const dayChipLabel = (key: string) => {
  const date = parseISO(key);
  const short = format(date, 'd MMM', { locale: es });
  if (isToday(date)) return `Hoy · ${short}`;
  if (isYesterday(date)) return `Ayer · ${short}`;
  return short;
};

interface ProductionTimelinePanelProps {
  workOrder: WorkOrder;
}

/**
 * Panel «Producción» del detalle de la OT: línea de tiempo del día con una fila
 * por ítem, botón Iniciar/Finalizar por fila y, para el supervisor, ajustes y
 * registros olvidados.
 */
export const ProductionTimelinePanel: React.FC<ProductionTimelinePanelProps> = ({ workOrder }) => {
  const theme = useTheme();
  const { user, hasPermission } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const canTrack = hasPermission(PERMISSIONS.TRACK_WORK_ORDER_TIME);
  const canSupervise = hasPermission(PERMISSIONS.ADJUST_WORK_ORDER_TIME);
  const isOrderAnnulled = workOrder.order?.status === 'ANULADO';
  const trackable = TRACKABLE.includes(workOrder.status) && !isOrderAnnulled;

  const allEntries = useMemo(() => workOrder.timeEntries ?? [], [workOrder.timeEntries]);
  // El operario no ve los anulados; el supervisor sí, tachados.
  const entries = useMemo(
    () => allEntries.filter((e) => canSupervise || !e.voidedAt),
    [allEntries, canSupervise],
  );
  const hasRunning = entries.some(isRunning);
  const now = useNow(hasRunning ? 1000 : 30_000);

  const todayKey = dayKey(new Date(now));
  const days = useMemo(() => {
    const keys = activityDays(entries);
    return keys.includes(todayKey) ? keys : [...keys, todayKey].sort();
  }, [entries, todayKey]);

  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<WorkOrderTimeEntry | null>(null);
  const [voiding, setVoiding] = useState<WorkOrderTimeEntry | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Enlace desde la bandeja «por revisar»: ?timeEntry=<id> abre ese registro en su día.
  const linkedEntryId = searchParams.get('timeEntry');
  useEffect(() => {
    if (!linkedEntryId) return;
    const linked = allEntries.find((e) => e.id === linkedEntryId);
    if (linked?.startAt) {
      setSelectedDay(dayKey(linked.startAt));
      setOpenEntryId(linked.id);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('timeEntry');
    setSearchParams(next, { replace: true });
  }, [linkedEntryId, allEntries, searchParams, setSearchParams]);

  const visibleDays = selectedDay === ALL_DAYS ? days : [selectedDay];
  const axis = buildAxis(visibleDays, entries, now);
  const inView = (e: WorkOrderTimeEntry) => hasTimeRange(e) && visibleDays.includes(dayKey(e.startAt!));
  const visible = entries.filter(inView);
  const counted = visible.filter((e) => !e.voidedAt);
  const totalSeconds = counted.reduce((acc, e) => acc + entryDurationSeconds(e, now), 0);
  const people = [...new Map(counted.map((e) => [e.user.id, e.user])).values()];
  const runningCount = counted.filter(isRunning).length;
  const legacy = entries.filter((e) => !hasTimeRange(e));

  const myRunningFor = (itemId: string | null) =>
    allEntries.find(
      (e) => isRunning(e) && e.user.id === user?.id && (e.workOrderItem?.id ?? null) === itemId,
    );

  const rowAction = (itemId: string | null, name: string, annulled = false) => {
    if (!canTrack) return null;
    if (annulled) {
      return (
        <Typography variant="caption" color="error">
          Anulado en la OP — no se produce
        </Typography>
      );
    }
    const running = myRunningFor(itemId);
    // Una tarea en curso se puede finalizar aunque la OT ya haya cambiado de estado.
    if (!trackable && !running) return null;
    return (
      <TaskTimerButton
        workOrderId={workOrder.id}
        workOrderItemId={itemId}
        rowName={name}
        runningEntry={running}
        now={now}
      />
    );
  };

  const rowFooter = (rowEntries: WorkOrderTimeEntry[]) => {
    const seconds = rowEntries.filter((e) => !e.voidedAt).reduce((a, e) => a + entryDurationSeconds(e, now), 0);
    return (
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="caption" color="text.secondary">
          {selectedDay === ALL_DAYS ? 'Total' : 'En el día'}
        </Typography>
        <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {seconds ? formatDuration(seconds) : '—'}
        </Typography>
      </Stack>
    );
  };

  const generalEntries = visible.filter((e) => !e.workOrderItem);
  const rows: TimelineRow[] = [
    {
      id: null,
      name: 'General de la OT',
      subtitle: 'Alistamiento, revisión, empaque',
      entries: generalEntries,
      action: rowAction(null, 'General de la OT'),
      footer: rowFooter(generalEntries),
    },
    ...workOrder.items.map((item) => {
      const itemEntries = visible.filter((e) => e.workOrderItem?.id === item.id);
      const annulled =
        parseFloat(item.orderItem.annulledQuantity ?? '0') > 0 && getAliveQuantity(item.orderItem) === 0;
      return {
        id: item.id,
        name: item.productDescription,
        subtitle: [
          item.productionAreas.map((pa) => pa.productionArea.name).join(', '),
          `${Number(item.orderItem.quantity)} und`,
        ]
          .filter(Boolean)
          .join(' · '),
        entries: itemEntries,
        action: rowAction(item.id, item.productDescription, annulled),
        footer: rowFooter(itemEntries),
      };
    }),
  ];

  const openEntry = openEntryId ? allEntries.find((e) => e.id === openEntryId) ?? null : null;
  const itemOptions = workOrder.items.map((i) => ({ id: i.id, productDescription: i.productDescription }));
  const dayWord =
    selectedDay === ALL_DAYS ? 'En toda la OT' : selectedDay === todayKey ? 'Hoy' : `El ${dayChipLabel(selectedDay)}`;

  return (
    <Card component="section" aria-labelledby="production-panel-title" sx={{ mt: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
        sx={{ px: 2.5, pt: 2, pb: 1.5 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="production-panel-title" variant="h6">
            Producción
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {dayWord}: <strong>{formatDuration(totalSeconds)}</strong> registradas ·{' '}
            <strong>{people.length}</strong> persona{people.length === 1 ? '' : 's'}
            {runningCount > 0 && (
              <>
                {' '}
                · <strong>{runningCount}</strong> en curso
              </>
            )}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', maxWidth: '100%', pb: 0.5 }}>
          {days.map((key) => (
            <Chip
              key={key}
              label={dayChipLabel(key)}
              size="small"
              color={selectedDay === key ? 'primary' : 'default'}
              variant={selectedDay === key ? 'filled' : 'outlined'}
              onClick={() => setSelectedDay(key)}
            />
          ))}
          {days.length > 1 && (
            <Chip
              label="Toda la OT"
              size="small"
              color={selectedDay === ALL_DAYS ? 'primary' : 'default'}
              variant={selectedDay === ALL_DAYS ? 'filled' : 'outlined'}
              onClick={() => setSelectedDay(ALL_DAYS)}
            />
          )}
        </Stack>
        {canSupervise && !isOrderAnnulled && workOrder.status !== WorkOrderStatus.DRAFT && workOrder.status !== WorkOrderStatus.CANCELLED && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setManualOpen(true)}>
            Registro olvidado
          </Button>
        )}
      </Stack>

      {canTrack && !trackable && !isOrderAnnulled && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 1.5 }}>
          El temporizador se activa cuando la OT está confirmada, en producción o lista para entrega.
        </Typography>
      )}

      <TimelineGrid
        rows={rows}
        axis={axis}
        now={now}
        labelHeader="Ítem"
        onOpenEntry={(e) => setOpenEntryId(e.id)}
      />

      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ px: 2.5, py: 1.5 }}>
        {people.map((p) => (
          <LegendSwatch key={p.id} color={operatorColor(p.id)} label={userName(p)} />
        ))}
        <LegendSwatch color={theme.palette.text.secondary} label="En curso" striped />
        <LegendSwatch color={theme.palette.error.main} label="Cerrada por el sistema" outlined />
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 2, height: 14, bgcolor: 'error.main' }} />
          <Typography variant="caption" color="text.secondary">
            Ahora
          </Typography>
        </Stack>
      </Stack>

      {legacy.length > 0 && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Registros anteriores al temporizador, sin hora:{' '}
            {legacy.map((e, i) => (
              <React.Fragment key={e.id}>
                {i > 0 && ' · '}
                <Box
                  component="button"
                  type="button"
                  onClick={() => setOpenEntryId(e.id)}
                  sx={{ border: 0, p: 0, bgcolor: 'transparent', color: 'primary.main', cursor: 'pointer', font: 'inherit' }}
                >
                  {userName(e.user)} {formatDuration(entryDurationSeconds(e))} ({format(new Date(e.workedDate), 'd MMM', { locale: es })})
                </Box>
              </React.Fragment>
            ))}
          </Typography>
        </Box>
      )}

      <TimeEntryDrawer
        entry={openEntry}
        workOrderNumber={workOrder.workOrderNumber}
        now={now}
        currentUserId={user?.id}
        isAdmin={user?.role?.name === 'admin'}
        canSupervise={canSupervise}
        onClose={() => setOpenEntryId(null)}
        onAdjust={(e) => {
          setOpenEntryId(null);
          setAdjusting(e);
        }}
        onVoid={(e) => {
          setOpenEntryId(null);
          setVoiding(e);
        }}
      />
      <AdjustTimeEntryDialog entry={adjusting} items={itemOptions} onClose={() => setAdjusting(null)} />
      <VoidTimeEntryDialog entry={voiding} onClose={() => setVoiding(null)} />
      <ManualTimeEntryDialog
        open={manualOpen}
        workOrderId={workOrder.id}
        items={itemOptions}
        defaultDay={selectedDay === ALL_DAYS ? new Date(now) : parseISO(selectedDay)}
        currentUserId={user?.role?.name === 'admin' ? undefined : user?.id}
        onClose={() => setManualOpen(false)}
      />
    </Card>
  );
};

const LegendSwatch: React.FC<{ color: string; label: string; striped?: boolean; outlined?: boolean }> = ({
  color,
  label,
  striped,
  outlined,
}) => (
  <Stack direction="row" alignItems="center" spacing={0.75}>
    <Box
      sx={{
        width: 22,
        height: 12,
        borderRadius: 0.5,
        borderLeft: `3px solid ${color}`,
        bgcolor: alpha(color, 0.22),
        ...(striped && {
          backgroundImage: `repeating-linear-gradient(135deg, ${alpha(color, 0.34)} 0 4px, ${alpha(color, 0.14)} 4px 8px)`,
        }),
        ...(outlined && { boxShadow: `inset 0 0 0 1.5px ${color}` }),
      }}
    />
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  </Stack>
);

