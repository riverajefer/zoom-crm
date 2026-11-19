import React from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Divider,
  Grid,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import {
  HISTORICAL_STATUS_COLORS,
  HISTORICAL_STATUS_LABELS,
} from '../../../types/historical-sale.types';
import { useHistoricalSale } from '../hooks/useHistoricalSales';
import { formatCurrency, formatNumber, formatSaleDate } from '../utils';

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
      {value || '—'}
    </Typography>
  </Box>
);

interface Props {
  saleId: string | null;
  onClose: () => void;
}

/** Detalle de solo lectura de una OP histórica, con sus líneas y el origen en la planilla. */
export const HistoricalSaleDetailDialog: React.FC<Props> = ({ saleId, onClose }) => {
  const { data: sale, isLoading } = useHistoricalSale(saleId);
  const payments = Object.entries(sale?.paymentsByMethod ?? {});

  return (
    <Dialog open={!!saleId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {sale ? (
          <>
            <SedeDot color={sale.location.color} />
            OP {sale.originalNumber} · {sale.location.name} · {sale.year}
            <Chip
              size="small"
              label={HISTORICAL_STATUS_LABELS[sale.status]}
              color={HISTORICAL_STATUS_COLORS[sale.status]}
            />
          </>
        ) : (
          'Venta histórica'
        )}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <LinearProgress />}
        {sale && (
          <>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6} sm={3}>
                <Field label="Fecha" value={formatSaleDate(sale.saleDate)} />
              </Grid>
              <Grid item xs={6} sm={5}>
                <Field label="Cliente" value={sale.clientName} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <Field label="NIT" value={sale.clientNit} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <Field label="Teléfono" value={sale.clientPhone} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Field label="Vendedor" value={sale.sellerName} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Field label="Facturación" value={sale.invoiceStatus} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Field label="Factura electrónica" value={sale.electronicInvoiceNumber} />
              </Grid>
            </Grid>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Producto</TableCell>
                    <TableCell align="right">Cantidad</TableCell>
                    <TableCell align="right">Vlr unitario</TableCell>
                    <TableCell align="right">IVA</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sale.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell align="right">{formatNumber(item.quantity)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.tax)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} align="right" sx={{ fontWeight: 600 }}>
                      Total
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrency(sale.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={6} sm={3}>
                <Field label="Recibido" value={formatCurrency(sale.receivedAmount)} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Field label="Saldo según la planilla" value={formatCurrency(sale.balance)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Field
                  label="Recibido por medio de pago"
                  value={
                    payments.length
                      ? payments.map(([name, amount]) => `${name}: ${formatCurrency(amount)}`).join('\n')
                      : 'La planilla no lo detalla'
                  }
                />
              </Grid>
              {sale.notes && (
                <Grid item xs={12}>
                  <Field label="Observaciones" value={sale.notes} />
                </Grid>
              )}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary">
              Origen: {sale.sourceFile} › hoja «{sale.sourceSheet}», filas {sale.sourceRows}. Dato de
              consulta: no es una orden del sistema.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};
