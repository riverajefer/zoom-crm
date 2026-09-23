import React, { useMemo, useState } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import SavingsIcon from '@mui/icons-material/Savings';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import { StatCard } from '../../../components/common/StatCard';
import { formatCurrency } from '../utils/orderFormatters';
import { useOrdersDashboardSummary } from '../hooks';
import type { FilterOrdersDto } from '../../../types/order.types';

type Preset = 'today' | 'week' | 'month' | 'custom';

/** Fecha local en formato YYYY-MM-DD (no usar toISOString: desplaza el día en UTC-5). */
const toLocalISODate = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** Convierte YYYY-MM-DD a un Date en hora local (00:00 del día). */
const fromLocalISODate = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Instante ISO del inicio/fin del día **en hora local**.
 *
 * El backend (`date-range.util.ts`) usa el valor tal cual cuando trae componente
 * horario, así que enviar los límites locales hace que el rango cubra el día
 * completo en Colombia (UTC-5) y no el día UTC. Se usa el mismo valor para el
 * dashboard y para los filtros de la tabla, de modo que ambos cuenten lo mismo.
 */
const localDayStartISO = (value: string): string => fromLocalISODate(value).toISOString();

const localDayEndISO = (value: string): string => {
  const date = fromLocalISODate(value);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

const presetRange = (preset: Exclude<Preset, 'custom'>): { from: string; to: string } => {
  const today = new Date();
  const from = new Date(today);

  if (preset === 'week') {
    // Semana corrida: lunes de la semana actual
    const dayOfWeek = (today.getDay() + 6) % 7;
    from.setDate(today.getDate() - dayOfWeek);
  } else if (preset === 'month') {
    from.setDate(1);
  }

  return { from: toLocalISODate(from), to: toLocalISODate(today) };
};

interface OrdersDashboardCardsProps {
  /** Aplica filtros a la tabla al hacer click en una tarjeta. */
  onFilterClick?: (filters: Partial<FilterOrdersDto>) => void;
}

export const OrdersDashboardCards: React.FC<OrdersDashboardCardsProps> = ({
  onFilterClick,
}) => {
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState(() => presetRange('today'));

  /** Rango como instantes ISO locales; lo comparten el dashboard y la tabla. */
  const isoRange = useMemo(
    () => ({
      from: localDayStartISO(range.from),
      to: localDayEndISO(range.to),
    }),
    [range],
  );

  const { data: summary, isLoading } = useOrdersDashboardSummary({
    dateFrom: isoRange.from,
    dateTo: isoRange.to,
  });

  const handlePresetChange = (_: unknown, value: Preset | null) => {
    if (!value) return;
    setPreset(value);
    if (value !== 'custom') setRange(presetRange(value));
  };

  const cards: Array<{
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color: string;
    filterParams?: Partial<FilterOrdersDto>;
  }> = [
    {
      title: 'Ventas del período',
      value: formatCurrency(summary?.salesAmount ?? 0),
      subtitle: `${summary?.salesCount ?? 0} orden(es)`,
      icon: <PointOfSaleIcon fontSize="small" />,
      color: '#34C38F',
      filterParams: {
        orderDateFrom: isoRange.from,
        orderDateTo: isoRange.to,
      },
    },
    {
      title: 'Recaudo del período',
      value: formatCurrency(summary?.collectedAmount ?? 0),
      subtitle: `${summary?.paymentsCount ?? 0} pago(s) recibido(s)`,
      icon: <SavingsIcon fontSize="small" />,
      color: '#22C55E',
    },
    {
      title: 'Saldo por cobrar',
      value: formatCurrency(summary?.receivableAmount ?? 0),
      subtitle: `${summary?.receivableCount ?? 0} orden(es) con saldo`,
      icon: <RequestQuoteIcon fontSize="small" />,
      color: '#F97316',
      filterParams: {
        orderDateFrom: isoRange.from,
        orderDateTo: isoRange.to,
        hasBalance: true,
      },
    },
    {
      title: 'Anticipos pendientes',
      value: `${summary?.pendingAdvancesCount ?? 0} orden(es)`,
      subtitle: 'esperando autorización de Caja',
      icon: <PendingActionsIcon fontSize="small" />,
      color: '#E8465A',
      filterParams: {
        orderDateFrom: isoRange.from,
        orderDateTo: isoRange.to,
        advancePaymentStatus: 'PENDING',
      },
    },
  ];

  return (
    <Box sx={{ mb: 3, mt: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={preset}
          onChange={handlePresetChange}
        >
          <ToggleButton value="today">Hoy</ToggleButton>
          <ToggleButton value="week">Esta semana</ToggleButton>
          <ToggleButton value="month">Este mes</ToggleButton>
          <ToggleButton value="custom">Personalizado</ToggleButton>
        </ToggleButtonGroup>

        {preset === 'custom' && (
          <>
            <DatePicker
              label="Desde"
              value={fromLocalISODate(range.from)}
              onChange={(date) =>
                date && setRange((prev) => ({ ...prev, from: toLocalISODate(date) }))
              }
              slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
            />
            <DatePicker
              label="Hasta"
              value={fromLocalISODate(range.to)}
              onChange={(date) =>
                date && setRange((prev) => ({ ...prev, to: toLocalISODate(date) }))
              }
              slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
            />
          </>
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        {cards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            color={card.color}
            loading={isLoading}
            onClick={
              onFilterClick && card.filterParams
                ? () => onFilterClick(card.filterParams!)
                : undefined
            }
          />
        ))}
      </Box>
    </Box>
  );
};
