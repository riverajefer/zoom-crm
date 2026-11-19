/**
 * Carga el histórico de ventas (solo Zoom) desde las planillas de Excel de
 * órdenes de producción que Zoom llevaba antes del CRM (2023-2025).
 *
 *   npm run prisma:import:historical-sales -- [--dry-run] [--report informe.csv] <archivo.xlsx>...
 *
 * - Cada archivo es un año. De cada libro se toma la hoja de OP con más filas
 *   (en 2025 hay dos: «OPS 2025», hasta octubre, y «OPS 2025 ENE-DIC», completa).
 * - Cada fila es una línea de producto; las filas con el mismo número de OP y
 *   el mismo local forman una venta. Cada local llevaba su propio consecutivo.
 * - Es repetible: reemplaza el año completo de cada archivo. No toca ninguna
 *   otra tabla (`historical_sales` no es `orders`).
 * - `--dry-run` muestra lo que cargaría sin escribir. `--report` deja en un CSV
 *   las filas descartadas o dudosas, para revisarlas con el cliente.
 * - Fuera de localhost exige `CONFIRM_DB_HOST` (ver `assert-zoom-database.ts`).
 *
 * Los archivos tienen datos de clientes: no van al repo.
 */
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { basename } from 'path';
import * as XLSX from 'xlsx';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';
import { HistoricalSaleStatus, Prisma, PrismaClient } from '../src/generated/prisma';
import { assertZoomDatabase } from './assert-zoom-database';

// ─── Lectura de la planilla ────────────────────────────────────────────────

/** Encabezados normalizados: sin tildes, en mayúscula, con un solo espacio. */
const norm = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Columnas de dinero recibido por medio de pago, con el nombre que se guarda. */
const PAYMENT_COLUMNS = [
  'NEQUI',
  'NEQUI ZULLY',
  'NEQUI OSCAR',
  'DATAFONO',
  'BANCO DE BOGOTA',
  'DAVIPLATA',
  'DAVIVIENDA AHORROS',
  'BANCOLOMBIA',
  'EFECTIVO',
];

/** Valores que en la planilla significan "no hay dato". */
const EMPTY = new Set(['', '0', 'NA', 'N/A', 'N.A', 'NAN', '-', 'NO', 'NINGUNO']);
/** Vendedores que en realidad son un estado o la falta de dato. */
const NOT_A_SELLER = new Set([
  'ANULADO',
  'ANULADA',
  'COTIZACION',
  'SIN INFO',
  'SIN IDENTIFICAR',
  'NA',
]);

/** Una línea con un total por encima de esto es un error de fórmula (en 2025 hay una de 165 mil millones). */
const MAX_LINE_TOTAL = 1_000_000_000;

type Cell = string | number | boolean | Date | null | undefined;

interface Columns {
  number: number;
  date: number;
  quantity: number;
  product: number;
  nit: number;
  client: number;
  phone: number;
  unitPrice: number;
  tax: number;
  total: number;
  received: number;
  balance: number;
  local: number;
  seller: number;
  notes: number;
  statusCols: number[];
  invoiceCols: number[];
  invoiceNumber: number;
  payments: { name: string; index: number }[];
}

function mapColumns(header: Cell[]): Columns | null {
  const names = header.map(norm);
  const find = (...candidates: string[]) => names.findIndex((n) => candidates.includes(n));
  const number = find('OP', 'NO.', 'NO', 'N°', 'NUMERO');
  const client = find('CLIENTE');
  const total = find('VLR TOTAL');
  const local = find('LOCAL');
  if (number < 0 || client < 0 || total < 0 || local < 0) return null;

  let seller = find('VENDEDOR');
  // 2023 no tiene encabezado de vendedor: viene en la primera columna sin
  // nombre después de LOCAL.
  if (seller < 0 && names[local + 1] === '') seller = local + 1;

  return {
    number,
    date: find('FECHA'),
    quantity: find('CANTIDAD'),
    product: find('PRODUCTO'),
    nit: find('NIT'),
    client,
    phone: find('TELEFONO'),
    unitPrice: find('VLR UNITARIO'),
    tax: find('IVA'),
    total,
    received: find('VLR RECIBIDO'),
    balance: find('SALDO'),
    local,
    seller,
    notes: find('OBSERVACIONES'),
    statusCols: names
      .map((n, i) => (['ESTADO', 'ESTADO OP', 'ANULADO', 'TIPO DE DOCUMENTO'].includes(n) ? i : -1))
      .filter((i) => i >= 0),
    invoiceCols: names
      .map((n, i) => (n.startsWith('FACTURA ELECTRONICA') ? i : -1))
      .filter((i) => i >= 0),
    invoiceNumber: names.findIndex((n) => /^N.? ?FAC ELECTRONICA$/.test(n)),
    payments: PAYMENT_COLUMNS.map((name) => ({ name, index: names.indexOf(name) })).filter(
      (p) => p.index >= 0,
    ),
  };
}

