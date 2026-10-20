import React from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { useChartColors } from './useChartColors';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ReportInterval } from '../../../../types/work-order-time.types';
import { heatmapCells, heatmapHours, msLabel, percentLabel } from '../../utils/productivity';

/**
 * Gráficos del reporte de productividad, en SVG propio para que sigan el tema
 * claro/oscuro de la app. Un solo eje, marcas delgadas y tooltip por marca.
 */

const HOUR = 3_600_000;

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export const ChartLegend: React.FC<{ items: { color: string; label: string; outlined?: boolean }[] }> = ({ items }) => (
  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2}>
    {items.map((it) => (
      <Stack key={it.label} direction="row" alignItems="center" spacing={0.75}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: 0.75,
            bgcolor: it.outlined ? 'transparent' : it.color,
            border: it.outlined ? `1px dashed ${it.color}` : 'none',
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {it.label}
        </Typography>
      </Stack>
    ))}
  </Stack>
);

// ─────────────────────────────────────────────────────────────────────────────
// Horas por día: en tareas (azul) + en planta sin tarea (neutro), apiladas.
// ─────────────────────────────────────────────────────────────────────────────

export const DailyHoursChart: React.FC<{ daily: { date: string; plantMs: number; busyMs: number }[] }> = ({ daily }) => {
  const c = useChartColors();
  const W = 760;
  const H = 240;
  const L = 44;
  const R = 8;
  const T = 12;
  const B = 32;
  const max = niceMax(Math.max(...daily.map((d) => d.plantMs / HOUR), 1));
  const bw = (W - L - R) / Math.max(daily.length, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Horas por día: en tareas y en planta sin tarea" style={{ minWidth: 480 }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={c.grid} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={c.text}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        <text x={8} y={T + 2} fontSize={11} fill={c.text} transform={`rotate(-90 8 ${T + 2})`} textAnchor="end">
          horas
        </text>
        {daily.map((d, i) => {
          // Con pocos días las barras no se estiran: máximo 56 px, centradas en su franja.
          const w = Math.max(2, Math.min(56, bw - 4));
          const x = L + i * bw + (bw - w) / 2;
          const busy = d.busyMs / HOUR;
          const idle = Math.max(0, (d.plantMs - d.busyMs) / HOUR);
          const yb = y(busy);
          const yt = y(busy + idle);
          const date = parseISO(d.date);
          const label = format(date, "EEE d 'de' MMM", { locale: es });
          return (
            <Tooltip
              key={d.date}
              disableInteractive
              title={
                <Box sx={{ fontSize: 12 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{label}</strong>
                  <br />
                  En tareas: {msLabel(d.busyMs)}
                  <br />
                  En planta sin tarea: {msLabel(Math.max(0, d.plantMs - d.busyMs))}
                  <br />
                  Ocupación: {percentLabel(d.plantMs ? d.busyMs / d.plantMs : null)}
                </Box>
              }
            >
              <g>
                {idle > 0 && <rect x={x} y={yt} width={w} height={Math.max(0, yb - yt - 2)} rx={3} fill={c.idle} />}
                <rect x={x} y={yb} width={w} height={Math.max(0, y(0) - yb)} rx={3} fill={c.data} />
                <rect x={x - 2} y={T} width={w + 4} height={H - T - B} fill="transparent" />
                {(daily.length <= 16 || i % 2 === 0) && (
                  <text x={x + w / 2} y={H - B + 16} textAnchor="middle" fontSize={11} fill={c.text}>
                    {format(date, 'd')}
                  </text>
                )}
              </g>
            </Tooltip>
          );
        })}
      </svg>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Barras horizontales con etiqueta directa
// ─────────────────────────────────────────────────────────────────────────────

export interface BarDatum {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  note?: string;
  tooltip?: React.ReactNode;
}

export const HorizontalBars: React.FC<{ data: BarDatum[]; max?: number; ariaLabel: string }> = ({
  data,
  max,
  ariaLabel,
}) => {
  const c = useChartColors();
  const W = 560;
  const rowH = 30;
  const L = 190;
  const R = 110;
  const H = data.length * rowH + 8;
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value), 0.0001));
  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} style={{ maxWidth: W, minWidth: 300, display: 'block' }}>
      {data.map((d, i) => {
        const y = 4 + i * rowH;
        const w = (W - L - R) * Math.min(1, d.value / top);
        const label = d.label.length > 21 ? `${d.label.slice(0, 20)}…` : d.label;
        return (
          <Tooltip key={d.id} disableInteractive title={d.tooltip ?? `${d.label}: ${d.valueLabel}`}>
            <g>
              <text x={L - 8} y={y + 18} textAnchor="end" fontSize={12} fontWeight={600} fill={c.strong}>
                {label}
              </text>
              <rect x={L} y={y + 6} width={W - L - R} height={16} rx={4} fill={c.track} />
              <rect x={L} y={y + 6} width={Math.max(0, w)} height={16} rx={4} fill={c.data} />
              <text x={L + w + 6} y={y + 18} fontSize={11} fill={c.text}>
                {d.valueLabel}
                {d.note ? ` · ${d.note}` : ''}
              </text>
              <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
            </g>
          </Tooltip>
        );
      })}
    </svg>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de calor día × hora de un operario
// ─────────────────────────────────────────────────────────────────────────────

export const OccupancyHeatmap: React.FC<{
  days: { date: string; attendance: ReportInterval[]; busy: ReportInterval[] }[];
}> = ({ days }) => {
  const c = useChartColors();
  const { from, to } = heatmapHours(days);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const W = 700;
  const L = 64;
  const T = 22;
  const cw = (W - L - 6) / hours.length;
  const ch = 20;
  const H = T + days.length * (ch + 3) + 6;
  const level = (share: number) => (share <= 0 ? 0 : share < 0.2 ? 1 : share < 0.45 ? 2 : share < 0.7 ? 3 : share < 0.9 ? 4 : 5);

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Mapa de calor: tiempo en tareas por hora" style={{ minWidth: 520 }}>
        {hours.map((h, j) => (
          <text key={h} x={L + j * cw + cw / 2} y={14} textAnchor="middle" fontSize={11} fill={c.text}>
            {h}
          </text>
        ))}
        {days.map((d, i) => {
          const y = T + i * (ch + 3);
          const date = parseISO(d.date);
          const cells = heatmapCells(d.date, d.attendance, d.busy, from, to);
          return (
            <g key={d.date}>
              <text x={L - 6} y={y + 14} textAnchor="end" fontSize={11} fill={c.text}>
                {format(date, 'EEE d', { locale: es })}
              </text>
              {cells.map((cell, j) => {
                const x = L + j * cw;
                if (!cell.plantMs) {
                  return (
                    <rect key={cell.hour} x={x + 1} y={y} width={cw - 2} height={ch} rx={3} fill="none" stroke={c.grid} strokeDasharray="2 3" />
                  );
                }
                return (
                  <Tooltip
                    key={cell.hour}
                    disableInteractive
                    title={`${format(date, "EEE d 'de' MMM", { locale: es })} · ${cell.hour}:00–${cell.hour + 1}:00 · en planta ${msLabel(
                      cell.plantMs,
                    )}, en tareas ${msLabel(cell.busyMs)}`}
                  >
                    <rect x={x + 1} y={y} width={cw - 2} height={ch} rx={3} fill={c.seq[level(cell.busyMs / cell.plantMs)]} />
                  </Tooltip>
                );
              })}
            </g>
          );
        })}
      </svg>
    </Box>
  );
};

