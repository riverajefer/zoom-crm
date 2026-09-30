import { useState, useEffect, Suspense, type FC, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { EnvironmentBanner } from './EnvironmentBanner';
import { AttendanceReminderBanner } from './AttendanceReminderBanner';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { useHeartbeat } from '../../hooks/useHeartbeat';
import { useLocationSupportSync } from '../../features/sedes/hooks/useLocationSupportSync';
import { LocationSupportBanner } from '../../features/sedes/components/LocationSupportBanner';
import { GlobalSearchModal } from '../GlobalSearch';
import { useUIStore } from '../../store/uiStore';

interface MainLayoutProps {
  children: ReactNode;
}

/**
 * Layout principal con sidebar y topbar
 */
export const MainLayout: FC<MainLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));

  const { toggleGlobalSearch } = useUIStore();

  // Enviar heartbeats de actividad cada 5 minutos mientras el layout está montado
  useHeartbeat();
  // Solo Zoom: la sede cambia sola al aprobarse o terminar un apoyo (docs/PLAN_SEDES.md §16)
  useLocationSupportSync();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleGlobalSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleGlobalSearch]);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    } else if (isTablet) {
      // Auto-collapse sidebar en tablets para dar más espacio al contenido
      setSidebarCollapsed(true);
    }
  }, [isMobile, isTablet]);

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleCloseSidebar = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleToggleCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {isMobile && sidebarOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1,
          }}
          onClick={handleCloseSidebar}
        />
      )}

      <Sidebar 
        open={sidebarOpen} 
        onClose={handleCloseSidebar}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <EnvironmentBanner />
        <Topbar onMenuClick={handleMenuClick} />
        <LocationSupportBanner />
        <AttendanceReminderBanner />
        <UpdateAvailableBanner />

        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            p: { xs: 2, sm: 2.5, md: 3 },
            backgroundColor: (theme) => theme.palette.background.default,
          }}
        >
          {/*
            El boundary se resetea al cambiar de ruta: un error en una pantalla
            no debe dejar bloqueado el resto del sistema. El sidebar y el topbar
            quedan fuera para que la navegación siga disponible.
          */}
          <ErrorBoundary resetKey={location.pathname}>
            {/*
              Cada página se carga con `lazy`, así que al navegar el árbol
              suspende. Sin este boundary la espera sube hasta el <Suspense>
              que envuelve todo el router: React oculta el layout completo
              (sidebar y topbar con `display: none`) y descarta ese commit,
              con lo que los efectos pendientes del topbar —por ejemplo el
              cierre del menú de usuario— nunca llegan a ejecutarse y el
              popover queda colgado sobre la pantalla. Suspendiendo aquí solo
              se reemplaza el contenido y el layout sigue vivo.
            */}
            <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
          </ErrorBoundary>
        </Box>

      </Box>

      <GlobalSearchModal />
    </Box>
  );
};
