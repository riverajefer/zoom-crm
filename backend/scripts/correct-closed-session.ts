/**
 * Corrige el cierre de una sesión de caja CERRADA cuando el arqueo no cuadró
 * por errores de registro, y recalcula su esperado y su diferencia.
 *
 * Cubre los dos errores que explicaron el sobrante del cierre del 22-oct-2026:
 *
 *   --to-transfer  Egresos de OG registrados como efectivo que en realidad se
 *                  pagaron por transferencia (OG-2026-0830, RC-2026-5648). El
 *                  billete nunca salió del cajón. La app solo deja corregir el
 *                  método mientras la caja del pago siga abierta; cerrada, el
 *                  cambio se hace aquí en los tres lugares que lo guardan: el
 *                  egreso, el ítem de la OG y el abono de su cuenta por pagar.
 *
 *   --pull         Movimientos que se registraron en la sesión abierta pero
 *                  cuyo billete se recibió en la sesión cerrada (OP-2026-4788:
 *                  el anticipo de $8.300 se rechazó, el efectivo se quedó en el
 *                  cajón y entró en el conteo que hoy es el fondo de apertura).
 *                  Si se queda en la sesión abierta, esa sesión espera un
 *                  dinero que ya está dentro de su fondo y cierra con faltante.
 *
 * Es el caso inverso de `move-movements-to-open-session.ts`. No toca pagos,
 * recibos, aprobaciones ni OP. Reescribe un arqueo firmado a propósito, así
 * que deja rastro en la nota de la sesión, en la descripción de cada movimiento
 * y en `audit_logs`.
 *
 * Uso:
 *   npx ts-node scripts/correct-closed-session.ts --session=<id> \
 *     --to-transfer=RC-2026-5648 --bank=Bancolombia --pull=RC-2026-XXXX
 *   ... --env=production            # dry-run contra producción
 *   ... --env=production --apply    # aplica
 *
 * Opciones:
 *   --session=<id>        Sesión CERRADA a corregir (obligatorio).
 *   --to-transfer=<RC,…>  Egresos de OG en efectivo de esa sesión que se pagaron por transferencia.
 *   --bank=<entidad>      Banco de origen que se anota en esos ítems y abonos (opcional).
 *   --pull=<RC,…>         Movimientos de la sesión abierta de la misma caja que se traen a la cerrada.
 *   --reason="…"          Motivo que queda en las notas (hay uno por defecto).
 *   --by=<username>       Usuario que figura en la auditoría (por defecto adminsistema).
 *   --apply               Aplica los cambios (por defecto solo muestra).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from '../src/generated/prisma';
import { CASH_IN_DRAWER_WHERE } from '../src/modules/cash-movement/cash-movement.helpers';

const SCRIPT = 'correct-closed-session';

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = (name: string) =>
  (arg(name) ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

const APPLY = process.argv.includes('--apply');
const ENV = arg('env') ?? 'development';
const BY_USERNAME = arg('by') ?? 'adminsistema';
const SESSION_ID = arg('session');
const BANK = arg('bank');
const TO_TRANSFER = list('to-transfer');
const PULL = list('pull');
const REASON = arg('reason') ?? 'corrección de registros que no correspondían a lo físico del cajón';

/**
 * Prioridad: variable de entorno DATABASE_URL > backend/.env.<ambiente>.
 * La variable permite correr contra producción sin dejar la contraseña en disco.
 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    console.log(`Usando DATABASE_URL del entorno (no se lee .env.${ENV}).`);
    return process.env.DATABASE_URL;
  }

  const envPath = path.resolve(__dirname, '..', `.env.${ENV}`);
  if (!fs.existsSync(envPath)) {
    console.error(`❌ No se encontró ${envPath}`);
    process.exit(1);
  }
  // Igual que `db-query.sh`: .env.production usa comillas simples y deja un
  // espacio al final; sin quitar ambos, la URL llega rota al driver.
  const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL[ \t]*=[ \t]*(.*)$/m);
  const url = match?.[1].trim().replace(/^['"]|['"]$/g, '').trim();
  if (!url) {
    console.error(`❌ ${envPath} no define DATABASE_URL`);
    process.exit(1);
  }
  return url;
}

const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const money = (v: unknown) =>
  Number(String(v)).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });

const bogota = (d: Date) =>
  d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

/** Efecto de un movimiento sobre el efectivo del cajón, con el signo de `closeSession`. */
const cashEffect = (m: { movementType: string; paymentMethod: string; amount: Prisma.Decimal }) =>
  m.paymentMethod !== 'CASH'
    ? new Prisma.Decimal(0)
    : m.movementType === 'INCOME' || m.movementType === 'DEPOSIT'
      ? new Prisma.Decimal(m.amount)
      : new Prisma.Decimal(m.amount).neg();