const text = (row: Cell[], index: number) =>
  index < 0 || row[index] == null ? '' : String(row[index]).replace(/\s+/g, ' ').trim();

const optionalText = (row: Cell[], index: number) => {
  const value = text(row, index);
  return EMPTY.has(norm(value)) ? null : value;
};

/** Número de una celda; acepta "1.500.000", "$ 20,000" o "1 // 2" (toma el primero). */
function num(row: Cell[], index: number): number | null {
  if (index < 0) return null;
  const value = row[index];
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).replace(/[$\s]/g, '').match(/-?[\d.,]+/);
  if (!match) return null;
  let raw = match[0];
  // "1.500.000" o "1,500,000": separadores de miles.
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, '');
  else raw = raw.replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Fecha de la celda como medianoche UTC (la columna es DATE). */
function date(row: Cell[], index: number): Date | null {
  if (index < 0) return null;
  const value = row[index];
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  if (typeof value === 'string') {
    const s = value.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  }
  return null;
}

// ─── Armado de las ventas ──────────────────────────────────────────────────

interface Line {
  excelRow: number;
  quantity: number;
  description: string;
  unitPrice: number;
  tax: number;
  total: number;
  received: number;
  balance: number;
  payments: Record<string, number>;
  annulled: boolean;
  quote: boolean;
  returned: boolean;
  date: Date | null;
  client: string;
  nit: string | null;
  phone: string | null;
  seller: string | null;
  notes: string | null;
  invoiceStatus: string | null;
  invoiceNumber: string | null;
}

interface Issue {
  file: string;
  sheet: string;
  row: number | string;
  type: string;
  detail: string;
}

interface ParsedSale {
  key: string;
  localCode: string;
  originalNumber: number;
  lines: Line[];
}

interface ParsedFile {
  file: string;
  sheet: string;
  year: number;
  sales: ParsedSale[];
  issues: Issue[];
  skippedEmpty: number;
}

const INVOICE_NUMBER = /^ZO\s*\d/i;

/**
 * Estado de facturación con un solo nombre por caso. Las columnas de factura
 * también traen notas sueltas («REVISAR OP», «ABONO 30 MILLONES»): esas van a
 * las observaciones, no aquí.
 */
function invoiceStatusOf(value: string): string | null {
  const v = norm(value);
  if (v.includes('PENDIENTE FACTURA')) return 'PENDIENTE FACTURAR';
  if (v.includes('OK FACTURA') || v.includes('FACTURA ELECTRONICA')) return 'FACTURADA';
  if (v.includes('FACTURA DE VENTA')) return 'FACTURA DE VENTA';
  return null;
}

