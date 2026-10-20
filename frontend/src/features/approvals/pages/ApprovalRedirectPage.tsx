import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { approvalRedirectApi } from '../../../api/approval-redirect.api';
import { PATHS } from '../../../router/paths';

const ROUTE_MAP: Record<string, (entityId: string) => string> = {
  ORDER_EDIT: (id) => `/orders/${id}`,
  STATUS_CHANGE: (id) => `/orders/${id}`,
  ADVANCE_PAYMENT: (id) => `/orders/${id}`,
  PAYMENT_EDIT: (id) => `/orders/${id}`,
  DISCOUNT_APPROVAL: (id) => `/orders/${id}`,
  CLIENT_OWNERSHIP_AUTH: (id) => `/orders/${id}`,
  REFUND_REQUEST: (id) => `/orders/${id}`,
  EXPENSE_ORDER_AUTH: (id) => `/expense-orders/${id}`,
  EXPENSE_ORDER_EDIT: (id) => `/expense-orders/${id}`,
  AP_AUTH: (id) => `/accounts-payable/${id}`,
  AP_PAYMENT_AUTH: (id) => `/accounts-payable/${id}`,
  CASH_MOVEMENT_VOID: (id) => `/cash-register/history/${id}`,
  ADVISOR_CHANGE: (id) => `/orders/${id}`,
  QUOTE_RESTORE: (id) => `/quotes/${id}`,
};

export const ApprovalRedirectPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('ID de solicitud no proporcionado');
      return;
    }

    approvalRedirectApi
      .resolve(id)
      .then(({ requestType, entityId }) => {
        const routeFn = ROUTE_MAP[requestType];
        if (!routeFn) {
          setError(`Tipo de solicitud no soportado: ${requestType}`);
          return;
        }
        navigate(routeFn(entityId), { replace: true });
      })
      .catch(() => {
        setError('No se pudo resolver la solicitud. Es posible que haya expirado o no exista.');
      });
  }, [id, navigate]);

  if (error) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        gap={2}
        p={3}
      >
        <Typography variant="h6" color="error" textAlign="center">
          {error}
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate(PATHS.DASHBOARD, { replace: true })}
        >
          Ir al Dashboard
        </Button>
      </Box>
    );
  }

  return <LoadingSpinner fullScreen message="Redirigiendo..." />;
};

export default ApprovalRedirectPage;
