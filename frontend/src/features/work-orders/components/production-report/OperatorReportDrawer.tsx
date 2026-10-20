import React from 'react';
import {
  Avatar,
  Box,
  Card,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ProductivityOperatorRow } from '../../../../types/work-order-time.types';
import { operatorColor, userInitials, userName } from '../../utils/timeline';
import { copLabel, hoursLabel, msLabel, percentLabel } from '../../utils/productivity';
import { HeatmapLegend, HorizontalBars, OccupancyHeatmap } from './ReportCharts';

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Card variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </Typography>
  </Card>
);

/** Ficha del operario: cuándo trabajó (mapa de calor), en qué OT y en qué máquinas. */
export const OperatorReportDrawer: React.FC<{
  row: ProductivityOperatorRow | null;
  onClose: () => void;
}> = ({ row, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const days = row?.days.filter((d) => d.plantMs > 0 || d.busy.length > 0) ?? [];

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={Boolean(row)}
      onClose={onClose}
      PaperProps={{ sx: { width: isMobile ? '100%' : 760, maxHeight: isMobile ? '92vh' : '100%' } }}
    >
      {row && (
        <>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 2 }}>
            <Avatar sx={{ bgcolor: operatorColor(row.user.id), width: 40, height: 40, fontSize: 15 }}>
              {userInitials(row.user)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {userName(row.user)}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {[row.user.cargo?.name, row.user.cargo?.productionArea?.name].filter(Boolean).join(' · ') || 'Sin cargo'}
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Cerrar">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Divider />
          <Stack spacing={2.5} sx={{ p: 2.5, overflowY: 'auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5 }}>
              <Stat label="Ocupación" value={percentLabel(row.occupancy)} />
              <Stat label="En tareas" value={msLabel(row.busyMs)} />
              <Stat label="En planta" value={msLabel(row.plantMs)} />
              <Stat label="Paralelo" value={row.parallel ? `${row.parallel.toFixed(2).replace('.', ',')}×` : '—'} />
              <Stat label="Horas extra" value={row.extraMs ? msLabel(row.extraMs) : '—'} />
              {row.cost && (
                <>
                  <Stat label="Valor hora *" value={copLabel(row.cost.hourlyRate)} />
                  <Stat label="Costo del periodo *" value={copLabel(row.cost.periodCost)} />
                  <Stat label="Costo / h productiva *" value={copLabel(row.cost.costPerProductiveHour)} />
                </>
              )}
            </Box>
            {row.cost === null && (
              <Typography variant="body2" color="warning.main">
                No tiene salario en nómina: su tiempo no suma al costo.
              </Typography>
            )}

            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Cuándo trabajó
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Cada celda es una hora. Más oscuro, más tiempo de esa hora con una tarea abierta.
              </Typography>
              {days.length ? (
                <>
                  <OccupancyHeatmap days={days} />
                  <Box sx={{ mt: 1 }}>
                    <HeatmapLegend />
                  </Box>
                </>
              ) : (
                <Typography color="text.secondary">Sin asistencia ni tareas en el periodo.</Typography>
              )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Horas por OT
                </Typography>
                {row.workOrders.length ? (
                  <HorizontalBars
                    ariaLabel="Horas por OT"
                    data={row.workOrders.slice(0, 10).map((o) => ({
                      id: o.id,
                      label: o.workOrderNumber,
                      value: o.ms,
                      valueLabel: hoursLabel(o.ms),
                    }))}
                  />
                ) : (
                  <Typography color="text.secondary">Sin tareas.</Typography>
                )}
                {row.workOrders.length > 10 && (
                  <Typography variant="caption" color="text.secondary">
                    Y {row.workOrders.length - 10} OT más.
                  </Typography>
                )}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Horas por máquina
                </Typography>
                {row.machines.length ? (
                  <HorizontalBars
                    ariaLabel="Horas por máquina"
                    data={row.machines.map((m) => ({ id: m.id, label: m.name, value: m.ms, valueLabel: hoursLabel(m.ms) }))}
                  />
                ) : (
                  <Typography color="text.secondary">No registró máquina en sus tareas.</Typography>
                )}
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Las horas por OT y por máquina suman cada tarea completa: con dos tareas a la vez cuentan las dos.
            </Typography>
          </Stack>
        </>
      )}
    </Drawer>
  );
};
