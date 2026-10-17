import React, { useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { useProductionAreas } from '../../production-areas/hooks/useProductionAreas';
import type { Machine } from '../../../types/machine.types';
import { useMachines } from '../hooks/useMachines';

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres'),
  productionAreaId: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface MachineFormDialogProps {
  open: boolean;
  /** Máquina a editar; sin ella, se crea una nueva. */
  machine: Machine | null;
  onClose: () => void;
}

export const MachineFormDialog: React.FC<MachineFormDialogProps> = ({ open, machine, onClose }) => {
  const { createMutation, updateMutation } = useMachines();
  const { productionAreasQuery } = useProductionAreas();
  const areas = productionAreasQuery.data ?? [];

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', productionAreaId: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: machine?.name ?? '',
      description: machine?.description ?? '',
      productionAreaId: machine?.productionArea?.id ?? '',
    });
  }, [open, machine, reset]);

  const submit = useSingleFlight(async (values: FormValues) => {
    const dto = {
      name: values.name.trim(),
      description: values.description.trim(),
      productionAreaId: values.productionAreaId || undefined,
    };
    if (machine) {
      await updateMutation.mutateAsync({
        id: machine.id,
        // `null` quita el área; `undefined` la dejaría como estaba.
        dto: { ...dto, productionAreaId: values.productionAreaId || null },
      });
    } else {
      await createMutation.mutateAsync(dto);
    }
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{machine ? 'Editar máquina' : 'Nueva máquina'}</DialogTitle>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Nombre"
                  placeholder="Ej.: Plotter Mimaki CJV150"
                  required
                  autoFocus
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="productionAreaId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select label="Área de producción"
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}>
                  <MenuItem value="">Sin área</MenuItem>
                  {areas.map((area) => (
                    <MenuItem key={area.id} value={area.id}>
                      {area.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="description"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Descripción"
                  multiline
                  minRows={2}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <LoadingButton
            type="submit"
            variant="contained"
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {machine ? 'Guardar' : 'Crear máquina'}
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  );
};
