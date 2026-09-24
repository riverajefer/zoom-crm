import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateNotificationDto, FilterNotificationsDto } from './dto';

export type NotificationTargetType =
  | 'ORDER'
  | 'QUOTE'
  | 'EXPENSE_ORDER'
  | 'ACCOUNT_PAYABLE'
  | 'CLIENT'
  | 'CASH_SESSION'
  | 'SUPPLY';

export interface NotificationTarget {
  entityType: NotificationTargetType;
  entityId: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crear una notificación
   */
  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: dto,
    });
  }

  /**
   * Obtener notificaciones del usuario con paginación
   */
  async findByUser(userId: string, filters: FilterNotificationsDto) {
    const { page = 1, limit = 20, isRead } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
    };

    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Contar notificaciones no leídas
   */
  async countUnread(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Marcar notificación como leída
   */
  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Resolver a qué entidad raíz lleva una notificación (OP, OG, CP, cliente…).
   *
   * Muchas notificaciones guardan en `relatedId` el ID de la *solicitud*
   * (p. ej. AccountPayablePaymentAuthRequest), no el de la entidad; aquí se
   * sigue la relación hasta la entidad que tiene pantalla de detalle.
   * Retorna null si la notificación no tiene destino navegable.
   */
  async resolveTarget(
    notificationId: string,
    userId: string,
  ): Promise<NotificationTarget | null> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { relatedId: true, relatedType: true },
    });
    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    const { relatedId: id, relatedType } = notification;
    if (!id || !relatedType) return null;

    const target = (
      entityType: NotificationTargetType,
      entityId: string | null | undefined,
    ): NotificationTarget | null =>
      entityId ? { entityType, entityId } : null;

    switch (relatedType) {
      // Entidades directas
      case 'Order':
        return target('ORDER', id);
      case 'Quote':
        return target('QUOTE', id);
      case 'ExpenseOrder':
        return target('EXPENSE_ORDER', id);
      case 'AccountPayable':
        return target('ACCOUNT_PAYABLE', id);
      case 'Client':
        return target('CLIENT', id);
      case 'SUPPLY':
        return target('SUPPLY', id);

      // Solicitudes sobre una OP
      case 'AdvancePaymentApproval':
        return target('ORDER', (await this.prisma.advancePaymentApproval.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'AdvisorChangeRequest':
        return target('ORDER', (await this.prisma.advisorChangeRequest.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'ClientOwnershipAuthRequest':
        return target('ORDER', (await this.prisma.clientOwnershipAuthRequest.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'DiscountApproval':
        return target('ORDER', (await this.prisma.discountApproval.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'OrderEditRequest':
        return target('ORDER', (await this.prisma.orderEditRequest.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'OrderStatusChangeRequest':
        return target('ORDER', (await this.prisma.orderStatusChangeRequest.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'PaymentEditApproval':
        return target('ORDER', (await this.prisma.paymentEditApproval.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'RefundRequest':
        return target('ORDER', (await this.prisma.refundRequest.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'PayrollDeduction':
        return target('ORDER', (await this.prisma.payrollDeduction.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);
      case 'Payment':
        return target('ORDER', (await this.prisma.payment.findUnique({ where: { id }, select: { orderId: true } }))?.orderId);

      // Solicitudes sobre una OG / CP / cliente
      case 'ExpenseOrderAuthRequest':
        return target('EXPENSE_ORDER', (await this.prisma.expenseOrderAuthRequest.findUnique({ where: { id }, select: { expenseOrderId: true } }))?.expenseOrderId);
      case 'AccountPayableAuthRequest':
        return target('ACCOUNT_PAYABLE', (await this.prisma.accountPayableAuthRequest.findUnique({ where: { id }, select: { accountPayableId: true } }))?.accountPayableId);
      case 'AccountPayablePaymentAuthRequest':
        return target('ACCOUNT_PAYABLE', (await this.prisma.accountPayablePaymentAuthRequest.findUnique({ where: { id }, select: { accountPayableId: true } }))?.accountPayableId);
      case 'AccountPayablePaymentReversalRequest':
        return target('ACCOUNT_PAYABLE', (await this.prisma.accountPayablePaymentReversalRequest.findUnique({ where: { id }, select: { paymentAuthRequest: { select: { accountPayableId: true } } } }))?.paymentAuthRequest?.accountPayableId);
      case 'ClientAdvisorRequest':
        return target('CLIENT', (await this.prisma.clientAdvisorRequest.findUnique({ where: { id }, select: { clientId: true } }))?.clientId);

      // Caja
      case 'CashMovement':
        return target('CASH_SESSION', (await this.prisma.cashMovement.findUnique({ where: { id }, select: { cashSessionId: true } }))?.cashSessionId);
      case 'CashMovementVoidRequest':
        return target('CASH_SESSION', (await this.prisma.cashMovementVoidRequest.findUnique({ where: { id }, select: { cashMovement: { select: { cashSessionId: true } } } }))?.cashMovement?.cashSessionId);

      default:
        return null;
    }
  }

  /**
   * Eliminar notificación
   */
  async delete(notificationId: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId,
      },
    });
  }

  /**
   * Notificar a todos los administradores
   */
  async notifyAllAdmins(
    data: Omit<CreateNotificationDto, 'userId'>,
  ): Promise<void> {
    // Obtener rol de admin
    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'admin' },
      include: {
        users: {
          select: { id: true },
        },
      },
    });

    if (!adminRole || adminRole.users.length === 0) {
      return;
    }

    // Crear notificaciones para todos los admins
    const notifications = adminRole.users.map((user) => ({
      userId: user.id,
      ...data,
    }));

    await this.prisma.notification.createMany({
      data: notifications,
    });
  }

  /**
   * Notificar a todos los usuarios que tengan un permiso específico
   */
  async notifyUsersWithPermission(
    permissionName: string,
    data: Omit<CreateNotificationDto, 'userId'>,
  ): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        role: {
          permissions: {
            some: {
              permission: { name: permissionName },
            },
          },
        },
      },
      select: { id: true },
    });

    if (users.length === 0) return;

    const notifications = users.map((user) => ({
      userId: user.id,
      ...data,
    }));

    await this.prisma.notification.createMany({
      data: notifications,
    });
  }
}
