import jsPDF from 'jspdf';
import logo from '../../../assets/logo-dark.webp';
import type { WorkOrder } from '../../../types/work-order.types';
import { formatDate, formatDateTime } from '../../../utils/formatters';
import {
  COMPANY_INFO,
  PDF_COLORS,
  PDF_FONTS,
  PDF_LAYOUT,
} from '../../../utils/pdfConstants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setTextColor(doc: jsPDF, color: readonly number[]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: readonly number[]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: jsPDF, color: readonly number[]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function calcLineCount(doc: jsPDF, text: string, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  return lines.length;
}

function formatUserName(
  user: { firstName?: string | null; lastName?: string | null; email: string } | null | undefined,
): string {
  if (!user) return '-';
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  return user.email;
}

function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Canvas context error'));
      }
    };
    img.onerror = (e) => reject(e);
  });
}

function drawFooterOnPage(doc: jsPDF, pageIndex: number) {
  const totalPages = doc.getNumberOfPages();
  doc.setPage(pageIndex);

  const sepY = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 4;
  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.2);
  doc.line(PDF_LAYOUT.marginLeft, sepY, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, sepY);

  doc.setFontSize(PDF_FONTS.footer);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.setFont('helvetica', 'normal');

  const footerLine1 = `${COMPANY_INFO.address}, ${COMPANY_INFO.city}`;
  const footerLine2 = `Tel: ${COMPANY_INFO.phones.join(' / ')}  |  ${COMPANY_INFO.email}`;
  const footerLine3 = `Página ${pageIndex} de ${totalPages}`;

  doc.text(footerLine1, PDF_LAYOUT.pageWidth / 2, sepY + 4, { align: 'center' });
  doc.text(footerLine2, PDF_LAYOUT.pageWidth / 2, sepY + 8, { align: 'center' });
  doc.text(footerLine3, PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight, sepY + 8, { align: 'right' });
}

const SERVICES_LIST = [
  ['• Papelería empresarial', '• Cuadernos, agendas', '• Vinilo', '• Banner', '• Etiquetas'],
  ['• Impresión gran formato', '• Impresión sobre rígidos', '• Sublimación textil', '• Roll ups, arañas', '• Calandra'],
  ['• Señalización', '• Promocionales', '• Confección', '• Mugs', '• DTF UV'],
  ['• DTF textil', '• Gorras', '• Bordados'],
];

// ---------------------------------------------------------------------------
// Section drawers
// ---------------------------------------------------------------------------

async function drawHeader(doc: jsPDF): Promise<number> {
  const logoData = await loadImage(logo);
  const logoW = 50;
  const logoH = 15;
  const logoX = (PDF_LAYOUT.pageWidth - logoW) / 2;
  const logoY = 10;
  const barHeight = 3;
  const barY = logoY + logoH / 2 - barHeight / 2;

  doc.addImage(logoData, 'PNG', logoX, logoY, logoW, logoH);

  setFillColor(doc, [41, 171, 226]);
  doc.rect(0, barY, logoX - 5, barHeight, 'F');

  setFillColor(doc, [0, 0, 0]);
  doc.rect(logoX + logoW + 5, barY, PDF_LAYOUT.pageWidth - (logoX + logoW + 5), barHeight, 'F');

  let y = logoY + logoH + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, [0, 0, 0]);
  doc.text('Zoom Publicidad', PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, [41, 171, 226]);
  // TODO(zoom): sitios web reales de Zoom Publicidad
  doc.text('PENDIENTE: sitio web', PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(8);
  setTextColor(doc, [100, 100, 100]);
  doc.text('Cra 28 #10-18, Bogotá D.C - Barrio Ricaurte', PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(
    'Tel: 305 451 8018 / 304 484 8835 / 305 4525079 | hsolutionssas@gmail.com',
    PDF_LAYOUT.pageWidth / 2,
    y,
    { align: 'center' },
  );
  y += 6;

  setDrawColor(doc, [220, 220, 220]);
  doc.setLineWidth(0.3);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setTextColor(doc, [0, 0, 0]);

  const margin = 15;
  const availableWidth = PDF_LAYOUT.pageWidth - margin * 2;
  const colWidth = availableWidth / 4;

  SERVICES_LIST.forEach((col, i) => {
    col.forEach((item, j) => {
      doc.text(item, margin + i * colWidth, y + j * 3.5);
    });
  });

  return y + 5 * 3.5 + 5;
}

function drawWorkOrderTitle(doc: jsPDF, y: number, workOrder: WorkOrder): number {
  const bandHeight = 10;

  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, bandHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, PDF_COLORS.tableHeaderText);

  const textY = y + bandHeight * 0.62;
  doc.text('ORDEN DE TRABAJO', PDF_LAYOUT.marginLeft + 4, textY);
  doc.text(
    workOrder.workOrderNumber,
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - 4,
    textY,
    { align: 'right' },
  );

  return y + bandHeight + 4;
}