function parseLine(row: Cell[], cols: Columns, excelRow: number): Line {
  const statusText = norm(
    [
      ...cols.statusCols.map((i) => text(row, i)),
      typeof row[cols.date] === 'string' ? row[cols.date] : '',
      text(row, cols.seller),
    ].join(' '),
  );

  const payments: Record<string, number> = {};
  for (const p of cols.payments) {
    const amount = num(row, p.index);
    if (amount) payments[p.name] = amount;
  }
  const received = num(row, cols.received) ?? 0;
  // 2023: la columna NEQUI a veces trae el nombre del medio de pago, no un valor.
  const label = cols.payments.find((p) => p.name === 'NEQUI');
  if (label && Object.keys(payments).length === 0 && received) {
    const named = norm(text(row, label.index));
    if (PAYMENT_COLUMNS.includes(named)) payments[named] = received;
  }

  // La factura: un número "ZO 1645" o un estado ("OK FACTURA", "PENDIENTE FACTURAR").
  let invoiceNumber = optionalText(row, cols.invoiceNumber);
  let invoiceStatus: string | null = null;
  const extraNotes: string[] = [];
  for (const i of cols.invoiceCols) {
    const value = optionalText(row, i);
    if (!value) continue;
    if (INVOICE_NUMBER.test(value)) invoiceNumber ??= value;
    else if (invoiceStatusOf(value)) invoiceStatus ??= invoiceStatusOf(value);
    else if (!norm(value).includes('ANULAD')) extraNotes.push(value);
  }
  for (const i of cols.statusCols) invoiceStatus ??= invoiceStatusOf(text(row, i));
  const notes = [optionalText(row, cols.notes), ...extraNotes].filter(Boolean).join(' · ');

  const seller = norm(text(row, cols.seller));

  return {
    excelRow,
    quantity: num(row, cols.quantity) ?? 0,
    description: text(row, cols.product) || 'SIN DESCRIPCIÓN',
    unitPrice: num(row, cols.unitPrice) ?? 0,
    tax: num(row, cols.tax) ?? 0,
    total: num(row, cols.total) ?? 0,
    received,
    balance: num(row, cols.balance) ?? 0,
    payments,
    annulled: statusText.includes('ANULAD'),
    quote: statusText.includes('COTIZACION'),
    returned: statusText.includes('DEVOLUCION'),
    date: date(row, cols.date),
    client: (optionalText(row, cols.client) ?? '').toUpperCase(),
    nit: optionalText(row, cols.nit),
    phone: optionalText(row, cols.phone),
    seller: seller && !NOT_A_SELLER.has(seller) && !/^\d+$/.test(seller) ? seller : null,
    notes: notes || null,
    invoiceStatus,
    invoiceNumber,
  };
}

function parseFile(path: string): ParsedFile {
  const file = basename(path);
  // Solo los encabezados, para elegir la hoja sin cargar el libro entero.
  const headersOnly = XLSX.readFile(path, { sheetRows: 1, dense: true });
  const candidates = headersOnly.SheetNames.filter((name) => {
    const [header] = XLSX.utils.sheet_to_json<Cell[]>(headersOnly.Sheets[name], {
      header: 1,
      raw: true,
    });
    return header && mapColumns(header) !== null;
  });
  if (candidates.length === 0) {
    throw new Error(`${file}: ninguna hoja tiene las columnas de OP, CLIENTE, VLR TOTAL y LOCAL.`);
  }

  const workbook = XLSX.readFile(path, { sheets: candidates, dense: true, cellDates: false });
  let best: { sheet: string; rows: Cell[][]; cols: Columns; count: number } | null = null;
  for (const sheet of candidates) {
    const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheet], {
      header: 1,
      raw: true,
      blankrows: true,
      defval: null,
    });
    const cols = mapColumns(rows[0])!;
    const count = rows.filter((r, i) => i > 0 && num(r, cols.number) !== null).length;
    if (!best || count > best.count) best = { sheet, rows, cols, count };
  }
  const { sheet, rows, cols } = best!;

  const issues: Issue[] = [];
  const issue = (row: number | string, type: string, detail: string) =>
    issues.push({ file, sheet, row, type, detail });

  const sales = new Map<string, ParsedSale>();
  let skippedEmpty = 0;
  const yearVotes = new Map<number, number>();

  rows.forEach((row, i) => {
    if (i === 0) return;
    const excelRow = i + 1;
    const number = num(row, cols.number);
    const client = text(row, cols.client);
    const product = text(row, cols.product);
    if (number === null || !Number.isInteger(number) || number <= 0) {
      if (client || product) {
        issue(excelRow, 'sin número de OP', `${client} / ${product}`.slice(0, 120));
      } else skippedEmpty++; // vacías o de totales
      return;
    }
    const local = num(row, cols.local);
    if (local === null) {
      issue(excelRow, 'sin local', `OP ${number}`);
      return;
    }
    const line = parseLine(row, cols, excelRow);
    if (Math.abs(line.total) > MAX_LINE_TOTAL) {
      issue(excelRow, 'total fuera de rango', `OP ${number}: ${line.total.toLocaleString('es-CO')}`);
      return;
    }
    if (line.date) {
      const y = line.date.getUTCFullYear();
      yearVotes.set(y, (yearVotes.get(y) ?? 0) + 1);
    }
    const localCode = String(local);
    const key = `${localCode}-${number}`;
    if (!sales.has(key)) sales.set(key, { key, localCode, originalNumber: number, lines: [] });
    sales.get(key)!.lines.push(line);
  });

  const year = [...yearVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!year) throw new Error(`${file}: no se pudo deducir el año (ninguna fecha válida).`);
  return { file, sheet, year, sales: [...sales.values()], issues, skippedEmpty };
}

