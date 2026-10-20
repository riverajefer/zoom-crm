import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BUSINESS_TIMEZONE,
  businessToday,
  startOfDay,
} from '../../common/utils/date-range.util';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApPaymentAuthRequestStatus,
  EditRequestStatus,
  NotificationType,
} from '../../generated/prisma';

/**
 * Días sin respuesta después de los cuales una solicitud se da por abandonada.
 * Una semana deja margen para fines de semana y ausencias.
 */
export const APPROVAL_EXPIRY_DAYS = 7;

/**
 * Campo de la orden que refleja el estado de la solicitud.
 *
 * `orders.service.updateStatus()` bloquea el avance de la orden mientras estos
 * campos estén en PENDING o REJECTED. Si la solicitud vence y el campo se queda
 * en PENDING, la orden queda trabada para siempre: la solicitud ya no existe y
 * nadie puede aprobarla. Por eso el vencimiento tiene que reflejarse también acá.
 */
type OrderMirrorField = 'advancePaymentStatus' | 'clientOwnershipAuthStatus';

interface ExpirableRequestType {
  /** Nombre del modelo en Prisma, para el log. */
  model: string;
  /** Cómo se nombra la solicitud en la notificación al solicitante. */
  label: string;
  /** El delegate de Prisma. Se resuelve perezosamente para no atarlo al constructor. */
  delegate: (prisma: PrismaService) => {
    findMany: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  /**
   * Estados que cuentan como "sin resolver". Casi todos usan EditRequestStatus,
   * pero las solicitudes de pago de CP tienen su propia máquina de dos pasos y
   * quedan sin resolver en dos estados distintos.
   */
  pendingStatus?: string | string[];
  /** Valor terminal al que se lleva. */
  expiredStatus?: string;
  /** Campos donde queda constancia; los nombres varían entre modelos. */
  closeFields?: (note: string) => Record<string, unknown>;
  /** Solo para las solicitudes que espejan su estado en la orden. */
  orderMirrorField?: OrderMirrorField;
}

/** Constancia estándar: la usan los 13 modelos que siguen EditRequestStatus. */
const defaultCloseFields = (note: string) => ({
  reviewedAt: new Date(),
  reviewNotes: note,
});

const EXPIRABLE_REQUEST_TYPES: ExpirableRequestType[] = [
  {
    model: 'orderEditRequest',
    label: 'edición de orden',
    delegate: (p) => p.orderEditRequest as any,
  },
  {
    model: 'orderStatusChangeRequest',
    label: 'cambio de estado',
    delegate: (p) => p.orderStatusChangeRequest as any,
  },
  {
    model: 'expenseOrderAuthRequest',
    label: 'autorización de OG',
    delegate: (p) => p.expenseOrderAuthRequest as any,
  },
  {
    model: 'expenseOrderEditRequest',
    label: 'edición de OG pagada',
    delegate: (p) => p.expenseOrderEditRequest as any,
  },
  {
    model: 'advancePaymentApproval',
    label: 'aprobación de anticipo',
    delegate: (p) => p.advancePaymentApproval as any,
    orderMirrorField: 'advancePaymentStatus',
  },
  {
    model: 'clientOwnershipAuthRequest',
    label: 'autorización de propiedad de cliente',
    delegate: (p) => p.clientOwnershipAuthRequest as any,
    orderMirrorField: 'clientOwnershipAuthStatus',
  },
  {
    model: 'discountApproval',
    label: 'aprobación de descuento',
    delegate: (p) => p.discountApproval as any,
  },
  {
    model: 'paymentEditApproval',
    label: 'edición de pago',
    delegate: (p) => p.paymentEditApproval as any,
  },
  {
    model: 'refundRequest',
    label: 'devolución',
    delegate: (p) => p.refundRequest as any,
  },
  {
    model: 'accountPayableAuthRequest',
    label: 'autorización de cuenta por pagar',
    delegate: (p) => p.accountPayableAuthRequest as any,
  },
  {
    model: 'cashMovementVoidRequest',
    label: 'anulación de movimiento de caja',
    delegate: (p) => p.cashMovementVoidRequest as any,
  },
  {
    model: 'clientAdvisorRequest',
    label: 'asignación de asesor a cliente',
    delegate: (p) => p.clientAdvisorRequest as any,
  },
  {
    model: 'advisorChangeRequest',
    label: 'cambio de asesor',
    delegate: (p) => p.advisorChangeRequest as any,
  },
  {
    model: 'quoteRestoreRequest',
    label: 'restauración de cotización',
    delegate: (p) => p.quoteRestoreRequest as any,
  },
  {
    // Máquina de estados propia, de dos pasos (Admin → Caja), con sus propios
    // nombres de campo. Vencen los dos estados sin resolver: PENDING espera al
    // administrador y ADMIN_APPROVED espera la firma de Caja. Una solicitud que
    // lleva una semana esperando a Caja está tan abandonada como la que lleva una
    // semana esperando al admin, y mientras siga abierta bloquea al solicitante
    // de volver a pedir el pago de esa CP.
    model: 'accountPayablePaymentAuthRequest',
    label: 'pago de cuenta por pagar',
    delegate: (p) => p.accountPayablePaymentAuthRequest as any,
    pendingStatus: [
      ApPaymentAuthRequestStatus.PENDING,
      ApPaymentAuthRequestStatus.ADMIN_APPROVED,
    ],
    expiredStatus: ApPaymentAuthRequestStatus.EXPIRED,
    closeFields: (note) => ({ adminReviewedAt: new Date(), adminNotes: note }),
  },
];

/**
 * Vence las solicitudes de aprobación que llevan una semana sin respuesta.
 *
 * Sin esto la bandeja de "Solicitudes" solo crece: en producción se habían
 * acumulado 22 solicitudes de OG, las más viejas de casi un mes, porque nadie
 * las responde y nada las cierra.
 *
 * No toca las solicitudes del día en curso: el corte es a medianoche, así que
 * una solicitud recién creada nunca se vence por accidente.
 */
@Injectable()
export class ApprovalExpiryService {
  private readonly logger = new Logger(ApprovalExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // 3 de la mañana hora Colombia, no del servidor. Sin `timeZone` el cron sigue
  // la zona del contenedor, que en Railway es UTC: dispararía a las 10 de la
  // noche hora local, dentro de la jornada.
  @Cron('0 3 * * *', { timeZone: BUSINESS_TIMEZONE })
  async expireStaleRequests(): Promise<void> {
    const cutoff = this.cutoffDate();
    let total = 0;

    for (const type of EXPIRABLE_REQUEST_TYPES) {
      try {
        total += await this.expireType(type, cutoff);
      } catch (error: any) {
        // Un tipo que falle no debe dejar sin barrer a los demás.
        this.logger.error(
          `Error venciendo solicitudes de ${type.model}: ${error.message}`,
        );
      }
    }

    if (total > 0) {
      this.logger.log(
        `Vencidas ${total} solicitud(es) sin respuesta desde antes de ${cutoff.toISOString()}`,
      );
    }
  }

  /**
   * Corte: medianoche **hora Colombia** de hace APPROVAL_EXPIRY_DAYS días.
   *
   * Se trunca al día en vez de restar 7×24 horas para que el resultado no dependa
   * de la hora a la que corra el cron, y para que las solicitudes de hoy queden
   * siempre fuera del barrido.
   *
   * La zona importa: `new Date().setHours(0,0,0,0)` resuelve en la zona del
   * servidor, que en Railway es UTC. Eso correría el corte a las 7 de la noche
   * hora Colombia del día anterior — la misma trampa que documenta
   * `date-range.util.ts`. Por eso la aritmética va sobre la fecha de calendario
   * del negocio y `startOfDay` la convierte al instante correcto.
   */
  private cutoffDate(): Date {
    const [year, month, day] = businessToday().split('-').map(Number);

    // Anclado en UTC solo para hacer la resta de días sin que la zona del
    // servidor desplace el resultado; el valor que importa es la fecha, no la hora.
    const cutoffDay = new Date(Date.UTC(year, month - 1, day));
    cutoffDay.setUTCDate(cutoffDay.getUTCDate() - APPROVAL_EXPIRY_DAYS);

    return startOfDay(cutoffDay.toISOString().split('T')[0])!;
  }

  private async expireType(
    type: ExpirableRequestType,
    cutoff: Date,
  ): Promise<number> {
    const delegate = type.delegate(this.prisma);

    const pending = type.pendingStatus ?? EditRequestStatus.PENDING;

    const stale = await delegate.findMany({
      where: {
        status: Array.isArray(pending) ? { in: pending } : pending,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        requestedById: true,
        ...(type.orderMirrorField ? { orderId: true } : {}),
      },
    });

    if (stale.length === 0) return 0;

    const ids = stale.map((request) => request.id);
    const note = `Vencida automáticamente tras ${APPROVAL_EXPIRY_DAYS} días sin respuesta`;

    await delegate.updateMany({
      where: { id: { in: ids } },
      data: {
        status: type.expiredStatus ?? EditRequestStatus.EXPIRED,
        ...(type.closeFields ?? defaultCloseFields)(note),
      },
    });

    if (type.orderMirrorField) {
      await this.mirrorOnOrders(type.orderMirrorField, stale);
    }

    await this.notifyRequesters(type.label, stale);

    this.logger.log(`Vencidas ${stale.length} solicitud(es) de ${type.label}`);

    return stale.length;
  }

  /**
   * Deja el campo de la orden en EXPIRED. `updateStatus()` solo bloquea con
   * PENDING y REJECTED, así que esto libera la orden en vez de dejarla trabada
   * contra una solicitud que ya nadie puede aprobar.
   */
  private async mirrorOnOrders(
    field: OrderMirrorField,
    stale: { orderId?: string }[],
  ): Promise<void> {
    const orderIds = [
      ...new Set(stale.map((r) => r.orderId).filter(Boolean) as string[]),
    ];

    if (orderIds.length === 0) return;

    await this.prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { [field]: EditRequestStatus.EXPIRED },
    });
  }

  private async notifyRequesters(
    label: string,
    stale: { requestedById: string }[],
  ): Promise<void> {
    for (const request of stale) {
      try {
        await this.notificationsService.create({
          userId: request.requestedById,
          type: NotificationType.APPROVAL_REQUEST_EXPIRED,
          title: 'Solicitud vencida sin respuesta',
          message: `Tu solicitud de ${label} venció tras ${APPROVAL_EXPIRY_DAYS} días sin respuesta. Si todavía la necesitas, vuelve a crearla.`,
        });
      } catch (error: any) {
        // La notificación es informativa: si falla, la solicitud ya quedó vencida.
        this.logger.error(
          `No se pudo notificar al usuario ${request.requestedById}: ${error.message}`,
        );
      }
    }
  }
}