function drawInfoSection(doc: jsPDF, y: number, workOrder: WorkOrder): number {
  // Teal top separator
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 5;

  const leftX = PDF_LAYOUT.marginLeft;
  const rightX = PDF_LAYOUT.marginLeft + 95;
  const labelOffset = 40;
  const lineH = 5.5;

  const drawRow = (
    labelLeft: string,
    valueLeft: string,
    labelRight: string,
    valueRight: string,
    atY: number,
  ) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.label);
    setTextColor(doc, PDF_COLORS.sectionTitleText);

    doc.text(labelLeft, leftX, atY);
    doc.text(labelRight, rightX, atY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.value);
    setTextColor(doc, PDF_COLORS.bodyText);

    doc.text(valueLeft, leftX + labelOffset, atY);
    doc.text(valueRight, rightX + labelOffset, atY);
  };

  const deliveryDateText = workOrder.order.deliveryDate
    ? formatDate(workOrder.order.deliveryDate)
    : 'No definida';

  const designerText = workOrder.designer
    ? formatUserName(workOrder.designer)
    : 'No asignado';

  drawRow(
    'N° Orden Pedido:',
    workOrder.order.orderNumber,
    'Cliente:',
    workOrder.order.client.name,
    y,
  );
  y += lineH;

  drawRow(
    'N° Orden Trabajo:',
    workOrder.workOrderNumber,
    'Creado por (OP):',
    formatUserName(workOrder.order.createdBy),
    y,
  );
  y += lineH;

  drawRow(
    'Fecha Creación:',
    formatDateTime(workOrder.createdAt),
    'Asesor OT:',
    formatUserName(workOrder.advisor),
    y,
  );
  y += lineH;

  drawRow(
    'Fecha Entrega:',
    deliveryDateText,
    'Diseñador:',
    designerText,
    y,
  );
  y += lineH;

  return y + 4;
}

