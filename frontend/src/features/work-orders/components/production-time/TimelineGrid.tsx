import React, { useEffect, useRef } from 'react';
import { Box, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import { keyframes } from '@mui/system';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { WorkOrderTimeEntry } from '../../../../types/work-order.types';
import {
  assignLanes,
  barGeometry,
  entryDurationSeconds,
  formatClock,
  formatDuration,
  formatTimer,
  isRunning,
  needsReview,
  operatorColor,
  positionPercent,
  userInitials,
  userName,
  type TimelineAxis,
} from '../../utils/timeline';

export interface TimelineRow {
  /** `null` = fila «General de la OT». */
  id: string | null;
  name: string;
  subtitle?: string;
  entries: WorkOrderTimeEntry[];
  /** Botón Iniciar/Finalizar u otra acción de la fila. */
  action?: React.ReactNode;
  /** Pie de la etiqueta (total del día, ocupación…). */
  footer?: React.ReactNode;
  /** Fondo opcional (p. ej. franja de asistencia) en % del eje. */
  background?: { left: number; width: number } | null;
}

interface TimelineGridProps {
  rows: TimelineRow[];
  axis: TimelineAxis;
  now: number;
  labelHeader: string;
  /** Texto de cada barra; por defecto la nota de la tarea. */
  barLabel?: (entry: WorkOrderTimeEntry) => string;
  onOpenEntry: (entry: WorkOrderTimeEntry) => void;
}

const march = keyframes`
  to { background-position: 20px 0; }
`;

const BAR_HEIGHT = 28;
const LANE_GAP = 6;
const TRACK_PADDING = 12;
const LABEL_WIDTH = { xs: 168, sm: 248 };

/**
 * Línea de tiempo horizontal: una fila por ítem (o por operario), el eje de
 * horas arriba y una barra por registro. Las tareas en paralelo se ven tal cual,
 * una encima de otra en el mismo tramo de horas.
 */
export const TimelineGrid: React.FC<TimelineGridProps> = ({
  rows,
  axis,
  now,
  labelHeader,
  barLabel,
  onOpenEntry,
}) => {
  const theme = useTheme();
  const span = axis.toHour - axis.fromHour;
  const multiDay = axis.days.length > 1;
  const step = multiDay ? 2 : 1;
  const nowLeft = positionPercent(now, axis);

  const ticks: { left: number; label: string }[] = [];
  axis.days.forEach((_, dayIndex) => {
    for (let h = axis.fromHour; h <= axis.toHour; h += step) {
      if (multiDay && h === axis.fromHour) continue;
      ticks.push({
        left: ((dayIndex * span + (h - axis.fromHour)) / (axis.days.length * span)) * 100,
        label: `${h}:00`,
      });
    }
  });

  // En pantallas angostas la línea se desplaza: al abrirla, que «ahora» quede a la vista.
  const scrollRef = useRef<HTMLDivElement>(null);
  const daysKey = axis.days.join();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || nowLeft === null || el.scrollWidth <= el.clientWidth) return;
    const labelWidth = (el.firstElementChild?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    const trackWidth = el.scrollWidth - labelWidth;
    el.scrollLeft = Math.max(0, labelWidth + (trackWidth * nowLeft) / 100 - el.clientWidth * 0.7);
    // Solo al cambiar de día, no en cada tic del reloj.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey]);

  const gridColor = alpha(theme.palette.text.primary, 0.07);
  const cols = axis.days.length * span;

  const trackSx = {
    position: 'relative' as const,
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px)`,
    backgroundSize: `calc(100% / ${cols}) 100%`,
  };

  const labelSx = {
    position: 'sticky' as const,
    left: 0,
    zIndex: 3,
    bgcolor: 'background.paper',
    borderRight: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    px: 1.5,
    py: 1.25,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0.75,
    minWidth: 0,
  };

  const NowLine = () =>
    nowLeft === null ? null : (
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${nowLeft}%`,
          width: 2,
          bgcolor: 'error.main',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
    );

  return (
    <Box ref={scrollRef} sx={{ overflowX: 'auto', borderTop: `1px solid ${theme.palette.divider}` }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: `${LABEL_WIDTH.xs}px 1fr`, sm: `${LABEL_WIDTH.sm}px 1fr` },
          minWidth: multiDay ? 1200 : 960,
        }}
      >
        {/* Encabezado de horas */}
        <Box sx={{ ...labelSx, justifyContent: 'center', py: 0.75 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase">
            {labelHeader}
          </Typography>
        </Box>
        <Box sx={{ ...trackSx, minHeight: 34 }}>
          {multiDay &&
            axis.days.map((day, i) => (
              <Typography
                key={day}
                variant="caption"
                fontWeight={700}
                sx={{
                  position: 'absolute',
                  top: 8,
                  left: `calc(${(i / axis.days.length) * 100}% + 6px)`,
                  borderLeft: i ? `2px solid ${theme.palette.divider}` : 'none',
                  pl: i ? 0.75 : 0,
                }}
              >
                {format(parseISO(day), "d MMM", { locale: es })}
              </Typography>
            ))}
          {ticks.map((tick) => (
            <Typography
              key={`${tick.left}`}
              variant="caption"
              color="text.secondary"
              sx={{
                position: 'absolute',
                top: 8,
                left: `${tick.left}%`,
                // La primera marca no se centra: quedaría medio cortada contra la etiqueta.
                transform: tick.left === 0 ? 'translateX(4px)' : 'translateX(-50%)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {tick.label}
            </Typography>
          ))}
          {nowLeft !== null && (
            <Box
              sx={{
                position: 'absolute',
                top: 5,
                left: `${nowLeft}%`,
                transform: 'translateX(-50%)',
                bgcolor: 'error.main',
                color: 'error.contrastText',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 1,
                px: 0.75,
                py: 0.25,
                zIndex: 3,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatClock(new Date(now))}
            </Box>
          )}
        </Box>

        {rows.map((row) => {
          const { laned, laneCount } = assignLanes(row.entries, now);
          const height = Math.max(84, TRACK_PADDING * 2 + laneCount * BAR_HEIGHT + (laneCount - 1) * LANE_GAP);
          return (
            <React.Fragment key={row.id ?? 'general'}>
              <Box sx={labelSx}>
                {row.name && (
                  <Typography variant="subtitle2" sx={{ lineHeight: 1.3, wordBreak: 'break-word' }}>
                    {row.name}
                  </Typography>
                )}
                {row.subtitle && (
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                    {row.subtitle}
                  </Typography>
                )}
                {row.action}
                {row.footer}
              </Box>
              <Box sx={{ ...trackSx, minHeight: height }}>
                {row.background && (
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      top: 6,
                      bottom: 6,
                      left: `${row.background.left}%`,
                      width: `${row.background.width}%`,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      border: `1px dashed ${alpha(theme.palette.primary.main, 0.45)}`,
                    }}
                  />
                )}
                {laned.map(({ entry, lane }) => {
                  const geometry = barGeometry(entry, axis, now);
                  if (!geometry) return null;
                  return (
                    <TimelineBar
                      key={entry.id}
                      entry={entry}
                      left={geometry.left}
                      width={geometry.width}
                      top={TRACK_PADDING + lane * (BAR_HEIGHT + LANE_GAP)}
                      now={now}
                      label={barLabel ? barLabel(entry) : entry.notes || 'Sin nota'}
                      onClick={() => onOpenEntry(entry)}
                    />
                  );
                })}
                <NowLine />
              </Box>
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
};

interface TimelineBarProps {
  entry: WorkOrderTimeEntry;
  left: number;
  width: number;
  top: number;
  now: number;
  label: string;
  onClick: () => void;
}

const TimelineBar: React.FC<TimelineBarProps> = ({ entry, left, width, top, now, label, onClick }) => {
  const theme = useTheme();
  const color = operatorColor(entry.user.id);
  const running = isRunning(entry);
  const review = needsReview(entry);
  const voided = Boolean(entry.voidedAt);
  const seconds = entryDurationSeconds(entry, now);

  const range = `${formatClock(entry.startAt!)} – ${running ? 'en curso' : formatClock(entry.endAt!)}`;
  const tooltip = `${userName(entry.user)} · ${label} · ${range}${entry.machine ? ` · ${entry.machine.name}` : ''}`;

  const tint = (amount: number) => alpha(color, amount);

  return (
    <Tooltip title={tooltip} placement="top" disableInteractive>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        aria-label={tooltip}
        sx={{
          position: 'absolute',
          top,
          left: `${left}%`,
          width: `${width}%`,
          minWidth: 10,
          height: BAR_HEIGHT,
          border: 0,
          borderLeft: `4px ${voided ? 'dashed' : 'solid'} ${color}`,
          borderRadius: running ? '7px 0 0 7px' : '7px',
          px: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          overflow: 'hidden',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          fontSize: 12,
          color: 'text.primary',
          bgcolor: review ? alpha(theme.palette.error.main, 0.14) : tint(0.2),
          boxShadow: review
            ? `inset 0 0 0 1.5px ${theme.palette.error.main}`
            : `inset 0 0 0 1px ${tint(0.35)}`,
          opacity: voided ? 0.45 : 1,
          textDecoration: voided ? 'line-through' : 'none',
          zIndex: 1,
          ...(running && {
            backgroundImage: `repeating-linear-gradient(135deg, ${tint(0.34)} 0 7px, ${tint(0.16)} 7px 14px)`,
            backgroundSize: '20px 20px',
            animation: `${march} 1s linear infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            '&::after': {
              content: '""',
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 3,
              bgcolor: color,
            },
          }),
          '&:hover': { bgcolor: review ? alpha(theme.palette.error.main, 0.22) : tint(0.3) },
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          WebkitAppearance: 'none',
        }}
      >
        <Box component="span" sx={{ fontWeight: 700, fontSize: 10.5, color }}>
          {userInitials(entry.user)}
        </Box>
        <Box
          component="span"
          sx={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {label}
        </Box>
        {review && (
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 0.5,
              px: 0.5,
              bgcolor: 'error.main',
              color: 'error.contrastText',
              whiteSpace: 'nowrap',
            }}
          >
            Cerrada por el sistema
          </Box>
        )}
        {entry.adjustedAt && !voided && (
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 0.5,
              px: 0.5,
              bgcolor: alpha(theme.palette.warning.main, 0.18),
              color: 'warning.dark',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.createdBy ? 'Agregado' : 'Ajustado'}
          </Box>
        )}
        <Box
          component="span"
          sx={{
            color: 'text.secondary',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: running ? 'monospace' : 'inherit',
          }}
        >
          {running ? formatTimer(seconds) : formatDuration(seconds)}
        </Box>
      </Box>
    </Tooltip>
  );
};
