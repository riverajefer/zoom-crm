import * as XLSX from 'xlsx';
import {
  HISTORICAL_STATUS_LABELS,
  type HistoricalSale,
} from '../../types/historical-sale.types';

export const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));

/** `saleDate` es una fecha sin hora (medianoche UTC): se muestra sin pasar por la zona local. */
export const formatSaleDate = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const formatNumber = (value: string | number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(value));

/** Dos hojas: una fila por OP y una fila por línea de producto. */
export function exportHistoricalSales(sales: HistoricalSale[]) {
  const header = [
    'Sede',
    'Año',
    'OP',
    'Fecha',
    'Cliente',
    'NIT',
    'Teléfono',
    'Vendedor',
    'Estado',
    'IVA',
    'Total',
    'Recibido',
    'Saldo',
    'Facturación',
    'Factura electrónica',
    'Observaciones',
  ];
  const salesRows = sales.map((s) => [
    s.location.code,
    s.year,
    s.originalNumber,
    formatSaleDate(s.saleDate),
    s.clientName,
    s.clientNit ?? '',
    s.clientPhone ?? '',
    s.sellerName ?? '',
    HISTORICAL_STATUS_LABELS[s.status],
    Number(s.tax),
    Number(s.total),
    Number(s.receivedAmount),
    Number(s.balance),
    s.invoiceStatus ?? '',
    s.electronicInvoiceNumber ?? '',
    s.notes ?? '',
  ]);

  const itemsRows = sales.flatMap((s) =>
    s.items.map((item) => [
      s.location.code,
      s.year,
      s.originalNumber,
      formatSaleDate(s.saleDate),
      s.clientName,
      item.description,
      Number(item.quantity),
      Number(item.unitPrice),
      Number(item.tax),
      Number(item.total),
    ]),
  );

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...salesRows]), 'Ventas');
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['Sede', 'Año', 'OP', 'Fecha', 'Cliente', 'Producto', 'Cantidad', 'Vlr unitario', 'IVA', 'Total'],
      ...itemsRows,
    ]),
    'Líneas',
  );
  XLSX.writeFile(book, `historico-ventas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
