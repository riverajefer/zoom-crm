/**
 * Mueve movimientos de una sesión de caja CERRADA a la sesión abierta de la
 * misma caja, y recalcula el cierre de la sesión de origen.
 *
 * Es para un caso puntual: abonos registrados mientras Caja hacía el arqueo.
 * Caen en la sesión que se está cerrando, el sistema los suma a lo esperado,
 * pero el billete no estaba en el conteo, y el cierre queda con un faltante
 * que no existe; el dinero aparece después en el cajón de la sesión siguiente.
 * Caso que lo originó: RC-2026-5657 y RC-2026-5658 (OP-2026-4790 y OP-2026-4850),
 * registrados a las 9:04 del 23-oct-2026, cinco minutos antes del cierre.
 *
 * Anular y volver a registrar no sirve: el cierre congela `systemBalance` y
 * `discrepancy`, así que el faltante falso queda para siempre, y de paso las OP
 * vuelven a quedar debiendo y se generan aprobaciones nuevas. Este script
 * no toca pagos, recibos, aprobaciones ni OP: solo cambia de sesión los
 * movimientos y recalcula el cierre de origen con la misma fórmula de
 * `closeSession` (fondo + movimientos en efectivo del cajón).
 *
 * Reescribe un arqueo firmado a propósito, así que deja rastro en tres
 * lugares: la nota de la sesión de origen, la descripción de cada movimiento
 * y `audit_logs`.
 *
 * Uso:
 *   npx ts-node scripts/move-movements-to-open-session.ts --receipts=RC-2026-5657,RC-2026-5658
 *   npx ts-node scripts/move-movements-to-open-session.ts --receipts=... --env=staging --apply
 *
 *   # Contra producción sin escribir la contraseña en disco:
 *   DATABASE_URL='postgresql://...' npx ts-node scripts/move-movements-to-open-session.ts \
 *     --env=production --receipts=RC-2026-5657,RC-2026-5658
 *
 * Opciones:
 *   --receipts=<RC,…>  Recibos a mover (obligatorio). Todos de la misma sesión.
 *   --to=<sessionId>   Sesión destino. Por defecto, la abierta de la misma caja.
 *   --reason="…"       Motivo que queda en las notas (hay uno por defecto).
 *   --by=<username>    Usuario que figura en la auditoría (por defecto adminsistema).
 *   --apply            Aplica los cambios (por defecto solo muestra).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from '../src/generated/prisma';
import { CASH_IN_DRAWER_WHERE } from '../src/modules/cash-movement/cash-movement.helpers';

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const APPLY = process.argv.includes('--apply');
const ENV = arg('env') ?? 'development';
const BY_USERNAME = arg('by') ?? 'adminsistema';
const TO_SESSION_ID = arg('to');
const REASON =
  arg('reason') ??
  'se registraron mientras Caja hacía el arqueo y no estaban en el conteo de cierre; ' +
    'el efectivo quedó en el cajón de la sesión siguiente';
const RECEIPTS = (arg('receipts') ?? '')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

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

/** Misma fórmula que `closeSession`: fondo + ingresos/depósitos − egresos/retiros, solo efectivo. */
async function computeSystemBalance(
  db: Prisma.TransactionClient | PrismaClient,
  cashSessionId: string,
  openingAmount: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const movements = await db.cashMovement.findMany({
    where: { cashSessionId, ...CASH_IN_DRAWER_WHERE },
    select: { movementType: true, amount: true },
  });
  return movements.reduce(
    (acc, m) =>
      m.movementType === 'INCOME' || m.movementType === 'DEPOSIT'
        ? acc.add(m.amount)
        : acc.sub(m.amount),
    new Prisma.Decimal(openingAmount),
  );
}

