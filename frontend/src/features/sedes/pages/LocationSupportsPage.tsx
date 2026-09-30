import React, { useState } from 'react';
import { Badge, Box, Button, Card, Tab, Tabs } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useAuthStore } from '../../../store/authStore';
import { useLocationStore } from '../../../store/locationStore';
import { PERMISSIONS } from '../../../utils/constants';
import type { LocationSupport, LocationSupportView } from '../../../types';
import {
  useLocationSupportMutations,
  useLocationSupportsList,
  useMyLocationSupports,
} from '../hooks/useLocationSupports';
import { LocationSupportAction, LocationSupportsTable } from '../components/LocationSupportsTable';
import { LocationSupportNoteDialog } from '../components/LocationSupportNoteDialog';
import { ScheduleLocationSupportDialog } from '../components/ScheduleLocationSupportDialog';
import { LocationSupportRequestDialog } from '../components/LocationSupportRequestDialog';
import { apiErrorMessage, bogotaToday, personName, supportDay } from '../utils/locationSupport';

type TabKey = LocationSupportView | 'mine';

const EMPTY: Record<TabKey, string> = {
  pending: 'No hay solicitudes pendientes.',
  active: 'Nadie está de apoyo en otra sede hoy.',
  scheduled: 'No hay apoyos programados.',
  history: 'Todavía no hay historial.',
  all: 'Sin apoyos.',
  mine: 'No has pedido apoyos en otra sede.',
};

type Pending = { kind: 'approve' | 'reject' | 'end'; support: LocationSupport } | null;

/**
 * Apoyos en otra sede (docs/PLAN_SEDES.md §16). Gerencia (`authorize_location_support`)
 * ve las pendientes, las vigentes, las programadas y el historial, y programa
 * apoyos. Los demás ven sus propias solicitudes y piden desde aquí o desde el
 * selector de sede.
 */
const LocationSupportsPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const isGerencia = useAuthStore((s) => s.hasPermission(PERMISSIONS.AUTHORIZE_LOCATION_SUPPORT));
  const canRequest = !useLocationStore((s) => s.canViewAll);
  const [tab, setTab] = useState<TabKey>(isGerencia ? 'pending' : 'mine');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const pendingQuery = useLocationSupportsList('pending', { enabled: isGerencia });
  const listQuery = useLocationSupportsList(tab === 'mine' ? 'pending' : tab, {
    enabled: isGerencia && tab !== 'mine' && tab !== 'pending',
  });
  const mineQuery = useMyLocationSupports({ enabled: tab === 'mine' });
  const mutations = useLocationSupportMutations();

  const query = tab === 'mine' ? mineQuery : tab === 'pending' ? pendingQuery : listQuery;
  const rows = query.data ?? [];

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    try {
      await action();
      enqueueSnackbar(success, { variant: 'success' });
      setPending(null);
    } catch (error) {
      enqueueSnackbar(apiErrorMessage(error, failure), { variant: 'error' });
    }
  };

  const gerenciaActions = (s: LocationSupport): LocationSupportAction[] => {
    if (s.status === 'PENDING') {
      return [
        { label: 'Rechazar', color: 'error', onClick: () => setPending({ kind: 'reject', support: s }) },
        { label: 'Aprobar', variant: 'contained', onClick: () => setPending({ kind: 'approve', support: s }) },
      ];
    }
    const vigenteOProgramado =
      s.kind === 'SUPPORT' && s.status === 'APPROVED' && !s.endedAt && (s.overdue || supportDay(s.endDate) >= bogotaToday());
    if (vigenteOProgramado && tab !== 'history') {
      const scheduled = supportDay(s.startDate) > bogotaToday();
      return [{ label: scheduled ? 'Cancelar' : 'Terminar', color: 'error', onClick: () => setPending({ kind: 'end', support: s }) }];
    }
    return [];
  };

  const mineActions = (s: LocationSupport): LocationSupportAction[] =>
    s.status === 'PENDING'
      ? [
          {
            label: 'Cancelar',
            color: 'error',
            onClick: () => run(() => mutations.cancel.mutateAsync(s.id), 'Solicitud cancelada', 'No se pudo cancelar'),
          },
        ]
      : [];

  const target = pending?.support;
  const who = target ? personName(target.user) : '';
  const scheduledEnd = target && supportDay(target.startDate) > bogotaToday();

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Apoyos entre sedes"
        subtitle={
          isGerencia
            ? 'Empleados que trabajan unos días en otra sede, con tu autorización.'
            : 'Tus solicitudes para trabajar en otra sede.'
        }
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {canRequest && (
              <Button variant="outlined" startIcon={<AddLocationAltOutlinedIcon />} onClick={() => setRequestOpen(true)}>
                Pedir apoyo o cambio
              </Button>
            )}
            {isGerencia && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setScheduleOpen(true)}>
                Programar apoyo
              </Button>
            )}
          </Box>
        }
      />

      <Card>
        {isGerencia && (
          <Tabs
            value={tab}
            onChange={(_, value: TabKey) => setTab(value)}
            variant="scrollable"
            sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
          >
            <Tab
              value="pending"
              label={
                <Badge color="warning" badgeContent={pendingQuery.data?.length ?? 0} sx={{ pr: 1.5 }}>
                  Pendientes
                </Badge>
              }
            />
            <Tab value="active" label="Vigentes" />
            <Tab value="scheduled" label="Programados" />
            <Tab value="history" label="Historial" />
            {canRequest && <Tab value="mine" label="Mías" />}
          </Tabs>
        )}

        {query.isLoading ? (
          <LoadingSpinner />
        ) : (
          <LocationSupportsTable
            rows={rows}
            showEmployee={tab !== 'mine'}
            actions={tab === 'mine' ? mineActions : gerenciaActions}
            emptyText={EMPTY[tab]}
          />
        )}
      </Card>

      <ScheduleLocationSupportDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <LocationSupportRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />

      <LocationSupportNoteDialog
        open={pending?.kind === 'approve'}
        title="Aprobar"
        description={
          target?.kind === 'RETURN'
            ? `${who} vuelve a ${target.location.name} en cuanto apruebes.`
            : `${who} va a trabajar en ${target?.location.name}. Mientras dure, no puede cambiar de sede sin tu autorización.`
        }
        label="Nota (opcional)"
        confirmText="Aprobar"
        loading={mutations.approve.isPending}
        onClose={() => setPending(null)}
        onConfirm={(notes) =>
          target &&
          run(
            () => mutations.approve.mutateAsync({ id: target.id, notes: notes || undefined }),
            'Aprobada: el empleado cambia de sede ahora',
            'No se pudo aprobar',
          )
        }
      />
      <LocationSupportNoteDialog
        open={pending?.kind === 'reject'}
        title="Rechazar"
        description={`${who} verá tu nota en la notificación.`}
        label="Nota (opcional)"
        confirmText="Rechazar"
        confirmColor="error"
        loading={mutations.reject.isPending}
        onClose={() => setPending(null)}
        onConfirm={(notes) =>
          target &&
          run(
            () => mutations.reject.mutateAsync({ id: target.id, notes: notes || undefined }),
            'Solicitud rechazada',
            'No se pudo rechazar',
          )
        }
      />
      <LocationSupportNoteDialog
        open={pending?.kind === 'end'}
        title={scheduledEnd ? 'Cancelar apoyo programado' : 'Terminar apoyo'}
        description={
          scheduledEnd
            ? `${who} ya no irá a ${target?.location.name}.`
            : `${who} vuelve a su sede ahora. Si tiene la caja de ${target?.location.name} abierta, primero debe cerrarla.`
        }
        label="Motivo"
        required
        confirmText={scheduledEnd ? 'Cancelar apoyo' : 'Terminar'}
        confirmColor="error"
        loading={mutations.end.isPending}
        onClose={() => setPending(null)}
        onConfirm={(reason) =>
          target &&
          run(
            () => mutations.end.mutateAsync({ id: target.id, reason }),
            scheduledEnd ? 'Apoyo cancelado' : 'Apoyo terminado',
            'No se pudo terminar el apoyo',
          )
        }
      />
    </Box>
  );
};

export default LocationSupportsPage;
