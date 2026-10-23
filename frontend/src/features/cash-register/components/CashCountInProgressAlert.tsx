import React from 'react';
import { Alert, AlertTitle } from '@mui/material';
import { useIsCashOpen } from '../hooks/useCashRegister';

/**
 * Aviso para quien registra abonos fuera del módulo de Caja: mientras Caja
 * hace el arqueo de cierre, el backend rechaza los abonos en efectivo. Avisarlo
 * antes evita que la comercial llene el formulario y se encuentre el error.
 *
 * El dato puede tener hasta 30 s de atraso (`useIsCashOpen`); el bloqueo real
 * está en el backend, esto solo es el aviso.
 */
const CashCountInProgressAlert: React.FC = () => {
  const { data } = useIsCashOpen();
  if (!data?.isCounting) return null;

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <AlertTitle>Caja está haciendo el arqueo de cierre</AlertTitle>
      Los abonos en efectivo no se pueden registrar hasta que termine. Las
      transferencias y los pagos con tarjeta sí.
    </Alert>
  );
};

export default CashCountInProgressAlert;
