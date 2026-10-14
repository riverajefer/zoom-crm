import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
  Alert,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PageHeader } from '../../../components/common/PageHeader';
import { useCashSession, useCashMutations } from '../hooks/useCashRegister';
import { cashRegisterApi } from '../../../api/cash-register.api';
import DenominationForm, {
  buildInitialRows,
  toDenominationDtoList,
} from '../components/DenominationForm';
import ConciliationSummary from '../components/ConciliationSummary';
import { PATHS } from '../../../router/paths';
import type { BalancePreview } from '../../../types/cash-register.types';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { getErrorMessage } from '../../../utils/helpers';

type Phase = 'counting' | 'reviewing';

const CloseSessionPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionQuery = useCashSession(id);
  const { closeSession } = useCashMutations();

  const [phase, setPhase] = useState<Phase>('counting');
  const [denominationRows, setDenominationRows] = useState(buildInitialRows());
  const [preview, setPreview] = useState<BalancePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const session = sessionQuery.data;

  const handleProceedToReview = async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const data = await cashRegisterApi.getBalancePreview(id);
      setPreview(data);
      setPhase('reviewing');
    } catch (error) {
      setPreviewError(`Error al obtener el balance del sistema: ${getErrorMessage(error)}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  // El cierre ciego es irreversible: dos clics en el mismo frame mandarían dos
  // cierres del mismo arqueo.
  const handleConfirmClose = useSingleFlight(async () => {
    const denominations = toDenominationDtoList(denominationRows);
    await closeSession.mutateAsync({ id, dto: { denominations } });
    navigate(PATHS.CASH_SESSION_HISTORY_DETAIL.replace(':id', id));
  }, { keepLockedOnSuccess: true });

  if (sessionQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!session) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Sesión no encontrada.</Alert>
      </Box>
    );
  }

  if (session.status === 'CLOSED') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Esta sesión ya está cerrada.</Alert>
        <Button
          sx={{ mt: 2 }}
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(PATHS.CASH_SESSION_HISTORY_DETAIL.replace(':id', id))}
        >
          Ver Detalle
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, maxWidth: 700, mx: 'auto' }}>
      <PageHeader
        title="Cerrar Sesión de Caja"
        subtitle={session.cashRegister.name}
      />

      <Stack spacing={3}>
        {/* Phase A: Blind count */}
        {phase === 'counting' && (
          <>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Conteo de Caja
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Ingresa el conteo físico de tu caja <strong>sin ver el saldo del sistema</strong>.
                  El resultado se revelará al continuar.
                </Typography>

                <DenominationForm
                  value={denominationRows}
                  onChange={setDenominationRows}
                />
              </CardContent>
            </Card>

            {previewError && (
              <Alert severity="error">{previewError}</Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(PATHS.CASH_SESSION_ACTIVE.replace(':id', id))}
                disabled={loadingPreview}
              >
                Volver
              </Button>
              <LoadingButton
                loading={loadingPreview}
                variant="contained"
                color="primary"
                startIcon={<VisibilityIcon />}
                onClick={handleProceedToReview}
              >
                Ver Conciliación
              </LoadingButton>
            </Box>
          </>
        )}

        {/* Phase B: Review conciliation */}
        {phase === 'reviewing' && preview && (
          <>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Conciliación de Cierre
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Compara el conteo físico con el saldo del sistema y confirma el cierre.
                </Typography>

                <ConciliationSummary
                  denominations={toDenominationDtoList(denominationRows)}
                  preview={preview}
                />
              </CardContent>
            </Card>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => setPhase('counting')}
                disabled={closeSession.isPending}
              >
                Rehacer Conteo
              </Button>
              <LoadingButton
                loading={closeSession.isPending}
                variant="contained"
                color="warning"
                startIcon={<LockIcon />}
                onClick={handleConfirmClose}
              >
                Confirmar Cierre
              </LoadingButton>
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
};

export default CloseSessionPage;
