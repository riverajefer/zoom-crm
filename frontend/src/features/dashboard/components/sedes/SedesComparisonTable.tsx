import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { SedeDot } from '../../../../components/layout/LocationSelector';
import { ALL_LOCATIONS } from '../../../../store/locationStore';
import { useSwitchSede } from '../../../sedes/hooks/useSwitchSede';
import type { FilterOrdersDto } from '../../../../types/order.types';
import type { SedeDashboardMetrics, SedesDashboardResponse } from '../../../../types/dashboard.types';
import { formatMoney, formatPercent } from './sedesDashboard.utils';

const TOTAL = 'total';

interface RowDef {
  key: keyof SedeDashboardMetrics;
  label: string;
  format: (value: number | null) => string;
  /** Cifras de venta: la Matriz no vende, así que su celda va vacía. */
  salesOnly?: boolean;
  /** El listado de OP que explica la cifra, con sus filtros. */
  orderFilters?: (range: { dateFrom: string; dateTo: string }) => FilterOrdersDto;
  emphasis?: boolean;
}

const money = (v: number | null) => (v === null ? '—' : formatMoney(v));
const count = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat('es-CO').format(v));
const opsInPeriod = (range: { dateFrom: string; dateTo: string }): FilterOrdersDto => ({
  orderDateFrom: range.dateFrom,
  orderDateTo: range.dateTo,
  excludeAnulado: true,
});

const ROWS: RowDef[] = [
  { key: 'ventas', label: 'Ventas', format: money, salesOnly: true, orderFilters: opsInPeriod, emphasis: true },
  { key: 'ordenes', label: 'OP creadas', format: count, salesOnly: true, orderFilters: opsInPeriod },
  { key: 'ticketPromedio', label: 'Ticket promedio', format: money, salesOnly: true },
  { key: 'conversion', label: 'Conversión COT → OP', format: formatPercent, salesOnly: true },
  { key: 'recaudo', label: 'Recaudo', format: money, salesOnly: true, emphasis: true },
  { key: 'saldoAFavorAplicado', label: 'Saldo a favor aplicado', format: money, salesOnly: true },
  { key: 'gastosOg', label: 'Gastos · OG pagadas', format: money },
  { key: 'gastosCp', label: 'Gastos · abonos a CP', format: money },
  { key: 'gastos', label: 'Gastos', format: money, emphasis: true },
  { key: 'resultado', label: 'Resultado (recaudo − gastos)', format: money, emphasis: true },
  {
    key: 'cartera',
    label: 'Cartera por cobrar (hoy)',
    format: money,
    salesOnly: true,
    orderFilters: () => ({ hasBalance: true, excludeAnulado: true }),
  },
];

interface Props {
  data: SedesDashboardResponse;
  range: { dateFrom: string; dateTo: string };
}

/**
 * Tabla comparativa del dashboard por sede (docs/PLAN_SEDES.md §7): una
 * columna por sede, la Matriz (solo gastos) y el total. Las cifras de OP llevan
 * al listado que las explica, ya en esa sede y ese periodo.
 */
export const SedesComparisonTable: React.FC<Props> = ({ data, range }) => {
  const navigate = useNavigate();
  const switchSede = useSwitchSede();
  const columns = [...data.locations.map((l) => ({ ...l, isTotal: false })), { id: TOTAL, isTotal: true } as const];

  const openList = (locationId: string, filters: FilterOrdersDto) => {
    switchSede(locationId === TOTAL ? ALL_LOCATIONS : locationId);
    navigate('/orders', { state: { orderFilters: filters } });
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Comparativo por sede
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 720, '& td, & th': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                <TableCell>Cifra</TableCell>
                {columns.map((c) => (
                  <TableCell key={c.id} align="right" sx={{ fontWeight: 700 }}>
                    {c.isTotal ? (
                      'Total'
                    ) : (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        <SedeDot color={c.color} />
                        {c.name}
                      </Box>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {ROWS.map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell sx={{ fontWeight: row.emphasis ? 700 : 400 }}>{row.label}</TableCell>
                  {columns.map((c) => {
                    const isMatriz = !c.isTotal && c.type === 'HEADQUARTERS';
                    if (row.salesOnly && isMatriz) {
                      return (
                        <TableCell key={c.id} align="right" sx={{ color: 'text.disabled' }}>
                          —
                        </TableCell>
                      );
                    }
                    const value = data.metrics[c.id]?.[row.key] as number | null;
                    const text = row.format(value);
                    const negative = typeof value === 'number' && value < 0;
                    return (
                      <TableCell
                        key={c.id}
                        align="right"
                        sx={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: row.emphasis || c.isTotal ? 700 : 400,
                          color: negative ? 'error.main' : undefined,
                        }}
                      >
                        {row.orderFilters && value ? (
                          <Button
                            size="small"
                            onClick={() => openList(c.id, row.orderFilters!(range))}
                            sx={{ p: 0, minWidth: 0, fontWeight: 'inherit', fontVariantNumeric: 'tabular-nums' }}
                            aria-label={`Ver en el listado de OP: ${row.label}, ${c.isTotal ? 'todas las sedes' : c.name}`}
                          >
                            {text}
                          </Button>
                        ) : (
                          text
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Ventas: OP creadas en el periodo, sin las anuladas. Recaudo: pagos recibidos en el periodo; el saldo a favor
          aplicado va aparte porque ya se había cobrado. Gastos: lo pagado en el periodo (OG pagadas por Caja y abonos a
          CP que no salen de una OG). La Matriz no vende y sus gastos no se reparten entre las sedes.
        </Typography>
      </CardContent>
    </Card>
  );
};
