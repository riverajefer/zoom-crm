import jsPDF from 'jspdf';
import logo from '../../../assets/logo-dark.webp';
import type { Order } from '../../../types/order.types';
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/formatters';
import {
  COMPANY_INFO,
  PDF_COLORS,
  PDF_FONTS,
  PDF_LAYOUT,
} from '../../../utils/pdfConstants';
import axiosInstance from '../../../api/axios';

/** Get string width in mm */
function strWidthMm(doc: jsPDF, text: string): number {
  return doc.getTextWidth(text);
}

/** Load image from URL to Base64 */
async function loadImageFromBlob(url: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch the image with authentication
      const response = await axiosInstance.get(url, {
        responseType: 'blob',
      });

      const blob = response.data;
      const blobUrl = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL('image/png'));
        } else {
          URL.revokeObjectURL(blobUrl);
          reject(new Error('Canvas context error'));
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(blobUrl);
        reject(e);
      };
      img.src = blobUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/** Load image from URL to Base64 (for logo) */
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

const SERVICES_LIST = [
  ['• Papelería empresarial', '• Cuadernos, agendas', '• Vinilo', '• Banner', '• Etiquetas'],
  ['• Impresión gran formato', '• Impresión sobre rígidos', '• Sublimación textil', '• Roll ups, arañas', '• Calandra'],
  ['• Señalización', '• Promocionales', '• Confección', '• Mugs', '• DTF UV'],
  ['• DTF textil', '• Gorras', '• Bordados']
];

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

/** Calculate how many lines a text will occupy given a max width in mm */
function calcLineCount(doc: jsPDF, text: string, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  return lines.length;
}

/** Draw footer on a given page (1-indexed) */
function drawFooterOnPage(doc: jsPDF, pageIndex: number) {
  const totalPages = doc.getNumberOfPages();
  doc.setPage(pageIndex);

  // Separator line above footer
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

// ---------------------------------------------------------------------------
// Section drawers — each receives (doc, y) and returns the new y
// ---------------------------------------------------------------------------

async function drawHeader(doc: jsPDF): Promise<number> {
  const logoData = await loadImage(logo);
  const logoW = 50;
  const logoH = 15; // Aspect ratio approximation
  const logoX = (PDF_LAYOUT.pageWidth - logoW) / 2;
  const logoY = 10;
  const barHeight = 3;
  const barY = logoY + (logoH / 2) - (barHeight / 2);

  // Logo
  doc.addImage(logoData, 'PNG', logoX, logoY, logoW, logoH);

  // Left Bar (lima)
  setFillColor(doc, PDF_COLORS.brandBar);
  // Draw a complex shape or simple bar. Let's do a simple bar and a "hook"
  doc.rect(0, barY, logoX - 5, barHeight, 'F');
  
  // Right Bar (Black)
  setFillColor(doc, [0, 0, 0]);
  doc.rect(logoX + logoW + 5, barY, PDF_LAYOUT.pageWidth - (logoX + logoW + 5), barHeight, 'F');
  
  // Company Info
  let y = logoY + logoH + 8;
  
  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, [0, 0, 0]);
  doc.text('Zoom Publicidad', PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 5;

  // Websites
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, PDF_COLORS.linkText);
  // TODO(zoom): sitios web reales de Zoom Publicidad
  doc.text('PENDIENTE: sitio web', PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 5;

  // Address & Contact
  doc.setFontSize(8);
  setTextColor(doc, [100, 100, 100]); // Gray color for address
  doc.text(`${COMPANY_INFO.address}, ${COMPANY_INFO.city}`, PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`Tel: ${COMPANY_INFO.phones.join(' / ')} | ${COMPANY_INFO.email}`, PDF_LAYOUT.pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Separator
  setDrawColor(doc, [220, 220, 220]);
  doc.setLineWidth(0.3);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight, y);
  y += 5;

  // Services List
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal'); // Font style looks like a techno font in image, using normal for now
  setTextColor(doc, [0, 0, 0]);

  // Distribute 4 columns
  const margin = 15;
  const availableWidth = PDF_LAYOUT.pageWidth - (margin * 2);
  const colWidth = availableWidth / 4;

  SERVICES_LIST.forEach((col, i) => {
    col.forEach((item, j) => {
      doc.text(item, margin + (i * colWidth), y + (j * 3.5));
    });
  });

  return y + (5 * 3.5) + 5;
}

function drawOrderInfo(doc: jsPDF, y: number, order: Order): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.sectionTitleText);

  // Left column labels
  doc.text('Orden:', PDF_LAYOUT.marginLeft, y);
  doc.text('Fecha Orden:', PDF_LAYOUT.marginLeft, y + 5);

  // Left column values
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.value);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(order.orderNumber, PDF_LAYOUT.marginLeft + 30, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDateTime(order.orderDate), PDF_LAYOUT.marginLeft + 30, y + 5);

  // Right column labels
  const rightLabelX = PDF_LAYOUT.marginLeft + 100;
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Fecha Generación:', rightLabelX, y);
  if (order.deliveryDate) {
    doc.text('Fecha Entrega:', rightLabelX, y + 5);
  }

  // Right column values
  doc.setFontSize(PDF_FONTS.value);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(formatDateTime(new Date()), rightLabelX + 38, y);
  if (order.deliveryDate) {
    doc.text(formatDate(order.deliveryDate), rightLabelX + 38, y + 5);
  }

  return y + 14;
}

