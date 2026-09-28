import React from 'react';
import { Chip } from '@mui/material';
import {
  ConsultaFields,
  ConsultaItemsTable,
  ConsultaLayout,
  ConsultaLinks,
  ConsultaSection,
} from '../../sedes/components/consulta';
import { QuoteStatusChip } from '../../quotes/components/QuoteStatusChip';
import { WorkOrderStatusChip } from '../../work-orders/components/WorkOrderStatusChip';
import { generateOrderPdf } from '../utils/generateOrderPdf';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { ORDER_STATUS_CONFIG, type Order } from '../../../types/order.types';
import type { QuoteStatus } from '../../../types/quote.types';

const personName = (p?: { firstName?: string | null; lastName?: string | null; email?: string } | null) =>
  p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email || '-' : '-';

/**
 * OP de otra sede en modo consulta (docs/PLAN_SEDES.md §8): estado, fechas,
 * dinero, asesor, ítems y documentos relacionados. Sin ninguna acción.
 */
export const OrderConsultaView: React.FC<{ order: Order }> = ({ order }) => {
  const status = ORDER_STATUS_CONFIG[order.status];

  // Las OT llegan por ítem (`items[].workOrders`) y, la activa, en la orden.
  const workOrders = new Map<string, { id: string; workOrderNumber: string; status: string }>();
  for (const item of order.items as Array<{ workOrders?: { id: string; workOrderNumber: string; status: string }[] }>) {
    for (const wo of item.workOrders ?? []) workOrders.set(wo.id, wo);
  }
  for (const wo of order.workOrders ?? []) workOrders.set(wo.id, wo);

  const links = [
    ...(order.quote
      ? [
          {
            label: order.quote.quoteNumber,
            to: `/quotes/${order.quote.id}`,
            status: <QuoteStatusChip status={order.quote.status as QuoteStatus} />,
          },
        ]
      : []),
    ...[...workOrders.values()].map((wo) => ({
      label: wo.workOrderNumber,
      to: `/work-orders/${wo.id}`,
      status: <WorkOrderStatusChip status={wo.status} />,
    })),
  ];

  return (
    <ConsultaLayout
      type="OP"
      number={order.orderNumber}
      sede={order.location!}
      status={<Chip size="small" label={status?.label ?? order.status} color={status?.color ?? 'default'} />}
      pdf={{ fileName: `Orden_${order.orderNumber}.pdf`, generate: () => generateOrderPdf(order) }}
    >
      <ConsultaSection title="Resumen">
        <ConsultaFields
          fields={[
            { label: 'Cliente', value: order.client?.name },
            { label: 'Asesor', value: personName(order.createdBy) },
            { label: 'Fecha', value: formatDate(order.orderDate) },
            { label: 'Fecha de entrega', value: order.deliveryDate ? formatDate(order.deliveryDate) : 'Sin fecha' },
            { label: 'Total', value: formatCurrency(order.total) },
            { label: 'Abonado', value: formatCurrency(order.paidAmount) },
            { label: 'Saldo', value: formatCurrency(order.balance) },
          ]}
        />
      </ConsultaSection>

      <ConsultaSection title="Ítems">
        <ConsultaItemsTable
          items={order.items.map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: formatCurrency(item.unitPrice),
            total: formatCurrency(item.total),
          }))}
        />
      </ConsultaSection>

      <ConsultaSection title="Documentos relacionados">
        <ConsultaLinks links={links} />
      </ConsultaSection>
    </ConsultaLayout>
  );
};
