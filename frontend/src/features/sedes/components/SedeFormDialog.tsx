import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSnackbar } from 'notistack';
import { Sede } from '../../../types';
import { useManageSedes } from '../hooks/useSedes';
import { SedeDot } from '../../../components/layout/LocationSelector';

const sedeSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{2,5}$/, 'De 2 a 5 letras mayúsculas o dígitos'),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  type: z.enum(['STORE', 'HEADQUARTERS']),
  address: z.string().optional(),
  phone: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Hexadecimal: #RRGGBB'),
  sortOrder: z.coerce.number().int().min(0),
  isActive: z.boolean(),
});

type SedeFormData = z.infer<typeof sedeSchema>;

interface Props {
  open: boolean;
  sede: Sede | null;
  onClose: () => void;
}

/** Crear o editar una sede. El código solo se elige al crearla: es el prefijo de la numeración. */
export const SedeFormDialog: React.FC<Props> = ({ open, sede, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { createMutation, updateMutation } = useManageSedes();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!sede;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SedeFormData>({
    resolver: zodResolver(sedeSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'STORE',
      address: '',
      phone: '',
      color: '#8FA3B8',
      sortOrder: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      sede
        ? {
            code: sede.code,
            name: sede.name,
            type: sede.type,
            address: sede.address ?? '',
            phone: sede.phone ?? '',
            color: sede.color,
            sortOrder: sede.sortOrder ?? 0,
            isActive: sede.isActive ?? true,
          }
        : undefined,
    );
  }, [open, sede, reset]);

  const onSubmit = async ({ code, ...rest }: SedeFormData) => {
    const data = { ...rest, address: rest.address || null, phone: rest.phone || null };
    try {
      setError(null);
      if (sede) {
        await updateMutation.mutateAsync({ id: sede.id, data });
        enqueueSnackbar('Sede actualizada', { variant: 'success' });
      } else {
        await createMutation.mutateAsync({ code, ...data });
        enqueueSnackbar('Sede creada', { variant: 'success' });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la sede');
    }
  };

  const color = watch('color');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle>{isEdit ? `Editar ${sede?.name}` : 'Nueva sede'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Código"
                    disabled={isEdit}
                    error={!!errors.code}
                    helperText={errors.code?.message ?? (isEdit ? 'No se cambia: es el prefijo de la numeración' : 'Prefijo de la numeración, p. ej. 130')}
                    sx={{ minWidth: 160 }}
                  />
                )}
              />
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Nombre" fullWidth error={!!errors.name} helperText={errors.name?.message} />
                )}
              />
            </Stack>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <TextField {...field} select label="Tipo">
                  <MenuItem value="STORE">Local (vende y produce)</MenuItem>
                  <MenuItem value="HEADQUARTERS">Matriz (contabilidad)</MenuItem>
                </TextField>
              )}
            />
            <Controller
              name="address"
              control={control}
              render={({ field }) => <TextField {...field} label="Dirección (sale en los PDF)" />}
            />
            <Controller
              name="phone"
              control={control}
              render={({ field }) => <TextField {...field} label="Teléfono" />}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
              <Controller
                name="color"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Color"
                    error={!!errors.color}
                    helperText={errors.color?.message}
                    InputProps={{
                      startAdornment: (
                        <Box sx={{ mr: 1, display: 'flex' }}>
                          <SedeDot color={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#999999'} size={14} />
                        </Box>
                      ),
                    }}
                  />
                )}
              />
              <Controller
                name="sortOrder"
                control={control}
                render={({ field }) => (
                  <TextField {...field} type="number" label="Orden" error={!!errors.sortOrder} helperText={errors.sortOrder?.message} sx={{ maxWidth: 140 }} />
                )}
              />
            </Stack>
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Activa" />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isEdit ? 'Guardar' : 'Crear sede'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