/** "2-4, 9" a partir de [2, 3, 4, 9]. */
function compressRows(rows: number[]): string {
  const sorted = [...rows].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const r of [...sorted.slice(1), Infinity]) {
    if (r === prev + 1) {
      prev = r;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = r;
  }
  return parts.join(', ');
}

const firstOf = <T>(values: (T | null)[]) => values.find((v) => v != null) ?? null;
const sum = (lines: Line[], pick: (l: Line) => number) =>
  Math.round(lines.reduce((acc, l) => acc + pick(l), 0) * 100) / 100;

function buildRecords(parsed: ParsedFile, locationIds: Map<string, string>) {
  const sales: Prisma.HistoricalSaleCreateManyInput[] = [];
  const items: Prisma.HistoricalSaleItemCreateManyInput[] = [];
  const issue = (row: number | string, type: string, detail: string) =>
    parsed.issues.push({ file: parsed.file, sheet: parsed.sheet, row, type, detail });

  for (const sale of parsed.sales) {
    const locationId = locationIds.get(sale.localCode);
    const rowsLabel = compressRows(sale.lines.map((l) => l.excelRow));
    if (!locationId) {
      issue(rowsLabel, 'local desconocido', `OP ${sale.originalNumber}, local ${sale.localCode}`);
      continue;
    }

    const allAnnulled = sale.lines.every((l) => l.annulled);
    // Una OP con algunas líneas anuladas cuenta solo las vivas.
    const lines = allAnnulled ? sale.lines : sale.lines.filter((l) => !l.annulled);
    const dropped = sale.lines.length - lines.length;

    const balance = sum(lines, (l) => l.balance);
    let status: HistoricalSaleStatus;
    if (allAnnulled) status = HistoricalSaleStatus.ANNULLED;
    else if (lines.some((l) => l.quote)) status = HistoricalSaleStatus.QUOTE;
    else if (lines.some((l) => l.returned)) status = HistoricalSaleStatus.RETURNED;
    else if (balance > 0) status = HistoricalSaleStatus.WITH_BALANCE;
    else status = HistoricalSaleStatus.PAID;

    const clients = [...new Set(lines.map((l) => l.client).filter(Boolean))];
    if (clients.length > 1) {
      issue(rowsLabel, 'varios clientes en una OP', `OP ${sale.originalNumber}: ${clients.join(' | ')}`);
    }
    const dates = lines.map((l) => l.date).filter((d): d is Date => !!d);
    if (!dates.length && status !== HistoricalSaleStatus.ANNULLED) {
      issue(rowsLabel, 'sin fecha', `OP ${sale.originalNumber}`);
    }

    const payments: Record<string, number> = {};
    for (const l of lines) {
      for (const [name, amount] of Object.entries(l.payments)) {
        payments[name] = (payments[name] ?? 0) + amount;
      }
    }

    const notes = [
      ...new Set(lines.map((l) => l.notes).filter((n): n is string => !!n)),
      ...(clients.length > 1 ? [`Clientes en la planilla: ${clients.join(' | ')}`] : []),
      ...(dropped ? [`Se omitieron ${dropped} línea(s) anuladas`] : []),
    ];

    const id = randomUUID();
    sales.push({
      id,
      locationId,
      year: parsed.year,
      originalNumber: sale.originalNumber,
      saleDate: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
      clientName: clients[0] || 'SIN NOMBRE',
      clientNit: firstOf(lines.map((l) => l.nit)),
      clientPhone: firstOf(lines.map((l) => l.phone)),
      sellerName: firstOf(lines.map((l) => l.seller)),
      status,
      tax: sum(lines, (l) => l.tax),
      total: sum(lines, (l) => l.total),
      receivedAmount: sum(lines, (l) => l.received),
      balance,
      paymentsByMethod: Object.keys(payments).length ? payments : Prisma.DbNull,
      invoiceStatus: firstOf(lines.map((l) => l.invoiceStatus)),
      electronicInvoiceNumber: firstOf(lines.map((l) => l.invoiceNumber)),
      notes: notes.length ? notes.join('\n') : null,
      sourceFile: parsed.file,
      sourceSheet: parsed.sheet,
      sourceRows: rowsLabel,
    });
    lines.forEach((l, i) =>
      items.push({
        saleId: id,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        tax: l.tax,
        total: l.total,
        sortOrder: i,
      }),
    );
  }
  return { sales, items };
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const files: string[] = [];
  let dryRun = false;
  let report: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--report') report = argv[++i];
    else files.push(argv[i]);
  }
  if (!files.length) {
    throw new Error(
      'Uso: npm run prisma:import:historical-sales -- [--dry-run] [--report informe.csv] <archivo.xlsx>...',
    );
  }
  return { files, dryRun, report };
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

