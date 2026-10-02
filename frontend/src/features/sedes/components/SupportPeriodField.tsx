import React, { useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { SupportDateField } from './SupportDateField';
import {
  addSupportDays,
  bogotaToday,
  describeSupportPeriod,
  nextSaturday,
  relativeSupportDay,
} from '../utils/locationSupport';

const CUSTOM = 'custom';

interface QuickOption {
  key: string;
  label: string;
  /** `YYYY-MM-DD` */
  value: string;
}

/** Un día del periodo: atajos y, si ninguno sirve, el calendario. */
const QuickDay: React.FC<{
  label: string;
  options: QuickOption[];
  selected: string;
  onSelect: (option: QuickOption) => void;
  onCustom: () => void;
  customLabel: string;
  value: string;
  onChange: (day: string) => void;
  minDate: string;
  error?: string;
  hint?: string;
}> = ({ label, options, selected, onSelect, onCustom, customLabel, value, onChange, minDate, error, hint }) => (
  <Box>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      {label}
    </Typography>
    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
      {options.map((option) => (
        <Chip
          key={option.key}
          label={option.label}
          color={selected === option.key ? 'primary' : 'default'}
          variant={selected === option.key ? 'filled' : 'outlined'}
          onClick={() => onSelect(option)}
        />
      ))}
      <Chip
        icon={<EventOutlinedIcon />}
        label={customLabel}
        color={selected === CUSTOM ? 'primary' : 'default'}
        variant={selected === CUSTOM ? 'filled' : 'outlined'}
        onClick={onCustom}
      />
    </Stack>
    {selected === CUSTOM && (
      <Box sx={{ mt: 1.5 }}>
        <SupportDateField label="Día" value={value} onChange={onChange} minDate={minDate} error={!!error} />
      </Box>
    )}
    {(error || hint) && (
      <Typography variant="caption" color={error ? 'error' : 'text.secondary'} display="block" sx={{ mt: 0.75 }}>
        {error ?? hint}
      </Typography>
    )}
  </Box>
);

interface Props {
  /** `YYYY-MM-DD` */
  startDate: string;
  endDate: string;
  onStartChange: (day: string) => void;
  onEndChange: (day: string) => void;
  /** En un cambio de sede no se elige el primer día: vale desde que Gerencia aprueba. */
  showStart?: boolean;
  /** Atajo extra para el último día, p. ej. lo que queda del apoyo actual. */
  extraEnd?: { label: string; value: string } | null;
  /** Bajo "Ahora mismo": cuándo empieza de verdad (al aprobar, o ya). */
  nowHint?: string;
  startError?: string;
  endError?: string;
}

/**
 * Las fechas de un apoyo en otra sede dichas como se dicen: "ahora mismo",
 * "mañana", "hasta el sábado", "una semana". El calendario queda para lo que
 * no cubren los atajos. Abajo, el periodo de corrido para confirmarlo.
 */
export const SupportPeriodField: React.FC<Props> = ({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  showStart = true,
  extraEnd,
  nowHint,
  startError,
  endError,
}) => {
  const today = bogotaToday();
  const tomorrow = addSupportDays(today, 1);
  const [startCustom, setStartCustom] = useState(false);
  const [endCustom, setEndCustom] = useState(false);

  const startOptions: QuickOption[] = [
    { key: 'now', label: 'Ahora mismo', value: today },
    { key: 'tomorrow', label: 'Mañana', value: tomorrow },
  ];
  const startKey = startCustom ? CUSTOM : (startOptions.find((o) => o.value === startDate)?.key ?? CUSTOM);

  // El último día se cuenta desde el primero (o desde hoy en un cambio de sede).
  const base = showStart ? startDate || today : today;
  const endValue = (key: string, from: string) => {
    if (key === 'same') return from;
    if (key === 'saturday') return nextSaturday(from);
    if (key === 'week') return addSupportDays(from, 6);
    return extraEnd?.value ?? from;
  };
  const endOptionsFrom = (from: string): QuickOption[] => {
    const all: QuickOption[] = [
      { key: 'same', label: `Solo ${from === today || from === tomorrow ? relativeSupportDay(from) : 'ese día'}`, value: from },
      ...(extraEnd && extraEnd.value >= from ? [{ key: 'extra', ...extraEnd }] : []),
      { key: 'saturday', label: 'Hasta el sábado', value: endValue('saturday', from) },
      { key: 'week', label: 'Una semana', value: endValue('week', from) },
    ];
    // Sin repetidos: un sábado, "solo ese día" y "hasta el sábado" son lo mismo.
    return all.filter((option, i) => all.findIndex((o) => o.value === option.value) === i);
  };
  const endOptions = endOptionsFrom(base);
  const endKey = endCustom ? CUSTOM : (endOptions.find((o) => o.value === endDate)?.key ?? CUSTOM);

  const changeStart = (day: string) => {
    onStartChange(day);
    if (!day) return;
    // "Una semana" sigue siendo una semana si se corre el primer día.
    if (endKey !== CUSTOM) onEndChange(endValue(endKey, day));
    else if (endDate < day) onEndChange(day);
  };

  return (
    <Stack spacing={2}>
      {showStart && (
        <QuickDay
          label="¿Cuándo empieza?"
          options={startOptions}
          selected={startKey}
          onSelect={(option) => {
            setStartCustom(false);
            changeStart(option.value);
          }}
          onCustom={() => setStartCustom(true)}
          customLabel="Otro día"
          value={startDate}
          onChange={changeStart}
          minDate={today}
          error={startError}
          hint={startKey === 'now' ? nowHint : undefined}
        />
      )}
      <QuickDay
        label={showStart ? '¿Hasta cuándo?' : '¿Hasta cuándo te quedas allá?'}
        options={endOptions}
        selected={endKey}
        onSelect={(option) => {
          setEndCustom(false);
          onEndChange(option.value);
        }}
        onCustom={() => setEndCustom(true)}
        customLabel="Otra fecha"
        value={endDate}
        onChange={onEndChange}
        minDate={base}
        error={endError}
      />
      {startDate && endDate && endDate >= base && (
        <Typography variant="body2" color="text.secondary">
          {showStart
            ? describeSupportPeriod(startDate, endDate, today)
            : `Desde que Gerencia apruebe hasta ${relativeSupportDay(endDate, today)}`}
        </Typography>
      )}
    </Stack>
  );
};
