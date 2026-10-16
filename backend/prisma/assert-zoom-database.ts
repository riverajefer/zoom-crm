/**
 * Guardián de los scripts que escriben en la base (solo Zoom).
 *
 * Zoom y High se trabajan al mismo tiempo y sus bases se parecen: el
 * 2026-10-14 casi se corre `prisma:sync:permissions` de Zoom contra la base de
 * High, porque en el `.env` de Zoom había una URL de Railway de High comentada.
 * Antes de escribir:
 *  - Se muestra a qué servidor y base apunta el script.
 *  - Se exige que sea una base de Zoom: tiene la tabla `locations` (sedes), que
 *    High no tiene. Las migraciones de Zoom la crean, así que una base nueva ya
 *    la trae cuando corre el seed.
 *  - Fuera de localhost se pide confirmar el servidor con `CONFIRM_DB_HOST`.
 */
import type { PrismaClient } from '../src/generated/prisma';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export async function assertZoomDatabase(prisma: PrismaClient): Promise<void> {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Falta DATABASE_URL.');

  const url = new URL(raw);
  const host = url.hostname;
  const target = `${host}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  const local = LOCAL_HOSTS.has(host);
  console.log(`   Base de datos: ${target}${local ? ' (local)' : ' (REMOTA)'}\n`);

  const [row] = await prisma.$queryRaw<{ locations: string | null }[]>`
    SELECT to_regclass('public.locations')::text AS locations
  `;
  if (!row?.locations) {
    throw new Error(
      `La base ${target} no es de Zoom: no tiene la tabla "locations" (sedes). ` +
        '¿Es la de High? Revisa DATABASE_URL; no se escribió nada.',
    );
  }

  if (!local && process.env.CONFIRM_DB_HOST !== host) {
    throw new Error(
      `La base ${target} es remota. Si de verdad es la de Zoom que quieres tocar, ` +
        `repite el comando con CONFIRM_DB_HOST=${host}. No se escribió nada.`,
    );
  }
}
