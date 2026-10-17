import React, { useState } from 'react';
import {
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Typography,
} from '@mui/material';
import RuleIcon from '@mui/icons-material/Rule';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ROUTES } from '../../../../utils/constants';
import { usePendingReview } from '../../hooks/useWorkOrderTime';
import { formatClock, userName } from '../../utils/timeline';

/**
 * Chip del supervisor: tareas que el operario no finalizó y cerró el sistema.
 * Cada una lleva a su OT con el registro abierto para ajustarlo o darlo por bueno.
 */
export const PendingTimeReviewChip: React.FC = () => {
  const { data: entries = [] } = usePendingReview();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();

  if (entries.length === 0) return null;

  return (
    <>
      <Chip
        icon={<RuleIcon />}
        label={`${entries.length} por revisar`}
        color="error"
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
        slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: 420 } } }}
      >
        <Typography variant="subtitle2" sx={{ px: 2, pt: 2 }}>
          Tareas cerradas por el sistema
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2 }}>
          El operario no las finalizó. Revisa la hora real y ajústalas o dalas por buenas.
        </Typography>
        <List dense>
          {entries.map((entry) => (
            <ListItemButton
              key={entry.id}
              onClick={() => {
                setAnchor(null);
                navigate(`${ROUTES.WORK_ORDERS_DETAIL.replace(':id', entry.workOrderId)}?timeEntry=${entry.id}`);
              }}
            >
              <ListItemText
                primary={`${entry.workOrder?.workOrderNumber ?? 'OT'} · ${userName(entry.user)}`}
                secondary={`${entry.notes || entry.workOrderItem?.productDescription || 'Tarea general'} · ${
                  entry.startAt ? format(new Date(entry.startAt), 'd MMM', { locale: es }) : ''
                } ${entry.startAt ? formatClock(entry.startAt) : ''}–${entry.endAt ? formatClock(entry.endAt) : ''}`}
              />
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
};
