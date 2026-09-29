import jsPDF from 'jspdf';
import {
  COMPANY_INFO,
  PDF_COLORS,
  pdfContactLines,
} from '../../../utils/pdfConstants';
import type { Order } from '../../../types/order.types';

// 80mm thermal printer standard
const PAGE_W = 80;
const MARGIN = 4;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 4;

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}


function setTextColor(doc: jsPDF, color: readonly number[]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function drawDashedLine(doc: jsPDF, y: number) {
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  doc.setLineDashPattern([], 0);
}

function estimateHeight(order: Order): number {
  let h = 10; // top margin
  h += 6;  // company name
  h += 6;  // address (hasta dos líneas) + phones
  h += 5;  // separator + gap
  h += 5;  // "ORDEN DE PEDIDO" title
  h += 4;  // OP number
  h += 4;  // Fecha
  h += 5;  // separator + gap
  h += 5;  // Cliente label + name
  h += 5;  // separator + gap

  // Items: name (may wrap) + description (may wrap) + qty + separator
  for (const item of order.items) {
    const name = item.product?.name ?? item.description;
    h += Math.ceil(name.length / 30) * LINE_H;
    if (item.description) {
      h += Math.ceil(item.description.length / 35) * LINE_H;
    }
    h += LINE_H + 3; // qty + thin separator
  }

  h += 5;  // separator + gap
  h += 4;  // subtotal
  h += 4;  // IVA (always)
  if (parseFloat(order.discountAmount) > 0) h += 4;
  h += 6;  // TOTAL prominent
  h += 4;  // Abonado (always)
  h += 4;  // Saldo (always)
  h += 5;  // Estado + separator + gap

  if (order.notes) {
    h += Math.ceil(order.notes.length / 35) * LINE_H + 6;
  }

  // Atendido por + separator
  h += 8;
  h += 8;  // footer text + print date + bottom margin

  return Math.max(h, 130);
}

export function generateOrderPosReceipt(order: Order): jsPDF {
  const pageH = estimateHeight(order);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_W, pageH],
  });

  let y = MARGIN + 2;
  const cx = PAGE_W / 2;
  const labelX = MARGIN;
  const valueX = MARGIN + CONTENT_W;

  // ── Company name ────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text(COMPANY_INFO.name.toUpperCase(), cx, y, { align: 'center' });
  y += 4;

  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  setTextColor(doc, PDF_COLORS.footerText);
  // Dirección y teléfono de la sede de la OP (docs/PLAN_SEDES.md §9).
  const contact = pdfContactLines(order.location);
  // La dirección de una sede puede no caber en los 80 mm de la tirilla.
  for (const line of doc.splitTextToSize(contact.address, CONTENT_W) as string[]) {
    doc.text(line, cx, y, { align: 'center' });
    y += 3;
  }
  doc.text(contact.contact, cx, y, { align: 'center' });
  y += 4;

  drawDashedLine(doc, y);
  y += 4;

  // ── Title ───────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('ORDEN DE PEDIDO', cx, y, { align: 'center' });
  y += 4;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(`OP: ${order.orderNumber}`, cx, y, { align: 'center' });
  y += 4;
  doc.text(`Fecha: ${formatDate(order.orderDate)}`, cx, y, { align: 'center' });
  y += 5;

  drawDashedLine(doc, y);
  y += 4;

  // ── Client ──────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text('CLIENTE', labelX, y);
  y += 3.5;

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  setTextColor(doc, PDF_COLORS.bodyText);
  const clientLines = doc.splitTextToSize(order.client.name, CONTENT_W);
  doc.text(clientLines, labelX, y);
  y += clientLines.length * LINE_H + 2;

  drawDashedLine(doc, y);
  y += 4;

  // ── Items ───────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text('ARTÍCULOS', labelX, y);
  y += 4;

  for (const item of order.items) {
    const name = item.product?.name ?? item.description;

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    setTextColor(doc, PDF_COLORS.bodyText);
    const nameLines = doc.splitTextToSize(name, CONTENT_W);
    doc.text(nameLines, labelX, y);
    y += nameLines.length * LINE_H;

    if (item.description && item.product) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      setTextColor(doc, PDF_COLORS.footerText);
      const descLines = doc.splitTextToSize(item.description, CONTENT_W - 2);
      doc.text(descLines, labelX + 2, y);
      y += descLines.length * LINE_H;
    }

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text(`Cant: ${item.quantity}`, labelX + 2, y);
    y += LINE_H;

    // Item separator (thin dashed)
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([0.5, 0.5], 0);
    doc.line(MARGIN + 2, y, MARGIN + CONTENT_W - 2, y);
    doc.setLineDashPattern([], 0);
    y += 3;
  }

  drawDashedLine(doc, y);
  y += 4;

  // ── Totals ──────────────────────────────────────────────────
  const printRow = (label: string, value: string) => {
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    setTextColor(doc, PDF_COLORS.bodyText);
    doc.text(label, labelX, y);
    doc.text(value, valueX, y, { align: 'right' });
    y += LINE_H;
  };

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  printRow('Subtotal:', formatCurrency(order.subtotal));

  if (parseFloat(order.retefuenteRate) > 0) {
    const rate = (parseFloat(order.retefuenteRate) * 100).toFixed(3).replace(/\.?0+$/, '');
    const amount = parseFloat(order.subtotal) * parseFloat(order.retefuenteRate);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 40, 40);
    printRow(`Retefuente (${rate}%):`, `- ${formatCurrency(amount.toString())}`);
  }

  if (parseFloat(order.reteICARate) > 0) {
    const rate = (parseFloat(order.reteICARate) * 100).toFixed(3).replace(/\.?0+$/, '');
    const amount = parseFloat(order.subtotal) * parseFloat(order.reteICARate);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 40, 40);
    printRow(`ReteICA (${rate}%):`, `- ${formatCurrency(amount.toString())}`);
  }

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  printRow(`IVA (${Math.round(parseFloat(order.taxRate) * 100)}%):`, formatCurrency(order.tax));

  if (parseFloat(order.reteIVARate) > 0 && parseFloat(order.tax) > 0) {
    const rate = (parseFloat(order.reteIVARate) * 100).toFixed(0);
    const amount = parseFloat(order.tax) * parseFloat(order.reteIVARate);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 40, 40);
    printRow(`ReteIVA (${rate}%):`, `- ${formatCurrency(amount.toString())}`);
  }

  if (parseFloat(order.discountAmount) > 0) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 40, 40);
    printRow('Descuento:', `- ${formatCurrency(order.discountAmount)}`);
  }

  // TOTAL prominente
  y += 1;
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('TOTAL', labelX, y);
  doc.text(formatCurrency(order.total), valueX, y, { align: 'right' });
  y += 5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Abonado:', labelX, y);
  doc.text(formatCurrency(order.paidAmount), valueX, y, { align: 'right' });
  y += LINE_H;

  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 40, 40);
  doc.text('Saldo:', labelX, y);
  doc.text(formatCurrency(Math.abs(parseFloat(order.balance))), valueX, y, { align: 'right' });
  y += LINE_H + 2;

  drawDashedLine(doc, y);
  y += 4;

  // ── Observations ────────────────────────────────────────────
  if (order.notes) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text('OBSERVACIONES', labelX, y);
    y += 3.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    setTextColor(doc, PDF_COLORS.bodyText);
    const noteLines = doc.splitTextToSize(order.notes, CONTENT_W);
    doc.text(noteLines, labelX, y);
    y += noteLines.length * LINE_H + 2;

    drawDashedLine(doc, y);
    y += 4;
  }

  // ── Atendido por ────────────────────────────────────────────
  const attendedBy = [order.createdBy.firstName, order.createdBy.lastName]
    .filter(Boolean)
    .join(' ') || order.createdBy.email;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text('Atendido por:', labelX, y);
  doc.setFont('courier', 'bold');
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(attendedBy, valueX, y, { align: 'right' });
  y += 5;

  drawDashedLine(doc, y);
  y += 4;

  // ── Footer ──────────────────────────────────────────────────
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text('Gracias por su preferencia', cx, y, { align: 'center' });
  y += 3;
  doc.text(`Impreso: ${formatDateTime(new Date().toISOString())}`, cx, y, { align: 'center' });

  return doc;
}
