import { PaymentAccountingStatus, Prisma } from '../../generated/prisma';

/**
 * Devuelve a "pendiente" la verificación contable de un pago que se acaba de
 * editar. Lo que contabilidad revisó (monto, método, fecha, comprobante) ya no
 * es lo que hay, así que tiene que volver a mirarlo; también es el camino por
 * el que un pago observado regresa a su bandeja una vez corregido.
 *
 * Corre dentro de la transacción que aplica la edición. Un pago que nadie ha
 * revisado se deja como está.
 */
export async function reopenPaymentAccountingReview(
  tx: Prisma.TransactionClient,
  paymentId: string,
  editedById: string,
): Promise<void> {
  const { count } = await tx.payment.updateMany({
    where: {
      id: paymentId,
      accountingStatus: { not: PaymentAccountingStatus.PENDING },
    },
    data: {
      accountingStatus: PaymentAccountingStatus.PENDING,
      accountingReviewedById: null,
      accountingReviewedAt: null,
      accountingNotes: null,
    },
  });
  if (count === 0) return;

  await tx.paymentAccountingReview.create({
    data: {
      paymentId,
      status: PaymentAccountingStatus.PENDING,
      notes: 'Reabierto: el pago se editó',
      reviewedById: editedById,
    },
  });
}
