import { Handle, Position, type NodeProps } from '@xyflow/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import { useTheme, alpha } from '@mui/material/styles';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';

import { useProductionOrders, useProductionOrder } from '../../production/hooks/useProduction';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: '#F59E0B' },
  IN_PROGRESS: { label: 'En progreso', color: '#3B82F6' },
  COMPLETED: { label: 'Completado', color: '#10B981' },
  CANCELLED: { label: 'Cancelado', color: '#EF4444' },
};

/** Compact card showing a single production order's progress */
function ProductionOrderCard({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const { data: order, isLoading } = useProductionOrder(orderId);

  if (isLoading || !order) {
    return (
      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={18} />
      </Box>
    );
  }

  const { progress, components } = order;
  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;
  const activeComponents = components.length;
  const completedComponents = components.filter((c) => c.progress === 100).length;

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
            {order.template.name}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {order.oprodNumber}
          </Typography>
        </Box>
        <Chip
          label={statusCfg.label}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 700,
            bgcolor: alpha(statusCfg.color, 0.15),
            color: statusCfg.color,
            border: `1px solid ${alpha(statusCfg.color, 0.3)}`,
          }}
        />
      </Box>

      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Progreso</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>{progress.total}%</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress.total}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            '& .MuiLinearProgress-bar': {
              borderRadius: 3,
              bgcolor: progress.total === 100 ? '#10B981' : theme.palette.primary.main,
            },
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Componentes</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {completedComponents} / {activeComponents}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Pasos</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {progress.completedSteps} / {progress.totalSteps}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default function ProductionOrderDetailsNode({ data }: NodeProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const workOrderId = data.workOrderId as string;

  const { data: prodOrdersResponse, isLoading, isError } = useProductionOrders({ workOrderId, limit: 50 });
  const prodOrders = prodOrdersResponse?.data ?? [];

  if (isLoading) {
    return (
      <Box>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Paper
          elevation={0}
          sx={{
            width: 320,
            p: 3,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: isDark ? alpha(theme.palette.background.paper, 0.9) : '#fff',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
          }}
        >
          <CircularProgress size={28} />
        </Paper>
      </Box>
    );
  }

  if (isError || prodOrders.length === 0) {
    return (
      <Box>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Paper
          elevation={0}
          sx={{
            width: 320,
            p: 2,
            bgcolor: isDark ? alpha(theme.palette.background.paper, 0.9) : '#fff',
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Sin órdenes de producción
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: theme.palette.warning.main,
          width: 8,
          height: 8,
          border: 'none',
        }}
      />
      <Paper
        elevation={3}
        sx={{
          width: 320,
          bgcolor: isDark ? theme.palette.background.paper : '#fff',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: isDark
            ? `0 4px 20px ${alpha('#000', 0.5)}`
            : `0 4px 20px ${alpha('#3E4A38', 0.1)}`,
        }}
      >
        <Box
          sx={{
            p: 1.5,
            px: 2,
            background: `linear-gradient(135deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`,
            color: theme.palette.warning.contrastText,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <PrecisionManufacturingIcon fontSize="small" />
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 600, opacity: 0.9, letterSpacing: 0.5, lineHeight: 1.2 }}>
              Órdenes de Producción
            </Typography>
            <Typography variant="caption" display="block" sx={{ opacity: 0.8 }}>
              {prodOrders.length} plantilla{prodOrders.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ maxHeight: 350, overflowY: 'auto' }}>
          {prodOrders.map((po, idx) => (
            <Box key={po.id}>
              <ProductionOrderCard orderId={po.id} />
              {idx < prodOrders.length - 1 && <Divider />}
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}