function drawClientSection(doc: jsPDF, y: number, order: Order): number {
  // Thin teal separator
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);

  y += 4;

  // Section title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Cliente', PDF_LAYOUT.marginLeft, y);

  y += 5;

  // Client name (bold)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.value);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(order.client.name, PDF_LAYOUT.marginLeft, y);
  y += 4.5;

  // Email / Phone (normal, optional)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.label);
  if (order.client.email) {
    doc.text(order.client.email, PDF_LAYOUT.marginLeft, y);
    y += 4;
  }
  if (order.client.phone) {
    doc.text(order.client.phone, PDF_LAYOUT.marginLeft, y);
    y += 4;
  }

  return y + 3;
}

async function drawItemsTable(doc: jsPDF, y: number, order: Order): Promise<number> {
  // Determine if we need an image column
  const hasImages = order.items?.some(item => item.sampleImageId);

  const colWidths = hasImages
    ? [20, 10, 25, 60, 32.5, 32.5] // Imagen | Cant | Producto | Descripción | Val. Unitario | Val. Total
    : [13, 27, 70, 35, 35]; // Cant | Producto | Descripción | Val. Unitario | Val. Total

  const colLabels = hasImages
    ? ['Imagen', 'Cant.', 'Producto', 'Descripción', 'Val. Unitario', 'Val. Total']
    : ['Cant.', 'Producto', 'Descripción', 'Val. Unitario', 'Val. Total'];

  const colAligns: ('center' | 'left' | 'right')[] = hasImages
    ? ['center', 'center', 'left', 'left', 'right', 'right']
    : ['center', 'left', 'left', 'right', 'right'];

  const rowHeight = 6;
  const headerHeight = 7;
  const x0 = PDF_LAYOUT.marginLeft;

  // Load all sample images upfront
  const imageCache: Record<string, string> = {};
  if (hasImages) {
    for (const item of order.items || []) {
      if (item.sampleImageId) {
        try {
          // Use backend proxy endpoint with authentication
          const viewUrl = `/storage/${item.sampleImageId}/view`;
          const imageData = await loadImageFromBlob(viewUrl);
          imageCache[item.sampleImageId] = imageData;
        } catch (error) {
          console.error(`Failed to load image ${item.sampleImageId}:`, error);
        }
      }
    }
  }

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

  for (let idx = 0; idx < order.items.length; idx++) {
    const item = order.items[idx];

    // Calculate required row height based on description wrapping
    const descColIndex = hasImages ? 3 : 2;
    const prodColIndex = hasImages ? 2 : 1;
    const descLines = calcLineCount(doc, item.description, colWidths[descColIndex] - 4);
    const prodLines = calcLineCount(doc, item.product?.name || 'N/A', colWidths[prodColIndex] - 4);
    const maxTextLines = Math.max(descLines, prodLines);
    
    const imageHeight = item.sampleImageId && imageCache[item.sampleImageId] ? 20 : 0;
    const dynamicRowHeight = Math.max(rowHeight, maxTextLines * 4 + 2, imageHeight + 4);

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

    // Row border (bottom)
    setDrawColor(doc, PDF_COLORS.borderGray);
    doc.setLineWidth(0.2);
    doc.line(x0, y + dynamicRowHeight, x0 + PDF_LAYOUT.contentWidth, y + dynamicRowHeight);

    // Cell content
    setTextColor(doc, PDF_COLORS.bodyText);
    const textY = y + dynamicRowHeight * 0.5 + (strWidthMm(doc, 'M') * 0.35);

    const values = hasImages
      ? [
          '', // Image placeholder
          String(item.quantity),
          item.product?.name || 'N/A',
          item.description,
          formatCurrency(item.unitPrice),
          formatCurrency(item.total),
        ]
      : [
          String(item.quantity),
          item.product?.name || 'N/A',
          item.description,
          formatCurrency(item.unitPrice),
          formatCurrency(item.total),
        ];

    let cx = x0;
    values.forEach((val, i) => {
      if (hasImages && i === 0) {
        // Image column
        if (item.sampleImageId && imageCache[item.sampleImageId]) {
          const imgData = imageCache[item.sampleImageId];
          const imgWidth = 18;
          const imgHeight = 18;
          const imgX = cx + (colWidths[i] - imgWidth) / 2;
          const imgY = y + (dynamicRowHeight - imgHeight) / 2;
          doc.addImage(imgData, 'PNG', imgX, imgY, imgWidth, imgHeight);
        }
      } else if ((hasImages && (i === 2 || i === 3)) || (!hasImages && (i === 1 || i === 2))) {
        // Left-aligned with padding, support multi-line (Producto and Descripción)
        const lines = doc.splitTextToSize(val, colWidths[i] - 4);
        const lineH = 4;
        const blockH = lines.length * lineH;
        const startY = y + (dynamicRowHeight - blockH) / 2 + lineH * 0.7;
        lines.forEach((line: string, li: number) => {
          doc.text(line, cx + 2, startY + li * lineH);
        });
      } else if (val !== '') {
        const align = colAligns[i];
        let textX = cx + colWidths[i] / 2;
        if (align === 'right') textX = cx + colWidths[i] - 2;
        if (align === 'left') textX = cx + 2;

        doc.text(val, textX, textY, { align });
      }
      cx += colWidths[i];
    });

    y += dynamicRowHeight;
  }

  return y + 4;
}

