import React, { useEffect } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { LoadingButton } from '../../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../../hooks/useSingleFlight';
import { useProductionSettings, useUpdateProductionSettings } from '../../hooks/useWorkOrderTime';
import { decimalLabel } from '../../utils/productivity';
import { userName } from '../../utils/timeline';

/** Número escrito con coma o punto decimal, dentro de un rango. */
const decimal = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Escribe ${label}`)
    .refine((v) => /^\d+([.,]\d{1,2})?$/.test(v), 'Escribe un número, con hasta 2 decimales')
    .transform((v) => Number(v.replace(',', '.')))
    .refine((n) => n >= min && n <= max, `Debe estar entre ${decimalLabel(min)} y ${decimalLabel(max)}`);

const schema = z
  .object({
    hourlyDivisor: decimal('las horas al mes', 100, 300),
    overtimePct: decimal('el recargo', 0, 200),
    laborShareWarningPct: decimal('el umbral de atención', 1, 100),
    laborShareCriticalPct: decimal('el umbral de alerta', 1, 100),
  })
  .refine((v) => v.laborShareWarningPct < v.laborShareCriticalPct, {
    message: 'Tiene que ser mayor que el umbral de atención',
    path: ['laborShareCriticalPct'],
  });

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const FIELDS: { name: keyof FormInput; label: string; unit: string; helper: string }[] = [
  {
    name: 'hourlyDivisor',
    label: 'Horas al mes',
    unit: 'h',
    helper: 'Valor hora = salario ÷ estas horas. 210 corresponde a la jornada de 42 h semanales.',
  },
  {
    name: 'overtimePct',
    label: 'Recargo de la hora extra',
    unit: '%',
    helper: 'Cuánto más se paga la hora extra. 25 % = la hora normal × 1,25.',
  },
  {
    name: 'laborShareWarningPct',
    label: 'MO / venta: atención desde',
    unit: '%',
    helper: 'Una OT cuya mano de obra pase este % de su venta sin IVA se marca en naranja.',
  },
  {
    name: 'laborShareCriticalPct',
    label: 'MO / venta: alerta desde',
    unit: '%',
    helper: 'Por encima de este % se marca en rojo y aparece en los hallazgos.',
  },
];

/**
 * Parámetros del reporte de productividad que gerencia ajusta sin pedir un
 * cambio de código: divisor del valor hora, recargo de la hora extra y umbrales
 * del semáforo de mano de obra / venta. Aplican a todo el reporte, también a
 * periodos pasados.
 */
export const ProductionSettingsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { data: settings, isLoading, isError } = useProductionSettings(open);
  const updateMutation = useUpdateProductionSettings();

  const { control, handleSubmit, reset } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { hourlyDivisor: '', overtimePct: '', laborShareWarningPct: '', laborShareCriticalPct: '' },
  });

  useEffect(() => {
    if (!open || !settings) return;
    reset({
      hourlyDivisor: decimalLabel(settings.hourlyDivisor),
      overtimePct: decimalLabel(Math.round((settings.overtimeFactor - 1) * 10_000) / 100),
      laborShareWarningPct: decimalLabel(settings.laborShareWarningPct),
      laborShareCriticalPct: decimalLabel(settings.laborShareCriticalPct),
    });
  }, [open, settings, reset]);

  const save = useSingleFlight(async (values: FormOutput) => {
    await updateMutation.mutateAsync({
      hourlyDivisor: values.hourlyDivisor,
      overtimeFactor: Math.round((1 + values.overtimePct / 100) * 100) / 100,
      laborShareWarningPct: values.laborShareWarningPct,
      laborShareCriticalPct: values.laborShareCriticalPct,
    });
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Parámetros de productividad</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {isError && <Alert severity="error">No se pudieron cargar los parámetros. Intenta de nuevo.</Alert>}
          {FIELDS.map((f) =>
            isLoading ? (
              <Skeleton key={f.name} variant="rounded" height={56} />
            ) : (
              <Controller
                key={f.name}
                name={f.name}
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label={f.label}
                    size="small"
                    fullWidth
                    inputProps={{ inputMode: 'decimal' }}
                    InputProps={{ endAdornment: <InputAdornment position="end">{f.unit}</InputAdornment> }}
                    error={Boolean(fieldState.error)}
                    helperText={fieldState.error?.message ?? f.helper}
                  />
                )}
              />
            ),
          )}
          <Alert severity="info" variant="outlined">
            Los cambios aplican a todo el reporte, también a periodos pasados.
          </Alert>
          {/* Sin autor son los valores con que arrancó el reporte: nadie los ha cambiado. */}
          {settings?.updatedAt && settings.updatedBy && (
            <Typography variant="caption" color="text.secondary">
              Última modificación: {format(parseISO(settings.updatedAt), 'dd/MM/yyyy HH:mm')} por{' '}
              {userName(settings.updatedBy)}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <LoadingButton
          variant="contained"
          loading={updateMutation.isPending}
          disabled={isLoading || isError}
          onClick={handleSubmit(save)}
        >
          Guardar
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
