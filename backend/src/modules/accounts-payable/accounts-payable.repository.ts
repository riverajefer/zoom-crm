import { Injectable } from '@nestjs/common';
import { Prisma, AccountPayableStatus } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { FilterAccountPayableDto, InstallmentItemDto } from './dto';
import { clampPageSize, MAX_EXPORT_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';

@Injectable()
export class AccountsPayableRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    apNumber: true,
    locationId: true,
    location: { select: LOCATION_SUMMARY_SELECT },
    expenseType: { select: { id: true, name: true } },
    expenseSubcategory: { select: { id: true, name: true } },
    status: true,
    description: true,
    observations: true,
    subtotalAmount: true,
    totalAmount: true,
    paidAmount: true,
    balance: true,
    applyIva: true,
    ivaRate: true,
    retefuenteRate: true,
    reteICARate: true,
    reteIVARate: true,
    dueDate: true,
    isRecurring: true,
    recurringDay: true,
    recurringFrequency: true,
    createdAt: true,
    updatedAt: true,
    cancelledAt: true,
    cancelReason: true,
    supplier: {
      select: { id: true, name: true, email: true, nit: true },
    },
    expenseOrder: {
      select: {
        id: true,
        ogNumber: true,
        items: { select: { name: true }, orderBy: { sortOrder: 'asc' } },
      },
    },
    createdBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    cancelledBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    authorizedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    authorizedAt: true,
    beneficiaryUser: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    payrollPeriod: {
      select: { id: true, name: true, status: true },
    },
  } satisfies Prisma.AccountPayableSelect;

  async findAll(filters: FilterAccountPayableDto) {
    const {
      page = 1,
      limit = 20,
      status,
      expenseTypeId,
      expenseSubcategoryId,
      supplierId,
      search,
      dueDateFrom,
      dueDateTo,
      hasExpenseOrder,
      orderBy = 'createdAt',
      orderDir = 'desc',
    } = filters;

    const take = clampPageSize(limit, 20, MAX_EXPORT_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: Prisma.AccountPayableWhereInput = {
      ...(status && { status }),
      ...(expenseTypeId && { expenseTypeId }),
      ...(expenseSubcategoryId && { expenseSubcategoryId }),
      ...(supplierId && { supplierId }),
      ...(search && {
        description: { contains: search, mode: 'insensitive' },
      }),
      ...(dueDateFrom || dueDateTo
        ? {
            dueDate: {
              ...(dueDateFrom && { gte: new Date(dueDateFrom) }),
              ...(dueDateTo && { lte: new Date(dueDateTo) }),
            },
          }
        : {}),
      ...(hasExpenseOrder === true && { expenseOrderId: { not: null } }),
      ...(hasExpenseOrder === false && { expenseOrderId: null }),
    };

    const [data, total] = await Promise.all([
      this.prisma.accountPayable.findMany({
        where,
        select: this.selectFields,
        skip,
        take,
        orderBy: { [orderBy]: orderDir },
      }),
      this.prisma.accountPayable.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findById(id: string) {
    return this.prisma.accountPayable.findUnique({
      where: { id },
      select: {
        ...this.selectFields,
        expenseOrder: {
          select: {
            id: true,
            ogNumber: true,
            status: true,
            observations: true,
            areaOrMachine: true,
            createdAt: true,
            expenseType: { select: { id: true, name: true } },
            expenseSubcategory: { select: { id: true, name: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            items: {
              select: {
                id: true,
                name: true,
                description: true,
                quantity: true,
                unitPrice: true,
                total: true,
                paymentMethod: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            paymentDate: true,
            reference: true,
            notes: true,
            bankEntity: true,
            receiptFileId: true,
            receiptFileId2: true,
            cashMovementId: true,
            createdAt: true,
            isReversed: true,
            reversedAt: true,
            registeredBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { paymentDate: 'desc' },
        },
        attachments: {
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            fileType: true,
            createdAt: true,
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        installments: {
          select: {
            id: true,
            installmentNumber: true,
            amount: true,
            dueDate: true,
            isPaid: true,
            paidAt: true,
            notes: true,
            paidBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });
  }

  async findByExpenseOrderId(expenseOrderId: string) {
    return this.prisma.accountPayable.findUnique({ where: { expenseOrderId } });
  }

  async create(data: Prisma.AccountPayableCreateInput) {
    return this.prisma.accountPayable.create({
      data,
      select: this.selectFields,
    });
  }

  async update(id: string, data: Prisma.AccountPayableUpdateInput) {
    return this.prisma.accountPayable.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }

  async getPaymentHistory(accountPayableId: string) {
    return this.prisma.accountPayablePayment.findMany({
      where: { accountPayableId },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        reference: true,
        notes: true,
        bankEntity: true,
        receiptFileId: true,
        receiptFileId2: true,
        cashMovementId: true,
        createdAt: true,
        // Un pago anulado sigue en la tabla a propósito (queda el rastro de
        // quién lo registró y con qué soporte). La pantalla necesita saberlo
        // para no mostrarlo como si siguiera vivo.
        isReversed: true,
        reversedAt: true,
        registeredBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async createPayment(data: Prisma.AccountPayablePaymentCreateInput) {
    return this.prisma.accountPayablePayment.create({
      data,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        reference: true,
        notes: true,
        bankEntity: true,
        receiptFileId: true,
        receiptFileId2: true,
        cashMovementId: true,
        createdAt: true,
        // Un pago anulado sigue en la tabla a propósito (queda el rastro de
        // quién lo registró y con qué soporte). La pantalla necesita saberlo
        // para no mostrarlo como si siguiera vivo.
        isReversed: true,
        reversedAt: true,
        registeredBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async findPaymentById(paymentId: string) {
    return this.prisma.accountPayablePayment.findUnique({ where: { id: paymentId } });
  }

  async getSummary() {
    const [statusGroups, upcomingCount] = await Promise.all([
      this.prisma.accountPayable.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true, paidAmount: true, balance: true },
      }),
      this.prisma.accountPayable.count({
        where: {
          status: { in: [AccountPayableStatus.PENDING, AccountPayableStatus.PARTIAL] },
          dueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const getGroup = (s: AccountPayableStatus) => statusGroups.find((g) => g.status === s);

    const pending = getGroup(AccountPayableStatus.PENDING);
    const partial = getGroup(AccountPayableStatus.PARTIAL);
    const paid = getGroup(AccountPayableStatus.PAID);
    const overdue = getGroup(AccountPayableStatus.OVERDUE);

    return {
      totalPending: pending?._count.id ?? 0,
      totalPartial: partial?._count.id ?? 0,
      totalPaid: paid?._count.id ?? 0,
      totalOverdue: overdue?._count.id ?? 0,
      upcomingCount,
      totalAmountPending: String(
        Number(pending?._sum.balance ?? 0) + Number(partial?._sum.balance ?? 0),
      ),
      totalAmountOverdue: String(overdue?._sum.balance ?? 0),
    };
  }

  async getLastApNumber(year: number) {
    return this.prisma.accountPayable.findFirst({
      where: { apNumber: { startsWith: `CP-${year}-` } },
      orderBy: { apNumber: 'desc' },
      select: { apNumber: true },
    });
  }

  /**
   * Marca OVERDUE las CP pendientes que vencieron antes de `dueBefore`. El corte
   * lo decide el servicio: el inicio del día de hoy en hora Colombia.
   */
  async markOverdue(dueBefore: Date) {
    return this.prisma.accountPayable.updateMany({
      where: {
        status: { in: [AccountPayableStatus.PENDING, AccountPayableStatus.PARTIAL] },
        dueDate: { lt: dueBefore },
      },
      data: { status: AccountPayableStatus.OVERDUE },
    });
  }

  // ─── Attachments ─────────────────────────────────────────────────────────────

  async createAttachment(data: Prisma.AccountPayableAttachmentCreateInput) {
    return this.prisma.accountPayableAttachment.create({
      data,
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        fileType: true,
        createdAt: true,
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAttachmentById(attachmentId: string) {
    return this.prisma.accountPayableAttachment.findUnique({
      where: { id: attachmentId },
    });
  }

  async deleteAttachment(attachmentId: string) {
    return this.prisma.accountPayableAttachment.delete({ where: { id: attachmentId } });
  }

  // ─── Installments ─────────────────────────────────────────────────────────────

  async setInstallments(accountPayableId: string, items: InstallmentItemDto[], createdById: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.accountPayableInstallment.deleteMany({ where: { accountPayableId } });
      if (items.length === 0) return [];
      return tx.accountPayableInstallment.createManyAndReturn({
        data: items.map((item, i) => ({
          accountPayableId,
          installmentNumber: i + 1,
          amount: item.amount,
          dueDate: new Date(item.dueDate),
          notes: item.notes,
        })),
        select: {
          id: true,
          installmentNumber: true,
          amount: true,
          dueDate: true,
          isPaid: true,
          paidAt: true,
          notes: true,
          paidBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async findInstallments(accountPayableId: string) {
    return this.prisma.accountPayableInstallment.findMany({
      where: { accountPayableId },
      select: {
        id: true,
        installmentNumber: true,
        amount: true,
        dueDate: true,
        isPaid: true,
        paidAt: true,
        notes: true,
        paidBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { installmentNumber: 'asc' },
    });
  }

  async updateInstallment(installmentId: string, data: Prisma.AccountPayableInstallmentUpdateInput) {
    return this.prisma.accountPayableInstallment.update({
      where: { id: installmentId },
      data,
      select: {
        id: true,
        installmentNumber: true,
        amount: true,
        dueDate: true,
        isPaid: true,
        paidAt: true,
        notes: true,
        paidBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async deleteInstallment(installmentId: string) {
    return this.prisma.accountPayableInstallment.delete({ where: { id: installmentId } });
  }

  async findInstallmentById(installmentId: string) {
    return this.prisma.accountPayableInstallment.findUnique({ where: { id: installmentId } });
  }
}