function drawFinancials(doc: jsPDF, y: number, order: Order): number {
  // Right-aligned two-column block
  const labelX = PDF_LAYOUT.marginLeft + 95;
  const valueRight = PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth; // right edge for right-aligned values
  const lineH = 5.5;

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.totalLabel);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Subtotal:', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(order.subtotal), valueRight, y, { align: 'right' });
  y += lineH;

  // Retefuente — only if rate > 0
  if (parseFloat(order.retefuenteRate) > 0) {
    const rate = (parseFloat(order.retefuenteRate) * 100).toFixed(3).replace(/\.?0+$/, '');
    const amount = parseFloat(order.subtotal) * parseFloat(order.retefuenteRate);
    doc.setFont('helvetica', 'normal');
    setTextColor(doc, [220, 53, 69]);
    doc.text(`Retefuente (${rate}%):`, labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${formatCurrency(amount.toString())}`, valueRight, y, { align: 'right' });
    setTextColor(doc, PDF_COLORS.bodyText);
    y += lineH;
  }

  // ReteICA — only if rate > 0
  if (parseFloat(order.reteICARate) > 0) {
    const rate = (parseFloat(order.reteICARate) * 100).toFixed(3).replace(/\.?0+$/, '');
    const amount = parseFloat(order.subtotal) * parseFloat(order.reteICARate);
    doc.setFont('helvetica', 'normal');
    setTextColor(doc, [220, 53, 69]);
    doc.text(`ReteICA (${rate}%):`, labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${formatCurrency(amount.toString())}`, valueRight, y, { align: 'right' });
    setTextColor(doc, PDF_COLORS.bodyText);
    y += lineH;
  }

  // IVA — only if tax > 0
  if (parseFloat(order.tax) > 0) {
    const rate = (parseFloat(order.taxRate) * 100).toFixed(1);
    doc.setFont('helvetica', 'normal');
    doc.text(`IVA (${rate}%):`, labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(order.tax), valueRight, y, { align: 'right' });
    y += lineH;
  }

  // ReteIVA — only if rate > 0 and there is IVA
  if (parseFloat(order.reteIVARate) > 0 && parseFloat(order.tax) > 0) {
    const rate = (parseFloat(order.reteIVARate) * 100).toFixed(0);
    const amount = parseFloat(order.tax) * parseFloat(order.reteIVARate);
    doc.setFont('helvetica', 'normal');
    setTextColor(doc, [220, 53, 69]);
    doc.text(`ReteIVA (${rate}%):`, labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${formatCurrency(amount.toString())}`, valueRight, y, { align: 'right' });
    setTextColor(doc, PDF_COLORS.bodyText);
    y += lineH;
  }

  // Prueba de Color
  if (order.requiresColorProof) {
    doc.setFont('helvetica', 'normal');
    doc.text('Prueba de Color:', labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(order.colorProofPrice), valueRight, y, { align: 'right' });
    y += lineH;
  }

  // Descuentos — only if discountAmount > 0
  if (parseFloat(order.discountAmount) > 0) {
    doc.setFont('helvetica', 'normal');
    setTextColor(doc, [220, 53, 69]); // Color rojo para descuentos
    doc.text('Descuentos:', labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${formatCurrency(order.discountAmount)}`, valueRight, y, { align: 'right' });
    setTextColor(doc, PDF_COLORS.bodyText); // Restaurar color
    y += lineH;
  }

  // Separator line
  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.3);
  doc.line(labelX, y + 1, valueRight, y + 1);
  y += 6;

  // Total (larger, bold)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.totalValue);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Total:', labelX, y);
  doc.text(formatCurrency(order.total), valueRight, y, { align: 'right' });
  y += lineH + 1;

  // Abono
  doc.setFontSize(PDF_FONTS.totalLabel);
  doc.setFont('helvetica', 'normal');
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Abono:', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(order.paidAmount), valueRight, y, { align: 'right' });
  y += lineH;

  // Saldo
  doc.setFont('helvetica', 'normal');
  doc.text('Saldo:', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.totalValue);
  doc.text(formatCurrency(order.balance), valueRight, y, { align: 'right' });
  y += lineH + 1;

  return y + 3;
}

