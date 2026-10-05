import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  EditRequestStatus,
  PaymentAccountingStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma';
import { queueLocationFilter } from '../../common/utils/location-context';

const USER_SELECT = { id: true, firstName: true, lastName: true } as const;

const VERIFICATION_SELECT = {
  id: true,
  amount: true,
  paymentMethod: true,
  paymentDate: true,
  reference: true,
  notes: true,
  bankEntity: true,
  receiptFileId: true,
  createdAt: true,
  accountingStatus: true,
  accountingReviewedAt: true,
  accountingNotes: true,
  accountingReviewedBy: { select: USER_SELECT },
  receivedBy: { select: USER_SELECT },
  advancePaymentApproval: {
    select: { reviewedAt: true, reviewedBy: { select: USER_SELECT } },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      client: { select: { id: true, name: true } },
      location: { select: { id: true, code: true, name: true, color: true } },
    },
  },
} as const;

export interface PaymentVerificationFilters {
  status?: PaymentAccountingStatus;
  dateFrom?: Date;
  dateTo?: Date;
  paymentMethod?: PaymentMethod;
  receivedById?: string;
  locationId?: string;
  search?: string;
}

@Injectable()
export class PaymentVerificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lo que entra a la bandeja de contabilidad: abonos vivos, que movieron
   * dinero nuevo (el saldo a favor ya se revisó en la OP de origen) y que Caja
   * ya aprobó. Los pagos anteriores a las solicitudes de anticipo no tienen
   * aprobación y entran igual.
   *
   * `Payment` no tiene sede: se filtra por la de su orden, como las demás
   * bandejas (`queueLocationFilter`): quien ve todas las sedes (contabilidad,
   * admin) recibe los pagos de todas aunque tenga una activa —la suya es la
   * Matriz, que no tiene OP—, y el resto solo los de su sede.
   */
  private reviewableWhere(): Prisma.PaymentWhereInput {
    return {
      isVoided: false,
      paymentMethod: { not: PaymentMethod.CREDIT_BALANCE },
      OR: [
        { advancePaymentApproval: null },
        { advancePaymentApproval: { status: EditRequestStatus.APPROVED } },
      ],
      order: { ...queueLocationFilter() },
    };
  }

  private buildWhere(filters: PaymentVerificationFilters): Prisma.PaymentWhereInput {
    const and: Prisma.PaymentWhereInput[] = [this.reviewableWhere()];

    if (filters.status) and.push({ accountingStatus: filters.status });
    if (filters.paymentMethod) and.push({ paymentMethod: filters.paymentMethod });
    if (filters.receivedById) and.push({ receivedById: filters.receivedById });
    if (filters.locationId) and.push({ order: { locationId: filters.locationId } });
    if (filters.dateFrom || filters.dateTo) {
      and.push({
        paymentDate: {
          ...(filters.dateFrom && { gte: filters.dateFrom }),
          ...(filters.dateTo && { lte: filters.dateTo }),
        },
      });
    }
    if (filters.search) {
      const contains = { contains: filters.search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { reference: contains },
          { order: { orderNumber: contains } },
          { order: { client: { name: contains } } },
        ],
      });
    }

    return { AND: and };
  }

  async findMany(filters: PaymentVerificationFilters, page: number, limit: number) {
    const where = this.buildWhere(filters);
    const [data, total, sum] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: VERIFICATION_SELECT,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { data, total, totalAmount: sum._sum.amount };
  }

  async countByStatus() {
    return this.prisma.payment.groupBy({
      by: ['accountingStatus'],
      where: this.reviewableWhere(),
      _count: { _all: true },
      _sum: { amount: true },
    });
  }

  /** Pagos de la lista que el usuario puede revisar desde la sede en la que está. */
  async findReviewable(paymentIds: string[]) {
    return this.prisma.payment.findMany({
      where: { AND: [this.reviewableWhere(), { id: { in: paymentIds } }] },
      select: {
        id: true,
        amount: true,
        accountingStatus: true,
        receivedById: true,
        order: { select: { id: true, orderNumber: true } },
      },
    });
  }

  async setStatus(
    paymentIds: string[],
    status: PaymentAccountingStatus,
    reviewedById: string,
    notes: string | null,
  ) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.payment.updateMany({
        where: { id: { in: paymentIds } },
        data: {
          accountingStatus: status,
          accountingReviewedById: reviewedById,
          accountingReviewedAt: now,
          accountingNotes: notes,
        },
      }),
      this.prisma.paymentAccountingReview.createMany({
        data: paymentIds.map((paymentId) => ({
          paymentId,
          status,
          notes,
          reviewedById,
          createdAt: now,
        })),
      }),
    ]);
  }

  async findHistory(paymentId: string) {
    return this.prisma.paymentAccountingReview.findMany({
      where: { paymentId },
      select: {
        id: true,
        status: true,
        notes: true,
        createdAt: true,
        reviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
