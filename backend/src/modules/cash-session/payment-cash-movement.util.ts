import { Logger } from '@nestjs/common';
import { PaymentMethod, Prisma } from '../../generated/prisma';
import {
  paymentMovesCash,
  voidReasonForNonCash,
} from '../../common/utils/payment-method.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { findActiveCashSession } from './active-cash-session.util';

/**
 * Rastro de una edición de pago que modificó un movimiento de caja cuya sesión
 * ya estaba cerrada. Se permite hacerlo (corregir un monto mal digitado no
 * puede quedar bloqueado), pero queda registrado: el arqueo de esa sesión
 * dejó de reflejar sus movimientos.
 */
export interface MovementEditedAfterClose {
  movementId: string;
  sessionId: string;
  oldAmount: string;
  newAmount: string;
  oldPaymentMethod: string;
  newPaymentMethod: string;
}

export interface SyncPaymentCashMovementParams {
  paymentId: string;
  /** Método del pago ANTES de la edición. */
  previousMethod: PaymentMethod;
  /** Pago ya actualizado dentro de la transacción. */
  updated: {
    amount: Prisma.Decimal;
    paymentMethod: PaymentMethod;
    cashMovementId: string | null;
  };
  orderId: string;
  orderNumber: string;
  userId: string;
  /** Consecutivo `CASH_RECEIPT` para el movimiento que haya que crear. */
  generateReceiptNumber: () => Promise<string>;
}

/**
 * Deja el movimiento de caja de un pago recién editado en coherencia con él.
 *
 * Es el único lugar que decide esto: lo usan tanto la edición directa
 * (`OrdersService.updatePayment`) como la aprobada por el admin
 * (`PaymentEditApprovalsService`). Cuando la aprobación tenía su propia copia
 * —que solo copiaba monto y método— un pago que pasaba a saldo a favor dejaba
 * vivo su ingreso en caja (OP-2026-3575, sep 2026).
 *
 * Tres casos:
 * - El pago dejó de ser dinero (saldo a favor, crédito, nómina): el movimiento
 *   se anula y se suelta el vínculo.
 * - Sigue siendo dinero: el movimiento toma el monto y el método nuevos.
 * - No era dinero y ahora sí: se crea el movimiento en la caja abierta HOY, o
 *   se encola como `pendingCashEntry` si no hay ninguna.
 *
 * Devuelve el rastro si se tocó un movimiento de una sesión ya cerrada.
 */