export const HeatmapLegend: React.FC = () => {
  const c = useChartColors();
  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={1.5}>
      <ChartLegend items={[{ color: c.text, label: 'Fuera de planta', outlined: true }, { color: c.seq[0], label: 'En planta sin tarea' }]} />
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {c.seq.slice(1).map((color) => (
          <Box key={color} sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: color }} />
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          más tiempo en tareas
        </Typography>
      </Stack>
    </Stack>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Uso por hora del día (mini gráfico de una fila de la tabla de máquinas)
// ─────────────────────────────────────────────────────────────────────────────

export const HourlySparkline: React.FC<{ hourly: number[]; max: number; fromHour?: number; toHour?: number }> = ({
  hourly,
  max,
  fromHour = 6,
  toHour = 21,
}) => {
  const c = useChartColors();
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const W = hours.length * 10;
  const H = 22;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Uso por hora del día">
      {hours.map((h, i) => {
        const v = hourly[h] ?? 0;
        const bh = v > 0 ? Math.max(2, (v / Math.max(max, 1)) * H) : 1;
        return (
          <Tooltip key={h} disableInteractive title={`${h}:00–${h + 1}:00 · ${msLabel(v)} de uso en el periodo`}>
            <rect x={i * 10} y={H - bh} width={8} height={bh} rx={1.5} fill={v > 0 ? c.data : c.track} />
          </Tooltip>
        );
      })}
    </svg>
  );
};

