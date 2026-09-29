import React from 'react';
import { Box, Card, CardContent, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { SedeDot } from '../../../../components/layout/LocationSelector';
import type { SedesDashboardResponse } from '../../../../types/dashboard.types';
import { formatMoney } from './sedesDashboard.utils';

/**
 * Consumo de insumos por sede: salidas de inventario del periodo (consumo en
 * OT), valoradas al costo del movimiento. El stock es común; lo que se
 * reparte es quién lo consumió (docs/PLAN_SEDES.md §7).
 */
export const SuppliesBySedeTable: React.FC<{ data: SedesDashboardResponse }> = ({ data }) => {
  const { byLocation, top } = data.supplies;
  const sedes = data.locations.filter((l) => l.type !== 'HEADQUARTERS' || byLocation[l.id]);
  const total = Object.values(byLocation).reduce((a, b) => a + b, 0);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6">Consumo de insumos</Typography>
        {top.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No hay consumos de insumos en el periodo.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto', mt: 1 }}>
            <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Insumo</TableCell>
                  {sedes.map((s) => (
                    <TableCell key={s.id} align="right">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        <SedeDot color={s.color} />
                        {s.code === 'MAT' ? 'Matriz' : s.code}
                      </Box>
                    </TableCell>
                  ))}
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {top.map((row) => (
                  <TableRow key={row.supplyId} hover>
                    <TableCell>
                      {row.name}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(row.quantity)} {row.unit ?? ''}
                      </Typography>
                    </TableCell>
                    {sedes.map((s) => (
                      <TableCell key={s.id} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {row.byLocation[s.id] ? formatMoney(row.byLocation[s.id]) : '—'}
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(row.value)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Total consumido</TableCell>
                  {sedes.map((s) => (
                    <TableCell key={s.id} align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(byLocation[s.id] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary">
              Los 10 insumos de mayor valor consumido; el total incluye todos.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
