import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import {
  PAYMENT_ACCOUNTING_STATUS_COLORS,
  PAYMENT_ACCOUNTING_STATUS_LABELS,
  type PaymentVerification,
} from '../../../types/payment-verification.types';
import { usePaymentVerificationHistory } from '../hooks/usePaymentVerifications';
import { formatDateTime, fullName } from '../utils';

interface Props {
  payment: PaymentVerification | null;
  onClose: () => void;
}

/** Bitácora de la verificación: cada observación, verificación y reapertura. */
export const PaymentReviewHistoryDialog: React.FC<Props> = ({ payment, onClose }) => {
  const historyQuery = usePaymentVerificationHistory(payment?.id ?? null);
  const history = historyQuery.data ?? [];

  return (
    <Dialog open={!!payment} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Historial de verificación{payment ? ` · ${payment.order.orderNumber}` : ''}</DialogTitle>
      <DialogContent>
        {historyQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : history.length === 0 ? (
          <Typography color="text.secondary">Contabilidad todavía no ha revisado este pago.</Typography>
        ) : (
          <Stack spacing={2}>
            {history.map((entry) => (
              <Box key={entry.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={PAYMENT_ACCOUNTING_STATUS_LABELS[entry.status]}
                    color={PAYMENT_ACCOUNTING_STATUS_COLORS[entry.status]}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {fullName(entry.reviewedBy)} · {formatDateTime(entry.createdAt)}
                  </Typography>
                </Box>
                {entry.notes && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {entry.notes}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};
