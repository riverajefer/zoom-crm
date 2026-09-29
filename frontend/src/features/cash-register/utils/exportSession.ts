import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import logo from '../../../assets/logo-dark.webp';
import {
  PDF_COLORS,
  PDF_FONTS,
  PDF_LAYOUT,
  pdfContactLines,
  type PdfSede,
} from '../../../utils/pdfConstants';
import type {
  CashSession,
  CashMovement,
  CashMovementType,
  DenominationCount,
} from '../../../types/cash-register.types';
import { COLOMBIAN_BILLS, COLOMBIAN_COINS } from '../../../types/cash-register.types';
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
  WITHDRAWAL: 'Retiro',
  DEPOSIT: 'Depósito',
};


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

function fmtCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
}

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function fmtDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
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

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 10) {
    doc.addPage();
    return PDF_LAYOUT.marginTop + 5;
  }
  return y;
}

function drawPageFooter(doc: jsPDF, sede: PdfSede) {
  const contact = pdfContactLines(sede);
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const sepY = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 4;
    setDrawColor(doc, PDF_COLORS.borderGray);
    doc.setLineWidth(0.2);
    doc.line(PDF_LAYOUT.marginLeft, sepY, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, sepY);

    doc.setFontSize(PDF_FONTS.footer);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${contact.address}  |  ${contact.contact}`,
      PDF_LAYOUT.pageWidth / 2,
      sepY + 4,
      { align: 'center' },
    );
    doc.text(`Página ${i} de ${totalPages}`, PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight, sepY + 4, {
      align: 'right',
    });
  }
}

// ---------------------------------------------------------------------------
// Computed session data
// ---------------------------------------------------------------------------

interface ComputedSession {
  session: CashSession;
  movements: CashMovement[];
  active: CashMovement[];
  summary: {
    totalIncome: number;
    totalDeposits: number;
    totalExpense: number;
    totalWithdrawals: number;
    net: number;
  };
  closingDenominations: DenominationCount[];
  runningBalance: number;
}

function computeSessionData(session: CashSession): ComputedSession {
  const movements = session.movements || [];
  const active = movements.filter((m) => !m.isVoided);

  const totalIncome = active
    .filter((m) => m.movementType === 'INCOME')
    .reduce((s, m) => s + Number(m.amount), 0);
  const totalDeposits = active
    .filter((m) => m.movementType === 'DEPOSIT')
    .reduce((s, m) => s + Number(m.amount), 0);
  const totalExpense = active
    .filter((m) => m.movementType === 'EXPENSE')
    .reduce((s, m) => s + Number(m.amount), 0);
  const totalWithdrawals = active
    .filter((m) => m.movementType === 'WITHDRAWAL')
    .reduce((s, m) => s + Number(m.amount), 0);
  const net = totalIncome + totalDeposits - totalExpense - totalWithdrawals;

  const base = Number(session.openingAmount);
  const runningBalance = base + net;

  const closingDenominations = session.denominations.filter((d) => d.countType === 'CLOSING');

  return {
    session,
    movements,
    active,
    summary: { totalIncome, totalDeposits, totalExpense, totalWithdrawals, net },
    closingDenominations,
    runningBalance,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PDF EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function drawPdfHeader(doc: jsPDF): Promise<number> {
  const logoData = await loadImage(logo);
  const logoW = 40;
  const logoH = 12;
  doc.addImage(logoData, 'PNG', PDF_LAYOUT.marginLeft, PDF_LAYOUT.marginTop, logoW, logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(
    'Reporte de Sesión de Caja',
    PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight,
    PDF_LAYOUT.marginTop + 7,
    { align: 'right' },
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text(
    `Generado: ${fmtDate(new Date().toISOString())}`,
    PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight,
    PDF_LAYOUT.marginTop + 12,
    { align: 'right' },
  );

  return PDF_LAYOUT.marginTop + logoH + 8;
}

function drawInfoBand(doc: jsPDF, y: number, data: ComputedSession): number {
  const { session, runningBalance, summary } = data;
  const rowH = 7;

  // Title band
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  doc.text(`Sesión — ${session.cashRegister.name}`, PDF_LAYOUT.marginLeft + 4, y + rowH * 0.65);
  doc.text(
    session.status === 'OPEN' ? 'ABIERTA' : 'CERRADA',
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - 4,
    y + rowH * 0.65,
    { align: 'right' },
  );
  y += rowH + 3;

  // Key/value pairs
  const leftX = PDF_LAYOUT.marginLeft;
  const rightX = PDF_LAYOUT.marginLeft + 95;
  const labelW = 32;
  const lineH = 5;

  const pairs = [
    ['Cajero:', userName(session.openedBy), 'Fondo Inicial:', fmtCurrency(session.openingAmount)],
    ['Apertura:', fmtDate(session.openedAt), 'Saldo Sistema:', fmtCurrency(runningBalance)],
    ...(session.closedAt
      ? [['Cierre:', fmtDate(session.closedAt), 'Conteo Físico:', session.closingAmount ? fmtCurrency(session.closingAmount) : '-']]
      : []),
  ];

  pairs.forEach((row) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.label);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text(row[0], leftX, y);
    doc.text(row[2], rightX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.value);
    setTextColor(doc, PDF_COLORS.bodyText);
    doc.text(row[1], leftX + labelW, y);
    doc.text(row[3], rightX + labelW, y);
    y += lineH;
  });

  // Discrepancy
  if (session.discrepancy !== undefined && session.discrepancy !== null) {
    const disc = Number(session.discrepancy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.label);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text('Descuadre:', rightX, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONTS.value);
    setTextColor(doc, disc === 0 ? [46, 125, 50] : disc > 0 ? [237, 108, 2] : [211, 47, 47]);
    const label = disc === 0 ? '$0 (Cuadrada)' : `${disc > 0 ? '+' : ''}${fmtCurrency(disc)} (${disc > 0 ? 'Sobrante' : 'Faltante'})`;
    doc.text(label, rightX + labelW, y);
    y += lineH;
  }

  // Inline summary
  y += 2;
  setFillColor(doc, PDF_COLORS.totalRowBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, 6, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setTextColor(doc, PDF_COLORS.bodyText);
  const items = [
    `Ingresos: +${fmtCurrency(summary.totalIncome)}`,
    `Depósitos: +${fmtCurrency(summary.totalDeposits)}`,
    `Egresos: -${fmtCurrency(summary.totalExpense)}`,
    `Retiros: -${fmtCurrency(summary.totalWithdrawals)}`,
    `Neto: ${summary.net >= 0 ? '+' : ''}${fmtCurrency(summary.net)}`,
  ];
  doc.text(items.join('    |    '), PDF_LAYOUT.pageWidth / 2, y + 4, { align: 'center' });
  y += 8;

  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.2);
  doc.line(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth, y);
  return y + 4;
}

function drawDenominations(doc: jsPDF, startY: number, denoms: DenominationCount[]): number {
  if (denoms.length === 0) return startY;

  let y = ensureSpace(doc, startY, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Conteo de Denominaciones', PDF_LAYOUT.marginLeft, y);
  y += 6;

  const cols = [
    { label: 'Tipo', x: PDF_LAYOUT.marginLeft, w: 25 },
    { label: 'Denominación', x: PDF_LAYOUT.marginLeft + 25, w: 55 },
    { label: 'Cantidad', x: PDF_LAYOUT.marginLeft + 80, w: 45 },
    { label: 'Subtotal', x: PDF_LAYOUT.marginLeft + 125, w: 55 },
  ];
  const rowH = 5;

  // Header
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH + 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  cols.forEach((c) => {
    const align = c.label === 'Subtotal' ? 'right' : c.label === 'Cantidad' ? 'center' : 'left';
    const tx = align === 'right' ? c.x + c.w - 2 : align === 'center' ? c.x + c.w / 2 : c.x + 2;
    doc.text(c.label, tx, y + rowH * 0.72, { align });
  });
  y += rowH + 1;

  let totalAmount = 0;
  let rowIdx = 0;

  const renderGroup = (allDenoms: readonly number[], typeLabel: string) => {
    allDenoms.forEach((denom) => {
      const row = denoms.find((d) => d.denomination === denom);
      if (!row || row.quantity === 0) return;
      const subtotal = denom * row.quantity;
      totalAmount += subtotal;

      y = ensureSpace(doc, y, rowH);
      setFillColor(doc, rowIdx % 2 === 0 ? PDF_COLORS.tableRowEven : PDF_COLORS.tableRowOdd);
      doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(PDF_FONTS.tableBody);
      setTextColor(doc, PDF_COLORS.bodyText);

      const textY = y + rowH * 0.72;
      doc.text(typeLabel, cols[0].x + 2, textY);
      doc.text(fmtCurrency(denom), cols[1].x + 2, textY);
      doc.text(String(row.quantity), cols[2].x + cols[2].w / 2, textY, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(fmtCurrency(subtotal), cols[3].x + cols[3].w - 2, textY, { align: 'right' });

      y += rowH;
      rowIdx++;
    });
  };

  renderGroup(COLOMBIAN_BILLS, 'Billete');
  renderGroup(COLOMBIAN_COINS, 'Moneda');

  // Total row
  y += 1;
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH + 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  doc.text('Total Conteo', cols[0].x + 2, y + rowH * 0.72);
  doc.text(fmtCurrency(totalAmount), cols[3].x + cols[3].w - 2, y + rowH * 0.72, { align: 'right' });
  y += rowH + 3;

  return y;
}

function drawMovementsTable(doc: jsPDF, startY: number, movements: CashMovement[]): number {
  let y = ensureSpace(doc, startY, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text(`Movimientos (${movements.length})`, PDF_LAYOUT.marginLeft, y);
  y += 6;

  if (movements.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(PDF_FONTS.tableBody);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text('Sin movimientos registrados.', PDF_LAYOUT.marginLeft, y);
    return y + 6;
  }

  const cols = [
    { label: '#', x: PDF_LAYOUT.marginLeft, w: 8 },
    { label: 'Recibo', x: PDF_LAYOUT.marginLeft + 8, w: 22 },
    { label: 'Fecha', x: PDF_LAYOUT.marginLeft + 30, w: 26 },
    { label: 'Tipo', x: PDF_LAYOUT.marginLeft + 56, w: 18 },
    { label: 'Descripción', x: PDF_LAYOUT.marginLeft + 74, w: 50 },
    { label: 'Método', x: PDF_LAYOUT.marginLeft + 124, w: 22 },
    { label: 'Monto', x: PDF_LAYOUT.marginLeft + 146, w: 26 },
    { label: 'Estado', x: PDF_LAYOUT.marginLeft + 172, w: 8 },
  ];
  const rowH = 5;

  // Header
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH + 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  cols.forEach((c) => {
    const align = c.label === 'Monto' ? 'right' : 'left';
    const tx = align === 'right' ? c.x + c.w - 1 : c.x + 1;
    doc.text(c.label, tx, y + rowH * 0.72, { align });
  });
  y += rowH + 1;

  movements.forEach((mov, i) => {
    y = ensureSpace(doc, y, rowH + 1);
    const isEven = i % 2 === 0;
    setFillColor(doc, isEven ? PDF_COLORS.tableRowEven : PDF_COLORS.tableRowOdd);
    doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);
    const isVoided = mov.isVoided;
    setTextColor(doc, isVoided ? PDF_COLORS.footerText : PDF_COLORS.bodyText);

    const textY = y + rowH * 0.72;
    doc.text(String(i + 1), cols[0].x + 1, textY);
    doc.text(mov.receiptNumber || '-', cols[1].x + 1, textY);
    doc.text(fmtDateShort(mov.createdAt), cols[2].x + 1, textY);
    doc.text(MOVEMENT_TYPE_LABELS[mov.movementType] || mov.movementType, cols[3].x + 1, textY);

    const desc = mov.description || '-';
    const maxDescW = cols[4].w - 2;
    const clipped = doc.getTextWidth(desc) > maxDescW ? desc.substring(0, 30) + '…' : desc;
    doc.text(clipped, cols[4].x + 1, textY);
    doc.text(PAYMENT_METHOD_LABELS[mov.paymentMethod] || mov.paymentMethod || '-', cols[5].x + 1, textY);

    const isPos = mov.movementType === 'INCOME' || mov.movementType === 'DEPOSIT';
    if (!isVoided) setTextColor(doc, isPos ? [46, 125, 50] : [211, 47, 47]);
    const sign = isPos ? '+' : '-';
    doc.text(`${sign}${fmtCurrency(mov.amount)}`, cols[6].x + cols[6].w - 1, textY, { align: 'right' });

    setTextColor(doc, isVoided ? [211, 47, 47] : [46, 125, 50]);
    doc.setFontSize(6);
    doc.text(isVoided ? 'Anulado' : 'Activo', cols[7].x + 1, textY);

    y += rowH;
  });

  return y + 4;
}

export async function exportSessionPdf(session: CashSession): Promise<void> {
  const data = computeSessionData(session);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawPdfHeader(doc);
  y = drawInfoBand(doc, y, data);
  y = drawDenominations(doc, y, data.closingDenominations);
  y = drawMovementsTable(doc, y, data.movements);

  drawPageFooter(doc, session.cashRegister.location);

  const fileName = `Sesion_${session.cashRegister.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXCEL EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export function exportSessionExcel(session: CashSession): void {
  const data = computeSessionData(session);
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Información de Sesión ──
  const infoRows: (string | number)[][] = [
    ['Reporte de Sesión de Caja'],
    [],
    ['Caja', session.cashRegister.name],
    ['Estado', session.status === 'OPEN' ? 'Abierta' : 'Cerrada'],
    ['Cajero', userName(session.openedBy)],
    ['Apertura', fmtDate(session.openedAt)],
    ...(session.closedAt ? [['Cierre', fmtDate(session.closedAt)] as (string | number)[]] : []),
    [],
    ['Concepto', 'Monto'],
    ['Fondo Inicial', Number(session.openingAmount)],
    ['+ Ingresos', data.summary.totalIncome],
    ['+ Depósitos', data.summary.totalDeposits],
    ['− Egresos', data.summary.totalExpense],
    ['− Retiros', data.summary.totalWithdrawals],
    ['Saldo Sistema', data.runningBalance],
    ...(session.closingAmount ? [['Conteo Físico', Number(session.closingAmount)] as (string | number)[]] : []),
    ...(session.discrepancy !== undefined && session.discrepancy !== null
      ? [['Descuadre', Number(session.discrepancy)] as (string | number)[]]
      : []),
    [],
    ['Movimientos Activos', data.active.length],
    ['Movimientos Anulados', data.movements.length - data.active.length],
    ['Total Movimientos', data.movements.length],
  ];

  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
  wsInfo['!cols'] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Resumen');

  // ── Sheet 2: Denominaciones ──
  if (data.closingDenominations.length > 0) {
    const denomRows: (string | number)[][] = [
      ['Conteo de Denominaciones'],
      [],
      ['Tipo', 'Denominación', 'Cantidad', 'Subtotal'],
    ];

    let totalDenom = 0;
    const addGroup = (allDenoms: readonly number[], typeLabel: string) => {
      allDenoms.forEach((denom) => {
        const row = data.closingDenominations.find((d) => d.denomination === denom);
        if (!row || row.quantity === 0) return;
        const subtotal = denom * row.quantity;
        totalDenom += subtotal;
        denomRows.push([typeLabel, denom, row.quantity, subtotal]);
      });
    };
    addGroup(COLOMBIAN_BILLS, 'Billete');
    addGroup(COLOMBIAN_COINS, 'Moneda');
    denomRows.push([]);
    denomRows.push(['', 'Total Conteo', '', totalDenom]);

    const wsDenom = XLSX.utils.aoa_to_sheet(denomRows);
    wsDenom['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsDenom, 'Denominaciones');
  }

  // ── Sheet 3: Movimientos ──
  if (data.movements.length > 0) {
    const movHeaders = ['#', 'Recibo', 'Fecha', 'Tipo', 'Descripción', 'Método de Pago', 'Monto', 'Estado', 'Referencia', 'Realizado por'];
    const movRows: (string | number)[][] = [movHeaders];

    data.movements.forEach((mov, i) => {
      const isPos = mov.movementType === 'INCOME' || mov.movementType === 'DEPOSIT';
      const amount = Number(mov.amount) * (isPos ? 1 : -1);
      const ref = mov.referenceType === 'ORDER' && mov.orderRef
        ? `OP ${mov.orderRef.orderNumber}`
        : mov.referenceType === 'EXPENSE_ORDER' && mov.expenseOrderRef
          ? `OG ${mov.expenseOrderRef.ogNumber}`
          : '';

      movRows.push([
        i + 1,
        mov.receiptNumber,
        fmtDate(mov.createdAt),
        MOVEMENT_TYPE_LABELS[mov.movementType] || mov.movementType,
        mov.description || '-',
        PAYMENT_METHOD_LABELS[mov.paymentMethod] || mov.paymentMethod || '-',
        amount,
        mov.isVoided ? 'Anulado' : 'Activo',
        ref,
        userName(mov.performedBy),
      ]);
    });

    const wsMov = XLSX.utils.aoa_to_sheet(movRows);
    wsMov['!cols'] = [
      { wch: 5 },   // #
      { wch: 14 },  // Recibo
      { wch: 20 },  // Fecha
      { wch: 12 },  // Tipo
      { wch: 32 },  // Descripción
      { wch: 16 },  // Método
      { wch: 16 },  // Monto
      { wch: 10 },  // Estado
      { wch: 14 },  // Referencia
      { wch: 20 },  // Realizado por
    ];
    XLSX.utils.book_append_sheet(wb, wsMov, 'Movimientos');
  }

  const fileName = `Sesion_${session.cashRegister.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
