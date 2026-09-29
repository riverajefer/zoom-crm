import jsPDF from 'jspdf';
import logo from '../../../assets/logo-dark.webp';
import type { PayrollItem } from '../../../types/payroll-item.types';
import type { PayrollEmployee } from '../../../types/payroll-employee.types';
import type { PayrollPeriod } from '../../../types/payroll-period.types';
import {
  COMPANY_INFO,
  pdfContactLines,
  PDF_COLORS,
  PDF_FONTS,
  PDF_LAYOUT,
} from '../../../utils/pdfConstants';
import { pesosEnLetras } from './numeroALetras';

/**
 * Lo único que el desprendible necesita del periodo. Un `PayrollPeriod` completo
 * encaja, pero también el periodo reducido que devuelve el historial del empleado.
 */
export type SlipPeriod = Pick<PayrollPeriod, 'name' | 'startDate' | 'endDate'>;

/** Bloque de empleado que usa el desprendible. */
export type SlipEmployee = PayrollItem['employee'];

/**
 * Adapta un empleado del módulo de nómina al bloque `employee` del desprendible.
 * Lo usa el historial, donde los registros no traen el empleado embebido.
 */
export function toSlipEmployee(employee: PayrollEmployee): SlipEmployee {
  return {
    id: employee.id,
    employeeType: employee.employeeType,
    monthlySalary: employee.monthlySalary,
    dailyRate: employee.dailyRate,
    identificationType: employee.identificationType,
    identificationNumber: employee.identificationNumber,
    firstName: employee.firstName,
    middleName: employee.middleName,
    firstLastName: employee.firstLastName,
    secondLastName: employee.secondLastName,
    startDate: employee.startDate,
    contractType: employee.contractType,
    eps: employee.eps,
    pensionFund: employee.pensionFund,
    cargo: employee.cargo ? { name: employee.cargo.name } : null,
    user: {
      id: employee.user.id,
      firstName: employee.user.firstName,
      lastName: employee.user.lastName,
      email: employee.user.email,
    },
  };
}

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

function num(value?: string | number | null): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(n) ? 0 : n;
}

function formatCurrency(value?: string | number | null): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num(value));
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateStr));
}

/** Agrupa la cédula en miles: 1234567890 -> 1.234.567.890 */
function formatIdNumber(value?: string | null): string {
  if (!value) return '-';
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const ID_TYPE_LABELS: Record<string, string> = {
  CC: 'C.C.',
  CE: 'C.E.',
  TI: 'T.I.',
  PA: 'Pasaporte',
  PPT: 'PPT',
  NIT: 'NIT',
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FIXED_TERM: 'Término fijo',
  INDEFINITE: 'Término indefinido',
  SERVICE_CONTRACT: 'Prestación de servicios',
  INTERNSHIP: 'Aprendizaje / Práctica',
};

const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  REGULAR: 'Regular (mensual)',
  TEMPORARY: 'Temporal (por día)',
};

/**
 * Nombre del empleado. Prefiere los campos propios del registro de nómina y
 * cae al usuario asociado (y por último al email) cuando no están cargados.
 */
