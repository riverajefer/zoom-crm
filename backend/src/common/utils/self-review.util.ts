import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';

export const SELF_REVIEW_MESSAGE =
  'No puedes aprobar ni rechazar una solicitud que tú mismo creaste: debe revisarla otra persona.';

type ReviewerLookup = Pick<Prisma.TransactionClient, 'user'>;

/**
 * ¿Esta persona está revisando su propia solicitud sin ser admin?
 *
 * Quien pide una autorización no puede ser quien la concede: si pudiera, el
 * control desaparece (registrar un abono en efectivo y luego rechazarlo uno
 * mismo, por ejemplo, borra el ingreso de la caja sin que nadie más lo vea).
 * Los admins quedan exceptuados (decisión del cliente, 2026-10-14).
 *
 * Aplica solo al paso de control. Los pasos de ejecución de Caja —pagar una OG
 * o una CxP, ejecutar una devolución— no lo llaman: ahí ya hubo un tercero que
 * aprobó, y que Caja pague lo que ella misma pidió es el flujo normal.
 */
export async function isForbiddenSelfReview(
  db: ReviewerLookup,
  params: { requestedById: string | null | undefined; reviewerId: string },
): Promise<boolean> {
  if (!params.requestedById || params.requestedById !== params.reviewerId) {
    return false;
  }

  const reviewer = await db.user.findUnique({
    where: { id: params.reviewerId },
    select: { role: { select: { name: true } } },
  });

  return reviewer?.role?.name !== 'admin';
}

/**
 * Lanza 403 si quien revisa es quien creó la solicitud. Ver
 * `isForbiddenSelfReview`.
 */
export async function assertNotSelfReview(
  db: ReviewerLookup,
  params: { requestedById: string | null | undefined; reviewerId: string },
): Promise<void> {
  if (await isForbiddenSelfReview(db, params)) {
    throw new ForbiddenException(SELF_REVIEW_MESSAGE);
  }
}
