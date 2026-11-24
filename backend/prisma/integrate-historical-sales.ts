/**
 * Integra el histórico de ventas (solo Zoom) al sistema: convierte las OP de
 * `historical_sales` (cargadas antes con `import-historical-sales.ts`) en
 * clientes, OP, ítems y pagos reales, a nombre de sus vendedoras.
 *
 *   npm run prisma:integrate:historical-sales -- [--config archivo.json] [--dry-run]
 *       [--replace] [--undo] [--allow-unmapped] [--report informe.csv]
 *
 * Las decisiones del cliente van en un archivo de configuración (por defecto
 * `prisma/data/historical-integration.json`, ignorado por git; la plantilla es
 * `prisma/historical-integration.example.json`). Sin ellas el script no corre:
 *
 * - `balancePolicy`: `carry` deja el saldo de la planilla como deuda real (la OP
 *   queda «entregada a crédito» y entra en cartera); `close` lo da por perdido con
 *   `reversedAmount`, como una anulación parcial: el total de la venta no cambia
 *   y la OP queda entregada sin saldo.
 *
 * Las OP sin saldo quedan `DELIVERED`, no `PAID`: en el flujo del sistema `PAID`
 * es «pagada, falta entregar», y así contarían como brecha en ventas por asesor
 * en vez de comisionables.
 * - `overpaymentPolicy`: `credit` deja como saldo a favor lo pagado de más (el
 *   cliente lo puede gastar en OP nuevas); `cap` registra como pagado solo hasta
 *   el total y anota el excedente en las observaciones.
 * - `ownershipPolicy`: a qué clientes nuevos se les asigna como dueña la
 *   vendedora de su última OP (`none`, `activeSellers`, `all`). Con dueña, otra
 *   asesora necesita autorización para venderle.
 * - `includeLoansToHigh`: si entran los «PRESTAMO HIGH».
 * - `sellers`: nombre de la planilla → usuario (`username` existente, `create`
 *   uno inactivo, `sameAs` otro nombre o `fallback` al usuario genérico).
 *
 * Qué crea, y cómo se reconoce para repetir o deshacer:
 * - OP con `historicalSaleKey` ("2024-104-625") y número `{sede}-OP-{número de
 *   la planilla}`; si ese número ya existe, se le agrega el año. El consecutivo
 *   de OP sale del máximo de la tabla, así que las OP nuevas siguen después.
 * - Clientes con `historicalKey` cuando no existían; si ya había uno con el
 *   mismo NIT o el mismo nombre, se reutiliza y no se marca.
 * - Pagos verificados por contabilidad y sin movimiento de caja: son dinero de
 *   antes del sistema, no entran a ningún arqueo ni a la bandeja de verificación.
 * - Usuarias inactivas para las vendedoras que no tienen usuario. `--undo` no las
 *   borra.
 *
 * `--undo` borra las OP integradas y los clientes que la integración creó y que
 * no tengan nada más. `--replace` deshace y vuelve a integrar en la misma
 * transacción. Fuera de localhost exige `CONFIRM_DB_HOST`.
 */
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';
import {
  HistoricalSaleStatus,
  OrderStatus,
  PaymentAccountingStatus,
  PaymentMethod,
  PersonType,
  Prisma,
  PrismaClient,
} from '../src/generated/prisma';
import { docCore, nameCore } from '../src/common/utils/normalize.util';
import { assertZoomDatabase } from './assert-zoom-database';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

// ─── Configuración ─────────────────────────────────────────────────────────

type SellerRule =
  | { username: string }
  | { create: { firstName: string; lastName?: string; username?: string } }
  | { sameAs: string }
  | { fallback: true };

interface IntegrationConfig {
  balancePolicy: 'carry' | 'close';
  overpaymentPolicy: 'credit' | 'cap';
  ownershipPolicy: 'none' | 'activeSellers' | 'all';
  includeLoansToHigh: boolean;
  defaultDepartment: string;
  defaultCity: string;
  genericClientName: string;
  fallbackSeller: { username: string; firstName: string; lastName?: string };
  sellers: Record<string, SellerRule>;
}

const DEFAULT_CONFIG_PATH = 'prisma/data/historical-integration.json';

