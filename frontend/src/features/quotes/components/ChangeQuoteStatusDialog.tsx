import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  MenuItem,
  TextField,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { Quote, QuoteStatus, QUOTE_STATUS_CONFIG, ALLOWED_QUOTE_TRANSITIONS } from '../../../types/quote.types';

interface ChangeQuoteStatusDialogProps {
  open: boolean;
  quote: Quote | null;
  onClose: () => void;
  onConfirm: (newStatus: QuoteStatus, rejectionReason?: string) => Promise<void>;
  isLoading?: boolean;
}

export const ChangeQuoteStatusDialog: React.FC<ChangeQuoteStatusDialogProps> = ({
  open,
  quote,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<QuoteStatus | ''>('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reasonDirty, setReasonDirty] = useState(false);

  const availableStatuses = useMemo(() => {
    if (!quote) return [];
    const nextStatuses = ALLOWED_QUOTE_TRANSITIONS[quote.status] || [];
    return nextStatuses.map((status) => ({
      value: status,
      label: QUOTE_STATUS_CONFIG[status]?.label || status,
    }));
  }, [quote]);

  useEffect(() => {
    if (quote && open) {
      const nextStatuses = ALLOWED_QUOTE_TRANSITIONS[quote.status] || [];
      setSelectedStatus(nextStatuses.length === 1 ? nextStatuses[0] : '');
      setRejectionReason('');
      setReasonDirty(false);
    }
  }, [quote, open]);

  const isRejecting = selectedStatus === QuoteStatus.REJECTED;
  const reasonMissing = isRejecting && !rejectionReason.trim();

  const handleConfirm = async () => {
    if (!selectedStatus) return;
    if (reasonMissing) {
      setReasonDirty(true);
      return;
    }
    try {
      await onConfirm(
        selectedStatus as QuoteStatus,
        isRejecting ? rejectionReason.trim() : undefined,
      );
      onClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setSelectedStatus('');
      setRejectionReason('');
      setReasonDirty(false);
      onClose();
    }
  };

  if (!quote) return null;

  const currentStatusLabel = QUOTE_STATUS_CONFIG[quote.status]?.label || quote.status;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Cambiar Estado de Cotización</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Cotización: <strong>{quote.quoteNumber}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Estado actual: <strong>{currentStatusLabel}</strong>
          </Typography>
        </Box>

        <TextField
          select
          fullWidth
          label="Nuevo Estado"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as QuoteStatus)}
          disabled={isLoading}
          size="small"
        >
          {availableStatuses.map((option) => {
            const statusConfig = QUOTE_STATUS_CONFIG[option.value as QuoteStatus];
            const isGradient = statusConfig.color === 'gradient';
            
            return (
              <MenuItem key={option.value} value={option.value}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip 
                    label={option.label} 
                    size="small" 
                    color={isGradient ? undefined : (statusConfig.color as any)}
                    sx={{ 
                      mr: 1, 
                      height: 20,
                      ...(isGradient && {
                        background: 'linear-gradient(135deg, #7FAE1F 0%, #1B7FB0 100%)',
                        color: 'white',
                        border: 'none'
                      })
                    }}
                  />
                </Box>
              </MenuItem>
            );
          })}
          {availableStatuses.length === 0 && (
            <MenuItem disabled value="">
              No hay transiciones disponibles
            </MenuItem>
          )}
        </TextField>

        {isRejecting && (
          <TextField
            fullWidth
            multiline
            minRows={3}
            size="small"
            label="Motivo del rechazo"
            placeholder="Ej: El cliente eligió otro proveedor por precio"
            value={rejectionReason}
            onChange={(e) => {
              setReasonDirty(true);
              setRejectionReason(e.target.value.slice(0, 500));
            }}
            disabled={isLoading}
            error={reasonDirty && reasonMissing}
            helperText={
              reasonDirty && reasonMissing
                ? 'El motivo es obligatorio'
                : `${rejectionReason.length}/500`
            }
            sx={{ mt: 2 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!selectedStatus || reasonMissing || isLoading}
        >
          {isLoading ? 'Cambiando...' : 'Confirmar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
