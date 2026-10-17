import React, { useMemo, useState } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip } from '@mui/material';
import { GridRenderCellParams } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { useResponsiveColumns, type ResponsiveGridColDef } from '../../../hooks';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';
import type { Machine } from '../../../types/machine.types';
import { useMachines } from '../hooks/useMachines';
import { MachineFormDialog } from '../components/MachineFormDialog';

/**
 * Catálogo de máquinas de la planta. El operario elige una (opcional) al
 * iniciar una tarea con el temporizador de la OT.
 */
const MachinesListPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission(PERMISSIONS.CREATE_MACHINES);
  const canUpdate = hasPermission(PERMISSIONS.UPDATE_MACHINES);
  const { machinesQuery, updateMutation } = useMachines();
  const [editing, setEditing] = useState<Machine | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const rawColumns: ResponsiveGridColDef[] = useMemo(
    () => [
      { field: 'name', headerName: 'Nombre', flex: 1, minWidth: 200 },
      {
        field: 'productionArea',
        headerName: 'Área de producción',
        flex: 1,
        minWidth: 180,
        valueGetter: (_value: unknown, row: Machine) => row.productionArea?.name ?? '—',
      },
      { field: 'description', headerName: 'Descripción', flex: 2, minWidth: 240, responsive: 'md' },
      {
        field: 'isActive',
        headerName: 'Estado',
        width: 120,
        align: 'center',
        headerAlign: 'center',
        renderCell: (params: GridRenderCellParams<Machine>) => (
          <Chip
            label={params.value ? 'Activa' : 'Inactiva'}
            size="small"
            color={params.value ? 'success' : 'default'}
          />
        ),
      },
      {
        field: 'actions',
        headerName: 'Acciones',
        width: 120,
        sortable: false,
        filterable: false,
        renderCell: (params: GridRenderCellParams<Machine>) =>
          canUpdate ? (
            <Stack direction="row">
              <Tooltip title="Editar">
                <IconButton
                  size="small"
                  onClick={() => {
                    setEditing(params.row);
                    setFormOpen(true);
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={params.row.isActive ? 'Desactivar' : 'Activar'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({ id: params.row.id, dto: { isActive: !params.row.isActive } })
                    }
                  >
                    {params.row.isActive ? (
                      <ToggleOnIcon fontSize="small" color="success" />
                    ) : (
                      <ToggleOffIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          ) : null,
      },
    ],
    [canUpdate, updateMutation],
  );

  const columns = useResponsiveColumns(rawColumns);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Máquinas"
        subtitle="Máquinas de la planta. El operario puede elegir una al iniciar una tarea en la OT."
      />
      <DataTable
        density="compact"
        pageSize={20}
        pageSizeOptions={[20, 50, 100]}
        rows={machinesQuery.data ?? []}
        columns={columns}
        loading={machinesQuery.isLoading}
        onAdd={
          canCreate
            ? () => {
                setEditing(null);
                setFormOpen(true);
              }
            : undefined
        }
        addButtonText="Nueva máquina"
        searchPlaceholder="Buscar máquinas..."
      />
      <MachineFormDialog open={formOpen} machine={editing} onClose={() => setFormOpen(false)} />
    </Box>
  );
};

export default MachinesListPage;
