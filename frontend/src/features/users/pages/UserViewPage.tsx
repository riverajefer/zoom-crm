import React, { useState } from 'react';
import { Box } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { UserDetail } from '../components/UserDetail';
import { UserSedesCard } from '../../sedes/components/UserSedesCard';
import { UserLocationSupportsCard } from '../../sedes/components/UserLocationSupportsCard';
import { useUsers } from '../hooks/useUsers';
import { ROUTES, PERMISSIONS } from '../../../utils/constants';
import { useAuthStore } from '../../../store/authStore';

/**
 * Página de detalle de usuario
 */
const UserViewPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, user: currentUser } = useAuthStore();
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  
  const { getUserQuery, deactivateUserMutation } = useUsers();
  const { data: user, isLoading, isError } = getUserQuery(id || '');

  // Desactivar es del admin y de soporte (el backend lo exige igual).
  const roleName = currentUser?.role?.name?.toLowerCase();
  const isAdmin = roleName === 'admin' || roleName === 'soporte';
  const canDeactivate = isAdmin && user?.isActive !== false;

  const handleDeactivate = async () => {
    if (!id) return;

    try {
      await deactivateUserMutation.mutateAsync(id);
      enqueueSnackbar('Usuario desactivado correctamente', { variant: 'success' });
      navigate(ROUTES.USERS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al desactivar usuario';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isError || !user) {
    return <Box>Usuario no encontrado</Box>;
  }

  return (
    <Box>
      <PageHeader
        title="Detalles del Usuario"
        breadcrumbs={[
          { label: 'Usuarios', path: ROUTES.USERS },
          { label: 'Detalles' },
        ]}
      />

      <UserDetail
        user={user}
        onBack={() => navigate(ROUTES.USERS)}
        onEdit={() => navigate(ROUTES.USERS_EDIT.replace(':id', user.id))}
        onDeactivate={() => setConfirmDeactivateOpen(true)}
        canEdit={hasPermission(PERMISSIONS.UPDATE_USERS)}
        canDeactivate={canDeactivate}
      />

      <UserSedesCard user={user} canManage={hasPermission(PERMISSIONS.MANAGE_USER_LOCATIONS)} />

      {hasPermission(PERMISSIONS.AUTHORIZE_LOCATION_SUPPORT) && <UserLocationSupportsCard userId={user.id} />}

      <ConfirmDialog
        open={confirmDeactivateOpen}
        title="Desactivar Usuario"
        message={`¿Estás seguro de que deseas desactivar al usuario ${user.email || user.username || user.id}?`}
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmDeactivateOpen(false)}
        isLoading={deactivateUserMutation.isPending}
        confirmText="Desactivar"
        severity="warning"
      />
    </Box>
  );
};

export default UserViewPage;
