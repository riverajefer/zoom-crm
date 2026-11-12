/**
 * Saneamiento de residuos de redondeo en OPs originadas en DTF.
 *
 * Contexto
 * --------
 * El total de una OP se cierra con el redondeo comercial colombiano al múltiplo
 * de 100 (regla vigente hasta 2026-11). El módulo DTF no lo aplicaba: cobraba en el
 * mostrador el valor exacto con IVA y ese cobro viajaba como pago inicial de la
 * OP al convertir el registro.
 *
 *   DTF-UV-2026-0548 → OP-2026-2532
 *   35.000 + 19% = 41.650 cobrados … pero el total de la OP quedó en 41.700
 *   → saldo de $50 que el cliente ya no debe y que nadie puede saldar
 *
 * Y al revés cuando el redondeo baja (41.630 cobrados contra un total de
 * 41.600): la OP queda con un "saldo a favor" que el cliente nunca tuvo.
 *
 * En producción a septiembre de 2026: 7 órdenes con residuo por cobrar ($200) y
 * 5 con sobrepago ($116), sobre 1.021 OPs originadas en DTF.
 *
 * El origen ya está corregido: DTF calcula y cobra el mismo total redondeado
 * que tendrá la OP (`computeDtfTotalToCharge`), así que este script es para el
 * histórico, no para un goteo que siga llegando.
 *
 * Qué hace
 * --------
 * Por cada OP originada en DTF cuyo saldo sea distinto de 0 pero menor a $100
 * en valor absoluto Y cuyo monto pagado redondee exactamente al total guardado
 * (esa es la firma del residuo de redondeo, y lo que distingue estos casos de
 * un abono parcial que casualmente dejó un saldo pequeño):
 *
 *   - ajusta `total` al monto efectivamente pagado;
 *   - recalcula `balance` con el helper del servicio (queda en 0);
 *   - deja un `AuditLog` con el total anterior y el nuevo.
 *
 * No toca pagos ni movimientos de caja: el dinero que entró es correcto, lo que
 * estaba mal era el total contra el que se comparaba.
 *
 * Uso
 * ---
 *   npx ts-node scripts/sanitize-dtf-rounding-residues.ts                      # dry-run sobre .env.development
 *   npx ts-node scripts/sanitize-dtf-rounding-residues.ts --env=production
 *   npx ts-node scripts/sanitize-dtf-rounding-residues.ts --env=production --apply
 *   npx ts-node scripts/sanitize-dtf-rounding-residues.ts --env=production --apply --orders=OP-2026-2532
 *
 * Opciones
 *   --apply            escribe (por defecto solo simula)
 *   --env=<nombre>     archivo .env.<nombre> del que leer DATABASE_URL
 *   --orders=OP-1,OP-2 limita el saneamiento a esas órdenes
 *
 * Es idempotente: tras ajustarlas, el saldo queda en 0 y dejan de entrar en el
 * filtro.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient, Prisma } from '../src/generated/prisma';
import { computeOrderBalance } from '../src/common/utils/order-balance.util';

/**
 * Regla de redondeo vigente cuando se generaron los residuos (múltiplos de
 * 100: 01–40 baja, 41–99 sube). Se congela aquí porque `applyColombianRounding`
 * pasó a múltiplos de 50 en 2026-11 y la firma del residuo histórico depende
 * de la regla vieja.
 */
function legacyRoundTo100(value: Prisma.Decimal): Prisma.Decimal {
  const truncated = value.toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);
  const lastTwo = truncated.mod(100).toNumber();
  if (lastTwo === 0) return truncated;
  if (lastTwo <= 40) return truncated.sub(lastTwo);
  return truncated.add(100 - lastTwo);
}

const APPLY = process.argv.includes('--apply');
const ENV =
  process.argv.find((a) => a.startsWith('--env='))?.split('=')[1] ??
  'development';
