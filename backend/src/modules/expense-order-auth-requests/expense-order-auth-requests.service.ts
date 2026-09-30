import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ApprovalRequestHandler,
  ApprovalRequestInfo,
  ApprovalRequestRegistry,
} from '../whatsapp/approval-request-registry';
import {
  ApproveExpenseOrderAuthRequestDto,
  CreateExpenseOrderAuthRequestDto,
  RejectExpenseOrderAuthRequestDto,
} from './dto';
import { ApprovalRequestType, EditRequestStatus, ExpenseOrderStatus, NotificationType } from '../../generated/prisma';
import { ExpenseOrdersService } from '../expense-orders/expense-orders.service';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { isUniqueViolationOn } from '../../common/utils/unique-violation.util';
import { queueLocationFilter } from '../../common/utils/location-context';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

/** Nombre del índice parcial que garantiza una sola solicitud PENDING por OG y usuario. */
const PENDING_UNIQUE_INDEX = 'expense_order_auth_requests_pending_unique';

/**
 * ¿El error es el choque contra `expense_order_auth_requests_pending_unique`?
 *
 * Leía `meta.target`, que con el adaptador de Postgres viene vacío: la rama
 * nunca se ejecutaba y la petición gemela recibía un 500 en vez de su
 * solicitud. `isUniqueViolationOn` busca sobre el meta completo.
 */
function isUniquePendingViolation(error: unknown): boolean {
  return isUniqueViolationOn(error, PENDING_UNIQUE_INDEX);
}

