import jsPDF from 'jspdf';
import logo from '../../../assets/logo-dark.webp';
import axiosInstance from '../../../api/axios';
import type { ExpenseOrder } from '../../../types/expense-order.types';
import { EXPENSE_ORDER_STATUS_CONFIG, PAYMENT_METHOD_LABELS } from '../../../types/expense-order.types';
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

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function formatCurrency(value?: string | number | null): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
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

/**
 * Descarga una imagen desde el storage (endpoint autenticado) y la devuelve como
 * data URL. Se usa la descarga vía blob para evitar el "tainting" del canvas que
 * ocurre con URLs firmadas sin cabeceras CORS. Devuelve null si falla o no es imagen.
 */
async function loadImageFromStorage(fileId: string): Promise<string | null> {
  try {
    const response = await axiosInstance.get(`/storage/${fileId}/download`, {
      responseType: 'blob',
    });
    const blob = response.data as Blob;
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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

  setFillColor(doc, PDF_COLORS.brandBar);
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
  setTextColor(doc, PDF_COLORS.linkText);
  // TODO(zoom): sitios web reales de Zoom Publicidad
  doc.text('PENDIENTE: sitio web', PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(8);
  setTextColor(doc, [100, 100, 100]);
  doc.text(`${COMPANY_INFO.address}, ${COMPANY_INFO.city}`, PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(
    `Tel: ${COMPANY_INFO.phones.join(' / ')} | ${COMPANY_INFO.email}`,
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

function drawExpenseOrderTitle(doc: jsPDF, y: number, expenseOrder: ExpenseOrder): number {
  const bandHeight = 10;

  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, bandHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, PDF_COLORS.tableHeaderText);

  const textY = y + bandHeight * 0.62;
  doc.text('ORDEN DE GASTO', PDF_LAYOUT.marginLeft + 4, textY);
  doc.text(
    expenseOrder.ogNumber,
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - 4,
    textY,
    { align: 'right' },
  );

  return y + bandHeight + 4;
}

function drawInfoSection(doc: jsPDF, y: number, expenseOrder: ExpenseOrder): number {
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 5;

  const leftX = PDF_LAYOUT.marginLeft;
  const rightX = PDF_LAYOUT.marginLeft + 95;
  const labelOffset = 42;
  const lineH = 5.5;

  // Max width available for each value column (gap of 3mm before right column starts)
  const maxLeftValueWidth = rightX - (leftX + labelOffset) - 3;
  const maxRightValueWidth = PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - (rightX + labelOffset) - 2;

  const clipText = (doc: jsPDF, text: string, maxWidth: number): string => {
    if (!text || doc.getTextWidth(text) <= maxWidth) return text;
    let clipped = text;
    while (clipped.length > 0 && doc.getTextWidth(clipped + '…') > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    return clipped + '…';
  };

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

    if (labelLeft) doc.text(labelLeft, leftX, atY);
    if (labelRight) doc.text(labelRight, rightX, atY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.value);
    setTextColor(doc, PDF_COLORS.bodyText);

    if (valueLeft) doc.text(clipText(doc, valueLeft, maxLeftValueWidth), leftX + labelOffset, atY);
    if (valueRight) doc.text(clipText(doc, valueRight, maxRightValueWidth), rightX + labelOffset, atY);
  };

  const statusLabel = EXPENSE_ORDER_STATUS_CONFIG[expenseOrder.status]?.label ?? expenseOrder.status;
  const otNumber = expenseOrder.workOrder?.workOrderNumber ?? '-';
  const areaOrMachine = expenseOrder.areaOrMachine ?? '-';

  drawRow(
    'N° OG:',
    expenseOrder.ogNumber,
    'Estado:',
    statusLabel,
    y,
  );
  y += lineH;

  drawRow(
    'Fecha creación:',
    formatDate(expenseOrder.createdAt),
    'OT vinculada:',
    otNumber,
    y,
  );
  y += lineH;

  drawRow(
    'Tipo de gasto:',
    expenseOrder.expenseType.name,
    'Área / Máquina:',
    areaOrMachine,
    y,
  );
  y += lineH;

  drawRow(
    'Subcategoría:',
    expenseOrder.expenseSubcategory.name,
    expenseOrder.workOrder?.order ? 'Cliente:' : '',
    expenseOrder.workOrder?.order?.client?.name ?? '',
    y,
  );
  y += lineH + 2;

  // Second block: people
  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.2);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 4;

  drawRow(
    'Autorizado a:',
    formatUserName(expenseOrder.authorizedTo),
    'Creado por:',
    formatUserName(expenseOrder.createdBy),
    y,
  );
  y += lineH;

  drawRow(
    'Responsable:',
    formatUserName(expenseOrder.responsible),
    expenseOrder.authorizedBy ? 'Autorizado por:' : '',
    expenseOrder.authorizedBy ? formatUserName(expenseOrder.authorizedBy) : '',
    y,
  );
  y += lineH;

  if (expenseOrder.authorizedAt) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.label);
    setTextColor(doc, PDF_COLORS.sectionTitleText);
    doc.text('Fecha autorización:', rightX, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.value);
    setTextColor(doc, PDF_COLORS.bodyText);
    doc.text(formatDate(expenseOrder.authorizedAt), rightX + labelOffset, y);
    y += lineH;
  }

  return y + 4;
}

function drawItemsTable(doc: jsPDF, y: number, expenseOrder: ExpenseOrder): number {
  // Column widths — must sum to PDF_LAYOUT.contentWidth = 180
  // #(7) | Nombre(32) | Descripción(30) | Cant.(13) | P.Unit(22) | Total(22) | Método(20) | Proveedor(22) | Áreas(12)
  const colWidths = [7, 32, 30, 13, 22, 22, 20, 22, 12];
  const colLabels = ['#', 'Nombre', 'Descripción', 'Cant.', 'P. Unit.', 'Total', 'Método pago', 'Proveedor', 'Áreas'];

  const headerHeight = 7;
  const x0 = PDF_LAYOUT.marginLeft;

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(x0, y, x0 + PDF_LAYOUT.contentWidth, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Ítems de Gasto', x0, y);
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

  for (let idx = 0; idx < expenseOrder.items.length; idx++) {
    const item = expenseOrder.items[idx];

    const nameText = item.name;
    const descText = item.description || '-';
    const qtyText = String(item.quantity);
    const unitPriceText = formatCurrency(item.unitPrice);
    const totalText = formatCurrency(item.total);
    const methodText = PAYMENT_METHOD_LABELS[item.paymentMethod] ?? item.paymentMethod;
    const supplierText = item.supplier?.name ?? '-';
    const areasText = item.productionAreas.length > 0
      ? item.productionAreas.map((a) => a.productionArea.name).join(', ')
      : '-';

    const lineH = 4;
    const minHeight = 7;

    const nameLines = calcLineCount(doc, nameText, colWidths[1] - 4);
    const descLines = calcLineCount(doc, descText, colWidths[2] - 4);
    const supplierLines = calcLineCount(doc, supplierText, colWidths[7] - 4);
    const areasLines = calcLineCount(doc, areasText, colWidths[8] - 4);

    const dynamicRowHeight = Math.max(
      minHeight,
      nameLines * lineH + 2,
      descLines * lineH + 2,
      supplierLines * lineH + 2,
      areasLines * lineH + 2,
    );

    // Page break check
    if (y + dynamicRowHeight > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 5) {
      doc.addPage();
      y = PDF_LAYOUT.marginTop;
      drawTableHeader(y);
      y += headerHeight;
    }

    // Row background
    const bgColor = idx % 2 === 0 ? PDF_COLORS.tableRowEven : PDF_COLORS.tableRowOdd;
    setFillColor(doc, bgColor);
    doc.rect(x0, y, PDF_LAYOUT.contentWidth, dynamicRowHeight, 'F');

    setDrawColor(doc, PDF_COLORS.borderGray);
    doc.setLineWidth(0.2);
    doc.line(x0, y + dynamicRowHeight, x0 + PDF_LAYOUT.contentWidth, y + dynamicRowHeight);

    setTextColor(doc, PDF_COLORS.bodyText);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);

    const numTextY = y + dynamicRowHeight / 2 + 1.5;

    const drawMultilineLeft = (text: string, colIndex: number, startX: number) => {
      const lines = doc.splitTextToSize(text, colWidths[colIndex] - 4);
      const blockH = lines.length * lineH;
      const startY = y + (dynamicRowHeight - blockH) / 2 + lineH * 0.7;
      lines.forEach((line: string, li: number) => {
        doc.text(line, startX + 2, startY + li * lineH);
      });
    };

    const drawMultilineRight = (text: string, colIndex: number, startX: number) => {
      const lines = doc.splitTextToSize(text, colWidths[colIndex] - 4);
      const blockH = lines.length * lineH;
      const startY = y + (dynamicRowHeight - blockH) / 2 + lineH * 0.7;
      lines.forEach((line: string, li: number) => {
        doc.text(line, startX + colWidths[colIndex] - 2, startY + li * lineH, { align: 'right' });
      });
    };

    let cx = x0;

    // # (index)
    doc.text(String(idx + 1), cx + colWidths[0] / 2, numTextY, { align: 'center' });
    cx += colWidths[0];

    // Nombre
    drawMultilineLeft(nameText, 1, cx);
    cx += colWidths[1];

    // Descripción
    drawMultilineLeft(descText, 2, cx);
    cx += colWidths[2];

    // Cantidad (center)
    doc.text(qtyText, cx + colWidths[3] / 2, numTextY, { align: 'center' });
    cx += colWidths[3];

    // Precio Unit. (right)
    drawMultilineRight(unitPriceText, 4, cx);
    cx += colWidths[4];

    // Total (right)
    drawMultilineRight(totalText, 5, cx);
    cx += colWidths[5];

    // Método pago (center)
    doc.text(methodText, cx + colWidths[6] / 2, numTextY, { align: 'center' });
    cx += colWidths[6];

    // Proveedor (left)
    drawMultilineLeft(supplierText, 7, cx);
    cx += colWidths[7];

    // Áreas (left)
    drawMultilineLeft(areasText, 8, cx);

    y += dynamicRowHeight;
  }

  return y + 4;
}

function drawFinancialSummary(doc: jsPDF, y: number, expenseOrder: ExpenseOrder): number {
  if (y + 14 > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 5) {
    doc.addPage();
    y = PDF_LAYOUT.marginTop;
  }

  const grandTotal = expenseOrder.items.reduce((sum, item) => sum + parseFloat(item.total || '0'), 0);

  const summaryX = PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - 80;
  const summaryWidth = 80;
  const rowH = 8;

  setFillColor(doc, PDF_COLORS.totalRowBg);
  doc.rect(summaryX, y, summaryWidth, rowH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.totalLabel);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('TOTAL:', summaryX + 4, y + rowH * 0.65);

  doc.setFontSize(PDF_FONTS.totalValue);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(formatCurrency(grandTotal), summaryX + summaryWidth - 4, y + rowH * 0.65, { align: 'right' });

  return y + rowH + 4;
}

function drawObservations(doc: jsPDF, y: number, expenseOrder: ExpenseOrder): number {
  if (!expenseOrder.observations) return y;

  if (y + 14 > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 5) {
    doc.addPage();
    y = PDF_LAYOUT.marginTop;
  }

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Observaciones', PDF_LAYOUT.marginLeft, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.tableBody);
  setTextColor(doc, PDF_COLORS.bodyText);
  const lines = doc.splitTextToSize(expenseOrder.observations, PDF_LAYOUT.contentWidth);
  lines.forEach((line: string) => {
    if (y > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 6) {
      doc.addPage();
      y = PDF_LAYOUT.marginTop;
    }
    doc.text(line, PDF_LAYOUT.marginLeft, y);
    y += 4;
  });

  return y + 3;
}

async function drawReferenceImages(
  doc: jsPDF,
  y: number,
  expenseOrder: ExpenseOrder,
): Promise<number> {
  const itemsWithReference = expenseOrder.items.filter((item) => item.referenceFileId);
  if (itemsWithReference.length === 0) return y;

  const pageLimit = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 5;

  // Section title
  if (y + 12 > pageLimit) {
    doc.addPage();
    y = PDF_LAYOUT.marginTop;
  }

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Imágenes de referencia', PDF_LAYOUT.marginLeft, y);
  y += 6;

  const maxW = 80;
  const maxH = 60;

  for (let idx = 0; idx < itemsWithReference.length; idx++) {
    const item = itemsWithReference[idx];
    const dataUrl = await loadImageFromStorage(item.referenceFileId!);
    if (!dataUrl) continue;

    let props: { width: number; height: number; fileType: string };
    try {
      props = doc.getImageProperties(dataUrl) as typeof props;
    } catch {
      continue;
    }

    // Fit preserving aspect ratio
    let w = maxW;
    let h = (props.height / props.width) * w;
    if (h > maxH) {
      h = maxH;
      w = (props.width / props.height) * h;
    }

    const labelH = 5;
    const blockH = labelH + h + 6;

    if (y + blockH > pageLimit) {
      doc.addPage();
      y = PDF_LAYOUT.marginTop;
    }

    // Item label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.label);
    setTextColor(doc, PDF_COLORS.sectionTitleText);
    doc.text(`Ítem ${idx + 1}: ${item.name}`, PDF_LAYOUT.marginLeft, y);
    y += labelH;

    try {
      doc.addImage(dataUrl, props.fileType, PDF_LAYOUT.marginLeft, y, w, h);
    } catch {
      continue;
    }
    setDrawColor(doc, PDF_COLORS.borderGray);
    doc.setLineWidth(0.2);
    doc.rect(PDF_LAYOUT.marginLeft, y, w, h);

    y += h + 6;
  }

  return y;
}

function drawCreatedBy(doc: jsPDF, y: number, expenseOrder: ExpenseOrder): number {
  if (y > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 10) {
    doc.addPage();
    y = PDF_LAYOUT.marginTop;
  }

  const createdByName = formatUserName(expenseOrder.createdBy);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Creado por: ', PDF_LAYOUT.marginLeft, y);

  doc.setFont('helvetica', 'bold');
  doc.text(createdByName, PDF_LAYOUT.marginLeft + doc.getTextWidth('Creado por: '), y);

  return y + 6;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateExpenseOrderPdf(expenseOrder: ExpenseOrder): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawHeader(doc);

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.5);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 5;

  y = drawExpenseOrderTitle(doc, y, expenseOrder);
  y = drawInfoSection(doc, y, expenseOrder);
  y = drawItemsTable(doc, y, expenseOrder);
  y = drawFinancialSummary(doc, y, expenseOrder);
  y = drawObservations(doc, y, expenseOrder);
  y = await drawReferenceImages(doc, y, expenseOrder);
  drawCreatedBy(doc, y, expenseOrder);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    drawFooterOnPage(doc, i);
  }

  return doc;
}