async function main() {
  const { files, dryRun, report } = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log(`\n📚 Histórico de ventas${dryRun ? ' (simulación, no escribe)' : ''}`);
    await assertZoomDatabase(prisma);

    const locations = await prisma.location.findMany({ select: { id: true, code: true } });
    const locationIds = new Map(locations.map((l) => [l.code, l.id]));

    const parsedFiles = files.map((f) => {
      console.log(`   Leyendo ${basename(f)}…`);
      return parseFile(f);
    });
    const years = parsedFiles.map((p) => p.year);
    const repeated = years.find((y, i) => years.indexOf(y) !== i);
    if (repeated) throw new Error(`Dos archivos son del año ${repeated}; pasa uno solo por año.`);

    const allIssues: Issue[] = [];
    for (const parsed of parsedFiles) {
      const { sales, items } = buildRecords(parsed, locationIds);
      allIssues.push(...parsed.issues);

      const byStatus = new Map<string, number>();
      for (const s of sales) byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
      const valid = sales.filter((s) => s.status !== 'ANNULLED' && s.status !== 'QUOTE');
      const totalSold = valid.reduce((a, s) => a + Number(s.total), 0);
      const pending = sales
        .filter((s) => s.status === 'WITH_BALANCE')
        .reduce((a, s) => a + Number(s.balance), 0);

      console.log(`\n   ${parsed.year} — ${parsed.file} › «${parsed.sheet}»`);
      console.log(`     OP: ${sales.length} · líneas: ${items.length} · vendido: ${money(totalSold)}`);
      console.log(`     Por estado: ${[...byStatus].map(([k, v]) => `${k} ${v}`).join(', ')}`);
      console.log(`     Saldo según la planilla: ${money(pending)}`);
      console.log(
        `     Filas vacías o de totales: ${parsed.skippedEmpty} · avisos: ${parsed.issues.length}`,
      );

      if (dryRun) continue;
      await prisma.$transaction(
        async (tx) => {
          // Reemplaza el año completo: así se puede volver a cargar una planilla corregida.
          await tx.historicalSale.deleteMany({ where: { year: parsed.year } });
          for (let i = 0; i < sales.length; i += 1000) {
            await tx.historicalSale.createMany({ data: sales.slice(i, i + 1000) });
          }
          for (let i = 0; i < items.length; i += 2000) {
            await tx.historicalSaleItem.createMany({ data: items.slice(i, i + 2000) });
          }
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
      console.log(`     ✓ Cargado`);
    }

    const byType = new Map<string, number>();
    for (const i of allIssues) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
    if (byType.size) {
      console.log(`\n   Avisos: ${[...byType].map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    if (report) {
      const lines = [
        ['archivo', 'hoja', 'filas', 'tipo', 'detalle'].map(csvCell).join(','),
        ...allIssues.map((i) => [i.file, i.sheet, i.row, i.type, i.detail].map(csvCell).join(',')),
      ];
      writeFileSync(report, '﻿' + lines.join('\n'));
      console.log(`   Informe: ${report}`);
    }
    console.log('');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
