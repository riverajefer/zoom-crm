import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DtfStatus, PaymentMethod, Prisma } from '../../generated/prisma';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';

const selectFields = {
  id: true,
  consecutive: true,
  quantity: true,
  unitPrice: true,
  value: true,
  abono: true,
  abonoPaymentMethod: true,
  abonoBankEntity: true,
  abonoNotes: true,
  applyIva: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true, basePrice: true, priceUnit: true } },
  client: {
    select: {
      id: true,
      name: true,
      phone: true,
      landlinePhone: true,
      email: true,
      address: true,
      nit: true,
      personType: true,
      city: { select: { name: true } },
    },
  },
  order: { select: { id: true, orderNumber: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export interface DtfFilters {
  status?: DtfStatus;
  productId?: string;
  clientId?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class DtfRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithFilters(filters: DtfFilters) {
    const {
      status,
      productId,
      clientId,
      createdAtFrom,
      createdAtTo,
      page = 1,
      limit = 50,
    } = filters;
    const take = clampPageSize(limit, 50, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: Prisma.DtfRecordWhereInput = {
      ...(status && { status }),
      ...(productId && { productId }),
      ...(clientId && { clientId }),
      ...((createdAtFrom || createdAtTo) && {
        createdAt: {
          ...(createdAtFrom && { gte: createdAtFrom }),
          ...(createdAtTo && { lte: createdAtTo }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.dtfRecord.findMany({
        where,
        select: selectFields,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.dtfRecord.count({ where }),
    ]);

    return { data, total, page, limit: take };
  }

  async findById(id: string) {
    return this.prisma.dtfRecord.findUnique({
      where: { id },
      select: selectFields,
    });
  }

  async create(data: {
    consecutive: string;
    /** Sede de la DTF (docs/PLAN_SEDES.md §2). */
    locationId: string;
    productId: string;
    clientId: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    value: Prisma.Decimal;
    abono?: Prisma.Decimal;
    abonoPaymentMethod?: PaymentMethod | null;
    abonoBankEntity?: string | null;
    abonoNotes?: string | null;
    applyIva?: boolean;
    createdById: string;
    notes?: string;
  }) {
    return this.prisma.dtfRecord.create({
      data,
      select: selectFields,
    });
  }

  async update(id: string, data: {
    clientId?: string;
    quantity?: Prisma.Decimal;
    unitPrice?: Prisma.Decimal;
    value?: Prisma.Decimal;
    abono?: Prisma.Decimal;
    abonoPaymentMethod?: PaymentMethod | null;
    abonoBankEntity?: string | null;
    abonoNotes?: string | null;
    applyIva?: boolean;
    notes?: string;
  }) {
    return this.prisma.dtfRecord.update({
      where: { id },
      data,
      select: selectFields,
    });
  }

  async updateStatus(id: string, status: DtfStatus, orderId?: string) {
    return this.prisma.dtfRecord.update({
      where: { id },
      data: { status, ...(orderId && { orderId }) },
      select: selectFields,
    });
  }

  async findByIdRaw(id: string) {
    return this.prisma.dtfRecord.findUnique({ where: { id } });
  }

  async createStatusHistory(data: {
    dtfId: string;
    fromStatus: DtfStatus | null;
    toStatus: DtfStatus;
    changedById: string;
    changedAt?: Date;
  }) {
    await this.prisma.dtfStatusHistory.create({ data });
  }

  async getStatusHistory(dtfId: string) {
    return this.prisma.dtfStatusHistory.findMany({
      where: { dtfId },
      orderBy: { changedAt: 'asc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        changedAt: true,
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
