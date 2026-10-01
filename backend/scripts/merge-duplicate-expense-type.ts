/**
 * Fusión de un tipo de gasto duplicado en otro.
 *
 * Contexto
 * --------
 * En producción convivían «PRODUCCIÓN» (el original, 2026-03-03) y «PRODUCCION»
 * (creado a mano el 2026-05-11, descripción «VARIOS»): el UNIQUE de `name`
 * compara texto exacto y la tilde los hacía distintos. Se fusionaron con este
 * script el 2026-09-30 (2 subcategorías, 140 OG y 145 CP movidas).
 *
 * Desde la migración `20260930000000_expense_types_unique_normalized_name` la
 * base ya no admite dos tipos con el mismo nombre normalizado, y esa migración
 * se niega a aplicarse si encuentra duplicados. Este script es la forma de
 * resolverlos antes.
 *
 * Qué hace
 * --------
 * 1. Subcategorías del duplicado:
 *    - si el tipo que se queda ya tiene una con el mismo nombre normalizado,
 *      sus OG y CP pasan a esa y la del duplicado se borra;
 *    - si no, la subcategoría se mueve tal cual.
 *    Así cada OG y CP queda con un par tipo/subcategoría coherente.
 * 2. Mueve las OG y las CP del duplicado al tipo que se queda.
 * 3. Borra el tipo duplicado, que ya no tiene referencias.
 *
 * Todo ocurre en una sola transacción. La auditoría guarda las filas borradas y
 * los IDs movidos, suficiente para deshacerlo a mano si hiciera falta.
 *
 * Uso
 * ---
 *   npx ts-node scripts/merge-duplicate-expense-type.ts --env=production --keep="PRODUCCIÓN" --drop="PRODUCCION"
 *   npx ts-node scripts/merge-duplicate-expense-type.ts --env=production --keep=... --drop=... --apply
 *
 * Opciones
 *   --keep=<nombre>  tipo que se queda (nombre exacto)
 *   --drop=<nombre>  tipo que se borra (nombre exacto)
 *   --apply          escribe (por defecto solo simula)
 *   --env=<nombre>   archivo .env.<nombre> del que leer DATABASE_URL
 *
 * Es idempotente: si el duplicado ya no existe, no hace nada.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient, Prisma } from '../src/generated/prisma';
import { normName } from '../src/common/utils/normalize.util';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

const APPLY = process.argv.includes('--apply');
const ENV = arg('env') ?? 'development';
const KEEP_NAME = arg('keep');
const DROP_NAME = arg('drop');

if (!KEEP_NAME || !DROP_NAME) {
  console.error('❌ Faltan --keep=<nombre> y --drop=<nombre>.');
  process.exit(1);
}

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
  if (keep.id === drop.id) {
    console.error('❌ --keep y --drop son el mismo tipo.');
    process.exit(1);
  }

  const where = { expenseTypeId: drop.id };
  const [dropSubs, keepSubs, expenseOrders, accountsPayable] = await Promise.all([
    prisma.expenseSubcategory.findMany({ where }),
    prisma.expenseSubcategory.findMany({ where: { expenseTypeId: keep.id } }),
    prisma.expenseOrder.findMany({ where, select: { id: true } }),
    prisma.accountPayable.findMany({ where, select: { id: true } }),
  ]);

  // Subcategoría del duplicado → subcategoría equivalente del tipo que se queda.
  const keepByNorm = new Map(keepSubs.map((s) => [normName(s.name), s]));
  const merges = dropSubs
    .filter((s) => keepByNorm.has(normName(s.name)))
    .map((s) => ({ from: s, to: keepByNorm.get(normName(s.name))! }));
  const moves = dropSubs.filter((s) => !keepByNorm.has(normName(s.name)));

  console.log(`Se queda:  «${keep.name}» (${keep.id})`);
  console.log(`Se borra:  «${drop.name}» (${drop.id})`);
  console.log(`  Subcategorías a mover: ${moves.map((s) => s.name).join(', ') || '—'}`);
  console.log(
    `  Subcategorías a fusionar: ${
      merges.map((m) => `${m.from.name} → ${m.to.name}`).join(', ') || '—'
    }`,
  );
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
          movedSubcategoryIds: moves.map((s) => s.id),
          mergedSubcategories: merges.map((m) => ({
            from: m.from as unknown as Prisma.InputJsonValue,
            toId: m.to.id,
          })),
          expenseOrderIds: expenseOrders.map((o) => o.id),
          accountPayableIds: accountsPayable.map((a) => a.id),
          script: 'merge-duplicate-expense-type',
        },
      },
    });

    // Primero las subcategorías que se fusionan: sus OG y CP cambian de
    // subcategoría y de tipo a la vez.
    for (const { from, to } of merges) {
      const data = { expenseTypeId: keep.id, expenseSubcategoryId: to.id };
      const byFrom = { expenseSubcategoryId: from.id };
      await tx.expenseOrder.updateMany({ where: byFrom, data });
      await tx.accountPayable.updateMany({ where: byFrom, data });
      await tx.expenseSubcategory.delete({ where: { id: from.id } });
    }

    const data = { expenseTypeId: keep.id };
    const subs = await tx.expenseSubcategory.updateMany({ where, data });
    const ogs = await tx.expenseOrder.updateMany({ where, data });
    const cps = await tx.accountPayable.updateMany({ where, data });
    await tx.expenseType.delete({ where: { id: drop.id } });

    return { subs: subs.count, ogs: ogs.count, cps: cps.count };
  });

  console.log(
    `✓ ${result.subs} subcategorías movidas y ${merges.length} fusionadas; ` +
      `OG y CP restantes movidas: ${result.ogs} y ${result.cps}. «${DROP_NAME}» borrado.`,
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
