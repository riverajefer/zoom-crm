import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import FactoryIcon from '@mui/icons-material/Factory';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { PageHeader } from '../../../components/common/PageHeader';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS, ROUTES } from '../../../utils/constants';
import type { WorkOrderTimeEntry } from '../../../types/work-order.types';
import type { PlantOperator } from '../../../types/work-order-time.types';
import {
  TimelineGrid,
  type TimelineRow,
  type TimelineSpan,
} from '../components/production-time/TimelineGrid';
import { TimeEntryDrawer } from '../components/production-time/TimeEntryDrawer';
import { PlantFilterBar } from '../components/production-time/PlantFilterBar';
import {
  AdjustTimeEntryDialog,
  VoidTimeEntryDialog,
} from '../components/production-time/TimeEntryFormDialogs';
import { usePlantDay } from '../hooks/useWorkOrderTime';
import { useNow } from '../hooks/useNow';
import {
  buildAxis,
  dayKey,
  entryDurationSeconds,
  formatClock,
  formatDuration,
  isRunning,
  positionPercent,
  userName,
} from '../utils/timeline';
import {
  IDLE_ALERT_MINUTES,
  attendanceIntervals,
  averageOccupancy,
  computeOccupancy,
  entryIntervals,
  isInPlant,
  operatorStatus,
  type Occupancy,
  type OperatorStatus,
} from '../utils/plant';
import {
  EMPTY_FILTERS,
  TODAY_ONLY_STATUSES,
  applyPlantFilters,
  buildFilterOptions,
  filtersFromParams,
  filtersToParams,
  hasTaskFilters,
  type PlantFilters,
} from '../utils/plantFilters';

interface OperatorRow {
  operator: PlantOperator;
  status: OperatorStatus;
  occupancy: Occupancy;
}

const atTime = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).getTime();

const barLabel = (entry: WorkOrderTimeEntry) =>
  `${entry.workOrder?.workOrderNumber ?? 'OT'} · ${
    entry.notes || entry.workOrderItem?.productDescription || 'General de la OT'
  }`;

/**
 * «Planta hoy»: una fila por operario con su franja de asistencia y lo que
 * registró en todas las OT. Responde «¿qué está haciendo cada uno?» sin abrir
 * OT por OT.
 */
const ProductionPlantPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const canSupervise = hasPermission(PERMISSIONS.ADJUST_WORK_ORDER_TIME);

  const [selected, setSelected] = useState<Date>(() => new Date());
  const day = format(selected, 'yyyy-MM-dd');
  const isToday = day === dayKey(new Date());

  const { data, isLoading, isError, isFetching } = usePlantDay(day, isToday);
  const operators = useMemo(() => data?.operators ?? [], [data]);
  // Cronómetros al segundo solo si hay algo corriendo.
  const anyRunning = operators.some((o) => o.entries.some(isRunning));
  const now = useNow(anyRunning ? 1000 : 30_000);

  // Los filtros viven en la URL: una vista filtrada se puede compartir o recargar.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromParams(searchParams);
  const setFilters = (next: PlantFilters) =>
    setSearchParams(filtersToParams(next, searchParams), { replace: true });
  const filterOptions = useMemo(() => buildFilterOptions(operators), [operators]);
  // Al cambiar de día puede quedar en la URL una OT o máquina que ese día no
  // aparece: no se ve en el filtro, así que tampoco debe filtrar. Queda en la
  // URL por si se vuelve al día anterior. Lo mismo con los estados que solo
  // aplican a hoy.
  const known = (ids: string[], list: { id: string }[]) => ids.filter((id) => list.some((o) => o.id === id));
  const effectiveFilters: PlantFilters = {
    operatorIds: known(filters.operatorIds, filterOptions.operators),
    areaIds: known(filters.areaIds, filterOptions.areas),
    workOrderIds: known(filters.workOrderIds, filterOptions.workOrders),
    machineIds: known(filters.machineIds, filterOptions.machines),
    status: !isToday && TODAY_ONLY_STATUSES.includes(filters.status) ? 'all' : filters.status,
  };

  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<WorkOrderTimeEntry | null>(null);
  const [voiding, setVoiding] = useState<WorkOrderTimeEntry | null>(null);

  // Una marca sin salida llega hasta ahora; en un día pasado, hasta el cierre
  // de la jornada o la última tarea, para no inflar el tiempo en planta.
  const workdayEnd = atTime(day, data?.schedule.workdayEnd ?? '18:00');
  const openEndFor = (op: PlantOperator) =>
    isToday
      ? now
      : Math.max(workdayEnd, ...entryIntervals(op.entries, now).map(([, end]) => end));

  const rows: OperatorRow[] = operators.map((operator) => {
    const attendance = attendanceIntervals(operator.attendance, openEndFor(operator));
    return {
      operator,
      status: operatorStatus(operator, now, isToday),
      occupancy: computeOccupancy(attendance, entryIntervals(operator.entries, now)),
    };
  });

  const allEntries = operators.flatMap((o) => o.entries);
  const axis = buildAxis([day], allEntries, now);
  // Que la franja de quien entra antes de las 6:00 no quede cortada.
  for (const op of operators) {
    for (const a of op.attendance) {
      if (dayKey(a.clockIn) === day) axis.fromHour = Math.min(axis.fromHour, new Date(a.clockIn).getHours());
    }
  }

  const visibleRows = applyPlantFilters(rows, effectiveFilters);
  const filtering = JSON.stringify(effectiveFilters) !== JSON.stringify(EMPTY_FILTERS);
  const taskFilter = hasTaskFilters(effectiveFilters);

  // Los indicadores se calculan sobre lo que se ve.
  const present = visibleRows.filter((r) =>
    isToday ? isInPlant(r.operator.attendance) : r.operator.attendance.length,
  );
  const busy = visibleRows.filter((r) => r.status.kind === 'busy').length;
  const idleAlert = visibleRows.filter((r) => r.status.kind === 'idle' && r.status.alert).length;
  const average = averageOccupancy(visibleRows.map((r) => r.occupancy.ratio));

  // Con filtro de OT o máquina: cuánto tiempo se le dedicó a eso ese día.
  const selectedEntries = visibleRows.flatMap((r) => r.visibleEntries);
  const selectedSeconds = selectedEntries.reduce((acc, e) => acc + entryDurationSeconds(e, now), 0);
  const selectedPeople = new Set(selectedEntries.map((e) => e.user.id)).size;

  // Una franja por marca de asistencia: si salió a almorzar, el hueco se ve.
  const background = (r: OperatorRow): TimelineSpan[] =>
    attendanceIntervals(r.operator.attendance, openEndFor(r.operator)).flatMap(([start, end]) => {
      const left = positionPercent(start, axis);
      if (left === null) return [];
      const right = positionPercent(end, axis) ?? (dayKey(new Date(end)) > day ? 100 : left);
      return [{ left, width: Math.max(0, right - left) }];
    });

  const timelineRows: TimelineRow[] = visibleRows.map((r) => ({
    id: r.operator.user.id,
    name: userName(r.operator.user),
    subtitle: [r.operator.user.cargo?.name, r.operator.user.cargo?.productionArea?.name]
      .filter(Boolean)
      .join(' · '),
    entries: r.visibleEntries.filter((e) => e.startAt && dayKey(e.startAt) === day),
    background: background(r),
    action: <StatusChip status={r.status} />,
    footer: <OccupancyBar occupancy={r.occupancy} />,
  }));

  const openEntry = openEntryId ? allEntries.find((e) => e.id === openEntryId) ?? null : null;
  const dateTitle = format(parseISO(day), "EEEE d 'de' MMMM", { locale: es });

  return (
    <Box>
      <PageHeader
        title={isToday ? 'Planta hoy' : 'Planta'}
        subtitle="Qué está haciendo cada persona de producción, en todas las OT"
        icon={<FactoryIcon />}
        breadcrumbs={[{ label: 'Producción' }, { label: 'Planta hoy' }]}
        action={
          <DatePicker
            label="Día"
            value={selected}
            onChange={(value) => value && !Number.isNaN(value.getTime()) && setSelected(value)}
            disableFuture
            slotProps={{ textField: { size: 'small', sx: { width: 180 } } }}
          />
        }
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <PlantFilterBar
          filters={effectiveFilters}
          options={filterOptions}
          isToday={isToday}
          onChange={setFilters}
        />
      </Card>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1.5,
          mb: 2,
        }}
      >
        <Kpi
          label={isToday ? 'En planta' : 'Marcaron entrada'}
          value={present.length}
          suffix={` de ${visibleRows.length}`}
        />
        <Kpi label="Con tarea ahora" value={isToday ? busy : '—'} />
        <Kpi label={`Sin tarea hace más de ${IDLE_ALERT_MINUTES} min`} value={isToday ? idleAlert : '—'} warn={idleAlert > 0} />
        <Kpi
          label="Ocupación promedio"
          value={average === null ? '—' : Math.round(average * 100)}
          suffix={average === null ? '' : ' %'}
          progress={average}
        />
      </Box>

      <Card component="section" aria-labelledby="plant-title">
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="plant-title" variant="h6" sx={{ '&::first-letter': { textTransform: 'uppercase' } }}>
              {dateTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {filtering
                ? `Mostrando ${visibleRows.length} de ${rows.length} operarios`
                : `${rows.length} operario${rows.length === 1 ? '' : 's'}`}{' '}
              · haz clic en una barra para ver el detalle
            </Typography>
            {taskFilter && visibleRows.length > 0 && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                En la selección: <strong>{formatDuration(selectedSeconds)}</strong> registradas por{' '}
                <strong>{selectedPeople}</strong> persona{selectedPeople === 1 ? '' : 's'}. La ocupación de cada
                operario sigue contando todas sus tareas del día.
              </Typography>
            )}
          </Box>
          {isFetching && !isLoading && <CircularProgress size={18} aria-label="Actualizando" />}
        </Stack>

        <Alert severity="info" sx={{ mx: 2.5, mb: 1.5 }}>
          El mostrador (DTF) no tiene OT: quien trabaja ahí sale con baja ocupación aunque esté ocupado
          todo el día.
        </Alert>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Alert severity="error" sx={{ mx: 2.5, mb: 2 }}>
            No se pudo cargar la planta. Intenta de nuevo en un momento.
          </Alert>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2.5, pb: 3 }}>
            Ningún usuario activo tiene un rol con permiso para usar el temporizador de la OT.
          </Typography>
        ) : visibleRows.length === 0 ? (
          <Stack spacing={1} alignItems="flex-start" sx={{ px: 2.5, pb: 3 }}>
            <Typography color="text.secondary">Ningún operario coincide con los filtros de este día.</Typography>
            <Button size="small" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpiar filtros
            </Button>
          </Stack>
        ) : (
          <TimelineGrid
            rows={timelineRows}
            axis={axis}
            now={now}
            labelHeader="Operario"
            barLabel={barLabel}
            onOpenEntry={(e) => setOpenEntryId(e.id)}
          />
        )}

        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ px: 2.5, pt: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box
              sx={{
                width: 22,
                height: 12,
                borderRadius: 0.5,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                border: `1px dashed ${alpha(theme.palette.primary.main, 0.45)}`,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              En planta (de la entrada a la salida)
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 2, height: 14, bgcolor: 'error.main' }} />
            <Typography variant="caption" color="text.secondary">
              Ahora
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Un hueco dentro de la franja = tiempo sin tarea registrada
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2.5, pt: 1, pb: 2, maxWidth: '80ch' }}>
          Ocupación = tiempo con al menos una tarea abierta dentro de la asistencia ÷ tiempo en planta.
          Dos tareas a la vez no cuentan doble.
        </Typography>
      </Card>

      <TimeEntryDrawer
        entry={openEntry}
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
        extraAction={
          openEntry && hasPermission(PERMISSIONS.READ_WORK_ORDERS) ? (
            <Button
              variant="text"
              startIcon={<OpenInNewIcon />}
              onClick={() =>
                navigate(`${ROUTES.WORK_ORDERS_DETAIL.replace(':id', openEntry.workOrderId)}?timeEntry=${openEntry.id}`)
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              Ver en la OT
            </Button>
          ) : null
        }
      />
      <AdjustTimeEntryDialog
        entry={adjusting}
        items={adjusting?.workOrderItem ? [adjusting.workOrderItem] : []}
        onClose={() => setAdjusting(null)}
      />
      <VoidTimeEntryDialog entry={voiding} onClose={() => setVoiding(null)} />
    </Box>
  );
};

