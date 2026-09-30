import type { PrismaService } from '../../database/prisma.service';
import { LocationSupportKind, LocationSupportStatus, Prisma } from '../../generated/prisma';
import { businessToday } from './date-range.util';
import { withoutLocationScope } from './location-context';

/**
 * Apoyo en otra sede (solo Zoom, docs/PLAN_SEDES.md §16).
 *
 * Un apoyo está **vigente** si fue aprobado, hoy (día de Bogotá) cae entre sus
 * fechas y nadie lo terminó antes. Mientras lo está, su sede es la única que el
 * usuario puede operar. Si venció con una caja abierta por el usuario en esa
 * sede, sigue vigente solo para que pueda cerrarla (`overdue`).
 */

/** Permiso de Gerencia: programar, aprobar, rechazar y terminar apoyos. */
export const AUTHORIZE_LOCATION_SUPPORT_PERMISSION = 'authorize_location_support';

/** Código del 400 al cambiar de sede con la caja abierta en la del apoyo. */
export const CASH_SESSION_OPEN = 'CASH_SESSION_OPEN';

/** Hoy, como lo guarda una columna `@db.Date`. */
export function businessTodayDate(): Date {
  return dateOnly(businessToday());
}

/** `YYYY-MM-DD` → medianoche UTC, que es como Prisma lee y escribe `@db.Date`. */
export function dateOnly(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** `where` de los apoyos vigentes hoy, sin contar el periodo de gracia por caja abierta. */
export function activeSupportWhere(today: Date = businessTodayDate()): Prisma.LocationSupportWhereInput {
  return {
    kind: LocationSupportKind.SUPPORT,
    status: LocationSupportStatus.APPROVED,
    endedAt: null,
    startDate: { lte: today },
    endDate: { gte: today },
  };
}

/**
 * Usuarios que hoy trabajan en una sede: la tienen fija y no están de apoyo en
 * otra, o están de apoyo en ella. Es a quienes les llegan sus notificaciones de
 * operación. No cuenta la gracia por caja abierta: un apoyo vencido ya no recibe.
 */
export function usersWorkingInLocationWhere(
  locationId: string,
  today: Date = businessTodayDate(),
): Prisma.UserWhereInput[] {
  const active = activeSupportWhere(today);
  return [
    {
      locations: { some: { locationId } },
      NOT: { locationSupports: { some: { ...active, locationId: { not: locationId } } } },
    },
    { locationSupports: { some: { ...active, locationId } } },
  ];
}

const activeSupportSelect = {
  id: true,
  userId: true,
  locationId: true,
  startDate: true,
  endDate: true,
  reason: true,
  location: { select: { id: true, code: true, name: true, type: true, color: true, address: true, phone: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
} satisfies Prisma.LocationSupportSelect;

export type ActiveLocationSupport = Prisma.LocationSupportGetPayload<{ select: typeof activeSupportSelect }> & {
  /** Venció, pero sigue vigente hasta que el usuario cierre su caja en esa sede. */
  overdue: boolean;
};

type SupportClient = Pick<PrismaService, 'locationSupport' | 'cashSession'>;

/** Sesión de caja abierta por el usuario en una sede, si la hay. */
export async function findOpenCashSessionInLocation(
  prisma: Pick<PrismaService, 'cashSession'>,
  userId: string,
  locationId: string,
) {
  // Las sesiones se filtran por la sede activa; esta pregunta es de otra sede.
  return withoutLocationScope(() =>
    prisma.cashSession.findFirst({
      where: { openedById: userId, status: 'OPEN', cashRegister: { locationId } },
      select: { id: true, cashRegister: { select: { name: true } } },
    }),
  );
}

/**
 * El apoyo vigente del usuario, o `null`. Una sola consulta en el caso normal:
 * la de gracia solo se hace si el candidato ya venció.
 */
export async function findActiveLocationSupport(
  prisma: SupportClient,
  userId: string,
  today: Date = businessTodayDate(),
): Promise<ActiveLocationSupport | null> {
  const { endDate: _vigente, ...approved } = activeSupportWhere(today);
  const candidate = await prisma.locationSupport.findFirst({
    where: {
      userId,
      ...approved,
      OR: [
        { endDate: { gte: today } },
        // Vencido, pero el usuario tiene alguna caja abierta: puede ser la de esa sede.
        { endDate: { lt: today }, user: { openedCashSessions: { some: { status: 'OPEN' } } } },
      ],
    },
    // El vigente termina hoy o después, así que va antes que cualquier vencido.
    orderBy: { endDate: 'desc' },
    select: activeSupportSelect,
  });
  if (!candidate) return null;
  if (candidate.endDate >= today) return { ...candidate, overdue: false };

  const open = await findOpenCashSessionInLocation(prisma, userId, candidate.locationId);
  return open ? { ...candidate, overdue: true } : null;
}
