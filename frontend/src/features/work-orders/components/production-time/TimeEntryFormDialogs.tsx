import React, { useEffect } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LoadingButton } from '../../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../../hooks/useSingleFlight';
import type { WorkOrderTimeEntry } from '../../../../types/work-order.types';
import {
  useTimeMachines,
  useTimeOperators,
  useWorkOrderTimeMutations,
} from '../../hooks/useWorkOrderTime';
import {
  entryDurationSeconds,
  formatClock,
  formatDuration,
  isRunning,
  userName,
} from '../../utils/timeline';

export interface ItemOption {
  id: string;
  productDescription: string;
}

const reasonSchema = z
  .string()
  .trim()
  .min(8, 'Escribe el motivo (mínimo 8 caracteres)')
  .max(500, 'Máximo 500 caracteres');

const pickerProps = (error?: { message?: string }) => ({
  ampm: false,
  disableFuture: true,
  format: 'dd/MM/yyyy HH:mm',
  slotProps: {
    textField: {
      fullWidth: true,
      size: 'small' as const,
      error: Boolean(error),
      helperText: error?.message,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Ajustar
// ─────────────────────────────────────────────────────────────────────────────

const adjustSchema = z
  .object({
    startAt: z.date({ required_error: 'Elige la hora de inicio', invalid_type_error: 'Fecha inválida' }),
    endAt: z.date({ invalid_type_error: 'Fecha inválida' }).nullable(),
    workOrderItemId: z.string(),
    machineId: z.string(),
    notes: z.string().max(120, 'Máximo 120 caracteres'),
    reason: reasonSchema,
    running: z.boolean(),
  })
  .refine((v) => v.running || v.endAt !== null, {
    message: 'Elige la hora de fin',
    path: ['endAt'],
  })
  .refine((v) => !v.endAt || v.endAt.getTime() > v.startAt.getTime(), {
    message: 'El fin tiene que ser después del inicio',
    path: ['endAt'],
  });

type AdjustForm = z.infer<typeof adjustSchema>;

interface AdjustTimeEntryDialogProps {
  entry: WorkOrderTimeEntry | null;
  items: ItemOption[];
  onClose: () => void;
}

export const AdjustTimeEntryDialog: React.FC<AdjustTimeEntryDialogProps> = ({ entry, items, onClose }) => {
  const { adjustMutation } = useWorkOrderTimeMutations();
  const { data: machines = [] } = useTimeMachines(Boolean(entry));
  const running = entry ? isRunning(entry) : false;

  const { control, handleSubmit, reset, formState } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
  });

  useEffect(() => {
    if (!entry) return;
    reset({
      startAt: entry.startAt ? new Date(entry.startAt) : (undefined as unknown as Date),
      endAt: entry.endAt ? new Date(entry.endAt) : null,
      workOrderItemId: entry.workOrderItem?.id ?? '',
      machineId: entry.machine?.id ?? '',
      notes: entry.notes ?? '',
      reason: '',
      running: isRunning(entry),
    });
  }, [entry, reset]);

  const submit = useSingleFlight(async (values: AdjustForm) => {
    if (!entry) return;
    await adjustMutation.mutateAsync({
      entryId: entry.id,
      dto: {
        startAt: values.startAt.toISOString(),
        ...(values.endAt && { endAt: values.endAt.toISOString() }),
        workOrderItemId: values.workOrderItemId || null,
        machineId: values.machineId || null,
        notes: values.notes,
        reason: values.reason,
      },
    });
    onClose();
  });

  const original =
    entry && (entry.adjustedAt ? entry.originalStartAt : entry.startAt)
      ? `${formatClock((entry.adjustedAt ? entry.originalStartAt : entry.startAt)!)} – ${
          (entry.adjustedAt ? entry.originalEndAt : entry.endAt)
            ? formatClock((entry.adjustedAt ? entry.originalEndAt : entry.endAt)!)
            : 'en curso'
        }`
      : null;

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Ajustar horas{entry ? ` · ${userName(entry.user)}` : ''}</DialogTitle>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            {entry?.closedBySystem && !entry.reviewedAt && (
              <Alert severity="error">
                El operario no la finalizó y el sistema la cerró. Pon la hora a la que terminó de verdad.
              </Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller
                name="startAt"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    label="Inicio"
                    value={field.value ?? null}
                    onChange={field.onChange}
                    {...pickerProps(formState.errors.startAt)}
                  />
                )}
              />
              <Controller
                name="endAt"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    label={running ? 'Fin (vacío = sigue en curso)' : 'Fin'}
                    value={field.value}
                    onChange={field.onChange}
                    {...pickerProps(formState.errors.endAt)}
                  />
                )}
              />
            </Stack>
            <Controller
              name="workOrderItemId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select size="small" label="Ítem"
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}>
                  <MenuItem value="">General de la OT</MenuItem>
                  {items.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.productDescription}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="machineId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select size="small" label="Máquina"
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}>
                  <MenuItem value="">Sin máquina</MenuItem>
                  {machines.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="notes"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  size="small"
                  label="Tarea"
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Motivo del ajuste"
                  placeholder="Ej.: olvidó finalizar; el jefe de área confirma que terminó a las 17:30."
                  multiline
                  minRows={2}
                  required
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    (original ? `Se guarda la hora original (${original}) y tu nombre.` : undefined)
                  }
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <LoadingButton type="submit" variant="contained" loading={adjustMutation.isPending}>
            Guardar ajuste
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Anular
// ─────────────────────────────────────────────────────────────────────────────

