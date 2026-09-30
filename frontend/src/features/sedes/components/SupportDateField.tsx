import React from 'react';
import { DatePicker } from '@mui/x-date-pickers';
import { format, isValid } from 'date-fns';

/** `2026-10-05` → fecha local (sin correr el día por la zona horaria). */
const toDate = (day: string) => {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface Props {
  label: string;
  /** `YYYY-MM-DD` */
  value: string;
  onChange: (day: string) => void;
  /** `YYYY-MM-DD` */
  minDate?: string;
  error?: boolean;
  helperText?: React.ReactNode;
}

/**
 * Fecha de un apoyo en otra sede con el calendario de los demás formularios.
 * El valor es el día (`YYYY-MM-DD`), que es lo que guarda el backend.
 */
export const SupportDateField: React.FC<Props> = ({ label, value, onChange, minDate, error, helperText }) => (
  <DatePicker
    label={label}
    value={toDate(value)}
    onChange={(date) => onChange(date && isValid(date) ? format(date, 'yyyy-MM-dd') : '')}
    minDate={minDate ? (toDate(minDate) ?? undefined) : undefined}
    format="dd/MM/yyyy"
    slotProps={{ textField: { fullWidth: true, error, helperText } }}
  />
);