function loadConfig(path: string): IntegrationConfig {
  if (!existsSync(path)) {
    throw new Error(
      `No existe ${path}. Copia prisma/historical-integration.example.json y llena las decisiones del cliente.`,
    );
  }
  const config = JSON.parse(readFileSync(path, 'utf8')) as IntegrationConfig;
  const oneOf = <T extends string>(field: keyof IntegrationConfig, values: T[]) => {
    if (!values.includes(config[field] as T)) {
      throw new Error(`${path}: "${String(field)}" debe ser ${values.join(' o ')}.`);
    }
  };
  oneOf('balancePolicy', ['carry', 'close']);
  oneOf('overpaymentPolicy', ['credit', 'cap']);
  oneOf('ownershipPolicy', ['none', 'activeSellers', 'all']);
  if (typeof config.includeLoansToHigh !== 'boolean') {
    throw new Error(`${path}: "includeLoansToHigh" debe ser true o false.`);
  }
  for (const field of ['defaultDepartment', 'defaultCity', 'genericClientName'] as const) {
    if (!config[field]) throw new Error(`${path}: falta "${field}".`);
  }
  if (!config.fallbackSeller?.username || !config.fallbackSeller.firstName) {
    throw new Error(`${path}: "fallbackSeller" necesita username y firstName.`);
  }
  config.sellers = Object.fromEntries(
    Object.entries(config.sellers ?? {}).map(([name, rule]) => [normSeller(name), rule]),
  );
  return config;
}

// ─── Utilidades ────────────────────────────────────────────────────────────

const normSeller = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Nombres que no identifican a nadie: van todos al cliente genérico. */
const GENERIC_CLIENTS = new Set([
  '',
  'sin nombre',
  'sin nombre clientes',
  'sin nombre cliente',
  'mostrador',
  'cliente',
  'cliente mostrador',
  'na',
  'n a',
  '0',
]);

const LOANS_TO_HIGH = new Set(['high', 'prestamo high']);

const PAYMENT_COLUMN: Record<string, { method: PaymentMethod; bank?: string }> = {
  NEQUI: { method: PaymentMethod.TRANSFER, bank: 'Nequi' },
  'NEQUI ZULLY': { method: PaymentMethod.TRANSFER, bank: 'Nequi' },
  'NEQUI OSCAR': { method: PaymentMethod.TRANSFER, bank: 'Nequi' },
  DATAFONO: { method: PaymentMethod.CARD },
  'BANCO DE BOGOTA': { method: PaymentMethod.TRANSFER, bank: 'Banco de Bogotá' },
  DAVIPLATA: { method: PaymentMethod.TRANSFER, bank: 'Daviplata' },
  'DAVIVIENDA AHORROS': { method: PaymentMethod.TRANSFER, bank: 'Davivienda' },
  BANCOLOMBIA: { method: PaymentMethod.TRANSFER, bank: 'Bancolombia' },
  EFECTIVO: { method: PaymentMethod.CASH },
};

const pad4 = (n: number) => String(n).padStart(4, '0');
const money = (n: Decimal | number) => `$${Math.round(Number(n)).toLocaleString('es-CO')}`;
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');

interface Issue {
  key: string;
  type: string;
  detail: string;
}

// ─── Vendedoras ────────────────────────────────────────────────────────────

interface SellerUser {
  id: string;
  label: string;
  isActive: boolean;
  created: boolean;
}

