import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  MenuItem,
  TextField,
  CircularProgress,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import type { Order, OrderStatus } from '../../../types/order.types';
import {
  ORDER_STATUS_CONFIG,
  ALLOWED_TRANSITIONS,
  BACKWARD_TRANSITIONS,
  isBackwardTransition,
} from '../../../types/order.types';
import { useAuthStore } from '../../../store/authStore';
import {
  COMPLETED_WORK_ORDER_NOTICE,
  revertLeavesCompletedWorkOrder,
} from '../utils/statusRevert';
import { StatusChangeAuthRequestDialog } from './StatusChangeAuthRequestDialog';

interface ChangeStatusDialogProps {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  /** `reason` solo llega cuando un admin devuelve la orden a un estado previo. */
  onConfirm: (newStatus: OrderStatus, reason?: string) => Promise<void>;
  isLoading?: boolean;
}

export const ChangeStatusDialog: React.FC<ChangeStatusDialogProps> = ({
  open,
  order,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [showAuthRequestDialog, setShowAuthRequestDialog] = useState(false);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState('');
  const isAdmin = useAuthStore((state) => state.user?.role?.name === 'admin');

  // Calcular opciones de estado válidas según el estado actual. El estado
  // previo va al final: es un retroceso, no el paso siguiente.
  const availableStatuses = useMemo(() => {
    if (!order) return [];
    const nextStatuses = ALLOWED_TRANSITIONS[order.status] || [];
    const options = nextStatuses.map((status) => ({
      value: status,
      label: ORDER_STATUS_CONFIG[status]?.label || status,
    }));
    const previous = BACKWARD_TRANSITIONS[order.status];
    if (previous) {
      options.push({
        value: previous,
        label: `Devolver a ${ORDER_STATUS_CONFIG[previous]?.label || previous}`,
      });
    }
    return options;
  }, [order]);

  const isRevert =
    !!order && !!selectedStatus && isBackwardTransition(order.status, selectedStatus);
  // El admin retrocede directo, pero dejando el motivo. Quien necesita
  // autorización lo escribe en la solicitud.
  const asksRevertReason = isRevert && isAdmin;

  React.useEffect(() => {
    if (order && open) {
      // Auto-seleccionar si solo hay una opción válida
      const nextStatuses = ALLOWED_TRANSITIONS[order.status] || [];
      setSelectedStatus(nextStatuses.length === 1 ? nextStatuses[0] : '');
      setAuthorizationError(null);
      setRevertReason('');
    }
  }, [order, open]);

  // Validar si el cambio de estado es permitido
  const statusValidation = useMemo(() => {
    if (!order || !selectedStatus) {
      return { allowed: true, reason: null };
    }

    const balance = parseFloat(order.balance);

    // Validación de saldo para PAID
    if (selectedStatus === 'PAID') {
      if (balance > 0) {
        return {
          allowed: false,
          reason: `No se puede cambiar al estado PAGADA con saldo pendiente ($${order.balance}). Use el estado "Entregado a Crédito" o complete los pagos primero.`,
        };
      }
    }

    return { allowed: true, reason: null };
  }, [order, selectedStatus]);

  const handleConfirm = async () => {
    if (!selectedStatus) {
      onClose();
      return;
    }

    try {
      await onConfirm(
        selectedStatus,
        asksRevertReason ? revertReason.trim() : undefined,
      );
      setAuthorizationError(null);
      onClose();
    } catch (error: any) {
      // Si el error es 403 (Forbidden), significa que requiere autorización
      if (error.response?.status === 403) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes('autorización')) {
          setAuthorizationError(errorMessage);
          setShowAuthRequestDialog(true);
        } else {
          setAuthorizationError(errorMessage);
        }
      } else {
        // Otros errores se propagan normalmente
        throw error;
      }
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setSelectedStatus('');
      setAuthorizationError(null);
      setRevertReason('');
      onClose();
    }
  };

  const handleAuthRequestClose = () => {
    setShowAuthRequestDialog(false);
    handleClose();
  };

  if (!order) return null;

  const currentStatusLabel =
    ORDER_STATUS_CONFIG[order.status]?.label || order.status;

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>Cambiar Estado de Orden</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Orden: <strong>{order.orderNumber}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Estado actual: <strong>{currentStatusLabel}</strong>
            </Typography>
            {parseFloat(order.balance) > 0 && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                Saldo pendiente: <strong>${order.balance}</strong>
              </Typography>
            )}
          </Box>

          {/* Bloqueo por anticipo pendiente o rechazado */}
          {order.advancePaymentStatus === 'PENDING' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              El anticipo de esta orden está pendiente de aprobación por Caja. No se puede cambiar el estado hasta que sea aprobado.
            </Alert>
          )}
          {order.advancePaymentStatus === 'REJECTED' && (
            <Alert severity="error" sx={{ mb: 2 }}>
              El anticipo de esta orden fue rechazado por Caja y el pago se
              eliminó, así que la orden quedó sin abono válido. Para
              desbloquearla, edita la orden y vuelve a registrar el «Abono
              Inicial» con el soporte correcto: Caja lo revisará de nuevo.
            </Alert>
          )}

          {authorizationError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {authorizationError}
            </Alert>
          )}

          {availableStatuses.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Este estado no tiene transiciones disponibles.
            </Alert>
          ) : (
            <TextField
              select
              fullWidth
              label="Nuevo Estado"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
              disabled={isLoading}
              required
              sx={{ mt: 2 }}
            >
              {availableStatuses.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          {isRevert && !isAdmin && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Devolver la orden a un estado previo requiere autorización de un
              administrador. Si aún no la tienes, se abrirá la solicitud.
            </Alert>
          )}

          {isRevert && order && revertLeavesCompletedWorkOrder(order, selectedStatus as OrderStatus) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {COMPLETED_WORK_ORDER_NOTICE}
            </Alert>
          )}

          {asksRevertReason && (
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Motivo *"
              value={revertReason}
              onChange={(e) => setRevertReason(e.target.value)}
              placeholder="Explica por qué la orden vuelve a un estado previo..."
              disabled={isLoading}
              inputProps={{ maxLength: 500 }}
              sx={{ mt: 2 }}
            />
          )}

          {!statusValidation.allowed && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {statusValidation.reason}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            disabled={
              isLoading ||
              !selectedStatus ||
              availableStatuses.length === 0 ||
              !statusValidation.allowed ||
              (asksRevertReason && !revertReason.trim()) ||
              order.advancePaymentStatus === 'PENDING' ||
              order.advancePaymentStatus === 'REJECTED'
            }
          >
            {isLoading ? <CircularProgress size={24} /> : 'Cambiar Estado'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog para solicitar autorización */}
      {showAuthRequestDialog && selectedStatus && (
        <StatusChangeAuthRequestDialog
          open={showAuthRequestDialog}
          onClose={handleAuthRequestClose}
          order={order}
          requestedStatus={selectedStatus}
        />
      )}
    </>
  );
};