export function employeeFullName(employee: PayrollItem['employee']): string {
  const own = [
    employee.firstName,
    employee.middleName,
    employee.firstLastName,
    employee.secondLastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (own) return own;

  const fromUser = [employee.user?.firstName, employee.user?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fromUser) return fromUser;

  return employee.user?.email ?? 'Empleado';
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
// Conceptos
// ---------------------------------------------------------------------------

/**
 * Y máxima que puede ocupar el contenido antes de invadir el bloque de firmas,
 * que va anclado al pie. Las secciones de largo variable (turnos extra,
 * observaciones) se truncan aquí para que el desprendible quepa en una página.
 */
const CONTENT_MAX_Y = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 26;

/**
 * Las fuentes estándar de jsPDF descartan en silencio los caracteres fuera de
 * Latin-1 (…, —, –), así que los puntos suspensivos van con tres puntos.
 */
const ELLIPSIS = '...';

interface Concept {
  label: string;
  amount: number;
}

/** Devengados del periodo, en el orden en que se muestran. Sin filas en cero. */
export function buildEarnings(item: PayrollItem): Concept[] {
  const extraShiftsTotal = (item.extraShifts ?? []).reduce(
    (acc, s) => acc + num(s.amount),
    0,
  );

  const days = num(item.daysWorked);
  const daytimeHours = num(item.overtimeDaytimeHours);
  const nighttimeHours = num(item.overtimeNighttimeHours);

  const rows: Concept[] = [
    {
      label: days > 0 ? `Salario base proporcional (${days} días)` : 'Salario base proporcional',
      amount: num(item.baseSalary),
    },
    { label: 'Auxilio de transporte', amount: num(item.transportAllowance) },
    {
      label: daytimeHours > 0 ? `Horas extra diurnas (${daytimeHours} h)` : 'Horas extra diurnas',
      amount: num(item.overtimeDaytimeValue),
    },
    {
      label:
        nighttimeHours > 0
          ? `Horas extra nocturnas (${nighttimeHours} h)`
          : 'Horas extra nocturnas',
      amount: num(item.overtimeNighttimeValue),
    },
    { label: 'Día de descanso / vacaciones', amount: num(item.restDayValue) },
    { label: 'Comisiones', amount: num(item.commissions) },
    {
      label: `Turnos extra (${(item.extraShifts ?? []).length})`,
      amount: extraShiftsTotal,
    },
  ];

  return rows.filter((r) => r.amount !== 0);
}

/** Deducciones del periodo. Salud y pensión van juntas porque así se almacenan. */
export function buildDeductions(item: PayrollItem): Concept[] {
  const rows: Concept[] = [
    {
      label: 'Aporte Salud y Pensión (8%)',
      amount: num(item.epsAndPensionDiscount),
    },
    { label: 'Ahorro fondo de empleados', amount: num(item.employeeFundSavings) },
    { label: 'Préstamos', amount: num(item.loans) },
    { label: 'Anticipos', amount: num(item.advances) },
    {
      label: 'Días no remunerados / incapacidad',
      amount: num(item.nonPaidDays),
    },
    { label: 'Descuento día laboral', amount: num(item.workdayDiscount) },
    // Trabajos que el empleado mandó a hacer en la empresa y pidió que se le
    // descontaran. Tiene que salir en la colilla: es plata que él ve de menos.
    { label: 'Órdenes descontadas', amount: num(item.orderDeductions) },
  ];

  return rows.filter((r) => r.amount !== 0);
}

// ---------------------------------------------------------------------------
// Section drawers
// ---------------------------------------------------------------------------

function drawHeader(doc: jsPDF, y: number, logoData: string | null): number {
  const x0 = PDF_LAYOUT.marginLeft;
  const logoW = 38;
  const logoH = 12;

  if (logoData) {
    doc.addImage(logoData, 'PNG', x0, y, logoW, logoH);
  }

  const rightX = x0 + PDF_LAYOUT.contentWidth;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(COMPANY_INFO.name, rightX, y + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text(pdfContactLines(null).address, rightX, y + 8.5, {
    align: 'right',
  });
  doc.text(
    pdfContactLines(null, '  |  ').contact,
    rightX,
    y + 12,
    { align: 'right' },
  );

  return y + Math.max(logoH, 14) + 4;
}

function drawTitleBand(doc: jsPDF, y: number, period: SlipPeriod): number {
  const bandHeight = 10;

  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(PDF_LAYOUT.marginLeft, y, PDF_LAYOUT.contentWidth, bandHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, PDF_COLORS.tableHeaderText);

  const textY = y + bandHeight * 0.62;
  doc.text('COMPROBANTE DE NÓMINA', PDF_LAYOUT.marginLeft + 4, textY);
  doc.text(
    period.name,
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - 4,
    textY,
    { align: 'right' },
  );

  return y + bandHeight + 5;
}

function drawEmployeeInfo(
  doc: jsPDF,
  y: number,
  item: PayrollItem,
  period: SlipPeriod,
): number {
  const employee = item.employee;
  const leftX = PDF_LAYOUT.marginLeft;
  const rightX = PDF_LAYOUT.marginLeft + 95;
  const labelOffset = 32;
  const lineH = 5.5;

  const maxLeftValueWidth = rightX - (leftX + labelOffset) - 3;
  const maxRightValueWidth =
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth - (rightX + labelOffset) - 2;

  const clipText = (text: string, maxWidth: number): string => {
    if (!text || doc.getTextWidth(text) <= maxWidth) return text;
    let clipped = text;
    while (clipped.length > 0 && doc.getTextWidth(clipped + ELLIPSIS) > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    return clipped + ELLIPSIS;
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

    if (valueLeft) {
      doc.text(clipText(valueLeft, maxLeftValueWidth), leftX + labelOffset, atY);
    }
    if (valueRight) {
      doc.text(
        clipText(valueRight, maxRightValueWidth),
        rightX + labelOffset,
        atY,
      );
    }
  };

  const idLabel = employee.identificationType
    ? (ID_TYPE_LABELS[employee.identificationType] ?? employee.identificationType)
    : 'Identificación';

  drawRow(
    'Empleado:',
    employeeFullName(employee),
    'Cargo:',
    employee.cargo?.name ?? '-',
    y,
  );
  y += lineH;

  drawRow(
    `${idLabel}:`,
    formatIdNumber(employee.identificationNumber),
    'Fecha ingreso:',
    formatDate(employee.startDate),
    y,
  );
  y += lineH;

  drawRow(
    'EPS:',
    employee.eps || '-',
    'Fondo pensión:',
    employee.pensionFund || '-',
    y,
  );
  y += lineH;

  drawRow(
    'Contrato:',
    employee.contractType
      ? (CONTRACT_TYPE_LABELS[employee.contractType] ?? employee.contractType)
      : '-',
    'Tipo empleado:',
    EMPLOYEE_TYPE_LABELS[employee.employeeType] ?? employee.employeeType,
    y,
  );
  y += lineH;

  drawRow(
    'Periodo:',
    // Guion simple a propósito: las fuentes estándar de jsPDF (WinAnsi) no
    // tienen la raya larga y la descartan silenciosamente.
    `${formatDate(period.startDate)} a ${formatDate(period.endDate)}`,
    'Días laborados:',
    item.daysWorked != null ? String(num(item.daysWorked)) : '-',
    y,
  );
  y += lineH + 2;

  return y;
}

function drawConceptsTable(doc: jsPDF, y: number, item: PayrollItem): number {
  const x0 = PDF_LAYOUT.marginLeft;
  // Concepto(100) | Devengado(40) | Deducción(40) = 180 = contentWidth
  const colWidths = [100, 40, 40];
  const headerHeight = 7;
  const rowHeight = 6;

  const earnings = buildEarnings(item);
  const deductions = buildDeductions(item);

  // Cabecera de la tabla
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(x0, y, PDF_LAYOUT.contentWidth, headerHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setTextColor(doc, PDF_COLORS.tableHeaderText);

  const headerTextY = y + headerHeight * 0.65;
  doc.text('CONCEPTO', x0 + 3, headerTextY);
  doc.text('DEVENGADO', x0 + colWidths[0] + colWidths[1] - 3, headerTextY, {
    align: 'right',
  });
  doc.text(
    'DEDUCCIÓN',
    x0 + colWidths[0] + colWidths[1] + colWidths[2] - 3,
    headerTextY,
    { align: 'right' },
  );

  y += headerHeight;

  // Filas: primero devengados, luego deducciones
  const rows: Array<{ label: string; earning?: number; deduction?: number }> = [
    ...earnings.map((c) => ({ label: c.label, earning: c.amount })),
    ...deductions.map((c) => ({ label: c.label, deduction: c.amount })),
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.tableBody);

  // Un registro sin valores dejaría la tabla vacía y parecería un documento roto.
  if (rows.length === 0) {
    setFillColor(doc, PDF_COLORS.tableRowEven);
    doc.rect(x0, y, PDF_LAYOUT.contentWidth, rowHeight, 'F');
    doc.setFont('helvetica', 'italic');
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text(
      'Sin conceptos registrados para este periodo.',
      x0 + 3,
      y + rowHeight * 0.68,
    );
    doc.setFont('helvetica', 'normal');
    y += rowHeight;
  }

  rows.forEach((row, idx) => {
    const bgColor = idx % 2 === 0 ? PDF_COLORS.tableRowEven : PDF_COLORS.tableRowOdd;
    setFillColor(doc, bgColor);
    doc.rect(x0, y, PDF_LAYOUT.contentWidth, rowHeight, 'F');

    setTextColor(doc, PDF_COLORS.bodyText);
    const textY = y + rowHeight * 0.68;

    doc.text(row.label, x0 + 3, textY);

    if (row.earning != null) {
      doc.text(
        formatCurrency(row.earning),
        x0 + colWidths[0] + colWidths[1] - 3,
        textY,
        { align: 'right' },
      );
    }
    if (row.deduction != null) {
      doc.text(
        formatCurrency(row.deduction),
        x0 + colWidths[0] + colWidths[1] + colWidths[2] - 3,
        textY,
        { align: 'right' },
      );
    }

    y += rowHeight;
  });

  // Separador antes de totales
  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(x0, y, x0 + PDF_LAYOUT.contentWidth, y);

  // Fila de totales
  const totalEarnings = earnings.reduce((acc, c) => acc + c.amount, 0);
  const totalDeductions = deductions.reduce((acc, c) => acc + c.amount, 0);

  const totalsHeight = 8;
  setFillColor(doc, PDF_COLORS.totalRowBg);
  doc.rect(x0, y, PDF_LAYOUT.contentWidth, totalsHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.totalLabel);
  setTextColor(doc, PDF_COLORS.sectionTitleText);

  const totalsTextY = y + totalsHeight * 0.65;
  doc.text('TOTALES', x0 + 3, totalsTextY);

  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text(
    formatCurrency(totalEarnings),
    x0 + colWidths[0] + colWidths[1] - 3,
    totalsTextY,
    { align: 'right' },
  );
  doc.text(
    formatCurrency(totalDeductions),
    x0 + colWidths[0] + colWidths[1] + colWidths[2] - 3,
    totalsTextY,
    { align: 'right' },
  );

  return y + totalsHeight + 5;
}

function drawNetPay(doc: jsPDF, y: number, item: PayrollItem): number {
  const x0 = PDF_LAYOUT.marginLeft;
  const boxWidth = 90;
  const boxX = x0 + PDF_LAYOUT.contentWidth - boxWidth;
  const boxHeight = 12;

  const stored = num(item.totalPayment);
  const computed =
    buildEarnings(item).reduce((acc, c) => acc + c.amount, 0) -
    buildDeductions(item).reduce((acc, c) => acc + c.amount, 0);

  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(boxX, y, boxWidth, boxHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.totalLabel);
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  doc.text('NETO A PAGAR', boxX + 4, y + boxHeight * 0.62);

  doc.setFontSize(PDF_FONTS.totalValue);
  doc.text(formatCurrency(stored), boxX + boxWidth - 4, y + boxHeight * 0.62, {
    align: 'right',
  });

  y += boxHeight + 4;

  // Valor en letras
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.bodyText);
  const letras = doc.splitTextToSize(
    `Son: ${pesosEnLetras(stored)}`,
    PDF_LAYOUT.contentWidth,
  );
  letras.forEach((line: string) => {
    doc.text(line, x0, y);
    y += 4;
  });

  // El total guardado es la fuente de verdad; si no cuadra con la suma de los
  // conceptos, se advierte en vez de ocultar la diferencia.
  if (Math.round(stored) !== Math.round(computed)) {
    y += 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_FONTS.footer);
    setTextColor(doc, [180, 60, 60]);
    doc.text(
      `Nota: la suma de conceptos (${formatCurrency(computed)}) difiere del total registrado. Verifique el registro de nómina.`,
      x0,
      y,
    );
    y += 4;
  }

  return y + 3;
}

function drawExtraShifts(doc: jsPDF, y: number, item: PayrollItem): number {
  const shifts = item.extraShifts ?? [];
  if (shifts.length === 0) return y;

  const x0 = PDF_LAYOUT.marginLeft;

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(x0, y, x0 + PDF_LAYOUT.contentWidth, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Detalle de turnos extra', x0, y);
  y += 5;

  const colWidths = [30, 110, 40];
  const rowHeight = 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.tableHeader);
  setFillColor(doc, PDF_COLORS.tableHeaderBg);
  doc.rect(x0, y, PDF_LAYOUT.contentWidth, rowHeight, 'F');
  setTextColor(doc, PDF_COLORS.tableHeaderText);
  doc.text('Fecha', x0 + 3, y + rowHeight * 0.72);
  doc.text('Descripción', x0 + colWidths[0] + 3, y + rowHeight * 0.72);
  doc.text('Valor', x0 + PDF_LAYOUT.contentWidth - 3, y + rowHeight * 0.72, {
    align: 'right',
  });
  y += rowHeight;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.tableBody);

  let drawn = 0;
  for (const shift of shifts) {
    // Se reserva una fila para el aviso de "… y N más" si hay que truncar.
    if (y + rowHeight * 2 > CONTENT_MAX_Y && drawn < shifts.length) break;

    const bgColor =
      drawn % 2 === 0 ? PDF_COLORS.tableRowEven : PDF_COLORS.tableRowOdd;
    setFillColor(doc, bgColor);
    doc.rect(x0, y, PDF_LAYOUT.contentWidth, rowHeight, 'F');

    setTextColor(doc, PDF_COLORS.bodyText);
    const textY = y + rowHeight * 0.72;
    doc.text(formatDate(shift.shiftDate), x0 + 3, textY);
    doc.text(
      doc.splitTextToSize(shift.description || '-', colWidths[1] - 6)[0],
      x0 + colWidths[0] + 3,
      textY,
    );
    doc.text(
      formatCurrency(shift.amount),
      x0 + PDF_LAYOUT.contentWidth - 3,
      textY,
      { align: 'right' },
    );

    y += rowHeight;
    drawn += 1;
  }

  if (drawn < shifts.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(PDF_FONTS.footer);
    setTextColor(doc, PDF_COLORS.footerText);
    doc.text(
      `${ELLIPSIS} y ${shifts.length - drawn} turno(s) más. El valor total ya está incluido en los devengados.`,
      x0 + 3,
      y + 3.5,
    );
    y += rowHeight;
  }

  return y + 4;
}

function drawObservations(doc: jsPDF, y: number, item: PayrollItem): number {
  // Si ya no queda espacio útil antes de las firmas, se omite la sección
  // completa en vez de dibujar un título huérfano encima del bloque de firmas.
  if (!item.observations || y + 12 > CONTENT_MAX_Y) return y;

  const x0 = PDF_LAYOUT.marginLeft;

  setDrawColor(doc, PDF_COLORS.tableHeaderBg);
  doc.setLineWidth(0.4);
  doc.line(x0, y, x0 + PDF_LAYOUT.contentWidth, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(PDF_FONTS.sectionTitle);
  setTextColor(doc, PDF_COLORS.sectionTitleText);
  doc.text('Observaciones', x0, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.tableBody);
  setTextColor(doc, PDF_COLORS.bodyText);
  const lines = doc.splitTextToSize(item.observations, PDF_LAYOUT.contentWidth);
  for (const line of lines as string[]) {
    if (y + 4 > CONTENT_MAX_Y) {
      doc.text(ELLIPSIS, x0, y);
      break;
    }
    doc.text(line, x0, y);
    y += 4;
  }

  return y + 3;
}

/** Bloque de firmas, anclado sobre el pie de página. */
function drawSignatures(doc: jsPDF, item: PayrollItem) {
  const x0 = PDF_LAYOUT.marginLeft;
  const y = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_FONTS.footer);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.text(
    'Recibí a satisfacción el valor neto aquí relacionado, correspondiente al periodo liquidado.',
    x0,
    y,
  );

  const lineY = y + 12;
  const lineWidth = 70;
  const rightLineX = x0 + PDF_LAYOUT.contentWidth - lineWidth;

  setDrawColor(doc, PDF_COLORS.bodyText);
  doc.setLineWidth(0.3);
  doc.line(x0, lineY, x0 + lineWidth, lineY);
  doc.line(rightLineX, lineY, rightLineX + lineWidth, lineY);

  doc.setFontSize(PDF_FONTS.label);
  setTextColor(doc, PDF_COLORS.bodyText);
  doc.text('Firma del empleado', x0, lineY + 4);
  doc.text('Firma del empleador', rightLineX, lineY + 4);

  const employee = item.employee;
  if (employee.identificationNumber) {
    doc.setFontSize(PDF_FONTS.footer);
    setTextColor(doc, PDF_COLORS.footerText);
    const idLabel = employee.identificationType
      ? (ID_TYPE_LABELS[employee.identificationType] ?? employee.identificationType)
      : 'ID';
    doc.text(
      `${idLabel} ${formatIdNumber(employee.identificationNumber)}`,
      x0,
      lineY + 8,
    );
  }
}

function drawFooterOnPage(doc: jsPDF, pageIndex: number) {
  const totalPages = doc.getNumberOfPages();
  doc.setPage(pageIndex);

  const sepY = PDF_LAYOUT.pageHeight - PDF_LAYOUT.marginBottom - 4;
  setDrawColor(doc, PDF_COLORS.borderGray);
  doc.setLineWidth(0.2);
  doc.line(
    PDF_LAYOUT.marginLeft,
    sepY,
    PDF_LAYOUT.marginLeft + PDF_LAYOUT.contentWidth,
    sepY,
  );

  doc.setFontSize(PDF_FONTS.footer);
  setTextColor(doc, PDF_COLORS.footerText);
  doc.setFont('helvetica', 'normal');

  doc.text(
    pdfContactLines(null).address,
    PDF_LAYOUT.pageWidth / 2,
    sepY + 4,
    { align: 'center' },
  );
  doc.text(
    pdfContactLines(null, '  |  ').contact,
    PDF_LAYOUT.pageWidth / 2,
    sepY + 8,
    { align: 'center' },
  );
  doc.text(
    `Página ${pageIndex} de ${totalPages}`,
    PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginRight,
    sepY + 8,
    { align: 'right' },
  );
}

// ---------------------------------------------------------------------------
// Composición de una página
// ---------------------------------------------------------------------------

function drawSlip(
  doc: jsPDF,
  item: PayrollItem,
  period: SlipPeriod,
  logoData: string | null,
) {
  let y: number = PDF_LAYOUT.marginTop;

  y = drawHeader(doc, y, logoData);
  y = drawTitleBand(doc, y, period);
  y = drawEmployeeInfo(doc, y, item, period);
  y = drawConceptsTable(doc, y, item);
  y = drawNetPay(doc, y, item);
  y = drawExtraShifts(doc, y, item);
  drawObservations(doc, y, item);

  drawSignatures(doc, item);
}

/** El logo se carga una sola vez por lote; si falla, el PDF sale sin logo. */
async function loadLogo(): Promise<string | null> {
  try {
    return await loadImage(logo);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Desprendible de un solo empleado (una página). */
export async function generatePayrollSlipPdf(
  item: PayrollItem,
  period: SlipPeriod,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoData = await loadLogo();

  drawSlip(doc, item, period, logoData);
  drawFooterOnPage(doc, 1);

  return doc;
}

/** Desprendibles de todo el periodo en un solo PDF, uno por página. */
export async function generatePayrollSlipsPdf(
  items: PayrollItem[],
  period: SlipPeriod,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoData = await loadLogo();

  items.forEach((item, idx) => {
    if (idx > 0) doc.addPage();
    drawSlip(doc, item, period, logoData);
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    drawFooterOnPage(doc, i);
  }

  return doc;
}

/** Nombre de archivo seguro para el desprendible de un empleado. */
export function payrollSlipFileName(
  item: PayrollItem,
  period: SlipPeriod,
): string {
  const slug = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `Desprendible_${slug(employeeFullName(item.employee))}_${slug(period.name)}.pdf`;
}