export async function syncPaymentCashMovement(
  tx: Prisma.TransactionClient,
  params: SyncPaymentCashMovementParams,
): Promise<MovementEditedAfterClose | null> {
  const { paymentId, previousMethod, updated, orderId, orderNumber, userId } =
    params;

  // ¿El pago dejó de ser dinero? Pasa tanto al volverse saldo a favor como
  // al volverse crédito: en ambos casos el ingreso desaparece de la caja.
  const becameNonCash = !paymentMovesCash(updated.paymentMethod);

  if (updated.cashMovementId) {
    // Si la sesión de ese movimiento ya está cerrada, editarlo altera un
    // arqueo firmado: `closingAmount`/`systemBalance`/`discrepancy` quedaron
    // congelados al cerrar y no se recalculan. Se permite igual (decisión de
    // negocio: corregir un monto mal digitado no puede quedar bloqueado para
    // siempre), pero **el cambio no puede ser silencioso**: se anota en la
    // descripción del movimiento —que es lo que se ve en el arqueo y en la
    // exportación de la sesión— y el llamador lo deja en el audit log.
    const movement = await tx.cashMovement.findUnique({
      where: { id: updated.cashMovementId },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        description: true,
        cashSession: { select: { id: true, status: true } },
      },
    });

    const sessionClosed = movement?.cashSession?.status === 'CLOSED';
    const amountChanged =
      movement != null && !movement.amount.equals(updated.amount);
    const fecha = new Date().toISOString().slice(0, 10);

    if (becameNonCash) {
      // El pago dejó de ser dinero, así que este movimiento deja de existir
      // como ingreso. Se anula (patrón administrativo: solo `isVoided`, sin
      // exigir sesión abierta ni contramovimiento) y se suelta el vínculo, para
      // que el pago no siga apuntando a un movimiento anulado.
      await tx.cashMovement.update({
        where: { id: updated.cashMovementId },
        data: {
          isVoided: true,
          voidedById: userId,
          voidedAt: new Date(),
          voidReason:
            voidReasonForNonCash(updated.paymentMethod) +
            (sessionClosed ? ` (anulado el ${fecha}, tras el cierre)` : ''),
        },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: { cashMovementId: null },
      });
    } else {
      const movementData: Prisma.CashMovementUpdateInput = {
        amount: updated.amount,
        paymentMethod: updated.paymentMethod,
      };

      if (movement && sessionClosed && amountChanged) {
        movementData.description =
          `${movement.description} [Editado el ${fecha} tras el cierre: ` +
          `${movement.amount.toString()} → ${updated.amount.toString()}]`;
      }

      await tx.cashMovement.update({
        where: { id: updated.cashMovementId },
        data: movementData,
      });
    }

    if (movement && sessionClosed) {
      return {
        movementId: movement.id,
        sessionId: movement.cashSession!.id,
        oldAmount: movement.amount.toString(),
        newAmount: becameNonCash ? '0 (anulado)' : updated.amount.toString(),
        oldPaymentMethod: movement.paymentMethod,
        newPaymentMethod: updated.paymentMethod,
      };
    }
    return null;
  }

  if (!paymentMovesCash(previousMethod) && !becameNonCash) {
    // Camino inverso: el pago no era dinero (saldo a favor o crédito, por
    // diseño sin movimiento) y ahora sí lo es. Sin esto nacería huérfano.
    // El movimiento se crea en la sesión abierta HOY, no en la del día en
    // que se registró el crédito: el dinero entra ahora.
    const activeSession = await findActiveCashSession(tx);

    if (activeSession) {
      const receiptNumber = await params.generateReceiptNumber();
      const movement = await tx.cashMovement.create({
        data: {
          cashSessionId: activeSession.id,
          receiptNumber,
          movementType: 'INCOME',
          paymentMethod: updated.paymentMethod,
          amount: updated.amount,
          description: `Abono a Orden ${orderNumber}`,
          referenceType: 'ORDER',
          referenceId: orderId,
          performedById: userId,
        },
        select: { id: true },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: { cashMovementId: movement.id },
      });
    } else {
      await tx.payment.update({
        where: { id: paymentId },
        data: { pendingCashEntry: true },
      });
    }
  }

  return null;
}

/**
 * Deja rastro de un arqueo alterado por la edición de un pago. Va fuera de la
 * transacción y sin await bloqueante: es evidencia, no puede tumbar la edición
 * si falla.
 */
export function reportMovementEditedAfterClose(
  logger: Logger,
  auditLogsService: AuditLogsService,
  trail: MovementEditedAfterClose,
  paymentId: string,
  userId: string,
): void {
  logger.warn(
    `Movimiento ${trail.movementId} de la sesión de caja ${trail.sessionId} ` +
      `(CERRADA) fue modificado al editar el pago ${paymentId}: ` +
      `${trail.oldAmount} → ${trail.newAmount}. El arqueo de esa sesión ya no ` +
      `refleja sus movimientos.`,
  );
  auditLogsService
    .logUpdate(
      'CashMovement',
      trail.movementId,
      { amount: trail.oldAmount, paymentMethod: trail.oldPaymentMethod },
      {
        amount: trail.newAmount,
        paymentMethod: trail.newPaymentMethod,
        editedAfterSessionClose: true,
        cashSessionId: trail.sessionId,
        reason: `Edición del pago ${paymentId} sobre una sesión de caja cerrada`,
      },
      userId,
    )
    .catch(() => {});
}
