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
import { findActiveCashSessionForLocation } from '../cash-session/active-cash-session.util';
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
  PaymentMethod,
  PayrollDeductionStatus,
  Prisma,
  RefundReason,
  WorkOrderStatus,
} from '../../generated/prisma';
import {
  computeAvailableOverpayment,
  computeItemsSaleValue,
  computeOrderBalance,
  computeReversedNetAmount,
} from '../../common/utils/order-balance.util';
import { queueLocationFilter } from '../../common/utils/location-context';

const ITEMS_SELECT = {
  select: {
    id: true,
    orderItemId: true,
    description: true,
    quantity: true,
    unitPrice: true,
    amount: true,
  },
} as const;

interface AnnulledItemLine {
  orderItemId: string;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
}

/** Lo que `applyToOrder` necesita de una solicitud para llevarla a la OP. */
interface ApplicableRequest {
  id: string;
  orderId: string;
  refundAmount: Prisma.Decimal;
  reversedAmount: Prisma.Decimal | null;
  paymentMethod: PaymentMethod;
  observation: string;
}

const formatCOP = (value: Prisma.Decimal | number): string =>
  `$${Number(value).toLocaleString('es-CO')}`;

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  locationId: true,
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

    const isItemAnnulment = (dto.items?.length ?? 0) > 0;

    // Una OP anulada sí admite devolución de su saldo a favor (lo que la empresa
    // no retuvo al anular), pero no anular más venta: la venta ya se anuló.
    if (
      order.status === OrderStatus.ANULADO &&
      (isItemAnnulment ||
        new Prisma.Decimal(dto.reversedAmount ?? 0).greaterThan(0))
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

    // Validar que no exista otra solicitud en curso para la misma orden: ni
    // pendiente de autorización, ni autorizada que Caja todavía no ha pagado.
    // En esa segunda ventana el dinero aún no se ha movido, así que una
    // solicitud nueva se calcularía sobre un saldo que está por cambiar.
    const existingInProgress = await this.prisma.refundRequest.findFirst({
      where: {
        orderId: dto.orderId,
        OR: [
          { status: EditRequestStatus.PENDING },
          { status: EditRequestStatus.APPROVED, executedAt: null },
        ],
      },
      select: { id: true, status: true },
    });

    if (existingInProgress) {
      throw new ConflictException(
        existingInProgress.status === EditRequestStatus.APPROVED
          ? 'Esta orden tiene una devolución autorizada pendiente de pago: Caja debe registrar el pago antes de solicitar otra'
          : 'Ya existe una solicitud de devolución pendiente para esta orden',
      );
    }

    // Anulación por ítems: el usuario dice qué se cae y cuánto retiene la
    // empresa, y la venta anulada sale de ahí. Aceptar además un
    // `reversedAmount` suelto dejaría dos cifras que pueden contradecirse.
    const retainedAmount = new Prisma.Decimal(dto.retainedAmount ?? 0);
    if (!isItemAnnulment && retainedAmount.greaterThan(0)) {
      throw new BadRequestException(
        'El valor retenido solo aplica cuando se anulan ítems de la orden',
      );
    }

    const itemLines = isItemAnnulment
      ? await this.resolveAnnulledItems(dto.orderId, dto.items!)
      : [];
    const itemsSaleValue = computeItemsSaleValue(
      itemLines.reduce(
        (sum, line) => sum.add(line.amount),
        new Prisma.Decimal(0),
      ),
      order.total,
      order.subtotal,
    );

    if (isItemAnnulment && retainedAmount.greaterThanOrEqualTo(itemsSaleValue)) {
      throw new BadRequestException(
        `El valor retenido (${retainedAmount.toString()}) debe ser menor que lo que valen los ítems anulados (${itemsSaleValue.toString()})`,
      );
    }

    const reversedAmount = isItemAnnulment
      ? itemsSaleValue.sub(retainedAmount)
      : new Prisma.Decimal(dto.reversedAmount ?? 0);
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

    // Anular ítems no exige que sobre plata: si el cliente no ha abonado más de
    // lo que queda debiendo, la anulación solo baja el saldo de la orden. Una
    // devolución por monto sin nada que devolver, en cambio, no tiene sentido.
    if (!isItemAnnulment && overpayment.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        reversedAmount.isZero()
          ? 'La orden no tiene saldo a favor para devolver'
          : 'Anular ese valor no deja dinero por devolver: el cliente no ha abonado más de lo que quedaría debiendo',
      );
    }

    const refundAmount = new Prisma.Decimal(dto.refundAmount);
    if (!isItemAnnulment && refundAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('El monto a devolver debe ser mayor a 0');
    }
    if (refundAmount.greaterThan(overpayment)) {
      throw new BadRequestException(
        `El monto a devolver (${refundAmount.toString()}) no puede exceder el dinero disponible (${overpayment.toString()})`,
      );
    }
    if (refundAmount.greaterThan(0) && !dto.paymentMethod) {
      throw new BadRequestException(
        'Indica el método de pago por el que saldrá el dinero',
      );
    }
    // La columna no admite nulo. En una anulación sin dinero no hay pago que
    // describir: el valor queda de relleno y nadie lo lee, porque no se crea
    // movimiento de caja.
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.CASH;

    // Crear la solicitud.
    //
    // La validación de arriba es un check-then-act; el índice parcial
    // `refund_requests_pending_unique` es lo que cierra la carrera del doble
    // clic. Si esta petición la pierde, se devuelve la solicitud gemela sin
    // volver a notificar.
    const include = {
      requestedBy: { select: USER_SELECT },
      order: { select: ORDER_SELECT },
      items: ITEMS_SELECT,
    };

    // Una anulación de ítems nunca es "saldo a favor": si el formulario no
    // manda motivo, el que queda es el genérico.
    const refundReason =
      dto.refundReason ??
      (isItemAnnulment ? RefundReason.OTHER : RefundReason.CREDIT_BALANCE);

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'refund_requests_pending_unique',
      create: () =>
        this.prisma.refundRequest.create({
          data: {
            orderId: dto.orderId,
            refundAmount,
            reversedAmount,
            retainedAmount,
            refundReason,
            paymentMethod,
            bankEntity: dto.bankEntity,
            // El comprobante solo tiene sentido en transferencias: en efectivo
            // el soporte es el recibo de caja que genera la propia ejecución.
            receiptFileId:
              paymentMethod === 'TRANSFER' ? dto.receiptFileId ?? null : null,
            observation: dto.observation,
            status: EditRequestStatus.PENDING,
            requestedById: userId,
            ...(isItemAnnulment ? { items: { create: itemLines } } : {}),
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

    const amountFormatted = formatCOP(refundAmount);
    const methodLabel = this.formatPaymentMethod(paymentMethod);

    // Notificar por WhatsApp (fire & forget)
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      'Usuario';

    if (isItemAnnulment) {
      // Gerencia autoriza dos cosas distintas en un mismo mensaje: qué trabajo
      // se cae y cuánta plata sale. Las dos tienen que leerse sin abrir la OP.
      const itemsNote = `Anula ${this.describeItemLines(itemLines)} por ${formatCOP(itemsSaleValue)}.`;
      const retainedNote = retainedAmount.greaterThan(0)
        ? ` La empresa retiene ${formatCOP(retainedAmount)}.`
        : '';
      const moneyNote = refundAmount.greaterThan(0)
        ? ` Se devuelven ${amountFormatted} vía ${methodLabel}.`
        : ' No sale dinero de caja.';

      await this.notificationsService.notifyUsersWithPermission(
        'approve_refunds',
        {
          type: NotificationType.REFUND_REQUEST_PENDING,
          title: 'Nueva solicitud de anulación de ítems',
          message: `${user?.firstName || user?.email} solicita anular ítems de la orden ${order.orderNumber}. ${itemsNote}${retainedNote}${moneyNote} Observación: ${dto.observation}`,
          relatedId: request.id,
          relatedType: 'RefundRequest',
        },
        { orderId: request.orderId },
      );

      this.notifyReviewersByWhatsApp(
        request.id,
        requesterName,
        `anulación de ítems de la orden ${order.orderNumber}`,
        `${itemsNote}${retainedNote}${moneyNote} Observación: ${dto.observation}`,
      );
    } else {
      // Gerencia necesita ver en el mensaje si además se está anulando venta: no
      // es lo mismo autorizar la salida de un excedente que dar de baja un trabajo.
      const reversalNote = reversedAmount.greaterThan(0)
        ? ` Anula ${formatCOP(reversedAmount)} de venta (${this.formatRefundReason(refundReason)}).`
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
        { orderId: request.orderId },
      );

      this.notifyReviewersByWhatsApp(
        request.id,
        requesterName,
        `devolución de ${amountFormatted} vía ${methodLabel} de la orden ${order.orderNumber}`,
        `${reversalNote.trim()}${reversalNote ? ' ' : ''}Observación: ${dto.observation}`,
      );
    }

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
    await this.loadAnnullableLines(this.prisma, requestId);

    // Una anulación de ítems que no devuelve dinero no tiene nada que esperar
    // de Caja: autorizarla es aplicarla. Dejarla en "pendiente de pago" la
    // mandaría a una bandeja donde nadie tiene qué pagar.
    if (new Prisma.Decimal(request.refundAmount).isZero()) {
      return this.approveAndApply(request, reviewerId, dto);
    }

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
        items: ITEMS_SELECT,
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
      { orderId: request.orderId },
    );

    this.wsEventsGateway.emitApprovalUpdated(updated);

    return updated;
  }

  /**
   * Autorizar y aplicar en el mismo acto: anulación de ítems sin dinero de por
   * medio. No pasa por Caja ni exige sesión abierta, porque no mueve plata.
   */
  private async approveAndApply(
    request: ApplicableRequest & {
      requestedById: string;
      order: { orderNumber: string };
    },
    reviewerId: string,
    dto: ApproveRefundRequestDto,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // El WHERE lleva el estado: dos aprobaciones seguidas (panel y WhatsApp)
      // anularían los ítems dos veces.
      const claimed = await tx.refundRequest.updateMany({
        where: { id: request.id, status: EditRequestStatus.PENDING },
        data: {
          status: EditRequestStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: now,
          reviewNotes: dto.reviewNotes,
        },
      });
      if (claimed.count === 0) {
        throw new NotFoundException('Solicitud no encontrada o ya procesada');
      }

      await this.applyToOrder(tx, request, null);

      // Queda ejecutada sin movimiento de caja: quien autorizó es quien la aplicó.
      return tx.refundRequest.update({
        where: { id: request.id },
        data: { executedAt: now, executedById: reviewerId },
        include: {
          requestedBy: { select: USER_SELECT },
          reviewedBy: { select: USER_SELECT },
          executedBy: { select: USER_SELECT },
          order: { select: ORDER_SELECT },
          items: ITEMS_SELECT,
        },
      });
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.REFUND_REQUEST_APPROVED,
      title: 'Anulación de ítems aplicada',
      message: `La anulación de ítems de la orden ${request.order.orderNumber} fue autorizada y ya quedó aplicada. No hubo devolución de dinero.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    await this.notifyWorkshopOfAnnulledItems(
      request.id,
      request.orderId,
      request.order.orderNumber,
    );

    this.wsEventsGateway.emitApprovalUpdated(updated);

    return updated;
  }

  /**
   * Lleva la solicitud a la OP: anula la venta, marca los ítems, descuenta lo
   * devuelto del abono y, si sale dinero, crea el egreso de caja.
   *
   * Es la única función que escribe estos campos. La llaman Caja al pagar y
   * gerencia al autorizar una anulación sin dinero (`cash` en null), y las dos
   * tienen que hacer exactamente la misma cuenta.
   *
   * Calcula sobre la OP bloqueada y releída, no sobre la lectura del llamador:
   * con esa lectura, un abono que entrara entre las dos quedaba registrado en
   * caja pero borrado del saldo de la OP. Ver `lockOrderForUpdate`.
   */
  private async applyToOrder(
    tx: Prisma.TransactionClient,
    request: ApplicableRequest,
    cash: { sessionId: string; receiptNumber: string; executorId: string } | null,
  ): Promise<{ movementId: string | null }> {
    const refundAmount = new Prisma.Decimal(request.refundAmount);
    const reversedAmount = new Prisma.Decimal(request.reversedAmount ?? 0);

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

    const lines = await this.loadAnnullableLines(tx, request.id);
    for (const line of lines) {
      await tx.orderItem.update({
        where: { id: line.orderItemId },
        data: { annulledQuantity: { increment: line.quantity } },
      });
    }

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

    let movementId: string | null = null;
    if (cash) {
      const movement = await tx.cashMovement.create({
        data: {
          cashSessionId: cash.sessionId,
          receiptNumber: cash.receiptNumber,
          movementType: 'EXPENSE',
          paymentMethod: request.paymentMethod,
          amount: refundAmount,
          description: `Devolución Orden ${order.orderNumber} — ${request.observation}`,
          referenceType: 'REFUND',
          referenceId: request.id,
          performedById: cash.executorId,
        },
        select: { id: true },
      });
      movementId = movement.id;
    }

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

    return { movementId };
  }

  /**
   * Arma las líneas de una anulación por ítems a partir de lo que mandó el
   * formulario: valida que cada ítem sea de la orden y que la cantidad quepa en
   * lo que todavía tiene vivo.
   */
  private async resolveAnnulledItems(
    orderId: string,
    items: { orderItemId: string; quantity: number }[],
  ): Promise<AnnulledItemLine[]> {
    const ids = items.map((i) => i.orderItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un mismo ítem aparece más de una vez en la anulación',
      );
    }

    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId, id: { in: ids } },
      select: {
        id: true,
        description: true,
        quantity: true,
        unitPrice: true,
        annulledQuantity: true,
      },
    });
    const byId = new Map(orderItems.map((item) => [item.id, item]));

    return items.map(({ orderItemId, quantity }) => {
      const item = byId.get(orderItemId);
      if (!item) {
        throw new BadRequestException(
          'Uno de los ítems a anular no pertenece a esta orden',
        );
      }
      const toAnnul = new Prisma.Decimal(quantity);
      const alive = new Prisma.Decimal(item.quantity).sub(
        item.annulledQuantity ?? 0,
      );
      if (toAnnul.greaterThan(alive)) {
        throw new BadRequestException(
          `No puedes anular ${toAnnul.toString()} de «${item.description.trim()}»: solo le quedan ${alive.toString()} sin anular`,
        );
      }
      return {
        orderItemId,
        description: item.description,
        quantity: toAnnul,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        amount: toAnnul.mul(item.unitPrice),
      };
    });
  }

  /**
   * Líneas de la solicitud, comprobando que todavía se puedan anular.
   *
   * Entre pedir y aplicar pueden pasar días: el ítem pudo borrarse en una
   * edición de la OP, o anularse en otra solicitud. Devuelve vacío en las
   * devoluciones por monto, que no tocan ítems.
   */
  private async loadAnnullableLines(
    client: Prisma.TransactionClient | PrismaService,
    requestId: string,
  ): Promise<{ orderItemId: string; quantity: Prisma.Decimal }[]> {
    const lines =
      (await client.refundRequestItem.findMany({
        where: { refundRequestId: requestId },
        select: {
          orderItemId: true,
          description: true,
          quantity: true,
          orderItem: { select: { quantity: true, annulledQuantity: true } },
        },
      })) ?? [];

    return lines.map((line) => {
      if (!line.orderItemId || !line.orderItem) {
        throw new BadRequestException(
          `El ítem «${line.description.trim()}» ya no existe en la orden: rechaza esta solicitud y crea una nueva`,
        );
      }
      const alive = new Prisma.Decimal(line.orderItem.quantity).sub(
        line.orderItem.annulledQuantity ?? 0,
      );
      if (new Prisma.Decimal(line.quantity).greaterThan(alive)) {
        throw new BadRequestException(
          `El ítem «${line.description.trim()}» ya no tiene esa cantidad por anular: cambió la orden o hubo otra anulación`,
        );
      }
      return { orderItemId: line.orderItemId, quantity: line.quantity };
    });
  }

  /**
   * Avisa al taller cuando se anula un ítem que ya está en una OT.
   *
   * El ítem no sale de la OT —queda marcado—, pero la marca solo la ve quien
   * abre la OT. Sin este aviso producción puede seguir fabricando algo que la
   * OP ya dio de baja. Va al asesor y al diseñador de la OT, que son los dos
   * usuarios que la orden de trabajo conoce.
   *
   * Corre después de la transacción y nunca la tumba: la anulación ya quedó
   * aplicada, un aviso que falla no la deshace.
   */
  private async notifyWorkshopOfAnnulledItems(
    requestId: string,
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    try {
      const lines =
        (await this.prisma.refundRequestItem.findMany({
          where: { refundRequestId: requestId, orderItemId: { not: null } },
          select: {
            description: true,
            quantity: true,
            orderItem: {
              select: {
                workOrderItems: {
                  where: {
                    workOrder: { status: { not: WorkOrderStatus.CANCELLED } },
                  },
                  select: {
                    workOrder: {
                      select: {
                        workOrderNumber: true,
                        advisorId: true,
                        designerId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })) ?? [];

      // Una OT puede tener varios ítems anulados: un solo aviso por OT.
      const byWorkOrder = new Map<
        string,
        { recipients: Set<string>; items: string[] }
      >();
      for (const line of lines) {
        const label = `${Number(line.quantity).toLocaleString('es-CO')} × ${line.description.trim()}`;
        for (const { workOrder } of line.orderItem?.workOrderItems ?? []) {
          const entry = byWorkOrder.get(workOrder.workOrderNumber) ?? {
            recipients: new Set<string>(),
            items: [],
          };
          entry.recipients.add(workOrder.advisorId);
          if (workOrder.designerId) entry.recipients.add(workOrder.designerId);
          entry.items.push(label);
          byWorkOrder.set(workOrder.workOrderNumber, entry);
        }
      }

      for (const [workOrderNumber, { recipients, items }] of byWorkOrder) {
        for (const userId of recipients) {
          await this.notificationsService.create({
            userId,
            type: NotificationType.REFUND_REQUEST_APPROVED,
            title: `Ítems anulados en ${workOrderNumber}`,
            message: `La orden ${orderNumber} anuló ítems que están en la ${workOrderNumber}: ${items.join(', ')}. Ya no deben producirse.`,
            relatedId: orderId,
            relatedType: 'Order',
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `No se pudo avisar al taller de la anulación ${requestId}: ${error.message}`,
      );
    }
  }

  /** «150 × MARCA RIGIDO, 1 × DTF UV», para notificaciones de una línea. */
  private describeItemLines(lines: AnnulledItemLine[]): string {
    return lines
      .map((line) => {
        const description = line.description.trim().replace(/\s+/g, ' ');
        const short =
          description.length > 40
            ? `${description.slice(0, 39)}…`
            : description;
        return `${Number(line.quantity).toLocaleString('es-CO')} × ${short}`;
      })
      .join(', ');
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

    // La caja de la sede de la OP (docs/PLAN_SEDES.md §4)
    const activeSession = await findActiveCashSessionForLocation(this.prisma, request.order.locationId);

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
    await this.loadAnnullableLines(this.prisma, requestId);

    // El recibo se numera en la sede de la OP (docs/PLAN_SEDES.md §3).
    const receiptNumber = await this.consecutivesService.generateNumber(
      'CASH_RECEIPT',
      request.order.locationId,
    );

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

      const { movementId } = await this.applyToOrder(tx, request, {
        sessionId: activeSession.id,
        receiptNumber,
        executorId,
      });

      return tx.refundRequest.update({
        where: { id: requestId },
        data: {
          cashMovementId: movementId,
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
          items: ITEMS_SELECT,
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

    await this.notifyWorkshopOfAnnulledItems(
      request.id,
      request.orderId,
      request.order.orderNumber,
    );

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
        items: ITEMS_SELECT,
      },
    });
  }

  async findPendingRequests() {
    return this.prisma.refundRequest.findMany({
      where: { status: EditRequestStatus.PENDING, order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        items: ITEMS_SELECT,
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
      where: { status: EditRequestStatus.APPROVED, executedAt: null, order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        items: ITEMS_SELECT,
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
      where: { order: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        order: { select: ORDER_SELECT },
        items: ITEMS_SELECT,
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
        items: ITEMS_SELECT,
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
        items: ITEMS_SELECT,
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
        items: ITEMS_SELECT,
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