async function main() {
  console.log(`Ambiente: ${ENV}`);
  console.log(APPLY ? '=== MODO APLICAR ===\n' : '=== DRY-RUN (sin cambios) ===\n');

  if (RECEIPTS.length === 0) fail('Falta --receipts=RC-…,RC-…');

  const actor = await prisma.user.findFirst({
    where: { username: BY_USERNAME },
    select: { id: true },
  });
  if (!actor) fail(`No existe el usuario "${BY_USERNAME}" (--by)`);

  const movements = await prisma.cashMovement.findMany({
    where: { receiptNumber: { in: RECEIPTS } },
    select: {
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
      originalMovement: { select: { id: true } },
      linkedPayment: { select: { order: { select: { orderNumber: true } } } },
    },
  });

  const missing = RECEIPTS.filter((r) => !movements.some((m) => m.receiptNumber === r));
  if (missing.length > 0) fail(`No existen: ${missing.join(', ')}`);

  for (const m of movements) {
    if (m.isVoided || m.counterMovementId) fail(`${m.receiptNumber} está anulado`);
    if (m.originalMovement) fail(`${m.receiptNumber} es la reversa de otro movimiento`);
  }

  const sourceIds = [...new Set(movements.map((m) => m.cashSessionId))];
  if (sourceIds.length !== 1) fail('Los recibos están en sesiones distintas: muévelos por separado');

  const source = await prisma.cashSession.findUniqueOrThrow({
    where: { id: sourceIds[0] },
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
  if (source.status !== 'CLOSED' || source.closingAmount === null || !source.closedAt) {
    fail('La sesión de origen no está cerrada: ahí no hay cierre que corregir');
  }

  const target = await prisma.cashSession.findFirst({
    where: TO_SESSION_ID
      ? { id: TO_SESSION_ID }
      : { cashRegisterId: source.cashRegisterId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    select: { id: true, status: true, cashRegisterId: true, openedAt: true, openingAmount: true },
  });
  if (!target) fail('No hay sesión abierta en esa caja');
  if (target.status !== 'OPEN') fail('La sesión destino no está abierta');
  if (target.cashRegisterId !== source.cashRegisterId) fail('La sesión destino es de otra caja');
  if (target.openedAt <= source.closedAt) fail('La sesión destino abrió antes del cierre de origen');

  // Si lo guardado no coincide con lo que da la fórmula hoy, algo más cambió
  // en la sesión después del cierre: corregir encima mezclaría dos problemas.
  const storedSystem = new Prisma.Decimal(source.systemBalance!);
  const currentSystem = await computeSystemBalance(prisma, source.id, source.openingAmount);
  if (!storedSystem.equals(currentSystem)) {
    fail(
      `El esperado guardado (${money(storedSystem)}) no coincide con el recalculado ` +
        `hoy (${money(currentSystem)}). Revisa la sesión antes de mover nada.`,
    );
  }

  const movedCash = movements
    .filter((m) => m.paymentMethod === 'CASH')
    .reduce(
      (acc, m) =>
        m.movementType === 'INCOME' || m.movementType === 'DEPOSIT'
          ? acc.add(m.amount)
          : acc.sub(m.amount),
      new Prisma.Decimal(0),
    );
  const closing = new Prisma.Decimal(source.closingAmount);
  const newSystem = storedSystem.sub(movedCash);
  const newDiscrepancy = closing.sub(newSystem);

  console.log(`Origen : ${source.id} (abrió ${bogota(source.openedAt)}, cerró ${bogota(source.closedAt)})`);
  console.log(`Destino: ${target.id} (abrió ${bogota(target.openedAt)}, OPEN)\n`);
  console.log('Movimientos a mover:');
  for (const m of movements) {
    console.log(
      `  ${m.receiptNumber}  ${m.movementType} ${m.paymentMethod}  ${money(m.amount)}  ` +
        `${bogota(m.createdAt)}  ${m.linkedPayment?.order.orderNumber ?? m.description}`,
    );
  }
  console.log('\nCierre de origen:');
  console.log(`  Contado     : ${money(closing)} (no cambia)`);
  console.log(`  Esperado    : ${money(storedSystem)} → ${money(newSystem)}`);
  console.log(`  Diferencia  : ${money(source.discrepancy)} → ${money(newDiscrepancy)}`);
  console.log(`\nLa sesión destino pasa a esperar ${money(movedCash)} más en efectivo.`);

  if (!APPLY) {
    console.log('\nDry-run: no se modificó nada. Agrega --apply para aplicar.');
    return;
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const recibos = movements.map((m) => m.receiptNumber).join(', ');
  const sessionNote =
    `[Ajuste ${fecha}] ${recibos} (${money(movedCash)} en efectivo) se movieron a la sesión ` +
    `abierta el ${bogota(target.openedAt)}: ${REASON}. Esperado ${money(storedSystem)} → ` +
    `${money(newSystem)}; diferencia ${money(source.discrepancy)} → ${money(newDiscrepancy)}.`;

  await prisma.$transaction(async (tx) => {
    // Se revalida dentro de la transacción: entre la lectura y aquí alguien
    // pudo cerrar la sesión destino.
    const stillOpen = await tx.cashSession.findFirst({
      where: { id: target.id, status: 'OPEN' },
      select: { id: true },
    });
    if (!stillOpen) throw new Error('La sesión destino se cerró mientras corría el script');

    for (const m of movements) {
      const description =
        `${m.description} [Movido el ${fecha} desde la sesión cerrada del ` +
        `${bogota(source.closedAt!)}: registrado durante el arqueo]`;
      await tx.cashMovement.update({
        where: { id: m.id },
        data: { cashSessionId: target.id, description },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          recordId: m.id,
          action: 'UPDATE',
          model: 'CashMovement',
          oldData: { cashSessionId: source.id, description: m.description },
          newData: { cashSessionId: target.id, description },
          changedFields: ['cashSessionId', 'description'],
          metadata: { script: 'move-movements-to-open-session', reason: REASON },
        },
        select: { id: true },
      });
    }

    const recomputed = await computeSystemBalance(tx, source.id, source.openingAmount);
    if (!recomputed.equals(newSystem)) {
      throw new Error(`El recálculo dio ${money(recomputed)} y se esperaba ${money(newSystem)}`);
    }

    const notes = source.notes ? `${source.notes}\n${sessionNote}` : sessionNote;
    // `select` explícito: sin él Prisma devuelve todas las columnas del modelo,
    // y si el cliente se generó con un schema más nuevo que la base (una
    // migración aún sin desplegar), la sentencia falla por una columna que no
    // existe allá.
    await tx.cashSession.update({
      where: { id: source.id },
      data: { systemBalance: newSystem, discrepancy: newDiscrepancy, notes },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        recordId: source.id,
        action: 'UPDATE',
        model: 'CashSession',
        oldData: {
          systemBalance: storedSystem.toString(),
          discrepancy: String(source.discrepancy),
          notes: source.notes,
        },
        newData: {
          systemBalance: newSystem.toString(),
          discrepancy: newDiscrepancy.toString(),
          notes,
        },
        changedFields: ['systemBalance', 'discrepancy', 'notes'],
        metadata: {
          script: 'move-movements-to-open-session',
          editedAfterSessionClose: true,
          movedReceipts: RECEIPTS,
          targetSessionId: target.id,
        },
      },
      select: { id: true },
    });
  });

  console.log(`\n✅ ${movements.length} movimiento(s) movidos y cierre recalculado.`);
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
