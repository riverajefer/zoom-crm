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
import {
  AdminApproveApPaymentAuthRequestDto,
  AdminRejectApPaymentAuthRequestDto,
  CajaRejectApPaymentAuthRequestDto,
  CreateApPaymentAuthRequestDto,
} from './dto';
import {
  ApPaymentAuthRequestStatus,
  ApprovalRequestType,
  NotificationType,
} from '../../generated/prisma';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { queueLocationFilter } from '../../common/utils/location-context';

const USER_SELECT = { id: true, email: true, firstName: true, lastName: true } as const;

@Injectable()
export class AccountsPayablePaymentAuthRequestsService implements OnModuleInit, ApprovalRequestHandler {
  private readonly logger = new Logger(AccountsPayablePaymentAuthRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly whatsappService: WhatsappService,
    private readonly approvalRegistry: ApprovalRequestRegistry,
    @Inject(forwardRef(() => AccountsPayableService))
    private readonly accountsPayableService: AccountsPayableService,
  ) {}

  onModuleInit() {
    this.approvalRegistry.register(ApprovalRequestType.AP_PAYMENT_AUTH, this);
  }

  // ─── ApprovalRequestHandler interface (WhatsApp admin step) ─────────────────

  async findPendingRequest(requestId: string): Promise<ApprovalRequestInfo | null> {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findUnique({
      where: { id: requestId },
      include: { accountPayable: { select: { apNumber: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      status: request.status as string,
      requestedById: request.requestedById,
      displayLabel: `pago de la CP ${request.accountPayable.apNumber}`,
    };
  }

  async approveViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findUnique({
      where: { id: requestId },
      include: { accountPayable: { select: { apNumber: true } } },
    });
    if (!request || request.status !== ApPaymentAuthRequestStatus.PENDING) return;

    await this.prisma.accountPayablePaymentAuthRequest.update({
      where: { id: requestId },
      data: {
        status: ApPaymentAuthRequestStatus.ADMIN_APPROVED,
        adminReviewedById: reviewerId,
        adminReviewedAt: new Date(),
        adminNotes: 'Aprobado vía WhatsApp',
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_PAYMENT_AUTH_ADMIN_APPROVED,
      title: 'Pago de CP aprobado por Admin',
      message: `Tu solicitud de pago para la CP ${request.accountPayable.apNumber} fue aprobada por el administrador. Pendiente de autorización de Caja.`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
    });

    await this.notifyCajaByWhatsApp(
      request.id,
      request.accountPayable.apNumber,
      Number(request.amount),
    );
  }

  async rejectViaWhatsApp(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findUnique({
      where: { id: requestId },
      include: { accountPayable: { select: { apNumber: true } } },
    });
    if (!request || request.status !== ApPaymentAuthRequestStatus.PENDING) return;

    await this.prisma.accountPayablePaymentAuthRequest.update({
      where: { id: requestId },
      data: {
        status: ApPaymentAuthRequestStatus.ADMIN_REJECTED,
        adminReviewedById: reviewerId,
        adminReviewedAt: new Date(),
        adminNotes: 'Rechazado vía WhatsApp',
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_PAYMENT_AUTH_ADMIN_REJECTED,
      title: 'Solicitud de pago de CP rechazada',
      message: `Tu solicitud de pago para la CP ${request.accountPayable.apNumber} fue rechazada por el administrador.`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
    });
  }

  // ─── Crear solicitud de pago ─────────────────────────────────────────────────

  async create(userId: string, dto: CreateApPaymentAuthRequestDto) {
    const ap = await this.prisma.accountPayable.findUnique({
      where: { id: dto.accountPayableId },
    });
    if (!ap) throw new NotFoundException(`CP con id ${dto.accountPayableId} no encontrada`);

    if (ap.status === 'CANCELLED') {
      throw new BadRequestException('No se puede solicitar un pago en una cuenta anulada');
    }
    if (ap.status === 'PAID') {
      throw new BadRequestException('La cuenta ya está completamente pagada');
    }

    // El tope descuenta lo que ya salió de caja por la OG asociada: la CP espejo
    // de una OG pagada muestra su saldo completo aunque el dinero ya se giró, y
    // sin esta verificación la solicitud llega hasta Caja y se paga dos veces.
    const amountNum = dto.amount;
    await this.accountsPayableService.assertPayableAmount(ap, amountNum);

    const existing = await this.prisma.accountPayablePaymentAuthRequest.findFirst({
      where: {
        accountPayableId: dto.accountPayableId,
        requestedById: userId,
        status: { in: [ApPaymentAuthRequestStatus.PENDING, ApPaymentAuthRequestStatus.ADMIN_APPROVED] },
      },
    });
    if (existing) {
      throw new BadRequestException('Ya tienes una solicitud de pago pendiente para esta Cuenta por Pagar');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    // El índice parcial `account_payable_payment_auth_requests_open_unique`
    // cierra la carrera del doble clic. Cubre PENDING y ADMIN_APPROVED, igual
    // que la validación de arriba: una solicitud aprobada por el admin pero
    // todavía sin registrar en Caja también ocupa el cupo.
    const include = {
      requestedBy: { select: USER_SELECT },
      accountPayable: { select: { id: true, apNumber: true } },
    };

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'account_payable_payment_auth_requests_open_unique',
      create: () =>
        this.prisma.accountPayablePaymentAuthRequest.create({
          data: {
            accountPayableId: dto.accountPayableId,
            requestedById: userId,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            paymentDate: new Date(dto.paymentDate),
            reference: dto.reference,
            notes: dto.notes,
            bankEntity: dto.bankEntity,
            receiptFileId: dto.receiptFileId,
            receiptFileId2: dto.receiptFileId2,
            reason: dto.reason,
            status: ApPaymentAuthRequestStatus.PENDING,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.accountPayablePaymentAuthRequest.findFirst({
          where: {
            accountPayableId: dto.accountPayableId,
            requestedById: userId,
            status: {
              in: [
                ApPaymentAuthRequestStatus.PENDING,
                ApPaymentAuthRequestStatus.ADMIN_APPROVED,
              ],
            },
          },
          include,
        }),
    });

    if (wasDuplicate) {
      this.logger.warn(
        `Solicitud de pago de CP duplicada para ${dto.accountPayableId} por el usuario ${userId}: se devuelve la solicitud ${request.id} sin notificar de nuevo`,
      );
      return request;
    }

    await this.notificationsService.notifyAllAdmins({
      type: NotificationType.AP_PAYMENT_AUTH_PENDING,
      title: 'Nueva solicitud de pago de Cuenta por Pagar',
      message: `${request.requestedBy.firstName || request.requestedBy.email} solicita registrar un pago en la CP ${request.accountPayable.apNumber} por ${amountNum.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
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
      request.accountPayable.apNumber,
      amountNum,
      dto.reason || 'Sin motivo especificado',
    );

    return request;
  }

  // ─── Paso 1: Admin aprueba ───────────────────────────────────────────────────

  async adminApprove(requestId: string, adminId: string, dto: AdminApproveApPaymentAuthRequestDto) {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findFirst({
      where: { id: requestId, status: ApPaymentAuthRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { apNumber: true } },
      },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o ya procesada');

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });
    if (!admin || admin.role?.name !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden aprobar solicitudes en el paso 1');
    }

    const updated = await this.prisma.accountPayablePaymentAuthRequest.update({
      where: { id: requestId },
      data: {
        status: ApPaymentAuthRequestStatus.ADMIN_APPROVED,
        adminReviewedById: adminId,
        adminReviewedAt: new Date(),
        adminNotes: dto.adminNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        adminReviewedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, totalAmount: true } },
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_PAYMENT_AUTH_ADMIN_APPROVED,
      title: 'Pago de CP aprobado por Admin — esperando Caja',
      message: `Tu solicitud de pago para la CP ${request.accountPayable.apNumber} fue aprobada por el administrador. Pendiente de autorización de Caja.`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
    });

    await this.notifyCajaByWhatsApp(
      request.id,
      request.accountPayable.apNumber,
      Number(request.amount),
    );

    return updated;
  }

  // ─── Paso 1: Admin rechaza ───────────────────────────────────────────────────

  async adminReject(requestId: string, adminId: string, dto: AdminRejectApPaymentAuthRequestDto) {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findFirst({
      where: { id: requestId, status: ApPaymentAuthRequestStatus.PENDING },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { apNumber: true } },
      },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o ya procesada');

    const admin = await this.prisma.user.findUnique({ where: { id: adminId }, include: { role: true } });
    if (admin?.role?.name !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden rechazar solicitudes');
    }

    const updated = await this.prisma.accountPayablePaymentAuthRequest.update({
      where: { id: requestId },
      data: {
        status: ApPaymentAuthRequestStatus.ADMIN_REJECTED,
        adminReviewedById: adminId,
        adminReviewedAt: new Date(),
        adminNotes: dto.adminNotes,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        adminReviewedBy: { select: USER_SELECT },
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_PAYMENT_AUTH_ADMIN_REJECTED,
      title: 'Solicitud de pago de CP rechazada',
      message: `Tu solicitud de pago para la CP ${request.accountPayable.apNumber} fue rechazada.${dto.adminNotes ? ` Motivo: ${dto.adminNotes}` : ''}`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
    });

    return updated;
  }

  // ─── Paso 2: Caja aprueba y registra el pago ─────────────────────────────────

  async cajaApprove(requestId: string, currentUser: AuthenticatedUser) {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findFirst({
      where: { id: requestId, status: ApPaymentAuthRequestStatus.ADMIN_APPROVED },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { apNumber: true, id: true } },
      },
    });
    if (!request) {
      throw new NotFoundException(
        'Solicitud no encontrada o no está en estado ADMIN_APPROVED',
      );
    }

    await this.prisma.accountPayablePaymentAuthRequest.update({
      where: { id: requestId },
      data: {
        status: ApPaymentAuthRequestStatus.COMPLETED,
        cajaReviewedById: currentUser.id,
        cajaReviewedAt: new Date(),
      },
    });

    // Registrar el pago real usando el servicio de CP
    const payment = await this.accountsPayableService.registerPaymentFromAuthRequest(
      request.accountPayableId,
      {
        amount: Number(request.amount),
        paymentMethod: request.paymentMethod,
        paymentDate: request.paymentDate.toISOString(),
        reference: request.reference ?? undefined,
        notes: request.notes ?? undefined,
        bankEntity: request.bankEntity ?? undefined,
        receiptFileId: request.receiptFileId ?? undefined,
        receiptFileId2: request.receiptFileId2 ?? undefined,
      },
      currentUser.id,
      requestId,
    );

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_PAYMENT_AUTH_COMPLETED,
      title: 'Pago de CP completado',
      message: `El pago para la CP ${request.accountPayable.apNumber} fue autorizado por Caja y registrado exitosamente.`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
    });

    return payment;
  }

  // ─── Paso 2: Caja rechaza ────────────────────────────────────────────────────

  async cajaReject(requestId: string, dto: CajaRejectApPaymentAuthRequestDto, currentUser: AuthenticatedUser) {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findFirst({
      where: { id: requestId, status: ApPaymentAuthRequestStatus.ADMIN_APPROVED },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { apNumber: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o no está en estado ADMIN_APPROVED');
    }

    const updated = await this.prisma.accountPayablePaymentAuthRequest.update({
      where: { id: requestId },
      data: {
        status: ApPaymentAuthRequestStatus.CAJA_REJECTED,
        cajaReviewedById: currentUser.id,
        cajaReviewedAt: new Date(),
        cajaRejectionReason: dto.reason,
      },
      include: {
        requestedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
      },
    });

    await this.notificationsService.create({
      userId: request.requestedById,
      type: NotificationType.AP_PAYMENT_AUTH_CAJA_REJECTED,
      title: 'Pago de CP rechazado por Caja',
      message: `El pago para la CP ${request.accountPayable.apNumber} fue rechazado por Caja.${dto.reason ? ` Motivo: ${dto.reason}` : ''}`,
      relatedId: request.id,
      relatedType: 'AccountPayablePaymentAuthRequest',
    });

    return updated;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  async findPendingAdmin() {
    return this.prisma.accountPayablePaymentAuthRequest.findMany({
      where: { status: ApPaymentAuthRequestStatus.PENDING, accountPayable: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingCaja() {
    return this.prisma.accountPayablePaymentAuthRequest.findMany({
      where: { status: ApPaymentAuthRequestStatus.ADMIN_APPROVED, accountPayable: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        adminReviewedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true, description: true } },
      },
      orderBy: { adminReviewedAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.accountPayablePaymentAuthRequest.findMany({
      where: { accountPayable: queueLocationFilter() },
      include: {
        requestedBy: { select: USER_SELECT },
        adminReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, totalAmount: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.accountPayablePaymentAuthRequest.findMany({
      where: { requestedById: userId },
      include: {
        accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true } },
        adminReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByAccountPayable(accountPayableId: string) {
    return this.prisma.accountPayablePaymentAuthRequest.findMany({
      where: { accountPayableId },
      include: {
        requestedBy: { select: USER_SELECT },
        adminReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
        reversalRequest: {
          select: { id: true, status: true, reason: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: USER_SELECT },
        adminReviewedBy: { select: USER_SELECT },
        cajaReviewedBy: { select: USER_SELECT },
        accountPayable: { select: { id: true, apNumber: true, totalAmount: true, balance: true, description: true } },
      },
    });
    if (!request) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);
    return request;
  }

  // ─── WhatsApp helpers ────────────────────────────────────────────────────────

  private async notifyAdminsByWhatsApp(
    requestId: string,
    requesterName: string,
    requesterRole: string,
    apNumber: string,
    amount: number,
    reason: string,
  ) {
    try {
      const adminPhones = await this.whatsappService.getAdminPhones();

      const amountFormatted = amount.toLocaleString('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      });

      const results = await Promise.allSettled(
        adminPhones.map((phone) =>
          this.whatsappService.sendApprovalNotification({
            telefono: phone,
            requesterName,
            requesterRole,
            actionDescription: `pago de ${amountFormatted} en CP ${apNumber}`,
            reason,
            requestId,
            requestType: ApprovalRequestType.AP_PAYMENT_AUTH,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `WhatsApp admin notifications for AP payment request ${requestId}: ${fulfilled} sent, ${rejected} failed`,
      );
    } catch (error: any) {
      this.logger.error(`Error sending WhatsApp admin notifications: ${error.message}`);
    }
  }

  private async notifyCajaByWhatsApp(requestId: string, apNumber: string, amount: number) {
    try {
      const cajaPhones = await this.whatsappService.getPhonesByPermission(
        'caja_authorize_ap_payment',
      );

      const amountFormatted = amount.toLocaleString('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      });

      await Promise.allSettled(
        cajaPhones.map((phone) =>
          this.whatsappService.sendTextMessage(
            phone,
              `✅ *Pago de CP autorizado por Admin*\n\nSe requiere tu firma de Caja para la CP *${apNumber}* por *${amountFormatted}*.\n\n🔗 Entra al sistema → Cuentas por Pagar → Pendientes Caja para autorizarlo.\n\nID solicitud: ${requestId}`,
            ),
          ),
      );
    } catch (error: any) {
      this.logger.error(`Error sending WhatsApp caja notifications: ${error.message}`);
    }
  }

  async getEntityId(requestId: string): Promise<string | null> {
    const request = await this.prisma.accountPayablePaymentAuthRequest.findUnique({
      where: { id: requestId },
      select: { accountPayableId: true },
    });
    return request?.accountPayableId ?? null;
  }
}
