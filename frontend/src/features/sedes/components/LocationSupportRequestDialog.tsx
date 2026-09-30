import React, { useEffect } from 'react';
import {
  Alert,
  Button,
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
import { useLocationStore } from '../../../store/locationStore';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { SupportDateField } from './SupportDateField';
import { useActiveSedes } from '../hooks/useSedes';
import { useLocationSupportMutations } from '../hooks/useLocationSupports';
import { apiErrorMessage, bogotaToday, formatSupportDay } from '../utils/locationSupport';

const schema = z
  .object({
    locationId: z.string().min(1, 'Elige la sede'),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().trim().min(3, 'Cuéntale a Gerencia por qué'),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'No puede ser antes del primer día',
  });

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Pedir trabajar en otra sede (docs/PLAN_SEDES.md §16). Sin apoyo vigente es un
 * apoyo con fechas; con uno vigente es un cambio de sede: a otra sede ajena o
 * de vuelta a la suya. Lo aprueba Gerencia.
 */
export const LocationSupportRequestDialog: React.FC<Props> = ({ open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { locations, activeSupport } = useLocationStore();
  const canOpenCash = useAuthStore((s) => s.hasPermission(PERMISSIONS.OPEN_CASH_SESSION));
  const { data: sedes = [] } = useActiveSedes({ enabled: open });
  const { request } = useLocationSupportMutations();
  const today = bogotaToday();

  const homeIds = activeSupport?.homeLocationIds ?? [];
  const options = activeSupport
    ? sedes.filter((s) => s.id !== activeSupport.locationId)
    : sedes.filter((s) => !locations.some((l) => l.id === s.id));

  const { control, handleSubmit, reset, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { locationId: '', startDate: today, endDate: activeSupport?.endDate ?? today, reason: '' },
  });
  const [locationId, startDate] = useWatch({ control, name: ['locationId', 'startDate'] });
  const isReturn = !!activeSupport && homeIds.includes(locationId);

  // El valor elegido en una línea: punto de color y nombre.
  const sedeName = (id: string, name: string) => (homeIds.includes(id) ? `${name} (tu sede)` : name);
  const renderSede = (id: string) => {
    const sede = options.find((s) => s.id === id);
    return sede ? (
      <Stack direction="row" spacing={1} alignItems="center">
        <SedeDot color={sede.color} size={12} />
        <span>{sedeName(sede.id, sede.name)}</span>
      </Stack>
    ) : null;
  };

  useEffect(() => {
    if (open) {
      reset({ locationId: '', startDate: today, endDate: activeSupport?.endDate ?? today, reason: '' });
    }
  }, [open, reset, today, activeSupport?.endDate]);

  const onSubmit = async (data: FormData) => {
    try {
      await request.mutateAsync({
        locationId: data.locationId,
        reason: data.reason,
        // En un cambio vale desde que se aprueba; en una vuelta no hay fechas.
        ...(activeSupport ? {} : { startDate: data.startDate }),
        ...(isReturn ? {} : { endDate: data.endDate }),
      });
      enqueueSnackbar('Solicitud enviada a Gerencia', { variant: 'success' });
      onClose();
    } catch (error) {
      enqueueSnackbar(apiErrorMessage(error, 'No se pudo enviar la solicitud'), { variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle>{activeSupport ? 'Pedir cambio de sede' : 'Pedir apoyo en otra sede'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Controller
              name="locationId"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label={activeSupport ? '¿A qué sede?' : '¿En qué sede?'}
                  SelectProps={{ renderValue: (id) => renderSede(id as string) }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                >
                  {options.map((sede) => (
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

            {isReturn ? (
              <Alert severity="info">Vuelves a tu sede en cuanto Gerencia lo apruebe.</Alert>
            ) : (
              <Stack direction="row" spacing={2}>
                {!activeSupport && (
                  <Controller
                    name="startDate"
                    control={control}
                    render={({ field }) => (
                      <SupportDateField
                        label="Desde"
                        value={field.value}
                        onChange={field.onChange}
                        minDate={today}
                      />
                    )}
                  />
                )}
                <Controller
                  name="endDate"
                  control={control}
                  render={({ field, fieldState }) => (
                    <SupportDateField
                      label="Hasta"
                      value={field.value}
                      onChange={field.onChange}
                      minDate={activeSupport ? today : startDate}
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ??
                        (activeSupport ? `Tu apoyo actual va hasta el ${formatSupportDay(activeSupport.endDate)}` : undefined)
                      }
                    />
                  )}
                />
              </Stack>
            )}

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

            {activeSupport && canOpenCash && (
              <Alert severity="warning">
                Si tienes la caja abierta, ciérrala antes: Gerencia no puede aprobar el cambio con la caja abierta.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
            Enviar a Gerencia
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
