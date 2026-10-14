import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from './whatsapp.service';
import { ApprovalRequestRegistry } from './approval-request-registry';
import { EditRequestStatus, NotificationType, ApprovalRequestType } from '../../generated/prisma';
import { isProductionLike } from '../../common/utils/environment.util';

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);
  private readonly appSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly whatsappService: WhatsappService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
  ) {
    this.appSecret =
      this.configService.get<string>('whatsapp.appSecret') || '';

    if (!this.appSecret) {
      if (isProductionLike()) {
        this.logger.error(
          'WHATSAPP_APP_SECRET no está configurado: se rechazarán todos los webhooks de WhatsApp hasta definirlo.',
        );
      } else {
        this.logger.warn(
          'WHATSAPP_APP_SECRET not configured. Webhook signature validation will be skipped.',
        );
      }
    }
  }

  /**
   * Verifica la firma X-Hub-Signature-256 enviada por Meta en cada webhook.
   * Meta firma el body raw con HMAC-SHA256 usando el App Secret de la aplicación.
   *
   * Sin App Secret, saltarse la firma solo se permite en desarrollo. En staging y
   * producción el webhook se rechaza: un POST falso con un botón de "Aprobar"
   * autorizaría pagos, y la variable es fácil de olvidar al montar otro
   * despliegue (el clon de Zoom).
   */
  verifyMetaSignature(rawBody: Buffer, signature: string): void {
    if (!this.appSecret) {
      if (isProductionLike()) {
        throw new UnauthorizedException('Webhook signature validation is not configured');
      }
      this.logger.warn('Skipping Meta signature validation (no appSecret)');
      return;
    }

    if (!signature || !signature.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing or invalid X-Hub-Signature-256');
    }

    const expected = createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');

    const received = signature.slice('sha256='.length);

    // Comparación en tiempo constante para prevenir timing attacks
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(received, 'hex');

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Procesa el payload del webhook de Meta.
   * Solo atiende respuestas a quick-reply de template (type: "button"): la
   * solicitud se resuelve por el `wamid` guardado al enviar, con vencimiento y
   * teléfono del admin. Cualquier otro tipo se ignora.
   *
   * Hubo un segundo formato, mensajes interactivos con la solicitud y un HMAC en
   * el id del botón (`approve:{id}:{hmac}`). Ningún envío lo producía y su secreto
   * no estaba configurado en PRD, así que se eliminó (tercera barrida, hallazgo 6).
   * Responde siempre HTTP 200 para evitar reintentos de Meta.
   */
  async processWebhook(body: Record<string, any>): Promise<void> {
    try {
      const messages: any[] =
        body?.entry?.[0]?.changes?.[0]?.value?.messages;

      if (!messages || messages.length === 0) {
        // Puede ser un evento de status (sent/delivered/read) — ignorar
        return;
      }

      const message = messages[0];
      const fromPhone: string = message.from;

      // Caso 1: Quick-reply de template (solicitud_edicion_op_v2)
      if (message.type === 'button') {
        const payload: string = message?.button?.payload; // "APPROVE" | "REJECT"
        const contextMessageId: string = message?.context?.id; // wamid del template enviado
        this.logger.debug(
          `Template button reply from=${fromPhone} payload=${payload} contextId=${contextMessageId}`,
        );
        await this.handleTemplateButtonReply(fromPhone, payload, contextMessageId);
        return;
      }

      this.logger.debug(
        `Ignoring webhook message type: ${message?.type}`,
      );
    } catch (error) {
      // Logueamos el error pero NO relanzamos — Meta reintentaría si devolvemos != 200
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
    }
  }

  /**
   * Procesa la respuesta a un botón quick-reply de un template de WhatsApp.
   * Resuelve el requestId a través del messageId original guardado en DB.
   *
   * Payload de Meta cuando el admin toca un quick-reply de template:
   * { type: "button", button: { payload: "APPROVE", text: "✅ Autorizar" },
   *   context: { from: "business_phone", id: "wamid.ORIGINAL" }, from: "admin_phone" }
   */
  private async handleTemplateButtonReply(
    fromPhone: string,
    payload: string,
    contextMessageId: string,
  ): Promise<void> {
    if (!payload || !contextMessageId) {
      this.logger.warn(
        `Template button reply missing payload or contextMessageId from ${fromPhone}`,
      );
      return;
    }

    // Meta envía como payload el texto del botón (UI de Business Manager no permite payload distinto)
    // Aceptamos tanto los valores en español (desde Business Manager) como en inglés (Graph API)
    const isApprove = ['APPROVE', 'Autorizar'].includes(payload);
    const isReject = ['REJECT', 'Rechazar'].includes(payload);

    if (!isApprove && !isReject) {
      this.logger.debug(`Ignoring unknown template button payload: ${payload}`);
      return;
    }

    // 1. Buscar el contexto de acción por messageId (guardado al enviar el template)
    const ctx = await this.prisma.whatsappActionContext.findUnique({
      where: { messageId: contextMessageId },
    });

    if (!ctx) {
      this.logger.warn(
        `No WhatsApp action context found for messageId=${contextMessageId}`,
      );
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ No se encontró el contexto de la solicitud. Accede al sistema para gestionarla.',
      );
      return;
    }

    if (ctx.expiresAt < new Date()) {
      this.logger.warn(
        `WhatsApp action context expired for messageId=${contextMessageId}`,
      );
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ El enlace de acción ha expirado. Accede al sistema para gestionar la solicitud.',
      );
      return;
    }

    // 2. Validar que el teléfono coincide con el admin original (anti-spoofing)
    const phoneVariants = this.getPhoneVariants(fromPhone);
    if (!phoneVariants.includes(ctx.adminPhone)) {
      this.logger.warn(
        `Phone mismatch: fromPhone=${fromPhone} expected=${ctx.adminPhone}`,
      );
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ No tienes permisos para realizar esta acción.',
      );
      return;
    }

    // 3. Despachar según requestType
    const requestType = ctx.requestType || ApprovalRequestType.ORDER_EDIT;

    if (requestType === ApprovalRequestType.ORDER_EDIT) {
      // Path legacy: lógica directa para ORDER_EDIT (backward compatible)
      await this.handleOrderEditApproval(ctx, fromPhone, isApprove, contextMessageId);
    } else {
      // Path genérico: delegar al handler registrado
      await this.handleGenericApproval(ctx, requestType, fromPhone, isApprove);
    }
  }

  /**
   * Path legacy para solicitudes de edición de orden.
   * Mantiene la lógica existente sin cambios para backward compatibility.
   */
  private async handleOrderEditApproval(
    ctx: { requestId: string; messageId: string },
    fromPhone: string,
    isApprove: boolean,
    contextMessageId: string,
  ): Promise<void> {
    const request = await this.prisma.orderEditRequest.findFirst({
      where: { id: ctx.requestId },
      include: {
        requestedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!request) {
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ Solicitud no encontrada.',
      );
      return;
    }

    if (request.status !== EditRequestStatus.PENDING) {
      const statusLabel =
        request.status === EditRequestStatus.APPROVED ? 'aprobada' : 'rechazada';
      await this.whatsappService.sendTextMessage(
        fromPhone,
        `ℹ️ La solicitud de edición de la Orden *${request.order.orderNumber}* ya fue ${statusLabel} anteriormente.`,
      );
      return;
    }

    const admin = await this.findAdminByPhone(fromPhone);

    if (!admin) {
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ No tienes permisos para realizar esta acción.',
      );
      return;
    }

    if (isApprove) {
      await this.approveRequest(request, admin.id, fromPhone);
    } else {
      await this.rejectRequest(request, admin.id, fromPhone);
    }

    await this.prisma.whatsappActionContext
      .delete({ where: { messageId: contextMessageId } })
      .catch(() => {
        /* ignorar si ya fue eliminado */
      });
  }

  /**
   * Path genérico para cualquier tipo de solicitud de aprobación.
   * Delega al handler registrado en ApprovalRequestRegistry.
   * Soporta findReviewerByPhone custom por handler (para módulos que
   * validan por permiso en vez de por rol admin).
   */
  private async handleGenericApproval(
    ctx: { requestId: string; messageId: string },
    requestType: string,
    fromPhone: string,
    isApprove: boolean,
  ): Promise<void> {
    const handler = this.approvalRegistry.getHandler(requestType);
    if (!handler) {
      this.logger.warn(`No handler registered for request type: ${requestType}`);
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ Tipo de solicitud no reconocido.',
      );
      return;
    }

    const requestInfo = await handler.findPendingRequest(ctx.requestId);
    if (!requestInfo) {
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ Solicitud no encontrada.',
      );
      return;
    }

    if (requestInfo.status !== 'PENDING') {
      const statusLabel = requestInfo.status === 'APPROVED' ? 'aprobada' : 'rechazada';
      await this.whatsappService.sendTextMessage(
        fromPhone,
        `ℹ️ La solicitud para ${requestInfo.displayLabel} ya fue ${statusLabel} anteriormente.`,
      );
      return;
    }

    // Usar findReviewerByPhone del handler si existe, o findAdminByPhone por defecto
    const reviewer = handler.findReviewerByPhone
      ? await handler.findReviewerByPhone(fromPhone)
      : await this.findAdminByPhone(fromPhone);

    if (!reviewer) {
      await this.whatsappService.sendTextMessage(
        fromPhone,
        '⚠️ No tienes permisos para realizar esta acción.',
      );
      return;
    }

    if (isApprove) {
      await handler.approveViaWhatsApp(ctx.requestId, reviewer.id);
      await this.whatsappService.sendTextMessage(
        fromPhone,
        `✅ ${requestInfo.displayLabel} fue autorizada correctamente.`,
      );
    } else {
      try {
        await handler.rejectViaWhatsApp(ctx.requestId, reviewer.id);
      } catch (error) {
        // Una regla de negocio impidió el rechazo (p. ej. el saldo a favor del
        // pago ya se gastó). La solicitud sigue pendiente: hay que decirle a
        // quien revisa por qué, o creerá que el rechazo se aplicó.
        if (!(error instanceof BadRequestException)) throw error;
        await this.whatsappService.sendTextMessage(
          fromPhone,
          `⚠️ No se pudo rechazar ${requestInfo.displayLabel}. ${error.message}`,
        );
        return;
      }
      await this.whatsappService.sendTextMessage(
        fromPhone,
        `❌ ${requestInfo.displayLabel} fue rechazada.`,
      );
    }

    await this.prisma.whatsappActionContext
      .delete({ where: { messageId: ctx.messageId } })
      .catch(() => {
        /* ignorar si ya fue eliminado */
      });

    this.logger.log(
      `Approval request ${ctx.requestId} (${requestType}) ${isApprove ? 'APPROVED' : 'REJECTED'} via WhatsApp by phone ${fromPhone}`,
    );
  }

  /**
   * Devuelve variantes de un número de teléfono para comparación flexible.
   */
  private getPhoneVariants(phone: string): string[] {
    // Normalizar: quitar "+" y espacios
    const clean = phone.replace(/[^\d]/g, '');
    return [
      clean,
      `+${clean}`,
      clean.startsWith('57') ? clean.slice(2) : null,
    ].filter(Boolean) as string[];
  }

  private async approveRequest(
    request: any,
    adminId: string,
    fromPhone: string,
  ): Promise<void> {
    await this.prisma.orderEditRequest.update({
      where: { id: request.id },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
        expiresAt: null,
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EDIT_REQUEST_APPROVED,
      title: 'Solicitud de edición aprobada',
      message: `Tu solicitud para editar la orden ${request.order.orderNumber} ha sido aprobada. Tienes 5 minutos para realizar los cambios.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    await this.whatsappService.sendTextMessage(
      fromPhone,
      `✅ La Orden de Pedido *${request.order.orderNumber}* fue autorizada correctamente.`,
    );

    this.logger.log(
      `Order edit request ${request.id} APPROVED via WhatsApp by admin phone ${fromPhone}`,
    );
  }

  private async rejectRequest(
    request: any,
    adminId: string,
    fromPhone: string,
  ): Promise<void> {
    await this.prisma.orderEditRequest.update({
      where: { id: request.id },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EDIT_REQUEST_REJECTED,
      title: 'Solicitud de edición rechazada',
      message: `Tu solicitud para editar la orden ${request.order.orderNumber} ha sido rechazada.`,
      relatedId: request.orderId,
      relatedType: 'Order',
    });

    await this.whatsappService.sendTextMessage(
      fromPhone,
      `❌ La Orden de Pedido *${request.order.orderNumber}* fue rechazada.`,
    );

    this.logger.log(
      `Order edit request ${request.id} REJECTED via WhatsApp by admin phone ${fromPhone}`,
    );
  }

  /**
   * Busca un admin activo por número de teléfono (normalizado).
   * Acepta formato con o sin código de país.
   */
  private async findAdminByPhone(fromPhone: string) {
    // fromPhone viene de Meta en formato E.164 sin "+": ej. "573001234567"
    // En DB puede estar guardado como "+573001234567", "573001234567" o "3001234567"
    const variants = [
      fromPhone,
      `+${fromPhone}`,
      fromPhone.startsWith('57') ? fromPhone.slice(2) : null,
    ].filter(Boolean) as string[];

    return this.prisma.user.findFirst({
      where: {
        isActive: true,
        phone: { in: variants },
        role: { name: 'admin' },
      },
      include: { role: true },
    });
  }
}
