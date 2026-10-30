// Definición de columnas para la hoja de detalle "Ítems de Gasto".
// Cada fila representa un ítem de una Orden de Gasto; la columna Nº OG se repite
// para poder relacionar/pivotear contra la hoja resumen de órdenes.

import type {
  ExpenseOrder,
  ExpenseOrderItem,
} from '../../../types/expense-order.types';
import { itemPaymentLabel } from './itemPayment';
import type { ExportColumn } from '../../../utils/excelExport';

/** Fila de la hoja de detalle: un ítem junto a su orden padre. */
export interface ExpenseOrderItemRow {
  order: ExpenseOrder;
  item: ExpenseOrderItem;
}

/** Expande una OG en una fila por cada ítem (para la hoja de detalle). */
export const explodeExpenseOrderItems = (
  eo: ExpenseOrder,
): ExpenseOrderItemRow[] =>
  (eo.items ?? []).map((item) => ({ order: eo, item }));

const productionAreas = (item: ExpenseOrderItem): string =>
  (item.productionAreas ?? [])
    .map((pa) => pa.productionArea?.name ?? '')
    .filter(Boolean)
    .join(', ');

export const EXPENSE_ORDER_ITEM_EXPORT_COLUMNS: ExportColumn<ExpenseOrderItemRow>[] =
  [
    {
      key: 'ogNumber',
      label: 'Nº OG',
      defaultVisible: true,
      getValue: ({ order }) => order.ogNumber,
    },
    {
      key: 'itemName',
      label: 'Ítem',
      defaultVisible: true,
      getValue: ({ item }) => item.name,
    },
    {
      key: 'quantity',
      label: 'Cant.',
      defaultVisible: true,
      numeric: true,
      getValue: ({ item }) => Number(item.quantity ?? 0),
    },
    {
      key: 'unitPrice',
      label: 'Precio Unit.',
      defaultVisible: true,
      numeric: true,
      getValue: ({ item }) => Number(item.unitPrice ?? 0),
    },
    {
      key: 'total',
      label: 'Total',
      defaultVisible: true,
      numeric: true,
      getValue: ({ item }) => Number(item.total ?? 0),
    },
    {
      key: 'paymentMethod',
      label: 'Método de Pago',
      defaultVisible: true,
      getValue: ({ item }) => itemPaymentLabel(item),
    },
    {
      key: 'supplier',
      label: 'Proveedor',
      defaultVisible: true,
      getValue: ({ item }) => item.supplier?.name ?? '',
    },
    {
      key: 'productionArea',
      label: 'Área de Producción',
      defaultVisible: true,
      getValue: ({ item }) => productionAreas(item),
    },
  ];
