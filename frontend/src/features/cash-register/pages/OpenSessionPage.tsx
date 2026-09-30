import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PersonIcon from '@mui/icons-material/Person';
import { PageHeader } from '../../../components/common/PageHeader';
import { useCashRegisters, useCashMutations } from '../hooks/useCashRegister';
import DenominationForm, {
  buildInitialRows,
  toDenominationDtoList,
} from '../components/DenominationForm';
import PendingCashEntriesPanel from '../components/PendingCashEntriesPanel';
import { PATHS } from '../../../router/paths';
import { useAuthStore } from '../../../store/authStore';
import { authApi } from '../../../api/auth.api';
import { cashRegisterApi } from '../../../api/cash-register.api';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { LoadingButton } from '../../../components/common/LoadingButton';

const OpenSessionPage: React.FC = () => {
  const navigate = useNavigate();
  const registersQuery = useCashRegisters();
  const { openSession } = useCashMutations();
  const user = useAuthStore((s) => s.user);

  const [cashRegisterId, setCashRegisterId] = useState('');
  const [denominationRows, setDenominationRows] = useState(buildInitialRows());
  const [notes] = useState('');
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [previousInfo, setPreviousInfo] = useState<string | null>(null);

  // Password verification state
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const activeRegisters = (registersQuery.data || []).filter((r) => r.isActive);

  const handleRegisterChange = async (registerId: string) => {
    setCashRegisterId(registerId);
    if (!registerId) return;

    setLoadingPrevious(true);
    setPreviousInfo(null);
    try {
      const result = await cashRegisterApi.getLastClosingDenominations(registerId);
      if (result.denominations.length > 0) {
        const rows = buildInitialRows().map((row) => {
          const match = result.denominations.find(
            (d) => d.denomination === row.denomination,
          );
          return match ? { ...row, quantity: match.quantity } : row;
        });
        setDenominationRows(rows);
        const date = result.closedAt
          ? new Date(result.closedAt).toLocaleString('es-CO', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '';
        setPreviousInfo(
          `Fondo precargado del cierre anterior${date ? ` (${date})` : ''}`,
        );
      } else {
        setDenominationRows(buildInitialRows());
      }
    } catch {
      setDenominationRows(buildInitialRows());
    } finally {
      setLoadingPrevious(false);
    }
  };

  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      setPasswordError('Ingresa tu contraseña');
      return;
    }
    setPasswordError('');
    setVerifyingPassword(true);
    try {
      const res = await authApi.verifyPassword(password);
      if (res.valid) {
        setPasswordVerified(true);
      } else {
        setPasswordError('Contraseña incorrecta');
      }
    } catch {
      setPasswordError('Contraseña incorrecta');
    } finally {
      setVerifyingPassword(false);
    }
  };

  // Dos clics en el mismo frame abrirían dos sesiones sobre la misma caja: el
  // botón no se deshabilita hasta el siguiente render. En la base lo impide
  // `cash_sessions_one_open_per_register`, pero el candado evita el viaje y el
  // error crudo.
  const handleSubmit = useSingleFlight(async () => {
    if (!cashRegisterId) return;

    const denominations = toDenominationDtoList(denominationRows);

    const session = await openSession.mutateAsync({
      cashRegisterId,
      denominations,
      notes: notes || undefined,
    });

    if (session) {
      navigate(
        PATHS.CASH_SESSION_ACTIVE.replace(':id', session.id),
      );
    }
  });

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, maxWidth: 700, mx: 'auto' }}>
      <PageHeader
        title="Abrir Sesión de Caja"
        subtitle="Selecciona la caja e ingresa el fondo de apertura"
      />

      <Stack spacing={3}>
        {/* Arrastre: abonos cobrados sin caja abierta que van a entrar solos
            al abrir. Va arriba de todo para que se vea antes de contar el
            fondo, no después de abrir. */}
        <PendingCashEntriesPanel />

        {/* Password verification step */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Verificación de Cajero
            </Typography>

            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Cajero
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {user ? `${user.firstName} ${user.lastName}` : '—'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary">
                  Fecha y Hora
                </Typography>
                <Typography variant="body1">
                  {new Date().toLocaleString('es-CO', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </Typography>
              </Box>

              {passwordVerified ? (
                <Alert severity="success">Identidad verificada</Alert>
              ) : (
                <>
                  <TextField
                    label="Contraseña"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleVerifyPassword();
                    }}
                    error={!!passwordError}
                    helperText={passwordError || 'Confirma tu contraseña para continuar'}
                    fullWidth
                    autoFocus
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword((v) => !v)}
                            edge="end"
                            size="small"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <LoadingButton
                    loading={verifyingPassword}
                    variant="contained"
                    onClick={handleVerifyPassword}
                    disabled={!password.trim()}
                    startIcon={<PersonIcon />}
                  >
                    Verificar Identidad
                  </LoadingButton>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Register selector */}
        {passwordVerified && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              2. Seleccionar Caja
            </Typography>

            {registersQuery.isLoading ? (
              <CircularProgress size={24} />
            ) : activeRegisters.length === 0 ? (
              <Alert severity="warning">
                No hay cajas registradoras activas. Pide a un administrador que cree una.
              </Alert>
            ) : (
              <FormControl fullWidth>
                <InputLabel>Caja Registradora</InputLabel>
                <Select
                  value={cashRegisterId}
                  onChange={(e) => handleRegisterChange(e.target.value)}
                  label="Caja Registradora"
                >
                  {activeRegisters.map((reg) => (
                    <MenuItem
                      key={reg.id}
                      value={reg.id}
                      disabled={(reg._count?.sessions ?? 0) > 0}
                    >
                      {reg.name}
                      {(reg._count?.sessions ?? 0) > 0 && (
                        <Typography
                          variant="caption"
                          color="warning.main"
                          sx={{ ml: 1 }}
                        >
                          (sesión abierta)
                        </Typography>
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </CardContent>
        </Card>
        )}

        {/* Denomination form */}
        {passwordVerified && cashRegisterId && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                3. Conteo de Fondo de Apertura
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Ingresa la cantidad de cada denominación en el fondo inicial de caja.
              </Typography>

              {loadingPrevious && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    Cargando fondo de sesión anterior…
                  </Typography>
                </Box>
              )}

              {previousInfo && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {previousInfo}. Puedes ajustar las cantidades si es necesario.
                </Alert>
              )}

              <DenominationForm
                value={denominationRows}
                onChange={setDenominationRows}
              />
            </CardContent>
          </Card>
        )}

        {/* Submit button */}
        {passwordVerified && cashRegisterId && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate(-1)}
              disabled={openSession.isPending}
            >
              Cancelar
            </Button>
            <LoadingButton
              loading={openSession.isPending}
              variant="contained"
              color="success"
              size="large"
              startIcon={<LockOpenIcon />}
              onClick={handleSubmit}
            >
              Abrir Sesión
            </LoadingButton>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default OpenSessionPage;
