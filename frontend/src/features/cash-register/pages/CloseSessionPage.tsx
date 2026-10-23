import React, { useState } from 'react';
import { isAxiosError } from 'axios';
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
  AlertTitle,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
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
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

/**
 * `intro`: aún no empieza el arqueo. Iniciarlo es lo que frena el efectivo en
 * el resto del sistema; sin ese paso, un abono registrado mientras se cuenta
 * cae en esta sesión sin estar en el conteo (cierre del 2026-10-23).
 */
type Phase = 'intro' | 'counting' | 'reviewing';

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

const CloseSessionPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionQuery = useCashSession(id);
  const { closeSession, startCount, cancelCount } = useCashMutations();

  // `null` hasta que el usuario avanza: la fase inicial sale de la sesión, para
  // que volver a la página con el arqueo ya iniciado retome el conteo.
  const [phase, setPhase] = useState<Phase | null>(null);
  const [denominationRows, setDenominationRows] = useState(buildInitialRows());
  const [preview, setPreview] = useState<BalancePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const session = sessionQuery.data;

  const handleStartCount = useSingleFlight(async () => {
    await startCount.mutateAsync(id);
    setPhase('counting');
  });

  const handleCancelCount = useSingleFlight(async () => {
    await cancelCount.mutateAsync(id);
    navigate(PATHS.CASH_SESSION_ACTIVE.replace(':id', id));
  }, { keepLockedOnSuccess: true });

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
  const lateMovements = preview?.lateMovements ?? [];

  const handleConfirmClose = useSingleFlight(async () => {
    const denominations = toDenominationDtoList(denominationRows);
    try {
      await closeSession.mutateAsync({
        id,
        dto: {
          denominations,
          // Solo se confirma lo que Caja tiene a la vista en la conciliación.
          acknowledgeLateMovements: lateMovements.length > 0,
        },
      });
    } catch (error) {
      // Algo entró después de la conciliación que se estaba viendo: se recarga
      // para que aparezca en la lista antes de decidir.
      if (isAxiosError(error) && error.response?.status === 409) {
        await handleProceedToReview();
      }
      throw error;
    }
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

  const currentPhase: Phase = phase ?? (session.countStartedAt ? 'counting' : 'intro');

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, maxWidth: 700, mx: 'auto' }}>
      <PageHeader
        title="Cerrar Sesión de Caja"
        subtitle={session.cashRegister.name}
      />

      <Stack spacing={3}>
        {currentPhase === 'intro' && (
          <>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Antes de contar
                </Typography>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  Al iniciar el arqueo la caja deja de recibir y entregar{' '}
                  <strong>efectivo</strong> hasta que cierres o canceles:
                </Typography>
                <Typography component="ul" variant="body2" sx={{ pl: 2.5, mb: 1.5 }}>
                  <li>Las comerciales no podrán registrar abonos en efectivo.</li>
                  <li>
                    No se podrán pagar OG, cuentas por pagar ni devoluciones en
                    efectivo, ni registrar movimientos manuales en efectivo.
                  </li>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Las transferencias y los pagos con tarjeta siguen funcionando
                  porque no cambian lo que hay en el cajón.
                </Typography>
              </CardContent>
            </Card>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(PATHS.CASH_SESSION_ACTIVE.replace(':id', id))}
                disabled={startCount.isPending}
              >
                Volver
              </Button>
              <LoadingButton
                loading={startCount.isPending}
                variant="contained"
                color="primary"
                startIcon={<PlayArrowIcon />}
                onClick={handleStartCount}
              >
                Iniciar arqueo
              </LoadingButton>
            </Box>
          </>
        )}

        {/* Phase A: Blind count */}
        {currentPhase === 'counting' && (
          <>
            {session.countStartedAt && (
              <Alert severity="info">
                Arqueo en curso desde las {formatTime(session.countStartedAt)}: la
                caja no recibe ni entrega efectivo hasta que cierres o canceles.
              </Alert>
            )}

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
              <LoadingButton
                loading={cancelCount.isPending}
                variant="outlined"
                color="inherit"
                startIcon={<CloseIcon />}
                onClick={handleCancelCount}
                disabled={loadingPreview}
              >
                Cancelar arqueo
              </LoadingButton>
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
        {currentPhase === 'reviewing' && preview && (
          <>
            {lateMovements.length > 0 && (
              <Alert severity="warning">
                <AlertTitle>
                  {lateMovements.length === 1
                    ? 'Un movimiento no está en tu conteo'
                    : `${lateMovements.length} movimientos no están en tu conteo`}
                </AlertTitle>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Entraron o cambiaron después de que empezaste a contar, así que
                  el saldo del sistema ya los incluye y tu conteo no. Rehaz el
                  conteo si el dinero ya está en el cajón, o cierra igual sabiendo
                  que la diferencia viene de aquí.
                </Typography>
                <Stack spacing={0.5}>
                  {lateMovements.map((m) => (
                    <Box
                      key={m.id}
                      sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
                    >
                      <Typography variant="body2">
                        {m.receiptNumber} · {m.description}
                        {m.isVoided ? ' (anulado)' : ''}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' '}· {formatDateTime(m.updatedAt)}
                          {m.performedBy
                            ? ` · ${[m.performedBy.firstName, m.performedBy.lastName].filter(Boolean).join(' ')}`
                            : ''}
                        </Typography>
                      </Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
                        {formatCurrency(m.amount)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Alert>
            )}

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
