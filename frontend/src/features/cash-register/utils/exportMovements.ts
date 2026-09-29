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
import type { CashSession, CashMovement, CashMovementType } from '../../../types/cash-register.types';
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

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
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

function formatDateShort(dateStr: string): string {
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

// ---------------------------------------------------------------------------
// PDF Footer
// ---------------------------------------------------------------------------

function drawFooter(doc: jsPDF, sede: PdfSede) {
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
// Check page break
// ---------------------------------------------------------------------------

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 10) {
    doc.addPage();
    return PDF_LAYOUT.marginTop + 5;
  }
  return y;
}

// ---------------------------------------------------------------------------
// PDF Header
// ---------------------------------------------------------------------------

async function drawHeader(doc: jsPDF, title = 'Reporte de Movimientos de Caja'): Promise<number> {
  const logoData = await loadImage(logo);
  const logoW = 40;
  const logoH = 12;
  doc.addImage(logoData, 'PNG', PDF_LAYOUT.marginLeft, PDF_LAYOUT.marginTop, logoW, logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(
    title,
    PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight,
    PDF_LAYOUT.marginTop + 7,
    { align: 'right' },
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text(
    `Generado: ${formatDate(new Date().toISOString())}`,
    PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight,
    PDF_LAYOUT.marginTop + 12,
    { align: 'right' },
  );

  return PDF_LAYOUT.marginTop + logoH + 8;
}

// ---------------------------------------------------------------------------
// Session info band
// ---------------------------------------------------------------------------

function drawSessionInfo(doc: jsPDF, y: number, session: CashSession, runningBalance: number): number {
  const bandH = 8;
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, bandH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  doc.text(`Sesión — ${session.cashRegister.name}`, PDF_LAYOUT.marginLeft + 4, y + bandH * 0.65);
  doc.text(
    `Abierta: ${formatDate(session.openedAt)}`,
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - 4,
    y + bandH * 0.65,
    { align: 'right' },
  );
  y += bandH + 4;

  // Info rows
  const leftX = PDF_LAYOUT.marginLeft;
  const rightX = PDF_LAYOUT.marginLeft + 95;
  const labelW = 30;
  const lineH = 5;

  const pairs = [
    ['Cajero:', userName(session.openedBy), 'Fondo Inicial:', formatCurrency(session.openingAmount)],
    ['Estado:', session.status === 'OPEN' ? 'Abierta' : 'Cerrada', 'Saldo Actual:', formatCurrency(runningBalance)],
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

  y += 2;
  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.2);
  doc.line(leftX, y, leftX + PDF_LAYOUT.contentWidth, y);

  return y + 4;
}

// ---------------------------------------------------------------------------
// Movements table
// ---------------------------------------------------------------------------

function drawMovementsTable(doc: jsPDF, startY: number, movements: CashMovement[]): number {
  let y = startY;
  const cols = [
    { label: '#', x: PDF_LAYOUT.marginLeft, w: 8 },
    { label: 'Recibo', x: PDF_LAYOUT.marginLeft + 8, w: 24 },
    { label: 'Fecha', x: PDF_LAYOUT.marginLeft + 32, w: 28 },
    { label: 'Tipo', x: PDF_LAYOUT.marginLeft + 60, w: 18 },
    { label: 'Descripción', x: PDF_LAYOUT.marginLeft + 78, w: 46 },
    { label: 'Método', x: PDF_LAYOUT.marginLeft + 124, w: 22 },
    { label: 'Monto', x: PDF_LAYOUT.marginLeft + 146, w: 26 },
    { label: 'Estado', x: PDF_LAYOUT.marginLeft + 172, w: 8 },
  ];

  const rowH = 5.5;

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

  // Rows
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

    // #
    doc.text(String(i + 1), cols[0].x + 1, textY);
    // Receipt
    doc.text(mov.receiptNumber || '-', cols[1].x + 1, textY);
    // Date
    doc.text(formatDateShort(mov.createdAt), cols[2].x + 1, textY);
    // Type
    doc.text(MOVEMENT_TYPE_LABELS[mov.movementType] || mov.movementType, cols[3].x + 1, textY);
    // Description (clipped)
    const desc = mov.description || '-';
    const maxDescW = cols[4].w - 2;
    const clipped = doc.getTextWidth(desc) > maxDescW ? desc.substring(0, 28) + '…' : desc;
    doc.text(clipped, cols[4].x + 1, textY);
    // Payment method
    doc.text(PAYMENT_METHOD_LABELS[mov.paymentMethod] || mov.paymentMethod || '-', cols[5].x + 1, textY);
    // Amount
    const isPos = mov.movementType === 'INCOME' || mov.movementType === 'DEPOSIT';
    if (!isVoided) {
      setTextColor(doc, isPos ? [46, 125, 50] : [211, 47, 47]);
    }
    const sign = isPos ? '+' : '-';
    doc.text(`${sign}${formatCurrency(mov.amount)}`, cols[6].x + cols[6].w - 1, textY, { align: 'right' });
    // Status
    setTextColor(doc, isVoided ? [211, 47, 47] : [46, 125, 50]);
    doc.setFontSize(6);
    doc.text(isVoided ? 'Anulado' : 'Activo', cols[7].x + 1, textY);

    y += rowH;
  });

  return y + 3;
}