/** Misma fórmula que `closeSession`: fondo + ingresos/depósitos − egresos/retiros, solo efectivo. */
async function computeSystemBalance(
  db: Prisma.TransactionClient | PrismaClient,
  cashSessionId: string,
  openingAmount: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const movements = await db.cashMovement.findMany({
    where: { cashSessionId, ...CASH_IN_DRAWER_WHERE },
    select: { movementType: true, paymentMethod: true, amount: true },
  });
  return movements.reduce((acc, m) => acc.add(cashEffect(m)), new Prisma.Decimal(openingAmount));
}

const MOVEMENT_SELECT = {
  id: true,
  receiptNumber: true,
  movementType: true,
  paymentMethod: true,
  amount: true,
  description: true,
  isVoided: true,
  counterMovementId: true,
  createdAt: true,
  cashSessionId: true,
  referenceType: true,
  referenceId: true,
  originalMovement: { select: { id: true } },
  linkedPayment: {
    select: {
      order: { select: { orderNumber: true } },
      advancePaymentApproval: { select: { status: true } },
    },
  },
} satisfies Prisma.CashMovementSelect;

async function findMovements(receipts: string[]) {
  const movements = await prisma.cashMovement.findMany({
    where: { receiptNumber: { in: receipts } },
    select: MOVEMENT_SELECT,
  });
  const missing = receipts.filter((r) => !movements.some((m) => m.receiptNumber === r));
  if (missing.length > 0) fail(`No existen: ${missing.join(', ')}`);
  for (const m of movements) {
    if (m.isVoided || m.counterMovementId) fail(`${m.receiptNumber} está anulado`);
    if (m.originalMovement) fail(`${m.receiptNumber} es la reversa de otro movimiento`);
  }
  return movements;
}

/**
 * El ítem de la OG que pagó cada egreso. Mismo emparejamiento que la app al
 * corregir el método (`paymentCorrectableCount`): egresos por fecha y recibo,
 * ítems por `sortOrder`, uno a uno. Si hay más egresos que ítems no se sabe
 * cuál es de cuál y se aborta.
 */
async function itemForExpenseMovement(movement: { id: string; referenceId: string | null; receiptNumber: string }) {
  const expenseOrder = await prisma.expenseOrder.findUnique({
    where: { id: movement.referenceId ?? '' },
    select: {
      ogNumber: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, paymentMethod: true, bankEntity: true },
      },
    },
  });
  if (!expenseOrder) fail(`${movement.receiptNumber}: no se encontró su OG`);

  const paid = await prisma.cashMovement.findMany({
    where: {
      referenceType: 'EXPENSE_ORDER',
      referenceId: movement.referenceId,
      movementType: 'EXPENSE',
      isVoided: false,
    },
    orderBy: [{ createdAt: 'asc' }, { receiptNumber: 'asc' }],
    select: { id: true },
  });
  if (paid.length > expenseOrder.items.length) {
    fail(`${expenseOrder.ogNumber} tiene más egresos que ítems: no se sabe qué ítem pagó ${movement.receiptNumber}`);
  }
  const index = paid.findIndex((p) => p.id === movement.id);
  const item = expenseOrder.items[index];
  if (!item || item.paymentMethod !== 'CASH') {
    fail(`${movement.receiptNumber}: el ítem que le corresponde en ${expenseOrder.ogNumber} no está en efectivo`);
  }
  return { ogNumber: expenseOrder.ogNumber, item };
}

