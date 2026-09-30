import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApPaymentReversalStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import {
  CajaRejectApPaymentReversalDto,
  CreateApPaymentReversalRequestDto,
  GerenciaRejectApPaymentReversalDto,
} from './dto';
import { queueLocationFilter } from '../../common/utils/location-context';

const USER_SELECT = { id: true, email: true, firstName: true, lastName: true } as const;

@Injectable()
export class AccountsPayablePaymentReversalRequestsService {
  private readonly logger = new Logger(AccountsPayablePaymentReversalRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Crear solicitud de reversión ────────────────────────────────────────────

  async create(userId: string, dto: CreateApPaymentReversalRequestDto) {
    const authRequest = await this.prisma.accountPayablePaymentAuthRequest.findUnique({
      where: { id: dto.paymentAuthRequestId },
      include: {
        accountPayable: { select: { apNumber: true, id: true } },
        createdPayment: { select: { id: true, amount: true, isReversed: true } },
        reversalRequest: true,
      },
    });

    if (!authRequest) {
      throw new NotFoundException(`Solicitud de pago ${dto.paymentAuthRequestId} no encontrada`);
    }
    if (authRequest.status !== 'COMPLETED') {
      throw new BadRequestException('Solo se pueden revertir pagos completados');
    }
    if (!authRequest.createdPayment) {
      throw new BadRequestException('La solicitud de pago no tiene un pago registrado asociado');
    }
    if (authRequest.createdPayment.isReversed) {
      throw new BadRequestException('Este pago ya fue revertido');
    }
    if (authRequest.reversalRequest) {
      throw new BadRequestException('Ya existe una solicitud de reversión para este pago');
    }

    const reversal = await this.prisma.accountPayablePaymentReversalRequest.create({
      data: {
        reason: dto.reason,
        paymentAuthRequest: { connect: { id: dto.paymentAuthRequestId } },
        requestedBy: { connect: { id: userId } },
        status: ApPaymentReversalStatus.PENDING_GERENCIA,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: { accountPayable: { select: { id: true, apNumber: true } } },
        },
      },
    });

    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.AP_PAYMENT_REVERSAL_REQUESTED,
      title: 'Nueva solicitud de reversión de pago CP',
      message: `Se solicita revertir el pago de la CP ${authRequest.accountPayable.apNumber}. Motivo: ${dto.reason}`,
      relatedId: reversal.id,
      relatedType: 'AccountPayablePaymentReversalRequest',
    });

    return reversal;
  }

  // ─── Paso 1: Gerencia aprueba ─────────────────────────────────────────────────

  async gerenciaApprove(id: string, userId: string) {
    const reversal = await this.prisma.accountPayablePaymentReversalRequest.findFirst({
      where: { id, status: ApPaymentReversalStatus.PENDING_GERENCIA },
      include: {
        requestedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: { accountPayable: { select: { apNumber: true } } },
        },
      },
    });
    if (!reversal) throw new NotFoundException('Solicitud no encontrada o ya procesada');

    const updated = await this.prisma.accountPayablePaymentReversalRequest.update({
      where: { id },
      data: {
        status: ApPaymentReversalStatus.PENDING_CAJA,
        gerenciaReviewedById: userId,
        gerenciaReviewedAt: new Date(),
      },
      include: {
        requestedBy: { select: USER_SELECT },
        gerenciaReviewedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: { accountPayable: { select: { id: true, apNumber: true } } },
        },
      },
    });

    await this.notificationsService.create({
      userId: reversal.requestedById,
      type: NotificationType.AP_PAYMENT_REVERSAL_GERENCIA_APPROVED,
      title: 'Reversión de pago aprobada por Gerencia',
      message: `La reversión del pago de la CP ${reversal.paymentAuthRequest.accountPayable.apNumber} fue aprobada por Gerencia. Pendiente de confirmación de Caja.`,
      relatedId: id,
      relatedType: 'AccountPayablePaymentReversalRequest',
    });

    await this.notifyCajaPendingReversal(
      id,
      reversal.paymentAuthRequest.accountPayable.apNumber,
      Number(reversal.paymentAuthRequest.amount),
      reversal.reason,
    );

    return updated;
  }

  // ─── Paso 1: Gerencia rechaza ─────────────────────────────────────────────────

  async gerenciaReject(id: string, userId: string, dto: GerenciaRejectApPaymentReversalDto) {
    const reversal = await this.prisma.accountPayablePaymentReversalRequest.findFirst({
      where: { id, status: ApPaymentReversalStatus.PENDING_GERENCIA },
      include: {
        requestedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: { accountPayable: { select: { apNumber: true } } },
        },
      },
    });
    if (!reversal) throw new NotFoundException('Solicitud no encontrada o ya procesada');

    const updated = await this.prisma.accountPayablePaymentReversalRequest.update({
      where: { id },
      data: {
        status: ApPaymentReversalStatus.REJECTED_BY_GERENCIA,
        gerenciaReviewedById: userId,
        gerenciaReviewedAt: new Date(),
        gerenciaRejectionNotes: dto.rejectionNotes,
      },
    });

    await this.notificationsService.create({
      userId: reversal.requestedById,
      type: NotificationType.AP_PAYMENT_REVERSAL_GERENCIA_REJECTED,
      title: 'Reversión de pago rechazada por Gerencia',
      message: `La reversión del pago de la CP ${reversal.paymentAuthRequest.accountPayable.apNumber} fue rechazada.${dto.rejectionNotes ? ` Motivo: ${dto.rejectionNotes}` : ''}`,
      relatedId: id,
      relatedType: 'AccountPayablePaymentReversalRequest',
    });

    return updated;
  }

  // ─── Paso 2: Caja confirma y ejecuta la reversión ────────────────────────────

  async cajaApprove(id: string, currentUser: AuthenticatedUser) {
    const reversal = await this.prisma.accountPayablePaymentReversalRequest.findFirst({
      where: { id, status: ApPaymentReversalStatus.PENDING_CAJA },
      include: {
        requestedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: {
            accountPayable: { select: { id: true, apNumber: true, totalAmount: true } },
            createdPayment: true,
          },
        },
      },
    });
    if (!reversal) {
      throw new NotFoundException('Solicitud no encontrada o no está en estado PENDING_CAJA');
    }

    const payment = reversal.paymentAuthRequest.createdPayment;
    if (!payment) {
      throw new BadRequestException('No se encontró el pago asociado a esta solicitud');
    }
    if (payment.isReversed) {
      throw new BadRequestException('El pago ya fue revertido');
    }

    const ap = reversal.paymentAuthRequest.accountPayable;
    const paymentAmount = Number(payment.amount);

    await this.prisma.$transaction(async (tx) => {
      // 1. Marcar reversalRequest como COMPLETED
      await tx.accountPayablePaymentReversalRequest.update({
        where: { id },
        data: {
          status: ApPaymentReversalStatus.COMPLETED,
          cajaReviewedById: currentUser.id,
          cajaReviewedAt: new Date(),
        },
      });

      // 2. Marcar el pago como revertido
      await tx.accountPayablePayment.update({
        where: { id: payment.id },
        data: { isReversed: true, reversedAt: new Date() },
      });

      // 3. Anular el CashMovement administrativamente (sin requerir sesión abierta)
      if (payment.cashMovementId) {
        await tx.cashMovement.update({
          where: { id: payment.cashMovementId },
          data: {
            isVoided: true,
            voidedById: currentUser.id,
            voidedAt: new Date(),
            voidReason: `Reversión de pago CP ${ap.apNumber} — solicitud ${id}`,
          },
        });
      }

      // 4. Revertir balance en AccountPayable.
      //
      // Se recalcula desde los pagos que siguen vivos, no restándole el monto al
      // acumulado: una CP que ya venía descuadrada se corrige sola al revertir,
      // y desaparecen los topes defensivos (`< 0 ? 0`, `> total ? total`) que
      // existían para tapar justamente esa deriva. Con Decimal, además, no hay
      // residuos de coma flotante decidiendo si la cuenta queda en PENDING.
      const vivos = await tx.accountPayablePayment.findMany({
        where: { accountPayableId: ap.id, isReversed: false },
        select: { amount: true },
      });

      const currentAp = await tx.accountPayable.findUniqueOrThrow({ where: { id: ap.id } });
      const newPaidAmount = vivos.reduce(
        (sum, p) => sum.add(p.amount),
        new Prisma.Decimal(0),
      );
      const newBalance = new Prisma.Decimal(currentAp.totalAmount).sub(newPaidAmount);

      await tx.accountPayable.update({
        where: { id: ap.id },
        data: {
          paidAmount: newPaidAmount,
          balance: newBalance,
          status: newPaidAmount.lessThanOrEqualTo(0) ? 'PENDING' : 'PARTIAL',
        },
      });
    });

    await this.notificationsService.create({
      userId: reversal.requestedById,
      type: NotificationType.AP_PAYMENT_REVERSAL_COMPLETED,
      title: 'Reversión de pago completada',
      message: `El pago de la CP ${ap.apNumber} fue revertido exitosamente por Caja.`,
      relatedId: id,
      relatedType: 'AccountPayablePaymentReversalRequest',
    });

    return { success: true, reversalId: id, accountPayableId: ap.id };
  }

  // ─── Paso 2: Caja rechaza ─────────────────────────────────────────────────────

  async cajaReject(id: string, currentUser: AuthenticatedUser, dto: CajaRejectApPaymentReversalDto) {
    const reversal = await this.prisma.accountPayablePaymentReversalRequest.findFirst({
      where: { id, status: ApPaymentReversalStatus.PENDING_CAJA },
      include: {
        requestedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: { accountPayable: { select: { apNumber: true } } },
        },
      },
    });
    if (!reversal) {
      throw new NotFoundException('Solicitud no encontrada o no está en estado PENDING_CAJA');
    }

    const updated = await this.prisma.accountPayablePaymentReversalRequest.update({
      where: { id },
      data: {
        status: ApPaymentReversalStatus.REJECTED_BY_CAJA,
        cajaReviewedById: currentUser.id,
        cajaReviewedAt: new Date(),
        cajaRejectionNotes: dto.rejectionNotes,
      },
    });

    await this.notificationsService.create({
      userId: reversal.requestedById,
      type: NotificationType.AP_PAYMENT_REVERSAL_CAJA_REJECTED,
      title: 'Reversión de pago rechazada por Caja',
      message: `La reversión del pago de la CP ${reversal.paymentAuthRequest.accountPayable.apNumber} fue rechazada por Caja.${dto.rejectionNotes ? ` Motivo: ${dto.rejectionNotes}` : ''}`,
      relatedId: id,
      relatedType: 'AccountPayablePaymentReversalRequest',
    });

    return updated;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────────

  async findPendingGerencia() {
    return this.prisma.accountPayablePaymentReversalRequest.findMany({
      where: {
        status: ApPaymentReversalStatus.PENDING_GERENCIA,
        paymentAuthRequest: { accountPayable: queueLocationFilter() },
      },
      include: {
        requestedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: {
            accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true, description: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingCaja() {
    return this.prisma.accountPayablePaymentReversalRequest.findMany({
      where: {
        status: ApPaymentReversalStatus.PENDING_CAJA,
        paymentAuthRequest: { accountPayable: queueLocationFilter() },
      },
      include: {
        requestedBy: { select: USER_SELECT },
        gerenciaReviewedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: {
            accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true, description: true } },
          },
        },
      },
      orderBy: { gerenciaReviewedAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.accountPayablePaymentReversalRequest.findMany({
      where: { paymentAuthRequest: { accountPayable: queueLocationFilter() } },
      include: {
        requestedBy: { select: USER_SELECT },
        gerenciaReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: {
            accountPayable: { select: { id: true, apNumber: true, totalAmount: true, description: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const reversal = await this.prisma.accountPayablePaymentReversalRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: USER_SELECT },
        gerenciaReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
        paymentAuthRequest: {
          include: {
            accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true, description: true } },
            createdPayment: { select: { id: true, amount: true, isReversed: true, reversedAt: true } },
          },
        },
      },
    });
    if (!reversal) throw new NotFoundException(`Solicitud de reversión ${id} no encontrada`);
    return reversal;
  }

  async findByPaymentAuthRequest(paymentAuthRequestId: string) {
    return this.prisma.accountPayablePaymentReversalRequest.findUnique({
      where: { paymentAuthRequestId },
      include: {
        requestedBy: { select: USER_SELECT },
        gerenciaReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
      },
    });
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────────

  private async notifyCajaPendingReversal(
    reversalId: string,
    apNumber: string,
    amount: number,
    reason: string,
  ) {
    try {
      const cajaUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: {
            permissions: { some: { permission: { name: 'caja_confirm_ap_payment_reversal' } } },
          },
        },
        select: { id: true },
      });

      const amountFormatted = amount.toLocaleString('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      });

      await Promise.allSettled(
        cajaUsers.map((u) =>
          this.notificationsService.create({
            userId: u.id,
            type: NotificationType.AP_PAYMENT_REVERSAL_GERENCIA_APPROVED,
            title: 'Reversión de pago pendiente de tu confirmación',
            message: `Gerencia aprobó revertir el pago de ${amountFormatted} en CP ${apNumber}. Motivo: ${reason}. ID: ${reversalId}`,
            relatedId: reversalId,
            relatedType: 'AccountPayablePaymentReversalRequest',
          }),
        ),
      );
    } catch (error: any) {
      this.logger.error(`Error notifying caja for reversal ${reversalId}: ${error.message}`);
    }
  }
}
