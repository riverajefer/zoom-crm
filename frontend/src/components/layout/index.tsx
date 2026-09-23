import type { FC, ReactNode } from 'react';
import { Box, Container } from '@mui/material';
import { EnvironmentBanner } from './EnvironmentBanner';

export { MainLayout } from './MainLayout';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Layout para páginas de autenticación
 */
export const AuthLayout: FC<AuthLayoutProps> = ({ children }) => {
  return (
    <>
      <EnvironmentBanner />
      <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: `#0E0F0E`,
      }}
    >
      <Container maxWidth="sm">
        {children}
      </Container>
    </Box>
    </>
  );
};
