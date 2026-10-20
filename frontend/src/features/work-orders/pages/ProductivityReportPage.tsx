import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
  Box,
  Card,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import InsightsIcon from '@mui/icons-material/Insights';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { format, parseISO } from 'date-fns';
import { PageHeader } from '../../../components/common/PageHeader';
import type {
  ProductivityOperatorRow,
  ProductivityReport,
  ProductivityTotals,
} from '../../../types/work-order-time.types';
import { useProductivityReport, useTimeMachines } from '../hooks/useWorkOrderTime';
import { operatorColor, userInitials, userName } from '../utils/timeline';
import {
  PERIOD_LABELS,
  buildInsights,
  confidenceLevel,
  hoursLabel,
  msLabel,
  percentLabel,
  presetRange,
  relativeChange,
  type ConfidenceLevel,
  type PeriodPreset,
} from '../utils/productivity';
import { ChartLegend, DailyHoursChart, HorizontalBars } from '../components/production-report/ReportCharts';
import { useChartColors } from '../components/production-report/useChartColors';
import { OperatorReportDrawer } from '../components/production-report/OperatorReportDrawer';

type TabKey = 'summary' | 'operators' | 'quality';

const dayLabel = (day: string) => format(parseISO(day), 'dd/MM/yyyy');

/**
 * Reporte de productividad de producción (fase 1, sin costos): cuánto del
 * tiempo en planta se convierte en trabajo sobre OT, por operario y periodo.
 */