async function resolveSellers(
  prisma: PrismaClient,
  config: IntegrationConfig,
  names: string[],
  options: { dryRun: boolean; allowUnmapped: boolean },
) {
  const asesorRole = await prisma.role.findUnique({ where: { name: 'asesor' } });
  if (!asesorRole) throw new Error('No existe el rol "asesor" para las usuarias inactivas.');

  const created: string[] = [];
  const byUsername = new Map<string, SellerUser>();

  const ensureUser = async (
    username: string,
    firstName: string,
    lastName: string | undefined,
    createIfMissing: boolean,
  ): Promise<SellerUser> => {
    if (byUsername.has(username)) return byUsername.get(username)!;
    const existing = await prisma.user.findUnique({ where: { username } });
    let user: SellerUser;
    if (existing) {
      user = {
        id: existing.id,
        label: `${username} (existente)`,
        isActive: existing.isActive,
        created: false,
      };
    } else if (!createIfMissing) {
      throw new Error(`No existe el usuario "${username}" que nombra la configuración.`);
    } else if (options.dryRun) {
      user = { id: `dry-${username}`, label: `${username} (se crearía, inactivo)`, isActive: false, created: true };
    } else {
      // Solo para el historial: no puede entrar (inactivo, contraseña al azar).
      const password = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
      const row = await prisma.user.create({
        data: {
          username,
          password,
          firstName,
          lastName: lastName ?? null,
          roleId: asesorRole.id,
          isActive: false,
          mustChangePassword: true,
        },
      });
      user = { id: row.id, label: `${username} (creado, inactivo)`, isActive: false, created: true };
      created.push(username);
    }
    byUsername.set(username, user);
    return user;
  };

  const fallback = await ensureUser(
    config.fallbackSeller.username,
    config.fallbackSeller.firstName,
    config.fallbackSeller.lastName,
    true,
  );

  const resolved = new Map<string, SellerUser>();
  const unmapped: string[] = [];
  const resolveName = async (name: string, depth = 0): Promise<SellerUser> => {
    if (depth > 5) throw new Error(`"sameAs" en ciclo para ${name}.`);
    const rule = config.sellers[name];
    if (!rule) {
      if (!unmapped.includes(name)) unmapped.push(name);
      return fallback;
    }
    if ('fallback' in rule) return fallback;
    if ('sameAs' in rule) return resolveName(normSeller(rule.sameAs), depth + 1);
    if ('username' in rule) return ensureUser(rule.username, name, undefined, false);
    const username = rule.create.username ?? `hist.${slug(`${rule.create.firstName} ${rule.create.lastName ?? ''}`)}`;
    return ensureUser(username, rule.create.firstName, rule.create.lastName, true);
  };

  for (const name of names) resolved.set(name, await resolveName(name));

  if (unmapped.length && !options.allowUnmapped) {
    throw new Error(
      `Vendedoras sin regla en la configuración: ${unmapped.join(', ')}. ` +
        'Agrégalas en "sellers" o corre con --allow-unmapped para mandarlas al usuario genérico.',
    );
  }
  return { resolved, fallback, created, unmapped };
}

// ─── Clientes ──────────────────────────────────────────────────────────────

interface ClientPlan {
  id: string;
  key: string;
  name: string;
  nit: string | null;
  personType: PersonType;
  phone: string | null;
  isNew: boolean;
  lastSale?: { date: number; sellerId: string; sellerActive: boolean; isFallback: boolean };
}

