/**
 * Fusión del tipo de gasto duplicado «PRODUCCION» (sin tilde) en «PRODUCCIÓN».
 *
 * Contexto
 * --------
 * En producción convivían dos tipos de gasto: «PRODUCCIÓN» (el original,
 * 2026-03-03) y «PRODUCCION» (creado a mano el 2026-05-11, descripción
 * «VARIOS»). El índice único de `name` no los distingue porque la tilde los hace
 * textos distintos. Ningún código depende del nombre: la relación es solo por
 * `expense_type_id` en tres tablas.
 *
 * Qué hace
 * --------
 * 1. Mueve las subcategorías del duplicado al tipo que se queda. Se conservan tal
 *    cual (no se fusionan con subcategorías parecidas) para que cada OG y CP siga
 *    apuntando a la misma subcategoría y el par tipo/subcategoría quede coherente.
 * 2. Mueve las OG y las CP del duplicado al tipo que se queda.
 * 3. Borra el tipo duplicado, que ya no tiene referencias.
 *
 * Todo ocurre en una sola transacción. La auditoría guarda la fila borrada y los
 * IDs movidos, suficiente para deshacerlo a mano si hiciera falta.
 *
 * Uso
 * ---
 *   npx ts-node scripts/merge-duplicate-expense-type.ts --env=production
 *   npx ts-node scripts/merge-duplicate-expense-type.ts --env=production --apply
 *
 * Es idempotente: si el duplicado ya no existe, no hace nada.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient, Prisma } from '../src/generated/prisma';

const APPLY = process.argv.includes('--apply');
const ENV =
  process.argv.find((a) => a.startsWith('--env='))?.split('=')[1] ?? 'development';

const KEEP_NAME = 'PRODUCCIÓN';
const DROP_NAME = 'PRODUCCION';

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

async function main() {
  console.log(`→ [${ENV}] ${APPLY ? 'APLICANDO' : 'SIMULACIÓN (usa --apply para escribir)'}`);

  const keep = await prisma.expenseType.findUnique({ where: { name: KEEP_NAME } });
  const drop = await prisma.expenseType.findUnique({ where: { name: DROP_NAME } });

  if (!drop) {
    console.log(`✓ No existe «${DROP_NAME}»: nada que fusionar.`);
    return;
  }
  if (!keep) {
    console.error(`❌ No existe «${KEEP_NAME}», el tipo que debería quedarse.`);
    process.exit(1);
  }

  const where = { expenseTypeId: drop.id };
  const [subcategories, expenseOrders, accountsPayable, keepSubcategories] =
    await Promise.all([
      prisma.expenseSubcategory.findMany({ where, select: { id: true, name: true } }),
      prisma.expenseOrder.findMany({ where, select: { id: true } }),
      prisma.accountPayable.findMany({ where, select: { id: true } }),
      prisma.expenseSubcategory.findMany({
        where: { expenseTypeId: keep.id },
        select: { name: true },
      }),
    ]);

  // @@unique([name, expenseTypeId]): una subcategoría con el mismo nombre en
  // ambos tipos haría fallar el UPDATE. Se revisa antes para fallar con claridad.
  const taken = new Set(keepSubcategories.map((s) => s.name));
  const collisions = subcategories.filter((s) => taken.has(s.name));
  if (collisions.length > 0) {
    console.error(
      `❌ Subcategorías con el mismo nombre en ambos tipos: ${collisions
        .map((s) => s.name)
        .join(', ')}. Hay que fusionarlas primero.`,
    );
    process.exit(1);
  }

  console.log(`Se queda:  «${keep.name}» (${keep.id})`);
  console.log(`Se borra:  «${drop.name}» (${drop.id})`);
  console.log(`  Subcategorías a mover: ${subcategories.map((s) => s.name).join(', ') || '—'}`);
  console.log(`  OG a mover: ${expenseOrders.length}`);
  console.log(`  CP a mover: ${accountsPayable.length}`);

  if (!APPLY) return;

  const result = await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        model: 'ExpenseType',
        action: 'MERGE',
        recordId: drop.id,
        oldData: drop as unknown as Prisma.InputJsonValue,
        metadata: {
          winnerId: keep.id,
          subcategoryIds: subcategories.map((s) => s.id),
          expenseOrderIds: expenseOrders.map((o) => o.id),
          accountPayableIds: accountsPayable.map((a) => a.id),
          script: 'merge-duplicate-expense-type',
        },
      },
    });

    const data = { expenseTypeId: keep.id };
    const subs = await tx.expenseSubcategory.updateMany({ where, data });
    const ogs = await tx.expenseOrder.updateMany({ where, data });
    const cps = await tx.accountPayable.updateMany({ where, data });
    await tx.expenseType.delete({ where: { id: drop.id } });

    return { subs: subs.count, ogs: ogs.count, cps: cps.count };
  });

  console.log(
    `✓ Movidas ${result.subs} subcategorías, ${result.ogs} OG y ${result.cps} CP. «${DROP_NAME}» borrado.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
