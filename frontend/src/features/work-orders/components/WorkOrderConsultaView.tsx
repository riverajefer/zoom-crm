import React from 'react';
import {
  ConsultaFields,
  ConsultaItemsTable,
  ConsultaLayout,
  ConsultaLinks,
  ConsultaSection,
} from '../../sedes/components/consulta';
import { WorkOrderStatusChip } from './WorkOrderStatusChip';
import { generateWorkOrderPdf } from '../utils/generateWorkOrderPdf';
import { formatDate } from '../../../utils/formatters';
import type { WorkOrder } from '../../../types/work-order.types';

const personName = (p?: { firstName?: string | null; lastName?: string | null; email: string } | null) =>
  p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email : '-';

/** OT de otra sede en modo consulta. Ver `OrderConsultaView`. */
export const WorkOrderConsultaView: React.FC<{ workOrder: WorkOrder }> = ({ workOrder }) => (
  <ConsultaLayout
    type="OT"
    number={workOrder.workOrderNumber}
    sede={workOrder.location!}
    status={<WorkOrderStatusChip status={workOrder.status} />}
    pdf={{ fileName: `OT_${workOrder.workOrderNumber}.pdf`, generate: () => generateWorkOrderPdf(workOrder) }}
  >
    <ConsultaSection title="Resumen">
      <ConsultaFields
        fields={[
          { label: 'Cliente', value: workOrder.order.client.name },
          { label: 'Asesor', value: personName(workOrder.advisor) },
          { label: 'Diseñador', value: personName(workOrder.designer) },
          { label: 'Fecha', value: formatDate(workOrder.createdAt) },
          {
            label: 'Entrega de la OP',
            value: workOrder.order.deliveryDate ? formatDate(workOrder.order.deliveryDate) : 'Sin fecha',
          },
        ]}
      />
    </ConsultaSection>

    <ConsultaSection title="Ítems">
      <ConsultaItemsTable
        items={workOrder.items.map((item) => ({
          id: item.id,
          description: item.productDescription || item.orderItem.description,
          quantity: item.orderItem.quantity,
        }))}
      />
    </ConsultaSection>

    <ConsultaSection title="Documentos relacionados">
      <ConsultaLinks links={[{ label: workOrder.order.orderNumber, to: `/orders/${workOrder.order.id}` }]} />
    </ConsultaSection>
  </ConsultaLayout>
);
