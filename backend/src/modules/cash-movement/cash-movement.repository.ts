import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';
import { FilterCashMovementsDto } from './dto';
import { clampPageSize, MAX_CASH_PAGE_SIZE } from '../../common/dto/pagination.dto';

const MOVEMENT_SELECT = {
  id: true,
  cashSessionId: true,
  receiptNumber: true,
  movementType: true,
  paymentMethod: true,
  amount: true,
  description: true,
  referenceType: true,
  referenceId: true,
  isVoided: true,
  voidedById: true,
  voidedAt: true,
  voidReason: true,
  counterMovementId: true,
  // Presente solo en un contramovimiento «-ANUL»: el frontend lo necesita para
  // dejarlo fuera de los totales (ver EXCLUDE_REVERSALS). La reversa puede caer
  // en otra sesión que la del original, así que no basta con cruzar
  // `counterMovementId` dentro de la lista.
  originalMovement: { select: { id: true, receiptNumber: true } },
  performedById: true,
  createdAt: true,
  updatedAt: true,
  performedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  voidedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  linkedPayment: {
    select: {
      id: true,
      orderId: true,
      amount: true,
      paymentMethod: true,
      advancePaymentApproval: {
        select: { id: true, status: true },
      },
    },
  },
} satisfies Prisma.CashMovementSelect;

type ExpenseOrderRef = {
  id: string;
  ogNumber: string;
  status: string;
  expenseType: { name: string };
} | null;

type OrderRef = {
  id: string;
  orderNumber: string;
  status: string;
  client: { name: string };
} | null;

type MovementBase = { referenceType: string | null; referenceId: string | null };
type EnrichedMovement<T extends MovementBase> = T & { expenseOrderRef: ExpenseOrderRef; orderRef: OrderRef };

@Injectable()
export class CashMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async enrichWithReferences<T extends MovementBase>(
    movements: T[],
  ): Promise<EnrichedMovement<T>[]> {
    // Enrich EXPENSE_ORDER references
    const ogIds = movements
      .filter((m) => m.referenceType === 'EXPENSE_ORDER' && m.referenceId)
      .map((m) => m.referenceId as string);

    const ogMap = new Map<string, NonNullable<ExpenseOrderRef>>();
    if (ogIds.length > 0) {
      const expenseOrders = await this.prisma.expenseOrder.findMany({
        where: { id: { in: ogIds } },
        select: {
          id: true,
          ogNumber: true,
          status: true,
          expenseType: { select: { name: true } },
        },
      });
      expenseOrders.forEach((og) => ogMap.set(og.id, og));
    }

    // Enrich ORDER references
    const orderIds = movements
      .filter((m) => m.referenceType === 'ORDER' && m.referenceId)
      .map((m) => m.referenceId as string);

    const orderMap = new Map<string, NonNullable<OrderRef>>();
    if (orderIds.length > 0) {
      const orders = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          client: { select: { name: true } },
        },
      });
      orders.forEach((o) => orderMap.set(o.id, o));
    }

    return movements.map((m) => ({
      ...m,
      expenseOrderRef:
        m.referenceType === 'EXPENSE_ORDER' && m.referenceId
          ? (ogMap.get(m.referenceId) ?? null)
          : null,
      orderRef:
        m.referenceType === 'ORDER' && m.referenceId
          ? (orderMap.get(m.referenceId) ?? null)
          : null,
    }));
  }

  async findById(id: string) {
    const movement = await this.prisma.cashMovement.findUnique({
      where: { id },
      select: {
        ...MOVEMENT_SELECT,
        cashSession: {
          select: { id: true, status: true, cashRegisterId: true },
        },
      },
    });

    if (!movement) return null;

    const [enriched] = await this.enrichWithReferences([movement]);
    return enriched;
  }

  async findAll(filters: FilterCashMovementsDto) {
    const {
      cashSessionId,
      movementType,
      includeVoided,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = filters;

    const where: Prisma.CashMovementWhereInput = {
      ...(cashSessionId && { cashSessionId }),
      ...(movementType && { movementType }),
      ...(!includeVoided && { isVoided: false }),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
    };

    const take = clampPageSize(limit, 50, MAX_CASH_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [raw, total] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where,
        select: MOVEMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.cashMovement.count({ where }),
    ]);

    const data = await this.enrichWithReferences(raw);

    return { data, total, page, limit };
  }

  async create(data: Prisma.CashMovementCreateInput) {
    return this.prisma.cashMovement.create({
      data,
      select: MOVEMENT_SELECT,
    });
  }

  async update(id: string, data: Prisma.CashMovementUpdateInput) {
    return this.prisma.cashMovement.update({
      where: { id },
      data,
      select: MOVEMENT_SELECT,
    });
  }
}