const ProductivityReportPage: React.FC = () => {
  const [preset, setPreset] = useState<PeriodPreset>('fortnight');
  const [custom, setCustom] = useState(() => presetRange('fortnight'));
  const range = preset === 'custom' ? custom : presetRange(preset);
  const [areaId, setAreaId] = useState('');
  const [userId, setUserId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [tab, setTab] = useState<TabKey>('summary');
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const { data: report, isLoading, isError, isFetching } = useProductivityReport({
    from: range.from,
    to: range.to,
    areaId: areaId || undefined,
    userId: userId || undefined,
    machineId: machineId || undefined,
  });
  const { data: machines = [] } = useTimeMachines();

  // Opciones de área y operario: se guardan de la última respuesta sin ese
  // filtro, para que al elegir un área no desaparezcan las demás opciones.
  const [areaOptions, setAreaOptions] = useState<{ id: string; name: string }[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<ProductivityOperatorRow['user'][]>([]);
  useEffect(() => {
    if (!report) return;
    if (!areaId && !userId) {
      const areas = new Map<string, string>();
      report.operators.forEach((o) => {
        const a = o.user.cargo?.productionArea;
        if (a) areas.set(a.id, a.name);
      });
      setAreaOptions([...areas].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es')));
    }
    if (!userId) setOperatorOptions(report.operators.map((o) => o.user));
  }, [report, areaId, userId]);

  const openRow = report?.operators.find((o) => o.user.id === openUserId) ?? null;

  return (
    <Box>
      <PageHeader
        title="Productividad"
        subtitle="Cuánto del tiempo en planta se convierte en trabajo sobre OT, por operario"
        icon={<InsightsIcon />}
        breadcrumbs={[{ label: 'Producción' }, { label: 'Productividad' }]}
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
            gap: 1.5,
          }}
        >
          <TextField select size="small" label="Periodo" value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
              <MenuItem key={p} value={p}>
                {PERIOD_LABELS[p]}
              </MenuItem>
            ))}
          </TextField>
          {preset === 'custom' && (
            <>
              <DatePicker
                label="Desde"
                value={parseISO(custom.from)}
                onChange={(v) => v && !Number.isNaN(v.getTime()) && setCustom((c) => ({ ...c, from: format(v, 'yyyy-MM-dd') }))}
                disableFuture
                slotProps={{ textField: { size: 'small' } }}
              />
              <DatePicker
                label="Hasta"
                value={parseISO(custom.to)}
                onChange={(v) => v && !Number.isNaN(v.getTime()) && setCustom((c) => ({ ...c, to: format(v, 'yyyy-MM-dd') }))}
                disableFuture
                slotProps={{ textField: { size: 'small' } }}
              />
            </>
          )}
          <TextField
            select
            size="small"
            label="Área"
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setUserId('');
            }}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Todas las áreas</MenuItem>
            {areaOptions.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Operario"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Todos los operarios</MenuItem>
            {operatorOptions.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {userName(u)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Máquina"
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Todas las máquinas</MenuItem>
            {machines.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Del {dayLabel(range.from)} al {dayLabel(range.to)}
            {report && ` · se compara con el ${dayLabel(report.previous.from)} al ${dayLabel(report.previous.to)}`}
            {machineId && ' · solo las tareas hechas en esa máquina'}
          </Typography>
          {isFetching && !isLoading && <CircularProgress size={16} aria-label="Actualizando" />}
        </Stack>
      </Card>

      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} variant="scrollable">
        <Tab value="summary" label="Resumen" />
        <Tab value="operators" label="Operarios" />
        <Tab value="quality" label="Calidad del registro" />
      </Tabs>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : isError || !report ? (
        <Alert severity="error">No se pudo cargar el reporte. Revisa el periodo e intenta de nuevo.</Alert>
      ) : report.operators.length === 0 ? (
        <Alert severity="info">Ningún operario coincide con los filtros.</Alert>
      ) : tab === 'summary' ? (
        <SummaryTab report={report} />
      ) : tab === 'operators' ? (
        <OperatorsTab rows={report.operators} onOpen={setOpenUserId} />
      ) : (
        <QualityTab rows={report.operators} />
      )}

      <Definitions />
      <OperatorReportDrawer row={openRow} onClose={() => setOpenUserId(null)} />
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────

const Kpi: React.FC<{ label: string; value: string; change?: { text: string; good: boolean | null } | null }> = ({
  label,
  value,
  change,
}) => (
  <Card sx={{ px: 2, py: 1.5, minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </Typography>
    {change && (
      <Typography
        variant="caption"
        sx={{ fontVariantNumeric: 'tabular-nums' }}
        color={change.good === null ? 'text.secondary' : change.good ? 'success.main' : 'error.main'}
      >
        {change.text} vs periodo anterior
      </Typography>
    )}
  </Card>
);

const changeOf = (current: number, previous: number, higherIsBetter = true) => {
  const delta = relativeChange(current, previous);
  if (delta === null) return null;
  const pct = Math.round(delta * 100);
  return { text: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '■'} ${Math.abs(pct)} %`, good: pct === 0 ? null : (pct > 0) === higherIsBetter };
};

const SummaryTab: React.FC<{ report: ProductivityReport }> = ({ report }) => {
  const colors = useChartColors();
  const t: ProductivityTotals = report.totals;
  const p = report.previous.totals;
  const occChange =
    t.occupancy !== null && p.occupancy !== null
      ? (() => {
          const pts = Math.round((t.occupancy - p.occupancy) * 100);
          return { text: `${pts > 0 ? '▲' : pts < 0 ? '▼' : '■'} ${Math.abs(pts)} pts`, good: pts === 0 ? null : pts > 0 };
        })()
      : null;
  const insights = buildInsights(report);
  const operatorBars = report.operators
    .filter((r) => r.plantMs > 0)
    .sort((a, b) => (b.occupancy ?? 0) - (a.occupancy ?? 0))
    .map((r) => ({
      id: r.user.id,
      label: userName(r.user),
      value: r.occupancy ?? 0,
      valueLabel: percentLabel(r.occupancy),
      tooltip: `${userName(r.user)}: ${msLabel(r.busyMs)} en tareas de ${msLabel(r.plantMs)} en planta`,
    }));
  const areaBars = report.areas
    .slice()
    .sort((a, b) => b.busyMs - a.busyMs)
    .map((a) => ({
      id: a.id ?? 'none',
      label: a.name,
      value: a.busyMs,
      valueLabel: hoursLabel(a.busyMs),
      tooltip: `${a.name}: ${msLabel(a.busyMs)} en tareas de ${msLabel(a.plantMs)} en planta (${percentLabel(
        a.plantMs ? a.busyMs / a.plantMs : null,
      )})`,
    }));

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1.5, mb: 2 }}>
        <Kpi label="Horas en planta" value={msLabel(t.plantMs)} change={changeOf(t.plantMs, p.plantMs)} />
        <Kpi label="Horas en tareas" value={msLabel(t.busyMs)} change={changeOf(t.busyMs, p.busyMs)} />
        <Kpi label="Ocupación" value={percentLabel(t.occupancy)} change={occChange} />
        <Kpi label="Horas extra" value={msLabel(t.extraMs)} change={changeOf(t.extraMs, p.extraMs, false)} />
        <Kpi label="OTs con tiempo registrado" value={String(t.workOrders)} change={changeOf(t.workOrders, p.workOrders)} />
      </Box>

      {insights.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1.5, mb: 2 }}>
          {insights.map((i) => (
            <Alert key={i.text} severity={i.severity} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
              {i.text}
            </Alert>
          ))}
        </Box>
      )}

      <Card sx={{ p: 2.5, mb: 2, minWidth: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
          <Box>
            <Typography variant="h6">Horas por día</Typography>
            <Typography variant="body2" color="text.secondary">
              La parte gris es tiempo en planta sin una tarea abierta.
            </Typography>
          </Box>
          <ChartLegend
            items={[
              { color: colors.data, label: 'En tareas' },
              { color: colors.idle, label: 'En planta sin tarea' },
            ]}
          />
        </Stack>
        {report.daily.length ? (
          <DailyHoursChart daily={report.daily} />
        ) : (
          <Typography color="text.secondary">Sin asistencia ni tareas en el periodo.</Typography>
        )}
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <Card sx={{ p: 2.5, minWidth: 0 }}>
          <Typography variant="h6">Ocupación por operario</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Horas en tareas ÷ horas en planta.
          </Typography>
          <HorizontalBars data={operatorBars} max={1} ariaLabel="Ocupación por operario" />
        </Card>
        <Card sx={{ p: 2.5, minWidth: 0 }}>
          <Typography variant="h6">Horas en tareas por área</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Área del cargo de cada operario.
          </Typography>
          <HorizontalBars data={areaBars} ariaLabel="Horas en tareas por área" />
        </Card>
      </Box>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Operarios
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'daysWorked' | 'plantMs' | 'busyMs' | 'occupancy' | 'parallel' | 'extraMs' | 'workOrders' | 'closed';

const sortValue = (r: ProductivityOperatorRow, key: SortKey): number | string | null => {
  switch (key) {
    case 'name':
      return userName(r.user);
    case 'workOrders':
      return r.workOrders.length;
    case 'closed': {
      const valid = r.quality.entries - r.quality.voided;
      return valid ? r.quality.closedBySystem / valid : null;
    }
    default:
      return r[key];
  }
};

const useSorted = (rows: ProductivityOperatorRow[], initial: SortKey) => {
  const [key, setKey] = useState<SortKey>(initial);
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const sorted = useMemo(
    () =>
      rows.slice().sort((a, b) => {
        const x = sortValue(a, key);
        const y = sortValue(b, key);
        if (x === null) return 1;
        if (y === null) return -1;
        const cmp = typeof x === 'string' ? x.localeCompare(String(y), 'es') : x - (y as number);
        return dir === 'asc' ? cmp : -cmp;
      }),
    [rows, key, dir],
  );
  const header = (k: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <TableCell align={align} sortDirection={key === k ? dir : false} sx={{ whiteSpace: 'nowrap' }}>
      <TableSortLabel
        active={key === k}
        direction={key === k ? dir : 'desc'}
        onClick={() => {
          if (key === k) setDir(dir === 'asc' ? 'desc' : 'asc');
          else {
            setKey(k);
            setDir(k === 'name' ? 'asc' : 'desc');
          }
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
  return { sorted, header };
};

const OperatorCell: React.FC<{ row: ProductivityOperatorRow }> = ({ row }) => (
  <Stack direction="row" alignItems="center" spacing={1.25}>
    <Avatar sx={{ width: 30, height: 30, fontSize: 12, bgcolor: operatorColor(row.user.id) }}>{userInitials(row.user)}</Avatar>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600} noWrap>
        {userName(row.user)}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap component="div">
        {row.user.cargo?.productionArea?.name ?? row.user.cargo?.name ?? 'Sin cargo'}
      </Typography>
    </Box>
  </Stack>
);

const OperatorsTab: React.FC<{ rows: ProductivityOperatorRow[]; onOpen: (id: string) => void }> = ({ rows, onOpen }) => {
  const { sorted, header } = useSorted(rows, 'occupancy');
  return (
    <Card>
      <Box sx={{ px: 2.5, pt: 2 }}>
        <Typography variant="h6">Operarios</Typography>
        <Typography variant="body2" color="text.secondary">
          Haz clic en una fila para ver su ficha: cuándo trabajó, en qué OT y en qué máquinas.
        </Typography>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {header('name', 'Operario', 'left')}
              {header('daysWorked', 'Días')}
              {header('plantMs', 'En planta')}
              {header('busyMs', 'En tareas')}
              {header('occupancy', 'Ocupación', 'left')}
              {header('parallel', 'Paralelo')}
              {header('extraMs', 'Horas extra')}
              {header('workOrders', 'OTs')}
              <TableCell>Máquina principal</TableCell>
              {header('closed', 'Cerradas por el sistema')}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((r) => {
              const valid = r.quality.entries - r.quality.voided;
              const closed = valid ? r.quality.closedBySystem / valid : null;
              return (
                <TableRow
                  key={r.user.id}
                  hover
                  tabIndex={0}
                  onClick={() => onOpen(r.user.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(r.user.id)}
                  sx={{ cursor: 'pointer', '& td': { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
                >
                  <TableCell>
                    <OperatorCell row={r} />
                  </TableCell>
                  <TableCell align="right">{r.daysWorked}</TableCell>
                  <TableCell align="right">{msLabel(r.plantMs)}</TableCell>
                  <TableCell align="right">{msLabel(r.busyMs)}</TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 130 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.round((r.occupancy ?? 0) * 100)}
                        sx={{ flex: 1, height: 6, borderRadius: 3 }}
                        aria-hidden
                      />
                      <span>{percentLabel(r.occupancy)}</span>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{r.parallel ? `${r.parallel.toFixed(2).replace('.', ',')}×` : '—'}</TableCell>
                  <TableCell align="right">{r.extraMs ? msLabel(r.extraMs) : '—'}</TableCell>
                  <TableCell align="right">{r.workOrders.length}</TableCell>
                  <TableCell>{r.machines[0]?.name ?? '—'}</TableCell>
                  <TableCell align="right">
                    {closed === null ? (
                      '—'
                    ) : (
                      <Chip
                        size="small"
                        color={closed > 0.1 ? 'error' : closed > 0.05 ? 'warning' : 'success'}
                        variant="outlined"
                        label={`${r.quality.closedBySystem} · ${percentLabel(closed)}`}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Calidad del registro
// ─────────────────────────────────────────────────────────────────────────────

const CONFIDENCE: Record<ConfidenceLevel, { label: string; color: 'success' | 'warning' | 'error' }> = {
  high: { label: 'Alta', color: 'success' },
  medium: { label: 'Media', color: 'warning' },
  low: { label: 'Baja', color: 'error' },
};

const QualityTab: React.FC<{ rows: ProductivityOperatorRow[] }> = ({ rows }) => {
  const total = rows.reduce(
    (a, r) => ({
      entries: a.entries + r.quality.entries,
      closed: a.closed + r.quality.closedBySystem,
      adjusted: a.adjusted + r.quality.adjusted,
      added: a.added + r.quality.added,
      voided: a.voided + r.quality.voided,
    }),
    { entries: 0, closed: 0, adjusted: 0, added: 0, voided: 0 },
  );
  const sorted = rows.slice().sort((a, b) => {
    const order = { low: 0, medium: 1, high: 2 };
    return order[confidenceLevel(a.quality)] - order[confidenceLevel(b.quality)];
  });
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1.5, mb: 2 }}>
        <Kpi label="Tareas registradas" value={String(total.entries)} />
        <Kpi label="Cerradas por el sistema" value={`${total.closed}`} />
        <Kpi label="Ajustadas por un supervisor" value={String(total.adjusted)} />
        <Kpi label="Agregadas a mano" value={String(total.added)} />
        <Kpi label="Anuladas" value={String(total.voided)} />
      </Box>
      <Card>
        <Box sx={{ px: 2.5, pt: 2 }}>
          <Typography variant="h6">Calidad del registro por operario</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '80ch' }}>
            Las cifras de productividad valen lo que valga el registro. Una tarea olvidada que cierra el sistema infla las
            horas; tiempo en planta sin tarea puede ser trabajo sin registrar; tareas fuera de la asistencia suelen ser
            una entrada o salida sin marcar.
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Operario</TableCell>
                <TableCell align="right">Tareas</TableCell>
                <TableCell align="right">Cerradas por el sistema</TableCell>
                <TableCell align="right">Ajustadas</TableCell>
                <TableCell align="right">Agregadas</TableCell>
                <TableCell align="right">Anuladas</TableCell>
                <TableCell align="right">En planta sin tarea</TableCell>
                <TableCell align="right">Tareas fuera de asistencia</TableCell>
                <TableCell>Confianza</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => {
                const q = r.quality;
                const valid = q.entries - q.voided;
                const level = CONFIDENCE[confidenceLevel(q)];
                return (
                  <TableRow key={r.user.id} sx={{ '& td': { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}>
                    <TableCell>
                      <OperatorCell row={r} />
                    </TableCell>
                    <TableCell align="right">{q.entries}</TableCell>
                    <TableCell align="right">
                      {q.closedBySystem}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        ({percentLabel(valid ? q.closedBySystem / valid : null)})
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{q.adjusted}</TableCell>
                    <TableCell align="right">{q.added}</TableCell>
                    <TableCell align="right">{q.voided}</TableCell>
                    <TableCell align="right">{r.plantMs ? percentLabel(q.unregisteredMs / r.plantMs) : '—'}</TableCell>
                    <TableCell align="right">{q.outsideAttendanceMs ? msLabel(q.outsideAttendanceMs) : '—'}</TableCell>
                    <TableCell>
                      {q.entries === 0 ? (
                        <Chip size="small" variant="outlined" label="Sin tareas" />
                      ) : (
                        <Chip size="small" color={level.color} label={level.label} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Definiciones
// ─────────────────────────────────────────────────────────────────────────────

const DEFINITIONS: [string, string][] = [
  ['Horas en planta', 'Suma de la asistencia, de la entrada a la salida. El almuerzo cuenta si no marcan salida.'],
  ['Horas en tareas', 'Tiempo con al menos una tarea abierta dentro de la asistencia. Dos tareas a la vez cuentan una sola vez.'],
  ['Ocupación', 'Horas en tareas ÷ horas en planta. Mide cuánto del tiempo pagado se dedica a OT; no mide velocidad ni calidad.'],
  ['Paralelo', 'Suma de todas las tareas ÷ horas en tareas. 1,3× quiere decir que en promedio llevaba 1,3 tareas a la vez.'],
  ['Horas extra', 'Horas en tareas después del cierre de la jornada (18:00).'],
  ['Confianza del registro', 'Baja si el sistema cerró más del 10 % de sus tareas o anuló más de 2; media desde el 5 %.'],
  ['Mostrador', 'El trabajo de mostrador (DTF) no tiene OT: quien trabaja ahí sale con baja ocupación aunque esté ocupado.'],
];

const Definitions: React.FC = () => (
  <Accordion sx={{ mt: 2 }} disableGutters>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography fontWeight={600}>Cómo se calcula cada número</Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2 }}>
        {DEFINITIONS.map(([term, text]) => (
          <Box key={term}>
            <Typography variant="body2" fontWeight={600}>
              {term}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {text}
            </Typography>
          </Box>
        ))}
      </Box>
    </AccordionDetails>
  </Accordion>
);

export default ProductivityReportPage;
