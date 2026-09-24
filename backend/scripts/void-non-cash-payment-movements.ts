/**
 * Anula los movimientos de caja que siguen vivos aunque su pago ya no es dinero.
 *
 * Un pago con saldo a favor, crédito o descuento por nómina no mueve caja (ver
 * `paymentMovesCash`). Si un pago nació como efectivo/transferencia y después
 * se editó a uno de esos métodos, su movimiento debía anularse. La edición
 * directa lo hacía; la aprobada por el admin no —solo le cambiaba la etiqueta
 * al movimiento—, así que el ingreso quedaba contado en la sesión
 * (OP-2026-3575 → RC-2026-3935, sep 2026). El código ya está corregido
 * (`syncPaymentCashMovement`); este script limpia lo que quedó.
 *
 * Hace lo mismo que el código corregido: anulación administrativa (solo
 * `isVoided`, sin contramovimiento) y suelta el vínculo del pago. **El pago no
 * se toca**: anular el movimiento desde Caja sí anularía el pago, y la OP
 * volvería a quedar debiendo.
 *
 * Uso:
 *   npx ts-node scripts/void-non-cash-payment-movements.ts                    # dry-run sobre .env.development
 *   npx ts-node scripts/void-non-cash-payment-movements.ts --env=staging --apply
 *
 *   # Contra producción sin escribir la contraseña en disco:
 *   DATABASE_URL='postgresql://...' npx ts-node scripts/void-non-cash-payment-movements.ts --env=production
 *
 * Opciones:
 *   --apply            Aplica los cambios (por defecto solo muestra).
 *   --include-closed   Incluye sesiones CERRADAS. En PRD hay ~121 movimientos
 *                      heredados de crédito en $0: anularlos no cambia ningún
 *                      saldo pero sí altera arqueos firmados, por eso van aparte.
 *   --by=<username>    Usuario que figura como quien anula (por defecto adminsistema).
 *   --receipt=<RC-…>   Limita a un recibo concreto (p. ej. --receipt=RC-2026-3935).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma';
import { voidReasonForNonCash } from '../src/common/utils/payment-method.util';

const APPLY = process.argv.includes('--apply');
const INCLUDE_CLOSED = process.argv.includes('--include-closed');
const ENV =
  process.argv.find((a) => a.startsWith('--env='))?.split('=')[1] ?? 'development';
const BY_USERNAME =
  process.argv.find((a) => a.startsWith('--by='))?.split('=')[1] ?? 'adminsistema';

const RECEIPT = process.argv.find((a) => a.startsWith('--receipt='))?.split('=')[1];

const NON_CASH_METHODS = ['CREDIT_BALANCE', 'CREDIT', 'PAYROLL_DEDUCTION'] as const;

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
  const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!match) {
    console.error(`❌ ${envPath} no define DATABASE_URL`);
    process.exit(1);
  }
  return match[1];
}

const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const money = (v: unknown) =>
  Number(String(v)).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });

async function main() {
  console.log(`Ambiente: ${ENV}`);
  console.log(APPLY ? '=== MODO APLICAR ===' : '=== DRY-RUN (sin cambios) ===');
  console.log(INCLUDE_CLOSED ? 'Incluye sesiones cerradas\n' : 'Solo sesiones abiertas\n');

  const actor = await prisma.user.findFirst({
    where: { username: BY_USERNAME },
    select: { id: true },
  });
  if (!actor) {
    console.error(`❌ No existe el usuario "${BY_USERNAME}" (--by)`);
    process.exit(1);
  }

  const payments = await prisma.payment.findMany({
    where: {
      paymentMethod: { in: [...NON_CASH_METHODS] },
      cashMovement: {
        isVoided: false,
        ...(RECEIPT ? { receiptNumber: RECEIPT } : {}),
        ...(INCLUDE_CLOSED ? {} : { cashSession: { status: 'OPEN' } }),
      },
    },
    select: {
      id: true,
      paymentMethod: true,
      amount: true,
      order: { select: { orderNumber: true } },
      cashMovement: {
        select: {
          id: true,
          receiptNumber: true,
          amount: true,
          paymentMethod: true,
          cashSession: { select: { status: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (payments.length === 0) {
    console.log('✅ No hay movimientos vivos de pagos que no mueven caja.');
    return;
  }

  console.log(`Movimientos a anular: ${payments.length}`);
  for (const p of payments) {
    const m = p.cashMovement!;
    console.log(
      `  ${m.receiptNumber}  ${money(m.amount)}  sesión ${m.cashSession.status}  ` +
        `→ pago ${p.paymentMethod} de ${p.order.orderNumber}`,
    );
  }

  if (!APPLY) {
    console.log('\nDry-run: no se modificó nada. Agrega --apply para aplicar.');
    return;
  }

  const fecha = new Date().toISOString().slice(0, 10);
  for (const p of payments) {
    const m = p.cashMovement!;
    const closed = m.cashSession.status === 'CLOSED';
    await prisma.$transaction(async (tx) => {
      await tx.cashMovement.update({
        where: { id: m.id },
        data: {
          isVoided: true,
          voidedById: actor.id,
          voidedAt: new Date(),
          voidReason:
            voidReasonForNonCash(p.paymentMethod) +
            ` (saneamiento del ${fecha}${closed ? ', tras el cierre' : ''})`,
        },
      });
      await tx.payment.update({
        where: { id: p.id },
        data: { cashMovementId: null },
      });
    });
    console.log(`  ✔ ${m.receiptNumber} anulado`);
  }

  console.log(`\n✅ ${payments.length} movimiento(s) anulado(s). Los pagos no se modificaron.`);
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