function clientIdentity(
  name: string,
  nit: string | null,
  config: IntegrationConfig,
): { key: string; core: string; doc: string; displayName: string } {
  const doc = docCore(nit);
  const core = nameCore(name);
  if (doc) return { key: `NIT:${doc}`, core, doc, displayName: name };
  if (GENERIC_CLIENTS.has(core)) {
    return { key: 'GENERICO', core: nameCore(config.genericClientName), doc: '', displayName: config.genericClientName };
  }
  return { key: `NOMBRE:${core.toUpperCase()}`, core, doc: '', displayName: name };
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const args = {
    config: DEFAULT_CONFIG_PATH,
    dryRun: false,
    replace: false,
    undo: false,
    allowUnmapped: false,
    report: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--replace') args.replace = true;
    else if (a === '--undo') args.undo = true;
    else if (a === '--allow-unmapped') args.allowUnmapped = true;
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--report') args.report = argv[++i];
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return args;
}

/** Borra lo que creó una integración anterior. Devuelve cuánto borró. */
async function undoIntegration(tx: Prisma.TransactionClient) {
  const orders = await tx.order.deleteMany({ where: { historicalSaleKey: { not: null } } });
  await tx.clientAdvisor.deleteMany({ where: { client: { historicalKey: { not: null } } } });
  // Un cliente creado por la integración que ya tiene documentos nuevos se queda.
  const clients = await tx.client.deleteMany({
    where: {
      historicalKey: { not: null },
      orders: { none: {} },
      quotes: { none: {} },
      prospects: { none: {} },
      dtfRecords: { none: {} },
    },
  });
  const kept = await tx.client.count({ where: { historicalKey: { not: null } } });
  return { orders: orders.count, clients: clients.count, keptClients: kept };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log(`\n🔗 Integración del histórico de ventas${args.dryRun ? ' (simulación, no escribe)' : ''}`);
    await assertZoomDatabase(prisma);

    if (args.undo) {
      if (args.dryRun) {
        const orders = await prisma.order.count({ where: { historicalSaleKey: { not: null } } });
        const clients = await prisma.client.count({ where: { historicalKey: { not: null } } });
        console.log(`   Borraría ${orders} OP integradas y hasta ${clients} clientes creados por la integración.\n`);
        return;
      }
      const result = await prisma.$transaction((tx) => undoIntegration(tx), { timeout: 600_000 });
      console.log(
        `   ✓ Deshecha: ${result.orders} OP y ${result.clients} clientes borrados` +
          (result.keptClients ? ` (${result.keptClients} clientes se quedan porque ya tienen documentos nuevos)` : '') +
          '.\n',
      );
      return;
    }

    const config = loadConfig(args.config);
    const already = await prisma.order.count({ where: { historicalSaleKey: { not: null } } });
    if (already && !args.replace) {
      throw new Error(
        `Ya hay ${already} OP integradas. Usa --replace para deshacer y volver a integrar, o --undo para solo deshacer.`,
      );
    }

    const issues: Issue[] = [];
    const issue = (key: string, type: string, detail: string) => issues.push({ key, type, detail });

    // ── Datos de origen ──
    const sales = await prisma.historicalSale.findMany({
      include: { location: { select: { code: true } }, items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ year: 'asc' }, { originalNumber: 'asc' }],
    });
    if (!sales.length) throw new Error('historical_sales está vacía: corre primero prisma:import:historical-sales.');

    const department = await prisma.department.findFirst({
      where: { name: { equals: config.defaultDepartment, mode: 'insensitive' } },
    });
    const city = department
      ? await prisma.city.findFirst({
          where: { departmentId: department.id, name: { equals: config.defaultCity, mode: 'insensitive' } },
        })
      : null;
    if (!department || !city) {
      throw new Error(`No existe la ciudad "${config.defaultCity}" en "${config.defaultDepartment}".`);
    }

    // ── Qué entra ──
    const included = sales.filter((s) => {
      const key = `${s.year}-${s.location.code}-${s.originalNumber}`;
      if (s.status === HistoricalSaleStatus.QUOTE) {
        issue(key, 'omitida', 'Era una cotización');
        return false;
      }
      const isLoan =
        normSeller(s.sellerName ?? '') === 'PRESTAMO HIGH' || LOANS_TO_HIGH.has(nameCore(s.clientName));
      if (isLoan && !config.includeLoansToHigh) {
        issue(key, 'omitida', `Préstamo a High (${s.clientName} / ${s.sellerName ?? 'sin vendedor'})`);
        return false;
      }
      return true;
    });

    // ── Vendedoras ──
    const sellerNames = [...new Set(included.map((s) => normSeller(s.sellerName ?? '')).filter(Boolean))];
    const sellers = await resolveSellers(prisma, config, sellerNames, args);
    const sellerOf = (name: string | null) =>
      (name && sellers.resolved.get(normSeller(name))) || sellers.fallback;

    // ── Clientes: existentes y nuevos ──
    const existingClients = await prisma.client.findMany({
      where: args.replace ? { historicalKey: null } : {},
      select: { id: true, name: true, nit: true, cedula: true },
    });
    const existingByDoc = new Map<string, string>();
    const existingByName = new Map<string, string[]>();
    for (const c of existingClients) {
      const doc = docCore(c.nit, c.cedula);
      if (doc) existingByDoc.set(doc, c.id);
      const core = nameCore(c.name);
      existingByName.set(core, [...(existingByName.get(core) ?? []), c.id]);
    }

    const clients = new Map<string, ClientPlan>();
    const clientFor = (name: string, nit: string | null, phone: string | null): ClientPlan => {
      const id = clientIdentity(name, nit, config);
      let plan = clients.get(id.key);
      if (!plan) {
        const reuse =
          (id.doc && existingByDoc.get(id.doc)) ||
          (existingByName.get(id.core)?.length === 1 ? existingByName.get(id.core)![0] : undefined);
        const isCompany = /^[89]\d{8}$/.test(id.doc);
        plan = {
          id: reuse ?? randomUUID(),
          key: id.key,
          name: id.displayName,
          nit: id.doc || null,
          personType: isCompany ? PersonType.EMPRESA : PersonType.NATURAL,
          phone: null,
          isNew: !reuse,
        };
        clients.set(id.key, plan);
      }
      const digits = phone?.replace(/\D/g, '') ?? '';
      if (!plan.phone && digits.length >= 7 && !/^(\d)\1+$/.test(digits)) plan.phone = digits;
      return plan;
    };

    // ── Numeración ──
    const takenNumbers = new Set(
      (
        await prisma.order.findMany({
          where: args.replace ? { historicalSaleKey: null } : {},
          select: { orderNumber: true },
        })
      ).map((o) => o.orderNumber),
    );

    // ── OP, ítems y pagos ──
    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const payments: Prisma.PaymentCreateManyInput[] = [];
    const now = new Date();
    const summary = { pending: new D(0), pendingCount: 0, closed: new D(0), closedCount: 0, credit: new D(0), creditCount: 0, capped: new D(0), cappedCount: 0 };

    for (const sale of included) {
      const code = sale.location.code;
      const key = `${sale.year}-${code}-${sale.originalNumber}`;
      const seller = sellerOf(sale.sellerName);
      const client = clientFor(sale.clientName, sale.clientNit, sale.clientPhone);
      const orderDate = sale.saleDate ?? new Date(Date.UTC(sale.year, 0, 1));
      // Mediodía UTC: en hora Colombia sigue siendo el mismo día.
      const orderDateTime = new Date(orderDate.getTime() + 12 * 3600 * 1000);

      let orderNumber = `${code}-OP-${pad4(sale.originalNumber)}`;
      if (takenNumbers.has(orderNumber)) {
        const alt = `${orderNumber}-${sale.year}`;
        issue(key, 'número repetido', `${orderNumber} ya existe; queda como ${alt}`);
        orderNumber = alt;
      }
      if (takenNumbers.has(orderNumber)) {
        issue(key, 'omitida', `No hay número libre (${orderNumber})`);
        continue;
      }
      takenNumbers.add(orderNumber);

      const total = new D(sale.total);
      const tax = new D(sale.tax);
      const subtotal = total.sub(tax);
      const notes: string[] = [];
      if (sale.notes) notes.push(sale.notes);

      const orderId = randomUUID();
      const orderPayments: Prisma.PaymentCreateManyInput[] = [];
      let status: OrderStatus;
      let paid = new D(0);
      let reversed = new D(0);
      let reversedNet = new D(0);
      let balance: Decimal;

      if (sale.status === HistoricalSaleStatus.ANNULLED) {
        // Anulada: nada cobrable ni a favor. Lo recibido queda solo como nota.
        status = OrderStatus.ANULADO;
        reversed = total;
        reversedNet = subtotal;
        balance = new D(0);
        if (new D(sale.receivedAmount).gt(0)) {
          notes.push(`La planilla registraba ${money(sale.receivedAmount)} recibidos en esta OP anulada.`);
        }
      } else {
        let received = Prisma.Decimal.max(new D(sale.receivedAmount), 0);
        if (received.gt(total)) {
          const excess = received.sub(total);
          if (config.overpaymentPolicy === 'cap') {
            notes.push(`La planilla registraba ${money(excess)} pagados de más; no quedan como saldo a favor.`);
            summary.capped = summary.capped.add(excess);
            summary.cappedCount++;
            received = total;
          } else {
            summary.credit = summary.credit.add(excess);
            summary.creditCount++;
          }
        }

        const breakdown = Object.entries((sale.paymentsByMethod as Record<string, number> | null) ?? {})
          .map(([column, amount]) => ({ column, amount: new D(amount) }))
          .filter((p) => p.amount.gt(0) && PAYMENT_COLUMN[p.column]);
        const breakdownSum = breakdown.reduce((acc, p) => acc.add(p.amount), new D(0));
        const lines: { amount: Decimal; method: PaymentMethod; bank?: string; note: string }[] = [];
        if (breakdown.length && breakdownSum.lte(received.add(1))) {
          for (const p of breakdown) {
            lines.push({ amount: p.amount, ...PAYMENT_COLUMN[p.column], note: `Columna «${p.column}» de la planilla` });
          }
          const rest = received.sub(breakdownSum);
          if (rest.gte(1)) lines.push({ amount: rest, method: PaymentMethod.OTHER, note: 'Sin medio de pago en la planilla' });
        } else if (received.gt(0)) {
          lines.push({
            amount: received,
            method: PaymentMethod.OTHER,
            note: breakdown.length
              ? `Medios de pago de la planilla sin cuadrar: ${breakdown.map((p) => `${p.column} ${money(p.amount)}`).join(', ')}`
              : 'Sin medio de pago en la planilla',
          });
        }
        for (const line of lines) {
          orderPayments.push({
            id: randomUUID(),
            orderId,
            amount: line.amount,
            paymentMethod: line.method,
            bankEntity: line.bank ?? null,
            paymentDate: orderDateTime,
            notes: `Histórico. ${line.note}`,
            receivedById: seller.id,
            accountingStatus: PaymentAccountingStatus.VERIFIED,
            accountingReviewedAt: now,
            accountingNotes: 'Integrado del histórico de ventas (planillas de Excel)',
            createdAt: orderDateTime,
          });
          paid = paid.add(line.amount);
        }

        const owed = total.sub(paid);
        if (owed.gt(0) && config.balancePolicy === 'carry') {
          balance = owed;
          status = OrderStatus.DELIVERED_ON_CREDIT;
          summary.pending = summary.pending.add(owed);
          summary.pendingCount++;
        } else if (owed.gt(0)) {
          // Como una anulación parcial: la venta no cambia, el saldo deja de cobrarse.
          reversed = owed;
          reversedNet = total.isZero() ? owed : owed.mul(subtotal).div(total).toDecimalPlaces(2);
          balance = new D(0);
          status = OrderStatus.DELIVERED;
          notes.push(`Saldo de la planilla no cobrado (${money(owed)}): se cerró al integrar el histórico.`);
          summary.closed = summary.closed.add(owed);
          summary.closedCount++;
        } else {
          balance = owed; // cero, o negativo = saldo a favor
          status = OrderStatus.DELIVERED;
        }
        if (sale.status === HistoricalSaleStatus.RETURNED) status = OrderStatus.RETURNED;
      }

      notes.push(
        `Integrada del histórico de ventas: ${sale.sourceFile}, hoja «${sale.sourceSheet}», filas ${sale.sourceRows}.`,
      );
      if (seller === sellers.fallback && sale.sellerName) {
        notes.push(`Vendedor en la planilla: ${sale.sellerName}.`);
      }
      if (client.key === 'GENERICO' && sale.clientName) {
        notes.push(`Cliente en la planilla: ${sale.clientName}.`);
      }

      orders.push({
        id: orderId,
        orderNumber,
        clientId: client.id,
        orderDate: orderDateTime,
        subtotal,
        taxRate: subtotal.isZero() ? new D(0) : tax.div(subtotal).toDecimalPlaces(4),
        tax,
        total,
        paidAmount: paid,
        reversedAmount: reversed,
        reversedNetAmount: reversedNet,
        balance,
        status,
        notes: notes.join('\n'),
        electronicInvoiceNumber: sale.electronicInvoiceNumber?.slice(0, 30) ?? null,
        createdById: seller.id,
        createdAt: orderDateTime,
        locationId: sale.locationId,
        historicalSaleKey: key,
      });
      sale.items.forEach((item, i) =>
        items.push({
          orderId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          sortOrder: i,
          createdAt: orderDateTime,
        }),
      );
      payments.push(...orderPayments);

      const ts = orderDate.getTime();
      if (!client.lastSale || ts >= client.lastSale.date) {
        client.lastSale = {
          date: ts,
          sellerId: seller.id,
          sellerActive: seller.isActive,
          isFallback: seller === sellers.fallback,
        };
      }
    }

    const newClients = [...clients.values()].filter((c) => c.isNew);
    const advisors = newClients
      .filter((c) => c.lastSale && !c.lastSale.isFallback && c.key !== 'GENERICO')
      .filter((c) => config.ownershipPolicy === 'all' || (config.ownershipPolicy === 'activeSellers' && c.lastSale!.sellerActive))
      .map((c) => ({ clientId: c.id, advisorId: c.lastSale!.sellerId }));

    // ── Resumen ──
    const byStatus = new Map<string, number>();
    for (const o of orders) byStatus.set(o.status as string, (byStatus.get(o.status as string) ?? 0) + 1);
    console.log(`   OP a integrar: ${orders.length} de ${sales.length} · ítems: ${items.length} · pagos: ${payments.length}`);
    console.log(`   Por estado: ${[...byStatus].map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(
      `   Clientes: ${newClients.length} nuevos, ${clients.size - newClients.length} ya existían` +
        ` · con dueña asignada: ${advisors.length} (${config.ownershipPolicy})`,
    );
    if (config.balancePolicy === 'carry') {
      console.log(`   Cartera que entra: ${summary.pendingCount} OP por ${money(summary.pending)}`);
    } else {
      console.log(`   Saldos cerrados sin cobrar: ${summary.closedCount} OP por ${money(summary.closed)}`);
    }
    if (config.overpaymentPolicy === 'credit') {
      console.log(`   Saldo a favor que entra: ${summary.creditCount} OP por ${money(summary.credit)}`);
    } else {
      console.log(`   Pagado de más que no entra como saldo a favor: ${summary.cappedCount} OP por ${money(summary.capped)}`);
    }
    console.log(`   Vendedoras: ${[...new Set([...sellers.resolved.values()].map((u) => u.label))].join(', ')}`);
    console.log(`   Usuario genérico: ${sellers.fallback.label}`);
    if (sellers.unmapped.length) console.log(`   Sin regla (van al genérico): ${sellers.unmapped.join(', ')}`);

    if (!args.dryRun) {
      const result = await prisma.$transaction(
        async (tx) => {
          const undone = args.replace ? await undoIntegration(tx) : null;
          for (let i = 0; i < newClients.length; i += 1000) {
            await tx.client.createMany({
              data: newClients.slice(i, i + 1000).map((c) => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                nit: c.personType === PersonType.EMPRESA ? c.nit : null,
                cedula: c.personType === PersonType.NATURAL ? c.nit : null,
                personType: c.personType,
                departmentId: department.id,
                cityId: city.id,
                historicalKey: c.key,
              })),
            });
          }
          for (let i = 0; i < orders.length; i += 1000) {
            await tx.order.createMany({ data: orders.slice(i, i + 1000) });
          }
          for (let i = 0; i < items.length; i += 2000) {
            await tx.orderItem.createMany({ data: items.slice(i, i + 2000) });
          }
          for (let i = 0; i < payments.length; i += 2000) {
            await tx.payment.createMany({ data: payments.slice(i, i + 2000) });
          }
          if (advisors.length) await tx.clientAdvisor.createMany({ data: advisors, skipDuplicates: true });
          // El contador de OP se pone al día con los números de la planilla (las
          // invariantes lo exigen). Nunca baja: tras un --undo solo se saltan números.
          await tx.$executeRaw`
            UPDATE consecutives SET last_number = GREATEST(last_number, (
              SELECT COALESCE(max(CAST(substring(order_number FROM '([0-9]+)$') AS int)), 0)
              FROM orders WHERE order_number ~ '^[A-Z0-9]+-OP-[0-9]+$'
            )), updated_at = now()
            WHERE type = 'ORDER'
          `;
          return undone;
        },
        { timeout: 900_000, maxWait: 30_000 },
      );
      if (result) console.log(`   ↺ Integración anterior deshecha: ${result.orders} OP, ${result.clients} clientes`);
      if (sellers.created.length) console.log(`   Usuarias inactivas creadas: ${sellers.created.join(', ')}`);
      console.log('   ✓ Integrado');
    }

    const byType = new Map<string, number>();
    for (const i of issues) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
    if (byType.size) console.log(`   Avisos: ${[...byType].map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (args.report) {
      writeFileSync(
        args.report,
        '﻿' +
          [['op', 'tipo', 'detalle'], ...issues.map((i) => [i.key, i.type, i.detail])]
            .map((row) => row.map(csvCell).join(','))
            .join('\n'),
      );
      console.log(`   Informe: ${args.report}`);
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
