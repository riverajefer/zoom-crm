import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, CircularProgress, Stack } from '@mui/material';
import { format, startOfMonth } from 'date-fns';
import { PageHeader } from '../../../components/common/PageHeader';
import { dashboardApi } from '../../../api/dashboard.api';
import { DateRange, DateRangeFilter } from '../components/DateRangeFilter';
import { SedeKpiCard, type KpiSplit } from '../components/sedes/SedeKpiCard';
import { SedesComparisonTable } from '../components/sedes/SedesComparisonTable';
import { SedeTrendMultiples } from '../components/sedes/SedeTrendMultiples';
import { ExpensesByTypeChart } from '../components/sedes/ExpensesByTypeChart';
import { SuppliesBySedeTable } from '../components/sedes/SuppliesBySedeTable';
import { changeRatio, formatMoney } from '../components/sedes/sedesDashboard.utils';
import type { SedeDashboardMetrics, SedesDashboardResponse } from '../../../types/dashboard.types';

const TOTAL = 'total';

const defaultRange = (): DateRange => ({
  dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  dateTo: format(new Date(), 'yyyy-MM-dd'),
});

/** Reparto de una cifra entre las sedes, para la barra de cada tarjeta. */
const splitOf = (data: SedesDashboardResponse, key: keyof SedeDashboardMetrics): KpiSplit[] =>
  data.locations.map((l) => ({ ...l, value: (data.metrics[l.id]?.[key] as number) ?? 0 }));

/**
 * Dashboard consolidado por sede del admin (docs/PLAN_SEDES.md §7): lo que
 * vendió, cobró y gastó cada sede en un periodo, comparado con el anterior.
 * Cubre todas las sedes, sin importar la activa.
 */
export const SedesDashboardPage: React.FC = () => {
  const [range, setRange] = useState<DateRange>(defaultRange);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sedes-dashboard', range.dateFrom, range.dateTo],
    queryFn: () => dashboardApi.getSedes(range),
    staleTime: 60_000,
  });

  const total = data?.metrics[TOTAL];
  const prev = data?.previous[TOTAL];

  return (
    <Box sx={{ pb: 3 }}>
      <PageHeader title="Dashboard por sede" subtitle="Ventas, recaudo, gastos y cartera de cada sede" />

      <Box sx={{ mb: 3 }}>
        <DateRangeFilter value={range} onChange={setRange} />
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}
      {isError && <Alert severity="error">No se pudo cargar el dashboard por sede.</Alert>}

      {data && total && prev && (
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
              gap: 2,
            }}
          >
            <SedeKpiCard label="Ventas" value={total.ventas} change={changeRatio(total.ventas, prev.ventas)} split={splitOf(data, 'ventas')} />
            <SedeKpiCard
              label="Recaudo"
              value={total.recaudo}
              change={changeRatio(total.recaudo, prev.recaudo)}
              note={total.saldoAFavorAplicado > 0 ? `Además, saldo a favor aplicado: ${formatMoney(total.saldoAFavorAplicado)}` : undefined}
              split={splitOf(data, 'recaudo')}
            />
            <SedeKpiCard label="Gastos" value={total.gastos} change={changeRatio(total.gastos, prev.gastos)} split={splitOf(data, 'gastos')} />
            <SedeKpiCard label="Resultado" value={total.resultado} change={changeRatio(total.resultado, prev.resultado)} note="Recaudo − gastos" />
            <SedeKpiCard
              label="Cartera por cobrar"
              value={total.cartera}
              note={`${total.carteraOrdenes} OP con saldo, a hoy`}
              split={splitOf(data, 'cartera')}
            />
          </Box>

          <SedesComparisonTable data={data} range={range} />
          <SedeTrendMultiples data={data} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
            <ExpensesByTypeChart data={data} />
            <SuppliesBySedeTable data={data} />
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default SedesDashboardPage;
