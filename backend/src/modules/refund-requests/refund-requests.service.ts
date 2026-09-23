import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createOrReturnTwin } from '../../common/utils/unique-violation.util';
import { findActiveCashSession } from '../cash-session/active-cash-session.util';
import { lockOrderForUpdate } from '../../common/utils/order-lock.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import {
  CreateRefundRequestDto,
  ApproveRefundRequestDto,
  RejectRefundRequestDto,
  ExecuteRefundRequestDto,
} from './dto';
import {
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
  OrderStatus,
  PayrollDeductionStatus,
  Prisma,
  RefundReason,
} from '../../generated/prisma';
import {
  computeAvailableOverpayment,
  computeOrderBalance,
  computeReversedNetAmount,
} from '../../common/utils/order-balance.util';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  total: true,
  paidAmount: true,
  appliedCreditAmount: true,
  refundedAmount: true,
  reversedAmount: true,
  reversedNetAmount: true,
  balance: true,
  // El descuento por nómina no es dinero que haya entrado por caja: se le restó
  // al empleado de su quincena. Devolvérselo en efectivo sacaría de la caja una
  // plata que nunca llegó.
  payrollDeduction: { select: { id: true, status: true } },
} as const;

@Injectable()
export class RefundRequestsService
  implements OnModuleInit, ApprovalRequestHandler
{
  private readonly logger = new Logger(RefundRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
    private readonly wsEventsGateway: WsEventsGateway,
    private readonly consecutivesService: ConsecutivesService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('REFUND_REQUEST', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(
    requestId: string,
  ): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `solicitud de devolución - Orden ${request.order.orderNumber}`,
    };
  }

  async approveViaWhatsApp(
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    await this.approve(requestId, reviewerId, {
      reviewNotes: 'Aprobado vía WhatsApp',
    });
  }

  async rejectViaWhatsApp(
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    await this.reject(requestId, reviewerId, {
      reviewNotes: 'Rechazado vía WhatsApp',
    });
  }

  async findReviewerByPhone(phone: string): Promise<{ id: string } | null> {
    const clean = phone.replace(/[^\d]/g, '');
    const variants = [
      clean,
      `+${clean}`,
      clean.startsWith('57') ? clean.slice(2) : null,
    ].filter(Boolean) as string[];

    return this.prisma.user.findFirst({
      where: {
        isActive: true,
        phone: { in: variants },
        role: {
          permissions: {
            some: { permission: { name: 'approve_refunds' } },
          },
        },
      },
      select: { id: true },
    });
  }

  // ─── Domain methods ───

  /**
   * Crear solicitud de devolución de dinero al cliente.
   * No mueve dinero hasta que Caja la ejecuta.
   *
   * Cubre los dos casos con la misma cuenta:
   *
   *   - Saldo a favor (`reversedAmount = 0`): el cliente pagó de más. Esa plata
   *     nunca fue una venta, así que solo hay que devolverla.
   *   - Reversión (`reversedAmount > 0`): el trabajo no cumplió o no se entregó,
   *     así que además de devolver el dinero hay que anular la venta.
   *
   * La cifra que el usuario decide es cuánta venta se anula; el dinero que puede
   * salir de la caja se deduce de ahí.
   */
  async create(userId: string, dto: CreateRefundRequestDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: ORDER_SELECT,
    });

    if (!order) {
      throw new NotFoundException(`Orden con id ${dto.orderId} no encontrada`);
    }

    // Una OP anulada sí admite devolución de su saldo a favor (lo que la empresa
    // no retuvo al anular), pero no anular más venta: la venta ya se anuló.
    if (
      order.status === OrderStatus.ANULADO &&
      new Prisma.Decimal(dto.reversedAmount ?? 0).greaterThan(0)
    ) {
      throw new BadRequestException(
        'La orden está anulada: su venta ya se anuló y solo se puede devolver el saldo a favor',
      );
    }

    if (order.status === OrderStatus.RETURNED) {
      throw new BadRequestException(
        'La orden ya fue devuelta en su totalidad: no queda nada por devolver',
      );
    }

    // Órdenes pagadas con descuento por nómina: la devolución no sale de la
    // caja, se reversa el descuento y el empleado recupera el valor en su
    // liquidación. Dejar pasar la solicitud haría que Caja pagara en efectivo un
    // trabajo que nunca cobró en efectivo.
    const deduction = order.payrollDeduction;
    if (deduction && deduction.status === PayrollDeductionStatus.APPLIED) {
      throw new BadRequestException(
        'Esta orden se pagó con descuento por nómina, así que no hay dinero en ' +
          'caja que devolver. Cancélalo desde Nómina › Descuento de Órdenes: ' +
          'el valor se le reversa al empleado en su liquidación y la orden ' +
          'vuelve a quedar con saldo.',
      );
    }
    const sinAplicar: PayrollDeductionStatus[] = [
      PayrollDeductionStatus.PENDING,
      PayrollDeductionStatus.APPROVED,
    ];
    if (deduction && sinAplicar.includes(deduction.status)) {
      throw new BadRequestException(
        'Esta orden tiene un descuento por nómina sin aplicar y todavía no se ha ' +
          'cobrado nada. Cancélalo desde Nómina › Descuento de Órdenes en vez ' +
          'de pedir una devolución.',
      );
    }

    // Validar que no exista otra solicitud pendiente para la misma orden
    const existingPending = await this.prisma.refundRequest.findFirst({
      where: {
        orderId: dto.orderId,
        status: EditRequestStatus.PENDING,
      },
      select: { id: true },
    });

    if (existingPending) {
      throw new ConflictException(
        'Ya existe una solicitud de devolución pendiente para esta orden',
      );
    }

    const reversedAmount = new Prisma.Decimal(dto.reversedAmount ?? 0);
    const alreadyReversed = new Prisma.Decimal(order.reversedAmount ?? 0);
    const pendingSaleValue = new Prisma.Decimal(order.total).sub(
      alreadyReversed,
    );

    // No se puede anular más venta de la que queda viva. Sin este tope, dos
    // devoluciones parciales sucesivas dejarían la OP valiendo menos que cero.
    if (reversedAmount.greaterThan(pendingSaleValue)) {
      throw new BadRequestException(
        `El valor a anular (${reversedAmount.toString()}) excede el valor vigente de la orden (${pendingSaleValue.toString()})`,
      );
    }

    // Dinero disponible para devolver: el excedente que queda una vez anulada
    // esa parte de la venta. Con `reversedAmount = 0` es exactamente el saldo a
    // favor de siempre, descontando lo que ya se aplicó como pago de otras
    // órdenes (ese saldo ya se gastó y no puede salir en efectivo).
    const overpayment = computeAvailableOverpayment({
      total: order.total,
      paidAmount: order.paidAmount,
      appliedCreditAmount: order.appliedCreditAmount,
      reversedAmount: alreadyReversed.add(reversedAmount),
    });

    if (overpayment.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        reversedAmount.isZero()
          ? 'La orden no tiene saldo a favor para devolver'
          : 'Anular ese valor no deja dinero por devolver: el cliente no ha abonado más de lo que quedaría debiendo',
      );
    }

    const refundAmount = new Prisma.Decimal(dto.refundAmount);
    if (refundAmount.greaterThan(overpayment)) {
      throw new BadRequestException(
        `El monto a devolver (${refundAmount.toString()}) no puede exceder el dinero disponible (${overpayment.toString()})`,
      );
    }

    // Crear la solicitud.
    //
    // La validación de arriba es un check-then-act; el índice parcial
    // `refund_requests_pending_unique` es lo que cierra la carrera del doble
    // clic. Si esta petición la pierde, se devuelve la solicitud gemela sin
    // volver a notificar.
    const include = {
      requestedBy: { select: USER_SELECT },
      order: { select: ORDER_SELECT },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'refund_requests_pending_unique',
      create: () =>
        this.prisma.refundRequest.create({
          data: {
            orderId: dto.orderId,
            refundAmount,
            reversedAmount,
            refundReason: dto.refundReason ?? RefundReason.CREDIT_BALANCE,
            paymentMethod: dto.paymentMethod,
            bankEntity: dto.bankEntity,
            // El comprobante solo tiene sentido en transferencias: en efectivo
            // el soporte es el recibo de caja que genera la propia ejecución.
            receiptFileId:
              dto.paymentMethod === 'TRANSFER' ? dto.receiptFileId ?? null : null,
            observation: dto.observation,
            status: EditRequestStatus.PENDING,
            requestedById: userId,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.refundRequest.findFirst({
          where: { orderId: dto.orderId, status: EditRequestStatus.PENDING },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de devolución duplicada para la orden ${dto.orderId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    // Notificar in-app a usuarios con approve_refunds
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    const amountFormatted = `$${Number(refundAmount).toLocaleString('es-CO')}`;
    const methodLabel = this.formatPaymentMethod(dto.paymentMethod);
    // Gerencia necesita ver en el mensaje si además se está anulando venta: no
    // es lo mismo autorizar la salida de un excedente que dar de baja un trabajo.
    const reversalNote = reversedAmount.greaterThan(0)
      ? ` Anula $${Number(reversedAmount).toLocaleString('es-CO')} de venta (${this.formatRefundReason(dto.refundReason ?? RefundReason.CREDIT_BALANCE)}).`
      : '';

    await this.notificationsService.notifyUsersWithPermission(
      'approve_refunds',
      {
        type: NotificationType.REFUND_REQUEST_PENDING,
        title: 'Nueva solicitud de devolución',
        message: `${user?.firstName || user?.email} solicita devolver ${amountFormatted} vía ${methodLabel} de la orden ${order.orderNumber}.${reversalNote} Observación: ${dto.observation}`,
        relatedId: request.id,
        relatedType: 'RefundRequest',
      },
    );

    // Notificar por WhatsApp (fire & forget)
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      'Usuario';

    this.notifyReviewersByWhatsApp(
      request.id,
      requesterName,
      `devolución de ${amountFormatted} vía ${methodLabel} de la orden ${order.orderNumber}`,
      `${reversalNote.trim()}${reversalNote ? ' ' : ''}Observación: ${dto.observation}`,
    );

    // Emitir WS
    this.wsEventsGateway.emitApprovalCreated(request);

    return request;
  }

  /**
   * Aprobar: gerencia autoriza, pero el dinero todavía no se mueve.
   *
   * Antes esta operación creaba el egreso de caja en el mismo acto, lo que
   * obligaba a tener una sesión de caja abierta para poder aprobar. Como
   * gerencia aprueba desde WhatsApp a cualquier hora, esa exigencia hacía
   * fallar la aprobación de noche. Ahora la solicitud queda APPROVED con
   * `executedAt` en null —autorizada, pendiente de pago— y Caja la ejecuta.
   */
  async approve(
    requestId: string,
    reviewerId: string,
    dto: ApproveRefundRequestDto,
  ) {
    const request = await this.prisma.refundRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    await this.validateReviewerPermission(reviewerId);

    // Se revalida contra el estado actual de la orden: entre la solicitud y la
    // aprobación pudieron entrar pagos, devoluciones o ediciones de ítems.
    this.assertRefundStillViable(request);

    const updated = await this.prisma.refundRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.REFUND_REQUEST_APPROVED,
      title: 'Devolución autorizada',
      message: `La devolución de la orden ${request.order.orderNumber} fue autorizada. Queda pendiente de pago en Caja.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    // Caja es quien paga, así que es Caja quien tiene que enterarse de que hay
    // algo esperando. Sin este aviso la solicitud queda autorizada en silencio.
    await this.notificationsService.notifyUsersWithPermission(
      'execute_refunds',
      {
        type: NotificationType.REFUND_REQUEST_APPROVED,
        title: 'Devolución pendiente de pago',
        message: `La devolución de $${Number(request.refundAmount).toLocaleString('es-CO')} de la orden ${request.order.orderNumber} fue autorizada y espera pago en Caja.`,
        relatedId: request.id,
        relatedType: 'RefundRequest',
      },
    );

    this.wsEventsGateway.emitApprovalUpdated(updated);

    return updated;
  }

  /**
   * Ejecutar: Caja paga la devolución autorizada.
   *
   * Es el único punto donde se mueve dinero. Hace cuatro cosas que van juntas o
   * no van: saca la plata de la caja, la descuenta del abono de la OP, anula la
   * parte de la venta que corresponda y, si no quedó nada de venta viva, pasa la
   * orden a "Devolución de dinero".
   */
  async execute(
    requestId: string,
    executorId: string,
    dto: ExecuteRefundRequestDto = {},
  ) {
    const request = await this.prisma.refundRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.APPROVED },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Solicitud no encontrada o no está autorizada',
      );
    }

    if (request.executedAt) {
      throw new ConflictException('Esta devolución ya fue pagada');
    }

    const activeSession = await findActiveCashSession(this.prisma);

    if (!activeSession) {
      throw new BadRequestException(
        'No hay sesión de caja abierta para registrar la devolución',
      );
    }

    // El tiempo entre autorizar y pagar puede ser de días: la orden pudo cambiar.
    // Esta es la comprobación rápida, para no gastar un número de recibo en
    // una devolución que ya no procede; la que cuenta se repite abajo, con la
    // OP bloqueada.
    this.assertRefundStillViable(request);

    const refundAmount = new Prisma.Decimal(request.refundAmount);
    const reversedAmount = new Prisma.Decimal(request.reversedAmount ?? 0);

    const receiptNumber =
      await this.consecutivesService.generateNumber('CASH_RECEIPT');

    const updated = await this.prisma.$transaction(async (tx) => {
      // El WHERE lleva la condición de no-ejecutada: aprobar dos veces movería
      // el dinero dos veces, y el `findFirst` de arriba no cierra esa carrera.
      const claimed = await tx.refundRequest.updateMany({
        where: { id: requestId, executedAt: null },
        data: { executedAt: new Date(), executedById: executorId },
      });

      if (claimed.count === 0) {
        throw new ConflictException('Esta devolución ya fue pagada');
      }

      // Los montos se calculan sobre la OP bloqueada y releída, no sobre la
      // lectura de arriba. Con esa lectura, un abono que entrara entre las dos
      // quedaba registrado en caja pero borrado del saldo de la OP. Ver
      // `lockOrderForUpdate`.
      await lockOrderForUpdate(tx, request.orderId);
      const order = await tx.order.findUnique({
        where: { id: request.orderId },
        select: ORDER_SELECT,
      });
      if (!order) {
        throw new NotFoundException(
          `Orden con id ${request.orderId} no encontrada`,
        );
      }
      this.assertRefundStillViable({ ...request, order });

      const newReversedAmount = new Prisma.Decimal(
        order.reversedAmount ?? 0,
      ).add(reversedAmount);
      // La anulación en la moneda de la comisión. Se acumula, igual que el
      // valor anulado, porque una OP puede tener varias devoluciones parciales.
      const newReversedNetAmount = new Prisma.Decimal(
        order.reversedNetAmount ?? 0,
      ).add(
        computeReversedNetAmount(
          reversedAmount,
          order.total,
          order.subtotal,
          order.discountAmount,
        ),
      );
      const newPaidAmount = new Prisma.Decimal(order.paidAmount).sub(
        refundAmount,
      );
      // `refundedAmount` acumula lo devuelto: los Payment no se borran, así que
      // sin este registro cualquier recálculo posterior de paidAmount desde los
      // pagos (p. ej. al editar un ítem) resucitaría el dinero ya devuelto.
      const newRefundedAmount = new Prisma.Decimal(
        order.refundedAmount ?? 0,
      ).add(refundAmount);
      const newBalance = computeOrderBalance({
        total: order.total,
        paidAmount: newPaidAmount,
        appliedCreditAmount: order.appliedCreditAmount,
        reversedAmount: newReversedAmount,
      });

      // La OP solo cambia de estado cuando ya no queda nada de venta en pie.
      // Una devolución parcial de un trabajo entregado a medias conserva su
      // estado: marcarla como devuelta borraría que la entrega sí ocurrió.
      // Una OP anulada ya tiene la venta anulada entera (salvo lo retenido):
      // devolverle su saldo a favor no la convierte en «Devuelta».
      const isTotalReversal =
        order.status !== OrderStatus.ANULADO &&
        newReversedAmount.greaterThanOrEqualTo(order.total) &&
        new Prisma.Decimal(order.total).greaterThan(0);

      const movement = await tx.cashMovement.create({
        data: {
          cashSessionId: activeSession.id,
          receiptNumber,
          movementType: 'EXPENSE',
          paymentMethod: request.paymentMethod,
          amount: refundAmount,
          description: `Devolución Orden ${order.orderNumber} — ${request.observation}`,
          referenceType: 'REFUND',
          referenceId: request.id,
          performedById: executorId,
        },
        select: { id: true },
      });

      await tx.order.update({
        where: { id: request.orderId },
        data: {
          paidAmount: newPaidAmount,
          refundedAmount: newRefundedAmount,
          reversedAmount: newReversedAmount,
          reversedNetAmount: newReversedNetAmount,
          balance: newBalance,
          ...(isTotalReversal ? { status: OrderStatus.RETURNED } : {}),
        },
      });

      return tx.refundRequest.update({
        where: { id: requestId },
        data: {
          cashMovementId: movement.id,
          // El comprobante del pago va aparte del que trajera la solicitud: son
          // dos transferencias distintas en el papel, y guardarlos en el mismo
          // campo haría que este borrara aquel.
          ...(request.paymentMethod === 'TRANSFER' && dto.receiptFileId
            ? { executionReceiptFileId: dto.receiptFileId }
            : {}),
        },
        include: {
          requestedBy: { select: USER_SELECT },
          reviewedBy: { select: USER_SELECT },
          executedBy: { select: USER_SELECT },
          order: { select: ORDER_SELECT },
          cashMovement: {
            select: {
              id: true,
              receiptNumber: true,
              amount: true,
              paymentMethod: true,
              movementType: true,
            },
          },
        },
      });
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.REFUND_REQUEST_APPROVED,
      title: 'Devolución pagada',
      message: `La devolución de la orden ${request.order.orderNumber} fue pagada y registrada en caja.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    this.wsEventsGateway.emitApprovalUpdated(updated);

    return updated;
  }

  /**
   * ¿La devolución sigue siendo posible contra el estado actual de la orden?
   *
   * Se llama al autorizar y al pagar porque entre la solicitud y el pago pueden
   * pasar días: pagos nuevos, otra devolución, una edición de ítems que cambia
   * el total. Aprobar a ciegas sacaría de la caja plata que la OP ya no respalda.
   */
  private assertRefundStillViable(request: {
    refundAmount: Prisma.Decimal;
    reversedAmount: Prisma.Decimal | null;
    order: {
      total: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      appliedCreditAmount: Prisma.Decimal;
      reversedAmount: Prisma.Decimal;
      status: OrderStatus;
    };
  }): void {
    const { order } = request;

    // Si la OP se anuló después de pedir la devolución, el dinero sigue
    // disponible como saldo a favor, pero la parte de venta que la solicitud
    // pensaba anular ya se anuló con la orden.
    if (
      order.status === OrderStatus.ANULADO &&
      new Prisma.Decimal(request.reversedAmount ?? 0).greaterThan(0)
    ) {
      throw new BadRequestException(
        'La orden fue anulada después de pedir la devolución: crea una nueva solicitud solo por el saldo a favor',
      );
    }

    const reversedAmount = new Prisma.Decimal(request.reversedAmount ?? 0);
    const alreadyReversed = new Prisma.Decimal(order.reversedAmount ?? 0);
    const pendingSaleValue = new Prisma.Decimal(order.total).sub(
      alreadyReversed,
    );

    if (reversedAmount.greaterThan(pendingSaleValue)) {
      throw new BadRequestException(
        'El valor a anular ya no cabe en la orden: cambió el total o hubo otra devolución',
      );
    }

    const available = computeAvailableOverpayment({
      total: order.total,
      paidAmount: order.paidAmount,
      appliedCreditAmount: order.appliedCreditAmount,
      reversedAmount: alreadyReversed.add(reversedAmount),
    });

    if (new Prisma.Decimal(request.refundAmount).greaterThan(available)) {
      throw new BadRequestException(
        `El dinero disponible en la orden (${available.toString()}) ya no alcanza para esta devolución`,
      );
    }
  }

  /**
   * Rechazar: solo actualiza estado, sin efectos financieros.
   */
  async reject(
    requestId: string,
    reviewerId: string,
    dto: RejectRefundRequestDto,
  ) {
    const request = await this.prisma.refundRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    await this.validateReviewerPermission(reviewerId);

    await this.prisma.refundRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    });

    const rejectReason = dto.reviewNotes ? ` Motivo: ${dto.reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.REFUND_REQUEST_REJECTED,
      title: 'Devolución rechazada',
      message: `La devolución de la orden ${request.order.orderNumber} ha sido rechazada.${rejectReason}`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    this.wsEventsGateway.emitApprovalUpdated({
      id: requestId,
      status: 'REJECTED',
      orderId: request.orderId,
    });

    return this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
      },
    });
  }

  async findPendingRequests() {
    return this.prisma.refundRequest.findMany({
      where: { status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            paidAmount: true,
            balance: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Autorizadas por gerencia que todavía esperan el pago de Caja.
   * Es la segunda sección del panel de Caja.
   */
  async findPendingExecution() {
    return this.prisma.refundRequest.findMany({
      where: { status: EditRequestStatus.APPROVED, executedAt: null },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            paidAmount: true,
            balance: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { reviewedAt: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.refundRequest.findMany({
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
        cashMovement: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            paymentMethod: true,
            movementType: true,
            createdAt: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(
        `Solicitud de devolución ${id} no encontrada`,
      );
    }

    return request;
  }

  async findByUser(userId: string) {
    return this.prisma.refundRequest.findMany({
      where: { requestedById: userId },
      include: {
        reviewedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByOrder(orderId: string) {
    return this.prisma.refundRequest.findMany({
      where: { orderId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        cashMovement: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async validateReviewerPermission(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const hasPermission = user?.role?.permissions?.some(
      (rp) => rp.permission.name === 'approve_refunds',
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Solo usuarios con permiso approve_refunds pueden aprobar/rechazar devoluciones',
      );
    }
  }

  private formatRefundReason(reason: RefundReason): string {
    const labels: Record<RefundReason, string> = {
      [RefundReason.CREDIT_BALANCE]: 'saldo a favor',
      [RefundReason.QUALITY]: 'calidad del trabajo',
      [RefundReason.DELIVERY_DELAY]: 'incumplimiento en la entrega',
      [RefundReason.FORCE_MAJEURE]: 'fuerza mayor',
      [RefundReason.CLIENT_WITHDRAWAL]: 'el cliente desistió',
      [RefundReason.OTHER]: 'otro motivo',
    };
    return labels[reason] ?? reason;
  }

  private formatPaymentMethod(method: string): string {
    const labels: Record<string, string> = {
      CASH: 'Efectivo',
      TRANSFER: 'Transferencia',
      CARD: 'Tarjeta',
      CHECK: 'Cheque',
      CREDIT: 'Crédito',
      OTHER: 'Otro',
    };
    return labels[method] ?? method;
  }

  private async notifyReviewersByWhatsApp(
    requestId: string,
    requesterName: string,
    actionDescription: string,
    reason: string,
  ): Promise<void> {
    try {
      const reviewerPhones =
        await this.whatsappService.getPhonesByPermission('approve_refunds');

      if (reviewerPhones.length === 0) {
        this.logger.warn(
          'No active users with approve_refunds permission and phone found for WhatsApp notification',
        );
        return;
      }

      const results = await Promise.allSettled(
        reviewerPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole: 'vendedor',
            actionDescription,
            reason,
            requestId,
            requestType: ApprovalRequestType.REFUND_REQUEST,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for refund request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: { orderId: true },
    });
    return request?.orderId ?? null;
  }
}
