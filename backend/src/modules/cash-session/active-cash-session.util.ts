import { ConflictException } from '@nestjs/common';
import { CashSessionStatus, PaymentMethod, Prisma } from '../../generated/prisma';
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
  /** Inicio del arqueo de cierre; `null` si Caja no está contando. */
  countStartedAt: Date | null;
}

const ACTIVE_SESSION_SELECT = {
  id: true,
  cashRegisterId: true,
  countStartedAt: true,
} satisfies Prisma.CashSessionSelect;

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
      select: ACTIVE_SESSION_SELECT,
      orderBy: { openedAt: 'asc' },
      take: 2,
    }),
  );

  if (open.length === 0) return null;
  if (open.length === 1) return open[0];

  throw new ConflictException(NO_REGISTER_FOR_SEDE_MULTIPLE);
}

export const COUNT_IN_PROGRESS_MESSAGE =
  'Caja está haciendo el arqueo de cierre y no puede recibir ni entregar ' +
  'efectivo hasta terminar. Intenta de nuevo en unos minutos.';

/**
 * Bloquea un movimiento en efectivo sobre una sesión cuyo arqueo ya empezó.
 *
 * Mientras Caja cuenta el cajón, cualquier efectivo que entre o salga en el
 * sistema cambia lo esperado sin estar en el conteo, y el cierre queda con un
 * descuadre falso. Pasó el 2026-10-23: dos abonos en efectivo registrados
 * cinco minutos antes del cierre cayeron en la sesión que se estaba contando.
 *
 * Solo el efectivo: el arqueo cuadra billetes (`CASH_IN_DRAWER_WHERE`), así que
 * una transferencia o un pago con tarjeta no lo altera y no hay por qué frenarlo.
 *
 * @throws ConflictException si la sesión está en arqueo y el método es efectivo.
 */
export function assertCashSessionNotCounting(
  session: Pick<ActiveCashSession, 'countStartedAt'> | null | undefined,
  paymentMethod: PaymentMethod | string | null | undefined,
): void {
  if (!session?.countStartedAt) return;
  if (paymentMethod !== PaymentMethod.CASH) return;
  throw new ConflictException(COUNT_IN_PROGRESS_MESSAGE);
}

/**
 * La misma regla para editar o anular un movimiento que ya existe: cambiar el
 * monto de un abono en efectivo, o pasarlo de transferencia a efectivo, mueve
 * lo esperado igual que crear uno nuevo.
 *
 * @param next  Monto y método después del cambio, o `null` si se anula.
 *   Si no cambia nada (el formulario reenvía el abono tal cual), se permite.
 *
 * @throws ConflictException si la sesión del movimiento está en arqueo y el
 *   cambio toca efectivo.
 */
export async function assertMovementChangeAllowedDuringCount(
  client: Pick<Prisma.TransactionClient, 'cashMovement'>,
  movementId: string,
  next: { amount: Prisma.Decimal; paymentMethod: PaymentMethod | string } | null,
): Promise<void> {
  // Sin el filtro de sede: el movimiento es de la sede de su documento, que
  // puede no ser la sede activa de quien opera.
  const movement = await withoutLocationScope(() =>
    client.cashMovement.findUnique({
      where: { id: movementId },
      select: {
        amount: true,
        paymentMethod: true,
        cashSession: { select: { status: true, countStartedAt: true } },
      },
    }),
  );
  const session = movement?.cashSession;
  if (!movement || session?.status !== CashSessionStatus.OPEN) return;
  if (!session.countStartedAt) return;

  const unchanged =
    next !== null &&
    movement.amount.equals(next.amount) &&
    movement.paymentMethod === next.paymentMethod;
  if (unchanged) return;

  assertCashSessionNotCounting(session, movement.paymentMethod);
  if (next) assertCashSessionNotCounting(session, next.paymentMethod);
}