function drawNotes(doc: jsPDF, y: number, order: Order): number {
  if (!order.notes && !order.requiresColorProof) return y;

  // Separator
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 4;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Observaciones y Detalles', PDF_LAYOUT.marginLeft, y);
  y += 5;

  // Prueba de color
  if (order.requiresColorProof) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.tableBody);
    setTextColor(doc, PDF_COLORS.linkText);
    doc.text('✓ Requiere prueba de color', PDF_LAYOUT.marginLeft, y);
    y += 5;
  }

  // Text (wrapped)
  if (order.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);
    setTextColor(doc, PDF_COLORS.bodyText);
    const lines = doc.splitTextToSize(order.notes, PDF_LAYOUT.contentWidth);
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

function drawAttendedBy(doc: jsPDF, y: number, order: Order): number {
  // Page-break guard: footer starts at pageHeight - marginBottom - 10
  if (y > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 10) {
    doc.addPage();
    y = PDF_LAYOUT.marginTop;
  }

  const name =
    order.createdBy.firstName && order.createdBy.lastName
      ? `${order.createdBy.firstName} ${order.createdBy.lastName}`
      : order.createdBy.email;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Atendido por: ', PDF_LAYOUT.marginLeft, y);

  doc.setFont('helvetica', 'bold');
  doc.text(name, PDF_LAYOUT.marginLeft + strWidthMm(doc, 'Atendido por: '), y);

  // Move legal notes closer to the footer
  // The footer separator line is at: PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 4
  // We'll place the notes just above that line
  const notesY = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 15;

  // Legal Notes
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setTextColor(doc, [200, 80, 90]); // Softer red color
  
  const note1 = 'NOTA: NO SE ENTREGARÁ TRABAJO SIN CANCELAR LA TOTALIDAD DEL VALOR, SIN EXCEPCIONES.';
  const note2 = 'EN 30 DÍAS VENCE LA FECHA DE ENTREGA, NO SE RESPONDE POR NINGÚN TRABAJO.';

  doc.text(note1, PDF_LAYOUT.pageWidth / 2, notesY, { align: 'center' });
  doc.text(note2, PDF_LAYOUT.pageWidth / 2, notesY + 4, { align: 'center' });

  return y + 6;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateOrderPdf(order: Order): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawHeader(doc);

  // Separator
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.5);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  y += 5;

  y = drawOrderInfo(doc, y, order);
  y = drawClientSection(doc, y, order);
  y = await drawItemsTable(doc, y, order);
  y = drawFinancials(doc, y, order);
  y = drawNotes(doc, y, order);
  drawAttendedBy(doc, y, order);

  // Draw footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    drawFooterOnPage(doc, i);
  }

  return doc;
}