const voidSchema = z.object({ reason: reasonSchema });

interface VoidTimeEntryDialogProps {
  entry: WorkOrderTimeEntry | null;
  onClose: () => void;
}

export const VoidTimeEntryDialog: React.FC<VoidTimeEntryDialogProps> = ({ entry, onClose }) => {
  const { voidMutation } = useWorkOrderTimeMutations();
  const { control, handleSubmit, reset } = useForm<{ reason: string }>({
    resolver: zodResolver(voidSchema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (entry) reset({ reason: '' });
  }, [entry, reset]);

  const submit = useSingleFlight(async ({ reason }: { reason: string }) => {
    if (!entry) return;
    await voidMutation.mutateAsync({ entryId: entry.id, reason });
    onClose();
  });

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Anular registro</DialogTitle>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            <Alert severity="info">
              El registro no se borra: queda tachado, con tu nombre y el motivo, y deja de contar en las horas.
            </Alert>
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Motivo"
                  placeholder="Ej.: se inició en la OT equivocada."
                  multiline
                  minRows={2}
                  required
                  autoFocus
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <LoadingButton type="submit" variant="contained" color="error" loading={voidMutation.isPending}>
            Anular registro
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Finalizar la tarea de otro operario
// ─────────────────────────────────────────────────────────────────────────────

interface CloseOnBehalfDialogProps {
  entry: WorkOrderTimeEntry | null;
  onClose: () => void;
  /** Se llama después de cerrar la tarea con éxito. */
  onDone?: () => void;
}

/**
 * El supervisor finaliza ahora la tarea de un operario que se fue sin darle
 * Finalizar. La hora es la del momento; si terminó antes, lo correcto es
 * «Ajustar horas».
 */
export const CloseOnBehalfDialog: React.FC<CloseOnBehalfDialogProps> = ({ entry, onClose, onDone }) => {
  const { closeOnBehalfMutation } = useWorkOrderTimeMutations();
  const { control, handleSubmit, reset } = useForm<{ reason: string }>({
    resolver: zodResolver(voidSchema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (entry) reset({ reason: '' });
  }, [entry, reset]);

  const submit = useSingleFlight(async ({ reason }: { reason: string }) => {
    if (!entry) return;
    await closeOnBehalfMutation.mutateAsync({ entryId: entry.id, reason });
    onClose();
    onDone?.();
  });

  const now = new Date();
  return (
    <Dialog open={Boolean(entry)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Finalizar tarea de {entry ? userName(entry.user) : ''}</DialogTitle>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            {entry && (
              <Alert severity="info">
                «{entry.notes || entry.workOrderItem?.productDescription || 'Tarea general'}» se cierra ahora, a las{' '}
                {formatClock(now)}, con {formatDuration(entryDurationSeconds(entry, now.getTime()))}. Si terminó
                antes, usa «Ajustar horas» y pon la hora real.
              </Alert>
            )}
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Motivo"
                  placeholder="Ej.: salió sin finalizar; la máquina sigue imprimiendo sola."
                  multiline
                  minRows={2}
                  required
                  autoFocus
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message ?? 'Queda registrado con tu nombre.'}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <LoadingButton type="submit" variant="contained" color="error" loading={closeOnBehalfMutation.isPending}>
            Finalizar ahora
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Registro olvidado
// ─────────────────────────────────────────────────────────────────────────────

const manualSchema = z
  .object({
    userId: z.string().min(1, 'Elige el operario'),
    workOrderItemId: z.string(),
    machineId: z.string(),
    startAt: z.date({ required_error: 'Elige la hora de inicio', invalid_type_error: 'Fecha inválida' }),
    endAt: z.date({ required_error: 'Elige la hora de fin', invalid_type_error: 'Fecha inválida' }),
    notes: z.string().max(120, 'Máximo 120 caracteres'),
    reason: reasonSchema,
  })
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), {
    message: 'El fin tiene que ser después del inicio',
    path: ['endAt'],
  });

type ManualForm = z.infer<typeof manualSchema>;

interface ManualTimeEntryDialogProps {
  open: boolean;
  workOrderId: string;
  items: ItemOption[];
  /** Día en que se está mirando la línea, para precargar las horas. */
  defaultDay: Date;
  currentUserId?: string;
  onClose: () => void;
}

export const ManualTimeEntryDialog: React.FC<ManualTimeEntryDialogProps> = ({
  open,
  workOrderId,
  items,
  defaultDay,
  currentUserId,
  onClose,
}) => {
  const { createManualMutation } = useWorkOrderTimeMutations();
  const { data: operators = [] } = useTimeOperators(open);
  const { data: machines = [] } = useTimeMachines(open);

  const { control, handleSubmit, reset, formState } = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
  });

  useEffect(() => {
    if (!open) return;
    const start = new Date(defaultDay);
    start.setHours(8, 0, 0, 0);
    const end = new Date(defaultDay);
    end.setHours(9, 0, 0, 0);
    reset({
      userId: '',
      workOrderItemId: '',
      machineId: '',
      startAt: start,
      endAt: end,
      notes: '',
      reason: '',
    });
  }, [open, defaultDay, reset]);

  const submit = useSingleFlight(async (values: ManualForm) => {
    await createManualMutation.mutateAsync({
      workOrderId,
      userId: values.userId,
      workOrderItemId: values.workOrderItemId || undefined,
      machineId: values.machineId || undefined,
      startAt: values.startAt.toISOString(),
      endAt: values.endAt.toISOString(),
      notes: values.notes.trim() || undefined,
      reason: values.reason,
    });
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Agregar registro olvidado</DialogTitle>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            <Alert severity="warning">
              Úsalo solo cuando alguien trabajó y no usó el temporizador. Queda marcado como «Agregado» con tu nombre.
            </Alert>
            <Controller
              name="userId"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  size="small"
                  label="Operario"
                  required
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    (operators.length === 0 ? 'Nadie tiene el permiso de usar el temporizador.' : undefined)
                  }
                >
                  {operators.map((op) => (
                    <MenuItem key={op.id} value={op.id} disabled={op.id === currentUserId}>
                      {userName(op)}
                      {op.id === currentUserId ? ' (no puedes agregarte horas)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="workOrderItemId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select size="small" label="Ítem"
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}>
                  <MenuItem value="">General de la OT</MenuItem>
                  {items.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.productDescription}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller
                name="startAt"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    label="Inicio"
                    value={field.value ?? null}
                    onChange={field.onChange}
                    {...pickerProps(formState.errors.startAt)}
                  />
                )}
              />
              <Controller
                name="endAt"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    label="Fin"
                    value={field.value ?? null}
                    onChange={field.onChange}
                    {...pickerProps(formState.errors.endAt)}
                  />
                )}
              />
            </Stack>
            <Controller
              name="machineId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select size="small" label="Máquina (opcional)"
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}>
                  <MenuItem value="">Sin máquina</MenuItem>
                  {machines.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField {...field} size="small" label="Tarea" placeholder="Ej.: empaque" />
              )}
            />
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Motivo"
                  placeholder="Ej.: la tablet del área estaba descargada."
                  multiline
                  minRows={2}
                  required
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <LoadingButton type="submit" variant="contained" loading={createManualMutation.isPending}>
            Agregar registro
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  );
};
