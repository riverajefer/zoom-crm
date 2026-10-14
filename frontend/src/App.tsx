import type { FC } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { lightTheme, darkTheme } from './theme';
import { useUIStore } from './store/uiStore';
import { useMaintenanceMode } from './hooks/useMaintenanceMode';
import RoutesConfig from './router';
import { queryClient } from './api/queryClient';
import MaintenancePage from './pages/MaintenancePage';


/**
 * Componente principal de la aplicación
 */
const AppContent: FC = () => {
  const theme = useUIStore((state) => state.theme);
  const currentTheme = theme === 'light' ? lightTheme : darkTheme;
  const { isMaintenanceMode, maintenanceMessage } = useMaintenanceMode();

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
        <SnackbarProvider maxSnack={3}>
          {isMaintenanceMode ? (
            <MaintenancePage message={maintenanceMessage} />
          ) : (
            // Boundary de rutas: cubre las pantallas que no pasan por
            // MainLayout (login, registro) y los fallos del propio router,
            // incluidos los chunks que no cargan tras un deploy nuevo.
            <ErrorBoundary fullScreen>
              <RoutesConfig />
            </ErrorBoundary>
          )}
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
};

const App: FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/*
          Red de último recurso: si falla algo por encima del router (tema,
          providers, modo mantenimiento) el usuario ve un mensaje en lugar de
          una pantalla en blanco. Renderiza con el tema por defecto de MUI
          porque el ThemeProvider vive más adentro.
        */}
        <ErrorBoundary fullScreen>
          <AppContent />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
