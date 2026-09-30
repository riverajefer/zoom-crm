import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createOrReturnTwin } from '../../common/utils/unique-violation.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import { CreateVoidRequestDto, ReviewVoidRequestDto } from './dto';
import { EditRequestStatus, NotificationType, ApprovalRequestType, Prisma } from '../../generated/prisma';
import { queueLocationFilter } from '../../common/utils/location-context';

@Injectable()
export class CashMovementVoidRequestsService
  implements OnModuleInit, ApprovalRequestHandler
{
  private readonly logger = new Logger(CashMovementVoidRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly whatsappService: WhatsappService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    @Inject(forwardRef(() => CashMovementService))
    private readonly cashMovementService: CashMovementService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('CASH_MOVEMENT_VOID', this);
  }

  /**
   * Cómo se nombra el objetivo de una solicitud en notificaciones y mensajes.
   *
   * La solicitud apunta a un movimiento de caja o directamente a un pago: un
   * tercio de los pagos recientes nunca llega a caja (se registran fuera del
   * horario o salen de saldo a favor) y también hay que poder anularlos.
   */
  private describeTarget(request: {
    cashMovement?: { receiptNumber: string; amount?: any } | null;
    payment?: {
      amount: any;
      order?: { orderNumber: string } | null;
    } | null;
  }): { label: string; labelWithAmount: string } {
    if (request.cashMovement) {
      const label = `movimiento ${request.cashMovement.receiptNumber}`;
      return {
        label,
        labelWithAmount: request.cashMovement.amount
          ? `${label} ($${parseFloat(request.cashMovement.amount.toString()).toLocaleString('es-CO')})`
          : label,
      };
    }

    if (request.payment) {
      const orderRef = request.payment.order
        ? ` de la orden ${request.payment.order.orderNumber}`
        : '';
      const label = `pago${orderRef}`;
      return {
        label,
        labelWithAmount: `${label} ($${parseFloat(request.payment.amount.toString()).toLocaleString('es-CO')})`,
      };
    }

    return { label: 'movimiento', labelWithAmount: 'movimiento' };
  }

  /** Ejecuta la anulación según a qué apunte la solicitud. */
  private async executeVoid(
    request: {
      cashMovementId: string | null;
      paymentId: string | null;
      voidReason: string;
    },
    reviewerId: string,
  ): Promise<void> {
    if (request.cashMovementId) {
      await this.cashMovementService.voidMovement(
        request.cashMovementId,
        { voidReason: request.voidReason },
        reviewerId,
      );
      return;
    }
    if (request.paymentId) {
      await this.cashMovementService.voidPaymentWithoutMovement(
        request.paymentId,
        reviewerId,
        request.voidReason,
      );
    }
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(
    requestId: string,
  ): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.cashMovementVoidRequest.findUnique({
      where: { id: requestId },
      include: {
        cashMovement: { select: { receiptNumber: true, amount: true } },
        payment: {
          select: {
            amount: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `Anulación del ${this.describeTarget(request).label}`,
    };
  }

  async approveViaWhatsApp(
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    const request = await this.prisma.cashMovementVoidRequest.findUnique({
      where: { id: requestId },
      include: {
        cashMovement: { select: { id: true, receiptNumber: true, amount: true } },
        payment: {
          select: {
            amount: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
    });

    if (!request || request.status !== EditRequestStatus.PENDING) return;

    // Update request status
    await this.prisma.cashMovementVoidRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
      },
    });

    // Execute the actual void
    await this.executeVoid(request, reviewerId);

    // Notify requester
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CASH_VOID_REQUEST_APPROVED,
      title: 'Solicitud de anulación aprobada',
      message: `Tu solicitud para anular el ${this.describeTarget(request).label} ha sido aprobada y ejecutada.`,
      relatedId: request.cashMovementId ?? request.paymentId ?? undefined,
      relatedType: request.cashMovementId ? 'CashMovement' : 'Payment',
    });
  }

  async rejectViaWhatsApp(
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    const request = await this.prisma.cashMovementVoidRequest.findUnique({
      where: { id: requestId },
      include: {
        cashMovement: { select: { receiptNumber: true, amount: true } },
        payment: {
          select: {
            amount: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
    });

    if (!request || request.status !== EditRequestStatus.PENDING) return;

    await this.prisma.cashMovementVoidRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CASH_VOID_REQUEST_REJECTED,
      title: 'Solicitud de anulación rechazada',
      message: `Tu solicitud para anular el ${this.describeTarget(request).label} ha sido rechazada.`,
      relatedId: request.cashMovementId ?? request.paymentId ?? undefined,
      relatedType: request.cashMovementId ? 'CashMovement' : 'Payment',
    });
  }

  // ─── Domain methods ───

  /**
   * Crea una solicitud de anulación sobre un movimiento de caja o sobre un pago.
   *
   * `target` lleva uno de los dos. El pago suelto no es un caso raro: un tercio
   * de los pagos recientes nunca llega a caja (se registran fuera del horario o
   * salen de saldo a favor), y son justo los que el comercial necesita poder
   * pedir que se anulen.
   */
  async create(
    target: { cashMovementId?: string; paymentId?: string },
    userId: string,
    dto: CreateVoidRequestDto,
  ) {
    const { cashMovementId, paymentId } = target;
    if (!cashMovementId && !paymentId) {
      throw new BadRequestException(
        'La solicitud de anulación necesita un movimiento de caja o un pago',
      );
    }

    // 1. Validar que el objetivo existe y no está anulado ya
    if (cashMovementId) {
      const movement = await this.prisma.cashMovement.findUnique({
        where: { id: cashMovementId },
        select: { isVoided: true },
      });

      if (!movement) {
        throw new NotFoundException(
          `Movimiento de caja ${cashMovementId} no encontrado`,
        );
      }
      if (movement.isVoided) {
        throw new BadRequestException('El movimiento ya está anulado');
      }
    } else {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { isVoided: true },
      });

      if (!payment) {
        throw new NotFoundException(`Pago ${paymentId} no encontrado`);
      }
      if (payment.isVoided) {
        throw new BadRequestException('El pago ya está anulado');
      }
    }

    // Una sesión cerrada NO impide solicitar la anulación: es justamente el caso
    // en que hace falta, porque el error casi siempre se detecta al día
    // siguiente. Al aprobarla, la reversa se registra en la sesión abierta de esa
    // caja (ver `resolveCounterSessionId`), sin tocar el cierre ya firmado.

    // 2. Check no pending request already exists
    const existing = await this.prisma.cashMovementVoidRequest.findFirst({
      where: {
        ...(cashMovementId ? { cashMovementId } : { paymentId }),
        status: EditRequestStatus.PENDING,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Ya existe una solicitud de anulación pendiente para este pago',
      );
    }

    // 3. Create the request
    //
    // La solicitud apunta a un movimiento o a un pago, nunca a los dos, así que
    // hay un índice parcial por cada columna. El que se viola depende de cuál
    // venga, y ambos cierran la misma carrera del doble clic.
    const include = {
      requestedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      cashMovement: {
        select: {
          id: true,
          receiptNumber: true,
          amount: true,
          movementType: true,
          description: true,
        },
      },
      payment: {
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          order: { select: { id: true, orderNumber: true } },
        },
      },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: cashMovementId
        ? 'cash_movement_void_requests_pending_movement_unique'
        : 'cash_movement_void_requests_pending_payment_unique',
      create: () =>
        this.prisma.cashMovementVoidRequest.create({
          data: {
            cashMovementId,
            paymentId,
            requestedById: userId,
            voidReason: dto.voidReason,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.cashMovementVoidRequest.findFirst({
          where: {
            ...(cashMovementId ? { cashMovementId } : { paymentId }),
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de anulación duplicada para ${cashMovementId ? `el movimiento ${cashMovementId}` : `el pago ${paymentId}`}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    // 4. Notify admins in-app
    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.CASH_VOID_REQUEST_PENDING,
      title: 'Nueva solicitud de anulación',
      message: `${request.requestedBy.firstName || request.requestedBy.email} solicita anular el ${this.describeTarget(request).labelWithAmount}`,
      relatedId: request.id,
      relatedType: 'CashMovementVoidRequest',
    });

    // 5. Notify admins via WhatsApp (fire-and-forget)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      request.requestedBy.email ||
      'Usuario';
    const requesterRole = user?.role?.name || 'usuario';

    this.notifyAdminsByWhatsApp(
      request.id,
      requesterName,
      requesterRole,
      `Anular ${this.describeTarget(request).labelWithAmount}`,
      dto.voidReason,
    );

    return request;
  }

  async approve(
    requestId: string,
    adminId: string,
    dto: ReviewVoidRequestDto,
  ) {
    // 1. Validate request exists and is PENDING
    const request = await this.prisma.cashMovementVoidRequest.findFirst({
      where: {
        id: requestId,
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: true,
        cashMovement: { select: { id: true, receiptNumber: true, amount: true } },
        payment: {
          select: {
            amount: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Solicitud de anulación no encontrada o ya fue procesada',
      );
    }

    // 2. Validate reviewer is admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException(
        'Solo los administradores pueden aprobar solicitudes',
      );
    }

    // 3. Update request
    const updatedRequest = await this.prisma.cashMovementVoidRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        cashMovement: { select: { id: true, receiptNumber: true, amount: true } },
        payment: {
          select: {
            amount: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
    });

    // 4. Execute the actual void
    await this.executeVoid(request, adminId);

    // 5. Notify requester
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CASH_VOID_REQUEST_APPROVED,
      title: 'Solicitud de anulación aprobada',
      message: `Tu solicitud para anular el ${this.describeTarget(request).label} ha sido aprobada y ejecutada.`,
      relatedId: request.cashMovementId ?? request.paymentId ?? undefined,
      relatedType: request.cashMovementId ? 'CashMovement' : 'Payment',
    });

    return updatedRequest;
  }

  async reject(
    requestId: string,
    adminId: string,
    dto: ReviewVoidRequestDto,
  ) {
    // 1. Validate request exists and is PENDING
    const request = await this.prisma.cashMovementVoidRequest.findFirst({
      where: {
        id: requestId,
        status: EditRequestStatus.PENDING,
      },
      include: {
        requestedBy: true,
        cashMovement: { select: { receiptNumber: true, amount: true } },
        payment: {
          select: {
            amount: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Solicitud de anulación no encontrada o ya fue procesada',
      );
    }

    // 2. Validate reviewer is admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException(
        'Solo los administradores pueden rechazar solicitudes',
      );
    }

    // 3. Update request
    const updatedRequest = await this.prisma.cashMovementVoidRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // 4. Notify requester
    const rejectReason = dto.reviewNotes
      ? ` Motivo: ${dto.reviewNotes}`
      : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.CASH_VOID_REQUEST_REJECTED,
      title: 'Solicitud de anulación rechazada',
      message: `Tu solicitud para anular el ${this.describeTarget(request).label} ha sido rechazada.${rejectReason}`,
      relatedId: request.cashMovementId ?? request.paymentId ?? undefined,
      relatedType: request.cashMovementId ? 'CashMovement' : 'Payment',
    });

    return updatedRequest;
  }

  private readonly defaultInclude = {
    cashMovement: {
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        movementType: true,
        description: true,
        paymentMethod: true,
      },
    },
    // Sin esto, una solicitud sobre un pago que nunca pasó por caja le llega al
    // admin sin recibo, sin tipo y con monto $0: imposible de decidir.
    payment: {
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        order: { select: { id: true, orderNumber: true } },
      },
    },
    requestedBy: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
    reviewedBy: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
  };

  /**
   * Sede de una solicitud de anulación: la de la caja del movimiento, o la de
   * la OP si el pago nunca pasó por caja. Ver `queueLocationFilter`.
   */
  private queueWhere(): Prisma.CashMovementVoidRequestWhereInput {
    const sede = queueLocationFilter();
    if (!sede.locationId) return {};
    return {
      OR: [
        { cashMovement: { cashSession: { cashRegister: sede } } },
        { payment: { order: sede } },
      ],
    };
  }

  async findAllPending() {
    return this.prisma.cashMovementVoidRequest.findMany({
      where: { status: EditRequestStatus.PENDING, ...this.queueWhere() },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.cashMovementVoidRequest.findMany({
      where: this.queueWhere(),
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByMovement(cashMovementId: string) {
    return this.prisma.cashMovementVoidRequest.findMany({
      where: { cashMovementId },
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async notifyAdminsByWhatsApp(
    requestId: string,
    requesterName: string,
    requesterRole: string,
    actionDescription: string,
    reason: string,
  ): Promise<void> {
    try {
      const adminPhones = await this.whatsappService.getAdminPhones();

      if (adminPhones.length === 0) {
        this.logger.warn(
          'No active administrators with phone number found for WhatsApp notification',
        );
        return;
      }

      const results = await Promise.allSettled(
        adminPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole,
            actionDescription,
            reason,
            requestId,
            requestType: ApprovalRequestType.CASH_MOVEMENT_VOID,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for void request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.cashMovementVoidRequest.findUnique({
      where: { id: requestId },
      include: { cashMovement: { select: { cashSessionId: true } } },
    });
    return request?.cashMovement?.cashSessionId ?? null;
  }
}
