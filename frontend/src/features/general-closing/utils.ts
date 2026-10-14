import * as XLSX from 'xlsx';
import {
  REGISTER_DAY_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  TOTAL_COLUMNS,
  type GeneralClosingDay,
} from '../../types/general-closing.types';

export { formatCurrency, formatDateTime, fullName } from '../payment-verifications/utils';
import { formatCurrency, formatDateTime, fullName } from '../payment-verifications/utils';

const BUSINESS_TIMEZONE = 'America/Bogota';

/** Hoy (`YYYY-MM-DD`) en hora de Bogotá: el día del negocio, no el del navegador. */
export const businessToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date());

/** Suma días a un `YYYY-MM-DD` sin pasar por la zona horaria del navegador. */
export const addDays = (day: string, amount: number) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

export const isDay = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** `2026-10-12` → "lun, 12 oct 2026". */
export const formatDay = (day: string) =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/** Color de una diferencia de caja: verde si cuadra, rojo si falta, ámbar si sobra. */
export const discrepancyColor = (value: number | null) => {
  if (value === null) return 'text.disabled';
  if (value === 0) return 'success.main';
  return value < 0 ? 'error.main' : 'warning.main';
};

export const discrepancyLabel = (value: number) =>
  value === 0
    ? 'Cuadrada'
    : `${value < 0 ? 'Faltante' : 'Sobrante'} ${formatCurrency(Math.abs(value))}`;

/** `id` de la tarjeta de una caja, para llevar a ella desde la lista de pendientes. */
export const registerAnchor = (cashRegisterId: string) => `caja-${cashRegisterId}`;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });

export function exportGeneralClosingExcel(day: GeneralClosingDay): void {
  const signed = day.closing?.status === 'CLOSED';
  const header = [
    'Sede',
    'Caja',
    'Estado',
    ...TOTAL_COLUMNS.map((c) => c.label),
    'Revisión',
    'Nota de la revisión',
    'Revisó',
    'Entregó a la Matriz',
    'Base que quedó',
  ];
  const rows: (string | number | null)[][] = [
    ['Cierre general de cajas'],
    ['Día', day.date],
    ['Estado', signed ? 'Cerrado' : 'En revisión'],
    ...(signed && day.closing?.closedAt
      ? [['Cerró', `${fullName(day.closing.closedBy)} · ${formatDateTime(day.closing.closedAt)}`]]
      : []),
    ...(day.closing?.notes ? [['Nota', day.closing.notes]] : []),
    [],
    header,
    ...day.registers.map((row) => [
      row.cashRegister.location.name,
      row.cashRegister.name,
      REGISTER_DAY_STATUS_LABELS[row.status],
      ...TOTAL_COLUMNS.map((c) => row.totals[c.field]),
      row.review ? REVIEW_STATUS_LABELS[row.review.status] : 'Sin revisar',
      row.review?.notes ?? '',
      row.review ? fullName(row.review.reviewedBy) : '',
      row.handover?.amount ?? null,
      row.handover?.baseLeft ?? null,
    ]),
    ['Total', '', '', ...TOTAL_COLUMNS.map((c) => day.totals[c.field])],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = header.map((_, i) => ({ wch: i < 2 ? 18 : i >= header.length - 5 ? 24 : 15 }));
  const book = XLSX.utils.book_new();

  // La primera hoja es la planilla de contabilidad: el consolidado de caja.
  const c = day.consolidated;
  const consolidated: (string | number | null)[][] = [
    ['Consolidado de caja', day.date],
    [],
    ['(+) Valor inicial (base)', c.base],
    ['(+) Retiros del banco', c.cashDeposits],
    ['(+) Ventas (abonos y saldos)', c.cashSales],
    ...c.expenseGroups.map((group) => [`(−) ${group.label}`, group.amount]),
    ...(c.cashWithdrawals > 0 ? [['(−) Consignaciones', c.cashWithdrawals]] : []),
    [],
    ['Total en caja', c.total],
    ['Efectivo en caja', c.counted],
    ['Diferencia', c.difference],
    [],
    ['Recibido en efectivo'],
    ['Sede', 'OP', 'Cliente', 'Valor'],
    ...c.cashReceived.map((line) => [line.location.code, line.reference, line.detail, line.amount]),
    ['Total', '', '', c.cashReceived.reduce((sum, line) => sum + line.amount, 0)],
    [],
    ['Gastos en efectivo'],
    ['Sede', 'Documento', 'Proveedor', 'Valor', 'Tipo de gasto'],
    ...c.cashExpenses.map((line) => [
      line.location.code,
      line.reference,
      line.detail,
      line.amount,
      line.group,
    ]),
    ['Total', '', '', c.cashExpenses.reduce((sum, line) => sum + line.amount, 0)],
  ];
  const consolidatedSheet = XLSX.utils.aoa_to_sheet(consolidated);
  consolidatedSheet['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 34 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(book, consolidatedSheet, 'Consolidado');
  XLSX.utils.book_append_sheet(book, sheet, 'Cajas');

  const sessions: (string | number | null)[][] = [
    ['Caja', 'Apertura', 'Abrió', 'Cierre', 'Cerró', 'Base', 'Esperado', 'Contado', 'Diferencia', 'Nota'],
    ...day.registers.flatMap((row) =>
      row.sessions.map((s) => [
        row.cashRegister.name,
        formatDateTime(s.openedAt),
        fullName(s.openedBy),
        s.closedAt ? formatDateTime(s.closedAt) : 'Abierta',
        s.closedAt ? fullName(s.closedBy) : '',
        Number(s.openingAmount),
        s.systemBalance === null ? null : Number(s.systemBalance),
        s.closingAmount === null ? null : Number(s.closingAmount),
        s.discrepancy === null ? null : Number(s.discrepancy),
        s.notes ?? '',
      ]),
    ),
  ];
  const sessionsSheet = XLSX.utils.aoa_to_sheet(sessions);
  sessionsSheet['!cols'] = sessions[0].map((_, i) => ({ wch: i === 9 ? 40 : 20 }));
  XLSX.utils.book_append_sheet(book, sessionsSheet, 'Sesiones');

  XLSX.writeFile(book, `cierre-general-${day.date}.xlsx`);
}
