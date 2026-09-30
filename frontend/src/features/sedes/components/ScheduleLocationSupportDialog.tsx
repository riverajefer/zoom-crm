import React, { useEffect, useMemo } from 'react';
import {
  Autocomplete,
  Button,
  createFilterOptions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSnackbar } from 'notistack';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { useUsers } from '../../users/hooks/useUsers';
import type { User } from '../../../types';
import { useActiveSedes } from '../hooks/useSedes';
import { useLocationSupportMutations } from '../hooks/useLocationSupports';
import { apiErrorMessage, bogotaToday } from '../utils/locationSupport';

const schema = z
  .object({
    userId: z.string().min(1, 'Elige el empleado'),
    locationId: z.string().min(1, 'Elige la sede'),
    startDate: z.string().min(1, 'Indica el primer día'),
    endDate: z.string().min(1, 'Indica el último día'),
    reason: z.string().trim().min(3, 'Indica el motivo'),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'No puede ser antes del primer día' });

type FormData = z.infer<typeof schema>;

const userLabel = (u: User) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '';

// Se busca por nombre o por usuario (`asesor.104`).
const filterEmployees = createFilterOptions<User>({ stringify: (u) => `${userLabel(u)} ${u.username ?? ''}` });

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Gerencia programa un apoyo en otra sede: nace aprobado (docs/PLAN_SEDES.md §16). */
export const ScheduleLocationSupportDialog: React.FC<Props> = ({ open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { usersQuery } = useUsers({ enabled: open });
  const { data: sedes = [] } = useActiveSedes({ enabled: open });
  const { schedule } = useLocationSupportMutations();
  const today = bogotaToday();

  // Quien no tiene sedes fijas opera en todas (admin, contabilidad): no va de apoyo.
  const employees = useMemo(
    () => (usersQuery.data ?? []).filter((u) => u.isActive !== false && (u.locations?.length ?? 0) > 0),
    [usersQuery.data],
  );

  const { control, handleSubmit, reset, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { userId: '', locationId: '', startDate: today, endDate: today, reason: '' },
  });
  const [userId, startDate] = useWatch({ control, name: ['userId', 'startDate'] });
  const employee = employees.find((u) => u.id === userId);
  const homeIds = employee?.locations?.map((l) => l.location.id) ?? [];
  // En su sede predeterminada no se programa un apoyo.
  const sedeOptions = sedes.filter((sede) => sede.id !== employee?.defaultLocationId);
  const sedeName = (id: string, name: string) => (homeIds.includes(id) ? `${name} (su sede)` : name);
  // El valor elegido en una línea: punto de color y nombre.
  const renderSede = (id: string) => {
    const sede = sedeOptions.find((s) => s.id === id);
    return sede ? (
      <Stack direction="row" spacing={1} alignItems="center">
        <SedeDot color={sede.color} size={12} />
        <span>{sedeName(sede.id, sede.name)}</span>
      </Stack>
    ) : null;
  };

  useEffect(() => {
    if (open) reset({ userId: '', locationId: '', startDate: today, endDate: today, reason: '' });
  }, [open, reset, today]);

  const onSubmit = async (data: FormData) => {
    try {
      await schedule.mutateAsync(data);
      enqueueSnackbar('Apoyo programado: el empleado ya fue avisado', { variant: 'success' });
      onClose();
    } catch (error) {
      enqueueSnackbar(apiErrorMessage(error, 'No se pudo programar el apoyo'), { variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle>Programar apoyo en otra sede</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Controller
              name="userId"
              control={control}
              render={({ field, fieldState }) => (
                <Autocomplete
                  options={employees}
                  loading={usersQuery.isLoading}
                  value={employees.find((u) => u.id === field.value) ?? null}
                  onChange={(_, u) => field.onChange(u?.id ?? '')}
                  getOptionLabel={userLabel}
                  filterOptions={filterEmployees}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  noOptionsText="Sin empleados con ese nombre"
                  renderOption={(props, u) => (
                    <li {...props} key={u.id}>
                      <ListItemText
                        primary={userLabel(u)}
                        secondary={[u.username, u.locations?.map((l) => l.location.name).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Empleado"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              )}
            />
            <Controller
              name="locationId"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Sede del apoyo"
                  SelectProps={{ renderValue: (id) => renderSede(id as string) }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                >
                  {sedeOptions.map((sede) => (
                    <MenuItem key={sede.id} value={sede.id}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <SedeDot color={sede.color} size={12} />
                      </ListItemIcon>
                      <ListItemText primary={sedeName(sede.id, sede.name)} />
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Stack direction="row" spacing={2}>
              <Controller
                name="startDate"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    type="date"
                    label="Desde"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: today }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    fullWidth
                  />
                )}
              />
              <Controller
                name="endDate"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    type="date"
                    label="Hasta"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: startDate }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    fullWidth
                  />
                )}
              />
            </Stack>
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Motivo"
                  multiline
                  minRows={2}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
            Programar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
