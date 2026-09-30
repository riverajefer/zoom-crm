import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
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
import { ApproveApAuthRequestDto, CreateApAuthRequestDto, RejectApAuthRequestDto } from './dto';
import {
  AccountPayableStatus,
  ApprovalRequestType,
  EditRequestStatus,
  NotificationType,
} from '../../generated/prisma';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { queueLocationFilter } from '../../common/utils/location-context';

const USER_SELECT = { id: true, email: true, firstName: true, lastName: true } as const;

@Injectable()
export class AccountsPayableAuthRequestsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(AccountsPayableAuthRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    private readonly whatsappService: WhatsappService,
    @Inject(forwardRef(() => AccountsPayableService))
    private readonly accountsPayableService: AccountsPayableService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register(ApprovalRequestType.AP_AUTH, this);
  }

  // ─── ApprovalRequestHandler interface ────────────────────────────────────────

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.accountPayableAuthRequest.findUnique({
      where: { id: requestId },
      include: { accountPayable: { select: { apNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status,
      requestedById: request.requestedById,
      displayLabel: `autorización de la CP ${request.accountPayable.apNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.accountPayableAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Aprobado vía WhatsApp',
      },
      include: { accountPayable: { select: { apNumber: true } } },
    });

    await this.autoAuthorizeAccountPayable(request.accountPayableId, reviewerId);

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_AUTH_REQUEST_APPROVED,
      title: 'Solicitud de autorización de Cuenta por Pagar aprobada',
      message: `Tu solicitud para la CP ${request.accountPayable.apNumber} fue aprobada. Ya puedes registrar el pago.`,
      relatedId: request.accountPayableId,
      relatedType: 'AccountPayable',
    });
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.accountPayableAuthRequest.update({
      where: { id: requestId },
      data: {
        status: EditRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: 'Rechazado vía WhatsApp',
      },
      include: { accountPayable: { select: { apNumber: true } } },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_AUTH_REQUEST_REJECTED,
      title: 'Solicitud de autorización de Cuenta por Pagar rechazada',
      message: `Tu solicitud para la CP ${request.accountPayable.apNumber} ha sido rechazada.`,
      relatedId: request.accountPayableId,
      relatedType: 'AccountPayable',
    });
  }

  // ─── Domain methods ───────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateApAuthRequestDto) {
    const accountPayable = await this.prisma.accountPayable.findUnique({
      where: { id: dto.accountPayableId },
    });
    if (!accountPayable) {
      throw new NotFoundException(`Cuenta por pagar con id ${dto.accountPayableId} no encontrada`);
    }

    if (accountPayable.status !== AccountPayableStatus.PENDING) {
      throw new BadRequestException(
        `Solo se puede solicitar autorización cuando la CP está en estado PENDING. Estado actual: ${accountPayable.status}`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (user?.role?.name === 'admin') {
      throw new BadRequestException(
        'Los administradores pueden autorizar la CP directamente sin crear una solicitud',
      );
    }

    const existing = await this.prisma.accountPayableAuthRequest.findFirst({
      where: {
        accountPayableId: dto.accountPayableId,
        requestedById: userId,
        status: EditRequestStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Ya tienes una solicitud de autorización pendiente para esta Cuenta por Pagar',
      );
    }

    // El índice parcial `account_payable_auth_requests_pending_unique` cierra la
    // carrera del doble clic; la petición perdedora devuelve la gemela sin
    // notificar de nuevo.
    const include = {
      requestedBy: { select: USER_SELECT },
      accountPayable: { select: { id: true, apNumber: true } },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'account_payable_auth_requests_pending_unique',
      create: () =>
        this.prisma.accountPayableAuthRequest.create({
          data: {
            accountPayableId: dto.accountPayableId,
            requestedById: userId,
            reason: dto.reason,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.accountPayableAuthRequest.findFirst({
          where: {
            accountPayableId: dto.accountPayableId,
            requestedById: userId,
            status: EditRequestStatus.PENDING,
          },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de autorización de CP duplicada para ${dto.accountPayableId} por el usuario ${userId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    // Notificación in-app a admins
    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.AP_AUTH_REQUEST_PENDING,
      title: 'Nueva solicitud de autorización de Cuenta por Pagar',
      message: `${request.requestedBy.firstName || request.requestedBy.email} solicita autorizar la CP ${request.accountPayable.apNumber}`,
      relatedId: request.id,
      relatedType: 'AccountPayableAuthRequest',
    });

    // Notificación WhatsApp (fire & forget)
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      request.requestedBy.email ||
      'Usuario';
    const requesterRole = user?.role?.name || 'usuario';

    this.notifyAdminsByWhatsApp(
      request.id,
      requesterName,
      requesterRole,
      `autorizar la Cuenta por Pagar ${request.accountPayable.apNumber}`,
      dto.reason || 'Sin motivo especificado',
    );

    return request;
  }

  async approve(requestId: string, adminId: string, dto: ApproveApAuthRequestDto) {
    const request = await this.prisma.accountPayableAuthRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { apNumber: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });
    if (!admin || admin.role?.name !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden aprobar solicitudes');
    }

    const updatedRequest = await this.prisma.accountPayableAuthRequest.update({
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

    await this.autoAuthorizeAccountPayable(request.accountPayableId, adminId);

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_AUTH_REQUEST_APPROVED,
      title: 'Solicitud de autorización de Cuenta por Pagar aprobada',
      message: `Tu solicitud para la CP ${request.accountPayable.apNumber} fue aprobada. Ya puedes registrar el pago.`,
      relatedId: request.accountPayableId,
      relatedType: 'AccountPayable',
    });

    return updatedRequest;
  }

  async reject(requestId: string, adminId: string, dto: RejectApAuthRequestDto) {
    const request = await this.prisma.accountPayableAuthRequest.findFirst({
      where: { id: requestId, status: EditRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { apNumber: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });
    if (!admin || admin.role?.name !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden rechazar solicitudes');
    }

    const updatedRequest = await this.prisma.accountPayableAuthRequest.update({
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

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_AUTH_REQUEST_REJECTED,
      title: 'Solicitud de autorización de Cuenta por Pagar rechazada',
      message: `Tu solicitud para la CP ${request.accountPayable.apNumber} fue rechazada. ${dto.reviewNotes ? `Motivo: ${dto.reviewNotes}` : ''}`,
      relatedId: request.accountPayableId,
      relatedType: 'AccountPayable',
    });

    return updatedRequest;
  }

  async findPending() {
    return this.prisma.accountPayableAuthRequest.findMany({
      where: { status: EditRequestStatus.PENDING, accountPayable: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, status: true, totalAmount: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.accountPayableAuthRequest.findMany({
      where: { accountPayable: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.accountPayableAuthRequest.findMany({
      where: { requestedById: userId },
      include: {
        reviewedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async autoAuthorizeAccountPayable(accountPayableId: string, adminId: string) {
    try {
      await this.accountsPayableService.adminAuthorize(accountPayableId, adminId);
    } catch (error: any) {
      this.logger.warn(
        `CP ${accountPayableId} aprobada pero no se pudo auto-transicionar: ${error.message}`,
      );
    }
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
      if (adminPhones.length === 0) return;

      await Promise.allSettled(
        adminPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole,
            actionDescription,
            reason,
            requestId,
            requestType: ApprovalRequestType.AP_AUTH,
          }),
        ),
      );
    } catch (error: any) {
      this.logger.error(`Error notifying admins via WhatsApp: ${error.message}`);
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.accountPayableAuthRequest.findUnique({
      where: { id: requestId },
      select: { accountPayableId: true },
    });
    return request?.accountPayableId ?? null;
  }
}
