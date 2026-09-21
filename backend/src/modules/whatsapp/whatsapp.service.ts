import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalRequestType } from '../../generated/prisma';
import { isProduction } from '../../common/utils/environment.util';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly frontendUrl: string;
  private readonly isConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessToken =
      this.configService.get<string>('whatsapp.accessToken') || '';
    this.phoneNumberId =
      this.configService.get<string>('whatsapp.phoneNumberId') || '';
    const apiVersion =
      this.configService.get<string>('whatsapp.apiVersion') || 'v22.0';

    this.baseUrl = `https://graph.facebook.com/${apiVersion}/${this.phoneNumberId}/messages`;
    this.frontendUrl =
      this.configService.get<string>('app.frontendUrl') ||
      'http://localhost:5173';
    this.isConfigured = !!(this.accessToken && this.phoneNumberId);

    if (!this.isConfigured) {
      this.logger.warn(
        'WhatsApp Cloud API credentials not configured. Messages will not be sent.',
      );
    }
  }

  /**
   * Normaliza un número de teléfono al formato E.164 sin "+"
   * Ejemplos: "+573118322699" → "573118322699"
   *           "3118322699"    → "573118322699" (asume Colombia si son 10 dígitos y empieza en 3)
   *           "573118322699"  → "573118322699"
   */
  private normalizePhone(phone: string): string {
    // Eliminar todo lo que no sea dígito ni "+"
    let cleaned = phone.replace(/[^\d+]/g, '');
    // Quitar el "+" inicial si existe
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    // Si es un número colombiano de 10 dígitos (empieza en 3), agregar indicativo 57
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
      cleaned = `57${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Colapsa una lista de usuarios a la lista de teléfonos únicos a los que hay
   * que escribir, usando el número normalizado como llave.
   *
   * El destinatario de una notificación es un teléfono, no una cuenta: el
   * webhook resuelve quién aprueba por `adminPhone`, no por userId. Si dos
   * cuentas comparten celular (o lo tienen guardado con formatos distintos,
   * "+573001234567" vs "3001234567"), enviar una vez por usuario le entrega
   * el mismo mensaje duplicado a la misma persona.
   *
   * Devuelve los números ya normalizados, que es lo que terminan guardando
   * `sendApprovalNotification` y `notificarSolicitudConBotones` en
   * WhatsappActionContext.
   */
  private dedupePhones(users: { phone: string | null }[]): string[] {
    const seen = new Set<string>();
    const phones: string[] = [];

    for (const { phone } of users) {
      if (!phone) continue;
      const normalized = this.normalizePhone(phone);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      phones.push(normalized);
    }

    return phones;
  }

  /**
   * Teléfonos únicos de los administradores activos.
   * Destinatarios de las solicitudes que se autorizan por rol admin.
   */
  async getAdminPhones(): Promise<string[]> {
    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'admin' },
      include: {
        users: {
          where: { isActive: true, phone: { not: null } },
          select: { phone: true },
        },
      },
    });

    return this.dedupePhones(adminRole?.users ?? []);
  }

  /**
   * Teléfonos únicos de los usuarios activos cuyo rol tiene el permiso dado.
   * Destinatarios de las solicitudes que se autorizan por permiso y no por rol.
   */
  async getPhonesByPermission(permissionName: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        phone: { not: null },
        role: {
          permissions: {
            some: { permission: { name: permissionName } },
          },
        },
      },
      select: { phone: true },
    });

    return this.dedupePhones(users);
  }

  /**
   * Enviar mensaje con template de WhatsApp Cloud API
   * @param to Número de teléfono (acepta +57..., 57..., o 10 dígitos colombianos)
   * @param templateName Nombre del template aprobado
   * @param params Parámetros del body del template (en orden)
   * @param language Código de idioma del template (default: es_CO)
   * @param buttonParams Parámetros para botones CTA de URL dinámica (opcional)
   * @returns messageId en caso de éxito, null si falla
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    params: string[],
    language: string = 'es_CO',
    buttonParams?: { index: number; text: string }[],
  ): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn(
        `WhatsApp not configured. Skipping template "${templateName}" to ${to}`,
      );
      return null;
    }

    const normalizedTo = this.normalizePhone(to);
    this.logger.debug(
      `Sending WhatsApp template "${templateName}" to ${normalizedTo} (original: ${to})`,
    );

    // Sanitizar parámetros: Meta rechaza con #132018 los params vacíos/null y
    // también los que contienen saltos de línea, tabs o >4 espacios seguidos.
    const sanitizedParams = params.map((value) => {
      if (value === null || value === undefined || value === '') {
        this.logger.warn(
          `Template "${templateName}": body param is ${value === '' ? 'empty' : String(value)}, replacing with "-"`,
        );
        return '-';
      }
      // Colapsar saltos de línea, tabs y espacios múltiples en un solo espacio
      const normalized = String(value).replace(/\s+/g, ' ').trim();
      if (normalized === '') {
        this.logger.warn(
          `Template "${templateName}": body param became empty after normalizing whitespace, replacing with "-"`,
        );
        return '-';
      }
      return normalized;
    });

    const components: Record<string, unknown>[] = [
      {
        type: 'body',
        parameters: sanitizedParams.map((value) => ({
          type: 'text',
          text: value,
        })),
      },
    ];

    // Agregar botones CTA de URL dinámica si existen
    if (buttonParams && buttonParams.length > 0) {
      for (const btn of buttonParams) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: btn.index.toString(),
          parameters: [{ type: 'text', text: btn.text }],
        });
      }
    }

    const body = {
      messaging_product: 'whatsapp',
      to: normalizedTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    };

    this.logger.debug(
      `WhatsApp API payload for "${templateName}": ${JSON.stringify(body.template, null, 2)}`,
    );

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const metaError = data?.error?.message || response.statusText;
        // error_data.details contiene la causa exacta del rechazo de Meta
        // (p. ej. qué parámetro/botón falla en #132018)
        const metaDetails = data?.error?.error_data?.details;
        this.logger.error(
          `Failed to send WhatsApp template "${templateName}" to ${normalizedTo}: ${metaError}${
            metaDetails ? ` — details: ${metaDetails}` : ''
          }`,
        );
        return null;
      }

      const messageId = data?.messages?.[0]?.id;
      this.logger.log(
        `WhatsApp template "${templateName}" sent to ${normalizedTo}. MessageId: ${messageId}`,
      );
      return messageId || null;
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp template "${templateName}" to ${normalizedTo}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Enviar notificación de solicitud de edición de orden de pedido
   * Template: solicitud_edicion_op (es_CO)
   * Body: {{1}} nombre solicitante, {{2}} rol, {{3}} número de orden, {{4}} motivo
   * Botón CTA: "Ver solicitud" → URL con orderId dinámico
   */
  async notificarSolicitudEdicionOP(
    telefono: string,
    nombreSolicitante: string,
    rolSolicitante: string,
    numeroOrden: string,
    motivo: string,
    orderId: string,
  ): Promise<string | null> {
    return this.sendTemplateMessage(
      telefono,
      'solicitud_edicion_op',
      [nombreSolicitante, rolSolicitante, numeroOrden, motivo],
      'es_CO',
      [{ index: 0, text: orderId }],
    );
  }

  /**
   * Retorna el nombre de la plantilla de aprobación según el ambiente.
   * - production  → solicitud_aprobacion_general_prod_v2
   * - dev/staging → solicitud_aprobacion_v1
   */
  private getApprovalTemplateName(): string {
    return isProduction()
      ? 'solicitud_aprobacion_general_prod_v2'
      : 'solicitud_aprobacion_v1';
  }

  /**
   * Retorna el nombre de la plantilla de edición de OP según el ambiente.
   * - production  → solicitud_edicion_op_v4_prod
   * - dev/staging → solicitud_edicion_op_v2
   */
  private getEdicionOpTemplateName(): string {
    return isProduction()
      ? 'solicitud_edicion_op_v4_prod'
      : 'solicitud_edicion_op_v2';
  }

  /**
   * Envía un mensaje de texto simple (para confirmaciones de webhook).
   */
  async sendTextMessage(to: string, text: string): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn(
        `WhatsApp not configured. Skipping text message to ${to}`,
      );
      return null;
    }

    const normalizedTo = this.normalizePhone(to);

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'text',
      text: { body: text },
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const metaError = data?.error?.message || response.statusText;
        this.logger.error(
          `Failed to send text message to ${normalizedTo}: ${metaError}`,
        );
        return null;
      }

      const messageId = data?.messages?.[0]?.id;
      this.logger.log(
        `Text message sent to ${normalizedTo}. MessageId: ${messageId}`,
      );
      return messageId || null;
    } catch (error) {
      this.logger.error(
        `Failed to send text message to ${normalizedTo}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Envía notificación de solicitud de edición de OP usando el template
   * "solicitud_edicion_op_v2" que incluye 3 botones integrados:
   *   - URL "🔗 Ver Orden" (botón 0, sufijo dinámico con orderId)
   *   - Quick Reply "✅ Autorizar" (botón 1, payload APPROVE)
   *   - Quick Reply "❌ Rechazar" (botón 2, payload REJECT)
   *
   * Después de enviar, guarda el messageId en DB para que el webhook pueda
   * resolver qué solicitud aprobar/rechazar cuando el admin toque un botón.
   *
   * IMPORTANTE: Los templates con quick-reply NO requieren ventana activa de 24h,
   * a diferencia de los mensajes interactivos no-template.
   */
  async notificarSolicitudConBotones(
    telefono: string,
    nombreSolicitante: string,
    rolSolicitante: string,
    numeroOrden: string,
    motivo: string,
    orderId: string,
    requestId: string,
  ): Promise<void> {
    const normalizedPhone = this.normalizePhone(telefono);

    // Enviar template v2 que ya contiene los 3 botones
    const messageId = await this.sendTemplateMessage(
      telefono,
      this.getEdicionOpTemplateName(),
      [nombreSolicitante, rolSolicitante, numeroOrden, motivo],
      'es_CO',
      [{ index: 2, text: orderId }], // sufijo dinámico del botón URL "Ver Orden" (índice 2: después de 2 quick-reply)
    );

    if (!messageId) {
      this.logger.warn(
        `Could not save WhatsApp action context for request ${requestId}: no messageId returned`,
      );
      return;
    }

    // Guardar contexto messageId → requestId para que el webhook lo resuelva
    try {
      await this.prisma.whatsappActionContext.create({
        data: {
          messageId,
          requestId,
          requestType: ApprovalRequestType.ORDER_EDIT,
          adminPhone: normalizedPhone,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 horas
        },
      });
      this.logger.debug(
        `WhatsApp action context saved: messageId=${messageId} requestId=${requestId}`,
      );
    } catch (error) {
      // No es crítico: si falla el guardado, el admin puede seguir gestionando desde el sistema
      this.logger.error(
        `Failed to save WhatsApp action context for messageId=${messageId}: ${error.message}`,
      );
    }
  }

  /**
   * Envía notificación genérica de solicitud de aprobación vía WhatsApp.
   * Usa el template "solicitud_aprobacion_v1" (aprobado por Meta) con estructura:
   *
   * Body: "Nueva solicitud de aprobación: {{1}} ({{2}}) solicita {{3}}.
   *        Motivo: {{4}}
   *        Por favor, revisa la solicitud y selecciona una opción para continuar."
   *
   * Botones (en orden de índice Meta):
   *   0 → URL "Ver detalle". El prefijo vive DENTRO de la plantilla en Meta y
   *       no se cambia sin volver a aprobarla:
   *         producción → https://api.zoompublicidadcrm.com/api/v1/approvals/ + {{1}}
   *         pruebas    → https://api.pruebas.zoompublicidadcrm.com/api/v1/approvals/ + {{1}}
   *   1 → Quick Reply "Autorizar" (payload: APPROVE)
   *   2 → Quick Reply "Rechazar"  (payload: REJECT)
   *
   * Guarda WhatsappActionContext con requestType para que el webhook
   * despache al handler correcto vía ApprovalRequestRegistry.
   */
  async sendApprovalNotification(params: {
    telefono: string;
    requesterName: string;
    requesterRole: string;
    actionDescription: string;
    reason: string;
    requestId: string;
    requestType: ApprovalRequestType;
  }): Promise<void> {
    const normalizedPhone = this.normalizePhone(params.telefono);

    const messageId = await this.sendTemplateMessage(
      params.telefono,
      this.getApprovalTemplateName(),
      [
        params.requesterName,
        params.requesterRole,
        params.actionDescription,
        params.reason,
      ],
      'es_CO',
      // Botón URL "Ver detalle" (índice 0: Call-to-Action va antes de Quick Reply en Meta)
      [{ index: 0, text: params.requestId }],
    );

    if (!messageId) {
      this.logger.warn(
        `Could not save WhatsApp action context for request ${params.requestId}: no messageId returned`,
      );
      return;
    }

    try {
      await this.prisma.whatsappActionContext.create({
        data: {
          messageId,
          requestId: params.requestId,
          requestType: params.requestType,
          adminPhone: normalizedPhone,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 horas
        },
      });
      this.logger.debug(
        `WhatsApp action context saved: messageId=${messageId} requestId=${params.requestId} type=${params.requestType}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save WhatsApp action context for messageId=${messageId}: ${error.message}`,
      );
    }
  }
}