async function main() {
  console.log(`Ambiente: ${ENV}`);
  console.log(APPLY ? '=== MODO APLICAR ===\n' : '=== DRY-RUN (sin cambios) ===\n');

  if (!SESSION_ID) fail('Falta --session=<id de la sesión cerrada>');
  if (TO_TRANSFER.length === 0 && PULL.length === 0) fail('Nada que corregir: usa --to-transfer y/o --pull');

  const actor = await prisma.user.findFirst({
    where: { username: BY_USERNAME },
    select: { id: true },
  });
  if (!actor) fail(`No existe el usuario "${BY_USERNAME}" (--by)`);

  const session = await prisma.cashSession.findUnique({
    where: { id: SESSION_ID },
    select: {
      id: true,
      status: true,
      cashRegisterId: true,
      openingAmount: true,
      closingAmount: true,
      systemBalance: true,
      discrepancy: true,
      notes: true,
      openedAt: true,
      closedAt: true,
    },
  });
  if (!session) fail(`No existe la sesión ${SESSION_ID}`);
  if (session.status !== 'CLOSED' || session.closingAmount === null || !session.closedAt) {
    fail('La sesión no está cerrada: ahí no hay cierre que corregir');
  }

  // Si lo guardado no coincide con lo que da la fórmula hoy, algo más cambió
  // en la sesión después del cierre: corregir encima mezclaría dos problemas.
  const storedSystem = new Prisma.Decimal(session.systemBalance!);
  const currentSystem = await computeSystemBalance(prisma, session.id, session.openingAmount);
  if (!storedSystem.equals(currentSystem)) {
    fail(
      `El esperado guardado (${money(storedSystem)}) no coincide con el recalculado ` +
        `hoy (${money(currentSystem)}). Revisa la sesión antes de corregir nada.`,
    );
  }

  // ── Egresos que se pagaron por transferencia ──────────────────────────────
  const toTransfer = TO_TRANSFER.length > 0 ? await findMovements(TO_TRANSFER) : [];
  const transferPlan: Array<{
    movement: (typeof toTransfer)[number];
    ogNumber: string;
    item: { id: string; name: string; bankEntity: string | null };
  }> = [];
  for (const m of toTransfer) {
    if (m.cashSessionId !== session.id) fail(`${m.receiptNumber} no es de la sesión ${session.id}`);
    if (m.referenceType !== 'EXPENSE_ORDER' || m.movementType !== 'EXPENSE') {
      fail(`${m.receiptNumber} no es el egreso de una OG`);
    }
    if (m.paymentMethod !== 'CASH') fail(`${m.receiptNumber} ya no está en efectivo`);
    transferPlan.push({ movement: m, ...(await itemForExpenseMovement(m)) });
  }

  // ── Movimientos que se traen desde la sesión abierta ──────────────────────
  const pull = PULL.length > 0 ? await findMovements(PULL) : [];
  const openSession = pull.length
    ? await prisma.cashSession.findFirst({
        where: { cashRegisterId: session.cashRegisterId, status: 'OPEN' },
        select: { id: true, openedAt: true },
      })
    : null;
  if (pull.length > 0) {
    if (!openSession) fail('No hay sesión abierta en esa caja de donde traer movimientos');
    if (openSession.openedAt <= session.closedAt) fail('La sesión abierta empezó antes del cierre que se corrige');
    for (const m of pull) {
      if (m.cashSessionId !== openSession.id) fail(`${m.receiptNumber} no está en la sesión abierta de esa caja`);
      const approval = m.linkedPayment?.advancePaymentApproval?.status;
      if (approval && approval !== 'APPROVED') {
        fail(`${m.receiptNumber}: el pago está ${approval}. Que Caja lo apruebe antes de traerlo.`);
      }
    }
  }

  // ── Recálculo ─────────────────────────────────────────────────────────────
  // Un egreso en efectivo que pasa a transferencia deja de restar; un
  // movimiento que llega suma (o resta) su efecto en efectivo.
  const delta = [
    ...toTransfer.map((m) => cashEffect(m).neg()),
    ...pull.map((m) => cashEffect(m)),
  ].reduce((acc, d) => acc.add(d), new Prisma.Decimal(0));
  const closing = new Prisma.Decimal(session.closingAmount);
  const newSystem = storedSystem.add(delta);
  const newDiscrepancy = closing.sub(newSystem);

  console.log(`Sesión: ${session.id} (abrió ${bogota(session.openedAt)}, cerró ${bogota(session.closedAt)})\n`);
  if (transferPlan.length > 0) {
    console.log(`Pasan de efectivo a transferencia${BANK ? ` (${BANK})` : ''}:`);
    for (const { movement: m, ogNumber, item } of transferPlan) {
      console.log(`  ${m.receiptNumber}  ${money(m.amount)}  ${ogNumber} · ${item.name}`);
    }
  }
  if (pull.length > 0) {
    console.log(`Se traen desde la sesión abierta (${openSession!.id}):`);
    for (const m of pull) {
      console.log(
        `  ${m.receiptNumber}  ${m.movementType} ${m.paymentMethod}  ${money(m.amount)}  ` +
          `${bogota(m.createdAt)}  ${m.linkedPayment?.order.orderNumber ?? m.description}`,
      );
    }
  }
  console.log('\nCierre:');
  console.log(`  Contado     : ${money(closing)} (no cambia)`);
  console.log(`  Esperado    : ${money(storedSystem)} → ${money(newSystem)}`);
  console.log(`  Diferencia  : ${money(session.discrepancy)} → ${money(newDiscrepancy)}`);
  if (pull.length > 0) {
    const pulledCash = pull.reduce((acc, m) => acc.add(cashEffect(m)), new Prisma.Decimal(0));
    console.log(`\nLa sesión abierta deja de esperar ${money(pulledCash)} en efectivo.`);
  }

  if (!APPLY) {
    console.log('\nDry-run: no se modificó nada. Agrega --apply para aplicar.');
    return;
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const lines = [
    ...transferPlan.map(
      ({ movement: m, ogNumber }) =>
        `${m.receiptNumber} (${ogNumber}, ${money(m.amount)}) pasa de efectivo a transferencia${BANK ? ` ${BANK}` : ''}`,
    ),
    ...pull.map(
      (m) =>
        `${m.receiptNumber} (${m.linkedPayment?.order.orderNumber ?? m.referenceId ?? ''}, ${money(m.amount)}) ` +
        `se trae desde la sesión abierta el ${bogota(openSession!.openedAt)}`,
    ),
  ];
  const sessionNote =
    `[Ajuste ${fecha}] ${lines.join('; ')}: ${REASON}. Esperado ${money(storedSystem)} → ` +
    `${money(newSystem)}; diferencia ${money(session.discrepancy)} → ${money(newDiscrepancy)}.`;

  // Todas las escrituras llevan `select` explícito: sin él Prisma devuelve
  // todas las columnas del modelo, y si el cliente se generó con un schema más
  // nuevo que la base (una migración aún sin desplegar), la sentencia falla.
  await prisma.$transaction(async (tx) => {
    const audit = (model: string, recordId: string, oldData: object, newData: object) =>
      tx.auditLog.create({
        data: {
          userId: actor.id,
          recordId,
          action: 'UPDATE',
          model,
          oldData,
          newData,
          changedFields: Object.keys(newData),
          metadata: { script: SCRIPT, reason: REASON, cashSessionId: session.id },
        },
        select: { id: true },
      });

    for (const { movement: m, item } of transferPlan) {
      const description = `${m.description} [Corregido el ${fecha}: se pagó por transferencia, no en efectivo]`;
      await tx.cashMovement.update({
        where: { id: m.id },
        data: { paymentMethod: 'TRANSFER', description },
        select: { id: true },
      });
      await audit(
        'CashMovement',
        m.id,
        { paymentMethod: m.paymentMethod, description: m.description },
        { paymentMethod: 'TRANSFER', description },
      );

      const bankEntity = BANK ?? item.bankEntity;
      await tx.expenseOrderItem.update({
        where: { id: item.id },
        data: { paymentMethod: 'TRANSFER', bankEntity },
        select: { id: true },
      });
      await audit(
        'ExpenseOrderItem',
        item.id,
        { paymentMethod: 'CASH', bankEntity: item.bankEntity },
        { paymentMethod: 'TRANSFER', bankEntity },
      );

      // El abono de la CP espejo de la OG guarda su propio método: sin esto, la
      // cuenta por pagar seguiría diciendo que se pagó en efectivo.
      const apPayments = await tx.accountPayablePayment.findMany({
        where: { cashMovementId: m.id },
        select: { id: true, paymentMethod: true, bankEntity: true },
      });
      for (const ap of apPayments) {
        const apBank = BANK ?? ap.bankEntity;
        await tx.accountPayablePayment.update({
          where: { id: ap.id },
          data: { paymentMethod: 'TRANSFER', bankEntity: apBank },
          select: { id: true },
        });
        await audit(
          'AccountPayablePayment',
          ap.id,
          { paymentMethod: ap.paymentMethod, bankEntity: ap.bankEntity },
          { paymentMethod: 'TRANSFER', bankEntity: apBank },
        );
      }
    }

    if (pull.length > 0) {
      // Se revalida dentro de la transacción: si la sesión abierta se cerró
      // mientras corría el script, sacarle movimientos alteraría otro cierre.
      const stillOpen = await tx.cashSession.findFirst({
        where: { id: openSession!.id, status: 'OPEN' },
        select: { id: true },
      });
      if (!stillOpen) throw new Error('La sesión abierta se cerró mientras corría el script');

      for (const m of pull) {
        const description =
          `${m.description} [Traído el ${fecha} a la sesión cerrada del ` +
          `${bogota(session.closedAt!)}: el efectivo se recibió en esa caja]`;
        await tx.cashMovement.update({
          where: { id: m.id },
          data: { cashSessionId: session.id, description },
          select: { id: true },
        });
        await audit(
          'CashMovement',
          m.id,
          { cashSessionId: m.cashSessionId, description: m.description },
          { cashSessionId: session.id, description },
        );
      }
    }

    const recomputed = await computeSystemBalance(tx, session.id, session.openingAmount);
    if (!recomputed.equals(newSystem)) {
      throw new Error(`El recálculo dio ${money(recomputed)} y se esperaba ${money(newSystem)}`);
    }

    const notes = session.notes ? `${session.notes}\n${sessionNote}` : sessionNote;
    await tx.cashSession.update({
      where: { id: session.id },
      data: { systemBalance: newSystem, discrepancy: newDiscrepancy, notes },
      select: { id: true },
    });
    await audit(
      'CashSession',
      session.id,
      { systemBalance: storedSystem.toString(), discrepancy: String(session.discrepancy), notes: session.notes },
      { systemBalance: newSystem.toString(), discrepancy: newDiscrepancy.toString(), notes },
    );
  });

  console.log('\n✅ Cierre corregido.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
