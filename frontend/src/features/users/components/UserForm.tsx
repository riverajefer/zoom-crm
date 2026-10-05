import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Grid, Alert, Autocomplete, FormControlLabel, Switch, Typography, InputAdornment, IconButton, MenuItem } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { CreateUserDto, UpdateUserDto } from '../../../types';
import { rolesApi, cargosApi } from '../../../api';
import { Role, Cargo } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';
import { useActiveSedes } from '../../sedes/hooks/useSedes';

// Schema base del formulario
const userFormSchema = z.object({
  username: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().min(1, 'El número de celular es requerido'),
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  roleId: z.string().min(1, 'El rol es requerido'),
  cargoId: z.string().optional().nullable(),
  locationId: z.string().optional(),
  isActive: z.boolean().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

interface UserFormProps {
  initialData?: UpdateUserDto & { id?: string; mustChangePassword?: boolean };
  onSubmit: (data: CreateUserDto | UpdateUserDto) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  isEdit?: boolean;
}

/**
 * Formulario de usuario
 */
export const UserForm: React.FC<UserFormProps> = ({
  initialData,
  onSubmit,
  isLoading = false,
  error,
  isEdit = false,
}) => {
  // Transform initialData to handle null cargoId
  const defaultValues = initialData
    ? {
        ...initialData,
        cargoId: initialData.cargoId ?? undefined,
        isActive: initialData.isActive ?? true,
      }
    : { isActive: true };

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { control, handleSubmit, formState: { errors }, setError, watch, setValue } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues,
  });

  const firstName = watch('firstName');
  const lastName = watch('lastName');

  // Auto-populate username from firstName + lastName in create mode
  useEffect(() => {
    if (!isEdit) {
      const preview = [firstName, lastName]
        .filter(Boolean)
        .join('')
        .toLowerCase()
        .replace(/\s+/g, '');
      if (preview) {
        setValue('username', preview);
      }
    }
  }, [firstName, lastName, isEdit, setValue]);

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.getAll(),
  });

  const { data: cargos = [], isLoading: isCargosLoading } = useQuery({
    queryKey: ['cargos'],
    queryFn: () => cargosApi.getAll(),
  });

  // La sede solo se elige al crear y con el mismo permiso que pide la ficha;
  // las demás sedes se agregan después desde allí.
  const canAssignSede = useAuthStore((s) => s.hasPermission(PERMISSIONS.MANAGE_USER_LOCATIONS));
  const showSede = !isEdit && canAssignSede;
  const { data: sedes = [] } = useActiveSedes({ enabled: showSede });

  const handleFormSubmit = async (data: UserFormData) => {
    const hasPassword = Boolean(data.password && data.password.trim() !== '');

    // Validaciones adicionales para modo creación
    if (!isEdit) {
      // Validar que password esté presente
      if (!hasPassword) {
        setError('password', {
          type: 'manual',
          message: 'La contraseña es requerida'
        });
        return;
      }

      // Validar longitud mínima
      if (data.password!.length < 6) {
        setError('password', {
          type: 'manual',
          message: 'La contraseña debe tener al menos 6 caracteres'
        });
        return;
      }

      // Validar que confirmPassword esté presente
      if (!data.confirmPassword || data.confirmPassword.trim() === '') {
        setError('confirmPassword', {
          type: 'manual',
          message: 'La confirmación de contraseña es requerida'
        });
        return;
      }

      // Validar que las contraseñas coincidan
      if (data.password !== data.confirmPassword) {
        setError('confirmPassword', {
          type: 'manual',
          message: 'Las contraseñas no coinciden'
        });
        return;
      }
    }

    // Validaciones de contraseña en modo edición (solo si se ingresó una nueva)
    if (isEdit && hasPassword) {
      if (data.password!.length < 6) {
        setError('password', {
          type: 'manual',
          message: 'La contraseña debe tener al menos 6 caracteres'
        });
        return;
      }

      if (data.password !== data.confirmPassword) {
        setError('confirmPassword', {
          type: 'manual',
          message: 'Las contraseñas no coinciden'
        });
        return;
      }
    }

    // Eliminar confirmPassword y transformar cargoId/email/phone vacío a undefined
    const { confirmPassword, cargoId, email, username, phone, isActive, locationId, ...rest } = data;
    const submitData = {
      ...rest,
      username: username || undefined,
      email: email || undefined,
      phone: phone,
      cargoId: cargoId || undefined,
      ...(showSede && locationId ? { locationId } : {}),
      // En modo edit, solo enviar password si se ingresó uno nuevo
      ...(isEdit && !hasPassword ? { password: undefined } : {}),
      // isActive solo en modo edición
      ...(isEdit ? { isActive: isActive ?? true } : {}),
    };
    await onSubmit(submitData);
  };

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        {isEdit && initialData?.mustChangePassword && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Este usuario debe cambiar su contraseña en el próximo inicio de sesión.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit(handleFormSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Controller
                name="firstName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Nombre"
                    fullWidth
                    error={!!errors.firstName}
                    helperText={errors.firstName?.message}
                    disabled={isLoading}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="lastName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Apellido"
                    fullWidth
                    error={!!errors.lastName}
                    helperText={errors.lastName?.message}
                    disabled={isLoading}
                  />
                )}
              />
            </Grid>
          </Grid>

          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Email (opcional)"
                type="email"
                fullWidth
                error={!!errors.email}
                helperText={errors.email?.message}
                disabled={isLoading}
              />
            )}
          />

          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Número de celular"
                type="tel"
                fullWidth
                error={!!errors.phone}
                helperText={errors.phone?.message}
                disabled={isLoading}
              />
            )}
          />

          <Controller
            name="username"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Usuario"
                fullWidth
                error={!!errors.username}
                helperText={errors.username?.message || (!isEdit ? 'Se auto-genera a partir del nombre y apellido' : undefined)}
                disabled={isLoading}
              />
            )}
          />

          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={isEdit ? 'Nueva Contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
                type={showPassword ? 'text' : 'password'}
                fullWidth
                error={!!errors.password}
                helperText={
                  errors.password?.message ||
                  (isEdit
                    ? 'Mínimo 6 caracteres. Si ingresa una contraseña, el usuario deberá cambiarla en su próximo inicio de sesión.'
                    : 'Mínimo 6 caracteres')
                }
                disabled={isLoading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        onMouseDown={(e) => e.preventDefault()}
                        edge="end"
                        disabled={isLoading}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}
          />
          <Controller
            name="confirmPassword"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={isEdit ? 'Confirmar Nueva Contraseña' : 'Confirmar Contraseña'}
                type={showConfirmPassword ? 'text' : 'password'}
                fullWidth
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword?.message || 'Debe coincidir con la contraseña ingresada'}
                disabled={isLoading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        onMouseDown={(e) => e.preventDefault()}
                        edge="end"
                        disabled={isLoading}
                        aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}
          />

          <Controller
            name="roleId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Rol"
                select
                fullWidth
                error={!!errors.roleId}
                helperText={errors.roleId?.message}
                disabled={isLoading}
                SelectProps={{
                  native: true,
                }}
              >
                <option value="">Selecciona un rol</option>
                {(roles as Role[]).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="cargoId"
            control={control}
            render={({ field }) => (
              <Autocomplete
                options={cargos as Cargo[]}
                getOptionLabel={(option: Cargo) =>
                  option.productionArea ? `${option.name} (${option.productionArea.name})` : option.name
                }
                value={(cargos as Cargo[]).find((c) => c.id === field.value) || null}
                onChange={(_, newValue) => {
                  field.onChange(newValue?.id || '');
                }}
                loading={isCargosLoading}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Cargo (opcional)"
                    error={!!errors.cargoId}
                    helperText={errors.cargoId?.message || 'Selecciona el cargo del usuario'}
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                disabled={isLoading}
              />
            )}
          />

          {showSede && (
            <Controller
              name="locationId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Sede (opcional)"
                  select
                  fullWidth
                  disabled={isLoading}
                  helperText="Queda como su sede predeterminada. Puedes agregar más desde la ficha del usuario."
                >
                  <MenuItem value="">Sin sede</MenuItem>
                  {sedes.map((sede) => (
                    <MenuItem key={sede.id} value={sede.id}>
                      {sede.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}

          {isEdit && (
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.value ?? true}
                        onChange={(e) => field.onChange(e.target.checked)}
                        disabled={isLoading}
                        color="success"
                      />
                    }
                    label={
                      <Typography variant="body2" color={field.value === false ? 'text.disabled' : 'text.primary'}>
                        {field.value === false ? 'Usuario inactivo' : 'Usuario activo'}
                      </Typography>
                    }
                  />
                </Box>
              )}
            />
          )}

          <Button variant="contained" type="submit" fullWidth disabled={isLoading}>
            {isLoading ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear Usuario'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};