const ONLY_ORDERS = (
  process.argv.find((a) => a.startsWith('--orders='))?.split('=')[1] ?? ''
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Por encima de $100 ya no es residuo de redondeo, es un abono parcial. */
const MAX_RESIDUE = new Prisma.Decimal(100);

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
  const match = fs
    .readFileSync(envPath, 'utf8')
    .match(/^DATABASE_URL\s*=\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  if (!match) {
    console.error(`❌ ${envPath} no define DATABASE_URL`);
    process.exit(1);
  }
  return match[1];
}

const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const money = (v: unknown) =>
  Number(String(v)).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

/**
 * Usuario al que se atribuye el ajuste. Se toma el admin más antiguo: es un
 * asiento administrativo, no la acción de un asesor.
 */
async function resolveActorId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ['admin', 'Admin', 'ADMIN'] } } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

async function main() {
  console.log(`Ambiente: ${ENV}`);
  console.log(APPLY ? '=== MODO APLICAR ===' : '=== DRY-RUN (sin cambios) ===');
  if (ONLY_ORDERS.length > 0) {
    console.log(`Limitado a: ${ONLY_ORDERS.join(', ')}`);
  }
  console.log('');

  const candidates = await prisma.order.findMany({
    where: {
      notes: { startsWith: '[DTF]' },
      balance: { not: 0 },
      ...(ONLY_ORDERS.length > 0 ? { orderNumber: { in: ONLY_ORDERS } } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      subtotal: true,
      tax: true,
      total: true,
      paidAmount: true,
      appliedCreditAmount: true,
      balance: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // El residuo de redondeo tiene una firma exacta: lo pagado redondea al total
  // guardado y el desfase cabe en una centena. Cualquier otra cosa es un abono
  // parcial y no se toca.
  const targets = candidates.filter((o) => {
    const balance = new Prisma.Decimal(o.balance);
    if (balance.abs().gte(MAX_RESIDUE)) return false;
    const paid = new Prisma.Decimal(o.paidAmount);
    if (paid.lte(0)) return false;
    return legacyRoundTo100(paid).equals(new Prisma.Decimal(o.total));
  });

  const descartadas = candidates.length - targets.length;
  console.log(
    `OPs de DTF con saldo distinto de 0: ${candidates.length} · ajustables: ${targets.length} · descartadas: ${descartadas}\n`,
  );

  if (targets.length === 0) {
    console.log('Nada que sanear.');
    return;
  }

  const actorId = await resolveActorId();
  let residuoCobrar = new Prisma.Decimal(0);
  let residuoFavor = new Prisma.Decimal(0);

  for (const o of targets) {
    const totalAnterior = new Prisma.Decimal(o.total);
    const paid = new Prisma.Decimal(o.paidAmount);
    const nuevoBalance = computeOrderBalance(paid, paid, o.appliedCreditAmount);
    const delta = paid.sub(totalAnterior);

    if (delta.lt(0)) residuoCobrar = residuoCobrar.add(delta.negated());
    else residuoFavor = residuoFavor.add(delta);

    console.log(
      `${o.orderNumber} [${o.status}] total ${money(totalAnterior)} → ${money(paid)} · saldo ${money(o.balance)} → ${money(nuevoBalance)}`,
    );

    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: o.id },
        data: { total: paid, balance: nuevoBalance },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          recordId: o.id,
          model: 'Order',
          action: 'SANITIZE_DTF_ROUNDING',
          oldData: { total: totalAnterior.toString(), balance: o.balance.toString() },
          newData: { total: paid.toString(), balance: nuevoBalance.toString() },
          changedFields: ['total', 'balance'],
          metadata: {
            motivo:
              'Residuo del redondeo comercial: DTF cobró el valor exacto y la OP redondeó su total. Se ajusta el total a lo efectivamente pagado.',
            subtotal: o.subtotal.toString(),
            tax: o.tax.toString(),
            script: 'sanitize-dtf-rounding-residues',
          },
        },
      });
    });
  }

  console.log('');
  console.log(`Residuo por cobrar liberado: ${money(residuoCobrar)}`);
  console.log(`Saldo a favor fantasma eliminado: ${money(residuoFavor)}`);
  console.log(
    APPLY
      ? `\n✅ ${targets.length} órdenes ajustadas.`
      : `\nDry-run: no se escribió nada. Repite con --apply para aplicar.`,
  );
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