function drawProductsTable(doc: jsPDF, y: number, workOrder: WorkOrder): number {
  // Column widths (total = 180mm)
  const colWidths = [8, 45, 18, 32, 37, 40];
  const colLabels = ['#', 'Descripción', 'Cantidad', 'Áreas Producción', 'Insumos', 'Observaciones'];
  const colAligns: ('center' | 'left' | 'right')[] = ['center', 'left', 'center', 'left', 'left', 'left'];

  const headerHeight = 7;
  const x0 = PDF_LAYOUT.marginLeft;

  // Teal separator above table
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(x0, y, x0 + PDF_LAYOUT.contentWidth, y);
  y += 4;

  // Section title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Productos / Servicios', x0, y);
  y += 5;

  const drawTableHeader = (atY: number) => {
    setFillColor(doc, PDF_COLORS.tableHeaderBg);
    doc.rect(x0, atY, PDF_LAYOUT.contentWidth, headerHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.tableHeader);
    setTextColor(doc, PDF_COLORS.tableHeaderText);

    let cx = x0;
    colLabels.forEach((label, i) => {
      doc.text(label, cx + colWidths[i] / 2, atY + headerHeight * 0.6, { align: 'center' });
      cx += colWidths[i];
    });
  };

  drawTableHeader(y);
  y += headerHeight;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.tableBody);

  for (let idx = 0; idx < workOrder.items.length; idx++) {
    const item = workOrder.items[idx];

    const areasText = item.productionAreas.length > 0
      ? item.productionAreas.map((a) => a.productionArea.name).join(', ')
      : '-';

    const suppliesText = item.supplies.length > 0
      ? item.supplies
          .map((s) => {
            const qty = s.quantity ? ` (${s.quantity})` : '';
            return `${s.supply.name}${qty}`;
          })
          .join(', ')
      : '-';

    const obsText = item.observations || '-';
    const descText = item.productDescription;
    const qtyText = String(item.orderItem.quantity);

    // Calculate required row height
    const descLines = calcLineCount(doc, descText, colWidths[1] - 4);
    const areasLines = calcLineCount(doc, areasText, colWidths[3] - 4);
    const suppliesLines = calcLineCount(doc, suppliesText, colWidths[4] - 4);
    const obsLines = calcLineCount(doc, obsText, colWidths[5] - 4);
    const lineH = 4;
    const minHeight = 7;
    const dynamicRowHeight = Math.max(
      minHeight,
      descLines * lineH + 2,
      areasLines * lineH + 2,
      suppliesLines * lineH + 2,
      obsLines * lineH + 2,
    );

    // Page break check
    if (y + dynamicRowHeight > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 5) {
      doc.addPage();
      y = PDF_LAYOUT.marginTop;
      drawTableHeader(y);
      y += headerHeight;
    }

    // Row background
    const bgColor = idx % 2 === 0 ? [255, 255, 255] : [232, 244, 246];
    setFillColor(doc, bgColor);
    doc.rect(x0, y, PDF_LAYOUT.contentWidth, dynamicRowHeight, 'F');

    // Bottom border
    setDrawColor(doc, PDF_COLORS.borderGray);
    doc.setLineWidth(0.2);
    doc.line(x0, y + dynamicRowHeight, x0 + PDF_LAYOUT.contentWidth, y + dynamicRowHeight);

    setTextColor(doc, PDF_COLORS.bodyText);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);

    let cx = x0;

    // # (index)
    const numTextY = y + dynamicRowHeight / 2 + 1.5;
    doc.text(String(idx + 1), cx + colWidths[0] / 2, numTextY, { align: 'center' });
    cx += colWidths[0];

    // Descripción (multi-line, left)
    const drawMultiline = (text: string, colIndex: number, startX: number) => {
      const lines = doc.splitTextToSize(text, colWidths[colIndex] - 4);
      const blockH = lines.length * lineH;
      const startY = y + (dynamicRowHeight - blockH) / 2 + lineH * 0.7;
      lines.forEach((line: string, li: number) => {
        doc.text(line, startX + 2, startY + li * lineH, { align: colAligns[colIndex] === 'left' ? 'left' : 'center' });
      });
    };

    drawMultiline(descText, 1, cx);
    cx += colWidths[1];

    // Cantidad (center)
    doc.text(qtyText, cx + colWidths[2] / 2, numTextY, { align: 'center' });
    cx += colWidths[2];

    // Áreas de Producción (multi-line, left)
    drawMultiline(areasText, 3, cx);
    cx += colWidths[3];

    // Insumos (multi-line, left)
    drawMultiline(suppliesText, 4, cx);
    cx += colWidths[4];

    // Observaciones (multi-line, left)
    drawMultiline(obsText, 5, cx);

    y += dynamicRowHeight;
  }

  return y + 4;
}

function drawObservations(doc: jsPDF, y: number, workOrder: WorkOrder): number {
  if (!workOrder.observations && !workOrder.fileName) return y;

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Observaciones', PDF_LAYOUT.marginLeft, y);
  y += 5;

  if (workOrder.fileName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);
    setTextColor(doc, PDF_COLORS.bodyText);
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre de archivo: ', PDF_LAYOUT.marginLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.text(workOrder.fileName, PDF_LAYOUT.marginLeft + doc.getTextWidth('Nombre de archivo: '), y);
    y += 5;
  }

  if (workOrder.observations) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);
    setTextColor(doc, PDF_COLORS.bodyText);
    const lines = doc.splitTextToSize(workOrder.observations, PDF_LAYOUT.contentWidth);
    lines.forEach((line: string) => {
      if (y > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 6) {
        doc.addPage();
        y = PDF_LAYOUT.marginTop;
      }
      doc.text(line, PDF_LAYOUT.marginLeft, y);
      y += 4;
    });
  }

  return y + 3;
}

function drawAsesor(doc: jsPDF, y: number, workOrder: WorkOrder): number {
  if (y > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 10) {
    doc.addPage();
    y = PDF_LAYOUT.marginTop;
  }

  const advisorName = formatUserName(workOrder.advisor);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Asesor OT: ', PDF_LAYOUT.marginLeft, y);

  doc.setFont('helvetica', 'bold');
  doc.text(advisorName, PDF_LAYOUT.marginLeft + doc.getTextWidth('Asesor OT: '), y);

  return y + 6;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateWorkOrderPdf(workOrder: WorkOrder): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawHeader(doc);

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.5);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 5;

  y = drawWorkOrderTitle(doc, y, workOrder);
  y = drawInfoSection(doc, y, workOrder);
  y = drawProductsTable(doc, y, workOrder);
  y = drawObservations(doc, y, workOrder);
  drawAsesor(doc, y, workOrder);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    drawFooterOnPage(doc, i);
  }

  return doc;
}
