import React from 'react';
import { Box, Chip, Tooltip } from '@mui/material';
import type { Payment } from '../../../types/order.types';
import {
  PAYMENT_ACCOUNTING_STATUS_COLORS,
  PAYMENT_ACCOUNTING_STATUS_LABELS,
} from '../../../types/payment-verification.types';

interface Props {
  payment: Payment;
  /** Caja todavía no aprueba el pago: contabilidad aún no lo tiene en su bandeja. */
  awaitingCashApproval?: boolean;
}

/**
 * Estado de la verificación contable de un pago en el Historial de Pagos.
 * Es informativo: un pago observado sigue contando en el saldo hasta que la
 * sede lo corrija (editar o anular).
 */
export const PaymentAccountingBadge: React.FC<Props> = ({ payment, awaitingCashApproval }) => {
  const status = payment.accountingStatus;
  if (!status || payment.isVoided || payment.paymentMethod === 'CREDIT_BALANCE') return null;
  if (status === 'PENDING' && awaitingCashApproval) return null;

  const tooltip =
    status === 'OBSERVED'
      ? `Contabilidad observó este pago: ${payment.accountingNotes ?? 'sin motivo'}`
      : status === 'VERIFIED'
        ? 'Contabilidad verificó este pago'
        : 'Contabilidad aún no revisa este pago';

  return (
    <Box>
      <Tooltip title={tooltip}>
        <Chip
          label={`Contabilidad: ${PAYMENT_ACCOUNTING_STATUS_LABELS[status]}`}
          color={PAYMENT_ACCOUNTING_STATUS_COLORS[status]}
          size="small"
          variant="outlined"
          sx={{ mt: 0.5, fontWeight: 500 }}
        />
      </Tooltip>
    </Box>
  );
};
