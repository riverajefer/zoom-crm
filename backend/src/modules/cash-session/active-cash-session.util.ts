import { ConflictException } from '@nestjs/common';
import { CashSessionStatus, Prisma } from '../../generated/prisma';
import { withoutLocationScope } from '../../common/utils/location-context';

/**
 * Resolución de "la caja abierta" para los flujos que mueven dinero.
 *
 * Hasta ahora cada flujo hacía su propio `findFirst({ status: 'OPEN' })`, sin
 * `cashRegisterId` y sin `orderBy`: el motor devolvía la fila que quisiera. Con
 * una sola caja registrada eso funciona por casualidad, no por diseño. Con dos
 * cajas abiertas a la vez —tres sedes, o simplemente un segundo punto de venta—
 * el dinero de una se registra en la otra y ningún arqueo cuadra.
 *
 * Por eso esta función no adivina. Si hay exactamente una caja abierta la
 * devuelve; si hay varias, falla y obliga a decidir. Perder un movimiento en la
 * caja equivocada es mucho más caro de reconstruir que repetir la operación.
 *
 * El índice parcial `cash_sessions_one_open_per_register` garantiza como máximo
 * una sesión abierta por caja, así que dos resultados son siempre dos cajas
 * distintas.
 *
 * En Zoom la búsqueda es siempre por sede: la versión sin sede
 * (`findActiveCashSession`, heredada de High) se quitó en la fase 3 para que
 * un cherry-pick que la use no compile y obligue a elegir la sede.
 */

export interface ActiveCashSession {
  id: string;
  cashRegisterId: string;
}

/** Acepta tanto `PrismaService` como el cliente de una transacción. */
type CashSessionClient = Pick<Prisma.TransactionClient, 'cashSession'>;

export const NO_REGISTER_FOR_SEDE_MULTIPLE =
  'Hay más de una caja abierta en esta sede y el sistema no puede saber en cuál ' +
  'registrar este movimiento. Cierra la caja que no corresponda y vuelve a intentarlo.';

/**
 * La sesión abierta de la caja de una sede, o `null` si no hay ninguna.
 *
 * Solo Zoom (docs/PLAN_SEDES.md §4): cada sede tiene su caja, y el dinero de un
 * documento entra o sale por la caja de la sede del documento. Con las 3 cajas
 * abiertas a la vez, buscar "la caja abierta" sin sede cruzaría la plata de
 * una sede a otra. Se busca sin el filtro del request: la sede la da el
 * documento, no la sede activa de quien opera.
 *
 * @throws ConflictException si la sede tiene varias cajas abiertas.
 */
export async function findActiveCashSessionForLocation(
  client: CashSessionClient,
  locationId: string,
): Promise<ActiveCashSession | null> {
  const open = await withoutLocationScope(() =>
    client.cashSession.findMany({
      where: { status: CashSessionStatus.OPEN, cashRegister: { locationId } },
      select: { id: true, cashRegisterId: true },
      orderBy: { openedAt: 'asc' },
      take: 2,
    }),
  );

  if (open.length === 0) return null;
  if (open.length === 1) return open[0];

  throw new ConflictException(NO_REGISTER_FOR_SEDE_MULTIPLE);
}