// ---------------------------------------------------------------------------
// Summary section
// ---------------------------------------------------------------------------

function drawSummary(
  doc: jsPDF,
  startY: number,
  movements: CashMovement[],
): number {
  let y = ensureSpace(doc, startY, 50);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Resumen', PDF_LAYOUT.marginLeft, y);
  y += 6;

  const active = movements.filter((m) => !m.isVoided);
  const types: CashMovementType[] = ['INCOME', 'DEPOSIT', 'EXPENSE', 'WITHDRAWAL'];

  // By type
  const rowH = 5.5;
  const colLabel = PDF_LAYOUT.marginLeft;
  const colCount = PDF_LAYOUT.marginLeft + 50;
  const colTotal = PDF_LAYOUT.marginLeft + 70;

  // Sub-header
  setFillColor(doc, PDF_COLORS.totalRowBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Tipo', colLabel + 1, y + rowH * 0.72);
  doc.text('Registros', colCount, y + rowH * 0.72);
  doc.text('Monto Total', colTotal + 50, y + rowH * 0.72, { align: 'right' });
  y += rowH;

  types.forEach((t, i) => {
    const items = active.filter((m) => m.movementType === t);
    const total = items.reduce((s, m) => s + Number(m.amount), 0);
    const isPos = t === 'INCOME' || t === 'DEPOSIT';

    setFillColor(doc, i % 2 === 0 ? PDF_COLORS.tableRowEven : PDF_COLORS.tableRowOdd);
    doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.tableBody);
    setTextColor(doc, PDF_COLORS.bodyText);
    doc.text(MOVEMENT_TYPE_LABELS[t], colLabel + 1, y + rowH * 0.72);
    doc.text(String(items.length), colCount, y + rowH * 0.72);

    setTextColor(doc, isPos ? [46, 125, 50] : [211, 47, 47]);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${isPos ? '+' : '-'}${formatCurrency(total)}`,
      colTotal + 50,
      y + rowH * 0.72,
      { align: 'right' },
    );
    y += rowH;
  });

  // Totals row
  y += 2;
  const totalIncome = active
    .filter((m) => m.movementType === 'INCOME' || m.movementType === 'DEPOSIT')
    .reduce((s, m) => s + Number(m.amount), 0);
  const totalExpense = active
    .filter((m) => m.movementType === 'EXPENSE' || m.movementType === 'WITHDRAWAL')
    .reduce((s, m) => s + Number(m.amount), 0);
  const net = totalIncome - totalExpense;

  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, rowH + 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  doc.text('Total Ingresos:', colLabel + 1, y + rowH * 0.7);
  doc.text(`+${formatCurrency(totalIncome)}`, colLabel + 55, y + rowH * 0.7);
  doc.text('Total Egresos:', colLabel + 80, y + rowH * 0.7);
  doc.text(`-${formatCurrency(totalExpense)}`, colLabel + 130, y + rowH * 0.7);
  doc.text(`Neto: ${net >= 0 ? '+' : ''}${formatCurrency(net)}`, colTotal + 50, y + rowH * 0.7, {
    align: 'right',
  });

  y += rowH + 3;

  // Counts
  const voided = movements.length - active.length;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text(
    `${active.length} movimientos activos  |  ${voided} anulados  |  ${movements.length} total`,
    PDF_LAYOUT.marginLeft,
    y,
  );

  return y + 6;
}

// ---------------------------------------------------------------------------
// Page Total calculation
// ---------------------------------------------------------------------------

function drawPageTotal(doc: jsPDF, startY: number, label: string, total: number, isPositive: boolean): number {
  let y = ensureSpace(doc, startY, 15) + 3;
  const totalBoxW = 75;
  const startX = PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight - totalBoxW;
  const rowH = 8;

  // Fondo claro para que resalte el texto de color
  setFillColor(doc, PDF_COLORS.tableRowEven);
  doc.rect(startX, y, totalBoxW, rowH, 'F');

  // Borde para separar del resto de la página
  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.2);
  doc.rect(startX, y, totalBoxW, rowH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableBody + 1);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(label, startX + 3, y + rowH * 0.68);

  setTextColor(doc, isPositive ? [46, 125, 50] : [211, 47, 47]);
  const sign = isPositive ? '+' : '-';
  doc.text(`${sign}${formatCurrency(total)}`, startX + totalBoxW - 3, y + rowH * 0.68, { align: 'right' });

  return y + rowH + 5;
}

// ---------------------------------------------------------------------------
// Main: Generate PDF
// ---------------------------------------------------------------------------

export async function exportMovementsPdf(
  session: CashSession,
  movements: CashMovement[],
  runningBalance: number,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawHeader(doc);
  y = drawSessionInfo(doc, y, session, runningBalance);
  y = drawMovementsTable(doc, y, movements);
  y = drawSummary(doc, y, movements);

  const activeMovements = movements.filter((m) => !m.isVoided);

  // Pagina de Ingresos
  const incomes = activeMovements.filter((m) => m.movementType === 'INCOME' || m.movementType === 'DEPOSIT');
  if (incomes.length > 0) {
    doc.addPage();
    y = await drawHeader(doc, 'Reporte de Ingresos');
    y = drawMovementsTable(doc, y, incomes);
    const totalIncomes = incomes.reduce((acc, m) => acc + Number(m.amount), 0);
    y = drawPageTotal(doc, y, 'Total Ingresos:', totalIncomes, true);
  }

  // Pagina de Egresos
  const expenses = activeMovements.filter((m) => m.movementType === 'EXPENSE' || m.movementType === 'WITHDRAWAL');
  if (expenses.length > 0) {
    doc.addPage();
    y = await drawHeader(doc, 'Reporte de Egresos');
    y = drawMovementsTable(doc, y, expenses);
    const totalExpenses = expenses.reduce((acc, m) => acc + Number(m.amount), 0);
    y = drawPageTotal(doc, y, 'Total Egresos:', totalExpenses, false);
  }

  drawFooter(doc, session.cashRegister.location);

  const fileName = `Movimientos_${session.cashRegister.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

// ---------------------------------------------------------------------------
// Main: Export Excel
// ---------------------------------------------------------------------------

export function exportMovementsExcel(
  session: CashSession,
  movements: CashMovement[],
): void {
  const headers = [
    '#',
    'Recibo',
    'Fecha',
    'Tipo',
    'Descripción',
    'Método de Pago',
    'Monto',
    'Estado',
    'Referencia',
    'Realizado por',
  ];

  const getRows = (movs: CashMovement[]) => movs.map((mov, i) => {
    const isPos = mov.movementType === 'INCOME' || mov.movementType === 'DEPOSIT';
    const ref = mov.referenceType === 'ORDER' && mov.orderRef
      ? `OP ${mov.orderRef.orderNumber}`
      : mov.referenceType === 'EXPENSE_ORDER' && mov.expenseOrderRef
        ? `OG ${mov.expenseOrderRef.ogNumber}`
        : '';

    return [
      i + 1,
      mov.receiptNumber || '',
      formatDate(mov.createdAt),
      MOVEMENT_TYPE_LABELS[mov.movementType] || mov.movementType,
      mov.description || '',
      PAYMENT_METHOD_LABELS[mov.paymentMethod] || mov.paymentMethod || '-',
      (isPos ? 1 : -1) * Number(mov.amount),
      mov.isVoided ? 'Anulado' : 'Activo',
      ref,
      userName(mov.performedBy),
    ];
  });

  const wb = XLSX.utils.book_new();

  // Todos los movimientos
  const wsAll = XLSX.utils.aoa_to_sheet([headers, ...getRows(movements)]);
  XLSX.utils.book_append_sheet(wb, wsAll, 'Todos');

  const activeMovements = movements.filter((m) => !m.isVoided);

  // Solo Ingresos
  const incomes = activeMovements.filter((m) => m.movementType === 'INCOME' || m.movementType === 'DEPOSIT');
  const sumIncomes = incomes.reduce((acc, m) => acc + Number(m.amount), 0);
  const incomeRows = getRows(incomes);
  if (incomes.length > 0) {
    incomeRows.push(['', '', '', '', '', 'Total:', sumIncomes, '', '', '']);
  }
  const wsIncomes = XLSX.utils.aoa_to_sheet([headers, ...incomeRows]);
  XLSX.utils.book_append_sheet(wb, wsIncomes, 'Ingresos');

  // Solo Egresos
  const expenses = activeMovements.filter((m) => m.movementType === 'EXPENSE' || m.movementType === 'WITHDRAWAL');
  const sumExpenses = expenses.reduce((acc, m) => acc + Number(m.amount), 0);
  const expenseRows = getRows(expenses);
  if (expenses.length > 0) {
    expenseRows.push(['', '', '', '', '', 'Total:', -Math.abs(sumExpenses), '', '', '']);
  }
  const wsExpenses = XLSX.utils.aoa_to_sheet([headers, ...expenseRows]);
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Egresos');

  const fileName = `Movimientos_${session.cashRegister.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