const StatusChip: React.FC<{ status: OperatorStatus }> = ({ status }) => {
  switch (status.kind) {
    case 'busy':
      return (
        <Chip
          size="small"
          color="success"
          label={`En ${status.running} tarea${status.running === 1 ? '' : 's'}`}
          sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
        />
      );
    case 'idle':
      return (
        <Chip
          size="small"
          color={status.alert ? 'warning' : 'default'}
          variant={status.alert ? 'filled' : 'outlined'}
          label={`Sin tarea hace ${formatDuration(status.idleMs / 1000)}`}
          sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
        />
      );
    case 'left':
      return (
        <Chip
          size="small"
          variant="outlined"
          label={status.at ? `Salió ${formatClock(new Date(status.at))}` : 'Sin marca de salida'}
          sx={{ alignSelf: 'flex-start' }}
        />
      );
    case 'no-entry':
      return <Chip size="small" variant="outlined" label="Sin entrada" sx={{ alignSelf: 'flex-start', color: 'text.secondary' }} />;
  }
};

const OccupancyBar: React.FC<{ occupancy: Occupancy }> = ({ occupancy }) => {
  if (occupancy.ratio === null) return null;
  const percent = Math.round(occupancy.ratio * 100);
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="caption" color="text.secondary">
          Ocupación
        </Typography>
        <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {percent} %
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percent}
        aria-label={`Ocupación ${percent} %`}
        sx={{ height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatDuration(occupancy.busyMs / 1000)} de {formatDuration(occupancy.plantMs / 1000)} en planta
      </Typography>
    </Box>
  );
};

const Kpi: React.FC<{
  label: string;
  value: number | string;
  suffix?: string;
  warn?: boolean;
  progress?: number | null;
}> = ({ label, value, suffix, warn, progress }) => (
  <Card sx={{ px: 2, py: 1.5 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography
      variant="h5"
      fontWeight={700}
      color={warn ? 'warning.main' : 'text.primary'}
      sx={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {value}
      {suffix && (
        <Typography component="span" variant="body2" color="text.secondary" fontWeight={500}>
          {suffix}
        </Typography>
      )}
    </Typography>
    {progress != null && (
      <LinearProgress
        variant="determinate"
        value={Math.round(progress * 100)}
        aria-hidden
        sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
      />
    )}
  </Card>
);

export default ProductionPlantPage;