@Injectable()
export class ExpenseOrderAuthRequestsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(ExpenseOrderAuthRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
    @Inject(forwardRef(() => ExpenseOrdersService))
    private readonly expenseOrdersService: ExpenseOrdersService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register('EXPENSE_ORDER_AUTH', this);
  }

  // ─── ApprovalRequestHandler interface ───

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.expenseOrderAuthRequest.findUnique({
      where: { id: requestId },
      include: { expenseOrder: { select: { ogNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `autorización de la OG ${request.expenseOrder.ogNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.expenseOrderAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
      },
      include: { expenseOrder: { select: { ogNumber: true } } },
    });

    // Auto-transición: cambiar estado de la OG a ADMIN_AUTHORIZED (pendiente de firma de Caja)
    try {
      const admin = await this.prisma.user.findUnique({
        where: { id: reviewerId },
        include: { role: true },
      });
      if (admin) {
        const adminUser: AuthenticatedUser = {
          id: reviewerId,
          username: admin.username ?? admin.email ?? '',
          email: admin.email,
          roleId: admin.roleId,
          firstName: admin.firstName,
          lastName: admin.lastName,
        };
        await this.expenseOrdersService.updateStatus(
          request.expenseOrderId,
          { status: ExpenseOrderStatus.ADMIN_AUTHORIZED },
          adminUser,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `OG ${request.expenseOrder.ogNumber} aprobada vía WhatsApp pero no se pudo auto-transicionar: ${error.message}`,
      );
    }

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EXPENSE_ORDER_AUTH_REQUEST_APPROVED,
      title: 'Solicitud de autorización de OG aprobada',
      message: `Tu solicitud para la OG ${request.expenseOrder.ogNumber} fue aprobada administrativamente. Pendiente de autorización de Caja para el pago.`,
      relatedId: request.expenseOrderId,
      relatedType: 'ExpenseOrder',
    });
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.expenseOrderAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
      include: { expenseOrder: { select: { ogNumber: true } } },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EXPENSE_ORDER_AUTH_REQUEST_REJECTED,
      title: 'Solicitud de autorización de OG rechazada',
      message: `Tu solicitud para autorizar la OG ${request.expenseOrder.ogNumber} ha sido rechazada.`,
      relatedId: request.expenseOrderId,
      relatedType: 'ExpenseOrder',
    });
  }

  // ─── Domain methods ───

  /**
   * Crear solicitud de autorización de OG
   */
  async create(userId: string, dto: CreateExpenseOrderAuthRequestDto) {
    // 1. Validar que OG existe
    const expenseOrder = await this.prisma.expenseOrder.findUnique({
      where: { id: dto.expenseOrderId },
    });

    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${dto.expenseOrderId} no encontrada`);
    }

    // 2. Validar que usuario NO es admin (admins pueden cambiar directamente)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (user?.role?.name === 'admin') {
      throw new BadRequestException(
        'Los administradores pueden autorizar la OG directamente sin crear una solicitud',
      );
    }

    // 3. Validar que no hay solicitud PENDING del mismo usuario para la misma OG
    const existingRequest = await this.prisma.expenseOrderAuthRequest.findFirst({
      where: {
        expenseOrderId: dto.expenseOrderId,
        requestedById: userId,
        status: EditRequestStatus.PENDING,
      },
    });

    if (existingRequest) {
      throw new BadRequestException(
        'Ya tienes una solicitud de autorización pendiente para esta OG',
      );
    }

    // 4. Crear solicitud
    //
    // La validación del paso 3 es un check-then-act: dos peticiones concurrentes
    // leen las dos "no hay pendiente" antes de que cualquiera inserte. El índice
    // parcial `expense_order_auth_requests_pending_unique` cierra esa ventana, así
    // que la segunda choca acá con P2002 en vez de crear una solicitud duplicada.
    //
    // Cuando eso pasa, la petición perdedora devuelve la solicitud gemela en lugar
    // de fallar: el usuario hizo una sola acción y ya tiene su solicitud creada.
    // Así solo sale una notificación de WhatsApp.
    const requestInclude = {
      requestedBy: { select: USER_SELECT },
      expenseOrder: { select: { id: true, ogNumber: true } },
    };

    let request;

    try {
      request = await this.prisma.expenseOrderAuthRequest.create({
        data: {
          expenseOrderId: dto.expenseOrderId,
          requestedById: userId,
          reason: dto.reason,
          status: EditRequestStatus.PENDING,
        },
        include: requestInclude,
      });
    } catch (error) {
      if (!isUniquePendingViolation(error)) throw error;

      const twin = await this.prisma.expenseOrderAuthRequest.findFirst({
        where: {
          expenseOrderId: dto.expenseOrderId,
          requestedById: userId,
          status: EditRequestStatus.PENDING,
        },
        include: requestInclude,
      });

      if (!twin) throw error;

      this.logger.warn(
        `Solicitud de autorización duplicada para OG ${dto.expenseOrderId} por el usuario ${userId}: se devuelve la solicitud ${twin.id} sin notificar de nuevo`,
      );

      return twin;
    }

    // 5. Notificar a todos los administradores (in-app)
    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.EXPENSE_ORDER_AUTH_REQUEST_PENDING,
      title: 'Nueva solicitud de autorización de OG',
      message: `${request.requestedBy.firstName || request.requestedBy.email} solicita autorizar la OG ${request.expenseOrder.ogNumber}`,
      relatedId: request.id,
      relatedType: 'ExpenseOrderAuthRequest',
    });

    // 6. Notificar administradores por WhatsApp (fire & forget)
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      request.requestedBy.email ||
      'Usuario';
    const requesterRole = user?.role?.name || 'usuario';

    this.notifyAdminsByWhatsApp(
      request.id,
      requesterName,
      requesterRole,
      `autorizar la OG ${request.expenseOrder.ogNumber}`,
      dto.reason || 'Sin motivo especificado',
    );

    return request;
  }

  /**
   * Aprobar solicitud
   */
  async approve(
    requestId: string,
    adminId: string,
    dto: ApproveExpenseOrderAuthRequestDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.expenseOrderAuthRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        expenseOrder: { select: { ogNumber: true, status: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    // 2. Validar que revisor es admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (!admin || admin.role?.name !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden aprobar solicitudes');
    }

    // 3. Actualizar solicitud a APPROVED
    const updatedRequest = await this.prisma.expenseOrderAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
    });

    // 4. Auto-transición: cambiar estado de la OG a ADMIN_AUTHORIZED (pendiente de firma de Caja)
    try {
      const adminUser: AuthenticatedUser = {
        id: adminId,
        username: admin.username ?? admin.email ?? '',
        email: admin.email,
        roleId: admin.roleId ?? admin.role?.id ?? '',
        firstName: admin.firstName,
        lastName: admin.lastName,
      };

      await this.expenseOrdersService.updateStatus(
        request.expenseOrderId,
        { status: ExpenseOrderStatus.ADMIN_AUTHORIZED },
        adminUser,
      );
    } catch (error: any) {
      this.logger.warn(
        `OG ${request.expenseOrder.ogNumber} aprobada pero no se pudo auto-transicionar: ${error.message}`,
      );
    }

    // 5. Notificar al solicitante
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EXPENSE_ORDER_AUTH_REQUEST_APPROVED,
      title: 'Solicitud de autorización de OG aprobada',
      message: `Tu solicitud para la OG ${request.expenseOrder.ogNumber} fue aprobada administrativamente. Pendiente de autorización de Caja para el pago.`,
      relatedId: request.expenseOrderId,
      relatedType: 'ExpenseOrder',
    });

    return updatedRequest;
  }

  /**
   * Rechazar solicitud
   */
  async reject(
    requestId: string,
    adminId: string,
    dto: RejectExpenseOrderAuthRequestDto,
  ) {
    // 1. Validar que solicitud existe y está PENDING
    const request = await this.prisma.expenseOrderAuthRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        expenseOrder: { select: { ogNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    // 2. Validar que revisor es admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden rechazar solicitudes');
    }

    // 3. Actualizar solicitud a REJECTED
    const updatedRequest = await this.prisma.expenseOrderAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
    });

    // 4. Notificar al solicitante
    const rejectReason = dto.reviewNotes ? ` Motivo: ${dto.reviewNotes}` : '';
    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.EXPENSE_ORDER_AUTH_REQUEST_REJECTED,
      title: 'Solicitud de autorización de OG rechazada',
      message: `Tu solicitud para autorizar la OG ${request.expenseOrder.ogNumber} ha sido rechazada.${rejectReason}`,
      relatedId: request.expenseOrderId,
      relatedType: 'ExpenseOrder',
    });

    return updatedRequest;
  }

  /**
   * Verificar si el cambio a AUTHORIZED requiere autorización (usuario no-admin)
   */
  async requiresAuthorization(userId: string): Promise<{ required: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (user?.role?.name === 'admin') {
      return { required: false };
    }

    return {
      required: true,
      reason: 'Autorizar una OG requiere aprobación de un administrador',
    };
  }

  /**
   * Verificar si usuario tiene solicitud aprobada para una OG
   */
  async hasApprovedRequest(expenseOrderId: string, userId: string): Promise<boolean> {
    const approvedRequest = await this.prisma.expenseOrderAuthRequest.findFirst({
      where: {
        expenseOrderId,
        requestedById: userId,
        status: EditRequestStatus.APPROVED,
      },
    });

    return !!approvedRequest;
  }

  /**
   * Obtener la solicitud aprobada para recuperar quién la aprobó
   */
  async getApprovedRequest(expenseOrderId: string, userId: string) {
    return this.prisma.expenseOrderAuthRequest.findFirst({
      where: {
        expenseOrderId,
        requestedById: userId,
        status: EditRequestStatus.APPROVED,
      },
    });
  }

  /**
   * Consumir solicitud aprobada (no-op — se mantiene para audit trail)
   */
  async consumeApprovedRequest(expenseOrderId: string, userId: string): Promise<void> {
    // Las solicitudes aprobadas permanecen en estado APPROVED para audit trail completo
    void expenseOrderId;
    void userId;
  }

  /**
   * Obtener solicitudes pendientes (para admins)
   */
  /**
   * Solicitudes que el administrador todavía tiene que responder.
   *
   * No basta con filtrar por `status: PENDING`: si la OG se autoriza por otra vía
   * —el admin firma directo sobre la OG en vez de responder la solicitud— la fila
   * se queda PENDING y la solicitud sigue apareciendo aunque ya no haya nada que
   * autorizar. En producción eran 84 de 106.
   *
   * La solicitud solo tiene sentido mientras la OG espera la firma del admin, es
   * decir en DRAFT o CREATED. Desde ADMIN_AUTHORIZED en adelante ya se firmó.
   */
  async findPendingRequests() {
    return this.prisma.expenseOrderAuthRequest.findMany({
      where: {
        status: EditRequestStatus.PENDING,
        expenseOrder: {
          status: {
            in: [ExpenseOrderStatus.DRAFT, ExpenseOrderStatus.CREATED],
          },
          ...queueLocationFilter(),
        },
      },
      include: {
        requestedBy: { select: USER_SELECT },
        expenseOrder: { select: { id: true, ogNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cierra las solicitudes que quedaron pendientes cuando la OG ya recibió la
   * firma del admin por otra vía.
   *
   * Se marcan APPROVED y no EXPIRED porque lo que el solicitante pidió sí ocurrió,
   * solo que por otro camino: se guarda como revisor a quien autorizó la OG, para
   * que el historial de autorizaciones cuente lo que realmente pasó.
   *
   * Devuelve cuántas cerró.
   */
  async closePendingRequestsForAuthorizedOrder(
    expenseOrderId: string,
    authorizedById: string,
  ): Promise<number> {
    const { count } = await this.prisma.expenseOrderAuthRequest.updateMany({
      where: {
        expenseOrderId,
        status: EditRequestStatus.PENDING,
      },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: authorizedById,
        reviewedAt: new Date(),
        reviewNotes: 'Autorizada directamente sobre la OG',
      },
    });

    if (count > 0) {
      this.logger.log(
        `OG ${expenseOrderId}: se cerraron ${count} solicitud(es) de autorización pendientes al firmarse la OG`,
      );
    }

    return count;
  }

  /**
   * Obtener todas las solicitudes (para admins)
   */
  async findAll() {
    return this.prisma.expenseOrderAuthRequest.findMany({
      where: { expenseOrder: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        expenseOrder: { select: { id: true, ogNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener el historial completo de solicitudes de una OG
   * (todas las solicitudes de autorización asociadas a la OG, en orden cronológico)
   */
  async findByExpenseOrder(expenseOrderId: string) {
    return this.prisma.expenseOrderAuthRequest.findMany({
      where: { expenseOrderId },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener solicitudes propias del usuario
   */
  async findByUser(userId: string) {
    return this.prisma.expenseOrderAuthRequest.findMany({
      where: { requestedById: userId },
      include: {
        reviewedBy: { select: USER_SELECT },
        expenseOrder: { select: { id: true, ogNumber: true, status: true } },
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
            requestType: ApprovalRequestType.EXPENSE_ORDER_AUTH,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `WhatsApp notifications for expense order auth request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending WhatsApp notifications: ${error.message}`,
      );
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.expenseOrderAuthRequest.findUnique({
      where: { id: requestId },
      select: { expenseOrderId: true },
    });
    return request?.expenseOrderId ?? null;
  }
}
