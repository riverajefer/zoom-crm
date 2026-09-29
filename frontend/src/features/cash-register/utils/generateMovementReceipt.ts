import jsPDF from 'jspdf';
import logo from '../../../assets/logo-dark.webp';
import {
  COMPANY_INFO,
  PDF_COLORS,
  PDF_FONTS,
  pdfContactLines,
  type PdfSede,
} from '../../../utils/pdfConstants';
import type { CashMovement, CashMovementType } from '../../../types/cash-register.types';
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
  WITHDRAWAL: 'Retiro',
  DEPOSIT: 'Depósito',
};


// Receipt is 80mm wide (thermal printer standard) × flexible height
const PAGE_W = 80;
const MARGIN = 5;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function userName(user?: { firstName?: string; lastName?: string } | null): string {
  if (!user) return '-';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || '-';
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

// ---------------------------------------------------------------------------
// Main: Generate Receipt
// ---------------------------------------------------------------------------

/** @param cashRegister Caja del movimiento; su sede da la dirección y el teléfono del recibo. */
export async function generateMovementReceipt(
  movement: CashMovement,
  cashRegister: { name: string; location?: PdfSede },
): Promise<void> {
  const cashRegisterName = cashRegister.name;
  // Calculate height dynamically
  const baseH = 130;
  const voidExtra = movement.isVoided ? 12 : 0;
  const refExtra = movement.referenceType ? 8 : 0;
  const pageH = baseH + voidExtra + refExtra;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_W, pageH],
  });

  let y = MARGIN;
  const cx = PAGE_W / 2;

  // ── Logo ────────────────────────────────────────────────────
  try {
    const logoData = await loadImage(logo);
    const logoW = 28;
    const logoH = 8;
    doc.addImage(logoData, 'PNG', cx - logoW / 2, y, logoW, logoH);
    y += logoH + 2;
  } catch {
    y += 2;
  }

  // ── Company name ────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(COMPANY_INFO.name, cx, y, { align: 'center' });
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setTextColor(doc, PDF_COLORS.footerText);
  const contact = pdfContactLines(cashRegister.location);
  // La dirección de una sede puede no caber en los 80 mm del recibo.
  for (const line of doc.splitTextToSize(contact.address, CONTENT_W) as string[]) {
    doc.text(line, cx, y, { align: 'center' });
    y += 3;
  }
  doc.text(contact.contact, cx, y, { align: 'center' });
  y += 4;

  drawDashedLine(doc, y);
  y += 3;

  // ── Title: COMPROBANTE DE CAJA ──────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('COMPROBANTE DE CAJA', cx, y, { align: 'center' });
  y += 3.5;

  // Receipt number
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text(movement.receiptNumber, cx, y, { align: 'center' });
  y += 4;

  drawDashedLine(doc, y);
  y += 3;

  // ── Detail rows ─────────────────────────────────────────────
  const isPositive = movement.movementType === 'INCOME' || movement.movementType === 'DEPOSIT';

  const rows: [string, string][] = [
    ['Fecha', formatDate(movement.createdAt)],
    ['Caja', cashRegisterName],
    ['Tipo', MOVEMENT_TYPE_LABELS[movement.movementType]],
    ['Método', PAYMENT_METHOD_LABELS[movement.paymentMethod] || movement.paymentMethod || '-'],
    ['Cajero', userName(movement.performedBy)],
  ];

  if (movement.description) {
    rows.push(['Descripción', movement.description]);
  }

  if (movement.referenceType === 'ORDER' && movement.orderRef) {
    rows.push(['Ref. Orden', `OP ${movement.orderRef.orderNumber}`]);
  } else if (movement.referenceType === 'EXPENSE_ORDER' && movement.expenseOrderRef) {
    rows.push(['Ref. OG', movement.expenseOrderRef.ogNumber]);
  }

  const labelX = MARGIN;
  const valueX = MARGIN + CONTENT_W;

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.label);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text(label, labelX, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.value);
    setTextColor(doc, PDF_COLORS.bodyText);

    // Wrap long values
    const maxW = CONTENT_W - 22;
    const lines = doc.splitTextToSize(value, maxW);
    doc.text(lines, valueX, y, { align: 'right' });
    y += 4 * Math.max(lines.length, 1);
  });

  y += 1;
  drawDashedLine(doc, y);
  y += 4;

  // ── Amount (prominent) ──────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setTextColor(doc, isPositive ? [46, 125, 50] : [211, 47, 47]);
  const sign = isPositive ? '+' : '-';
  doc.text(`${sign} ${formatCurrency(movement.amount)}`, cx, y, { align: 'center' });
  y += 5;

  // ── Voided badge ────────────────────────────────────────────
  if (movement.isVoided) {
    y += 1;
    doc.setFillColor(255, 235, 238);
    doc.roundedRect(MARGIN, y - 3, CONTENT_W, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(211, 47, 47);
    doc.text('ANULADO', cx, y + 1, { align: 'center' });
    if (movement.voidReason) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(movement.voidReason, cx, y + 5, { align: 'center' });
    }
    y += 10;
  }

  y += 1;
  drawDashedLine(doc, y);
  y += 3;

  // ── Footer ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text('Este documento es un comprobante de movimiento de caja.', cx, y, { align: 'center' });
  y += 3;
  doc.text(`Impreso: ${formatDate(new Date().toISOString())}`, cx, y, { align: 'center' });

  // ── Open print dialog in new tab ─────────────────────────────
  const pdfBlob = doc.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(blobUrl, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.focus();
      printWindow.print();
    });
  }
}
