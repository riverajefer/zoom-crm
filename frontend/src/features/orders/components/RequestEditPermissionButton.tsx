import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';
import { EditNote as EditNoteIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { ToolbarButton } from './ToolbarButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEditRequests } from '../../../hooks/useEditRequests';
import { useAuthStore } from '../../../store/authStore';
import { useSingleFlight } from '../../../hooks/useSingleFlight';

const schema = z.object({
  observations: z
    .string()
    .min(10, 'Debes proporcionar al menos 10 caracteres de observación')
    .max(500, 'Máximo 500 caracteres'),
});

type FormData = z.infer<typeof schema>;

interface RequestEditPermissionButtonProps {
  orderId: string;
  orderStatus: string;
}

export const RequestEditPermissionButton: React.FC<
  RequestEditPermissionButtonProps
> = ({ orderId, orderStatus }) => {
  const [open, setOpen] = useState(false);
  const { user } = useAuthStore();
  const { createMutation, activePermissionQuery } = useEditRequests(orderId);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { observations: '' },
  });

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    reset();
  };

  // `react-hook-form` 7.71 NO bloquea envíos reentrantes: `handleSubmit` marca
  // `isSubmitting` pero ejecuta el handler igual, así que dos clics en el mismo
  // frame llegan los dos.
  // Va antes del `return null`: es un hook, y el permiso activo llega después
  // del primer render, así que con el return primero cambia el número de hooks.
  const onSubmit = useSingleFlight(async (data: FormData) => {
    await createMutation.mutateAsync(data);
    handleClose();
  });

  const isAdmin = user?.role?.name === 'admin';
  const isDraft = orderStatus === 'DRAFT';
  const hasActivePermission = !!activePermissionQuery.data;

  if (isAdmin || isDraft || hasActivePermission || orderStatus === 'ANULADO') {
    return null;
  }

  return (
    <>
      <ToolbarButton
        icon={<EditNoteIcon />}
        label="Pedir Edición"
        onClick={handleOpen}
        tooltip="Solicitar Permiso de Edición"
      />

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Solicitar Permiso de Edición</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Controller
              name="observations"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Observaciones"
                  placeholder="Explica por qué necesitas editar esta orden..."
                  multiline
                  rows={4}
                  fullWidth
                  required
                  error={!!errors.observations}
                  helperText={errors.observations?.message}
                  sx={{ mt: 1 }}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={createMutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Enviando...' : 'Enviar Solicitud'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
};
