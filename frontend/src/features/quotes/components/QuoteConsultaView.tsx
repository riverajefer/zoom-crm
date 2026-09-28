import React from 'react';
import {
  ConsultaFields,
  ConsultaItemsTable,
  ConsultaLayout,
  ConsultaLinks,
  ConsultaSection,
} from '../../sedes/components/consulta';
import { QuoteStatusChip } from './QuoteStatusChip';
import { generateQuotePdf } from '../utils/generateQuotePdf';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import type { Quote } from '../../../types/quote.types';

/** COT de otra sede en modo consulta. Ver `OrderConsultaView`. */
export const QuoteConsultaView: React.FC<{ quote: Quote }> = ({ quote }) => {
  const advisor = quote.createdBy
    ? `${quote.createdBy.firstName ?? ''} ${quote.createdBy.lastName ?? ''}`.trim() || quote.createdBy.email
    : '-';

  return (
    <ConsultaLayout
      type="COT"
      number={quote.quoteNumber}
      sede={quote.location!}
      status={<QuoteStatusChip status={quote.status} />}
      pdf={{ fileName: `Cotizacion_${quote.quoteNumber}.pdf`, generate: () => generateQuotePdf(quote) }}
    >
      <ConsultaSection title="Resumen">
        <ConsultaFields
          fields={[
            { label: 'Cliente', value: quote.client?.name },
            { label: 'Asesor', value: advisor },
            { label: 'Fecha', value: formatDate(quote.quoteDate) },
            { label: 'Válida hasta', value: quote.validUntil ? formatDate(quote.validUntil) : '-' },
            { label: 'Total', value: formatCurrency(quote.total) },
          ]}
        />
      </ConsultaSection>

      <ConsultaSection title="Ítems">
        <ConsultaItemsTable
          items={(quote.items ?? []).map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: formatCurrency(item.unitPrice),
            total: formatCurrency(item.total),
          }))}
        />
      </ConsultaSection>

      <ConsultaSection title="Documentos relacionados">
        <ConsultaLinks
          links={quote.order ? [{ label: quote.order.orderNumber, to: `/orders/${quote.order.id}` }] : []}
        />
      </ConsultaSection>
    </ConsultaLayout>
  );
};
