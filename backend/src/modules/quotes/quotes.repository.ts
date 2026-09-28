import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, QuoteStatus } from '../../generated/prisma';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';

@Injectable()
export class QuotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    quoteNumber: true,
    locationId: true,
    location: { select: LOCATION_SUMMARY_SELECT },
    clientId: true,
    quoteDate: true,
    validUntil: true,
    subtotal: true,
    taxRate: true,
    tax: true,
    total: true,
    status: true,
    notes: true,
    rejectionReason: true,
    rejectedAt: true,
    rejectedFromStatus: true,
    createdAt: true,
    updatedAt: true,
    commercialChannelId: true,
    commercialChannel: {
      select: {
        id: true,
        name: true,
      },
    },
    client: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    },
    createdBy: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profilePhoto: true,
      },
    },
    items: {
      select: {
        id: true,
        description: true,
        quantity: true,
        unitPrice: true,
        total: true,
        specifications: true,
        sampleImageId: true,
        sortOrder: true,
        productId: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        productionAreas: {
          select: {
            productionArea: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' as const },
    },
    order: {
      select: {
        id: true,
        orderNumber: true,
        status: true,
      },
    },
  };

  async findAll(filters: {
    status?: QuoteStatus;
    clientId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
    createdById?: string;
    search?: string;
  }) {
    const { status, clientId, dateFrom, dateTo, page = 1, limit = 20, createdById, search } = filters;

    const where: Prisma.QuoteWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (createdById) {
      where.createdById = createdById;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (dateFrom || dateTo) {
      where.quoteDate = {};
      if (dateFrom) {
        where.quoteDate.gte = dateFrom;
      }
      if (dateTo) {
        where.quoteDate.lte = dateTo;
      }
    }

    if (search) {
      where.OR = [
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const take = clampPageSize(limit, 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        select: this.selectFields,
        orderBy: { quoteDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return {
      data: quotes,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findById(id: string) {
    return this.prisma.quote.findUnique({
      where: { id },
      select: this.selectFields,
    });
  }

  async findByQuoteNumber(quoteNumber: string) {
    return this.prisma.quote.findUnique({
      where: { quoteNumber },
      select: this.selectFields,
    });
  }

  async create(data: Prisma.QuoteCreateInput) {
    const quote = await this.prisma.quote.create({
      data,
      select: {
        id: true,
      },
    });

    return this.findById(quote.id);
  }

  async update(id: string, data: Prisma.QuoteUpdateInput) {
    return this.prisma.quote.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }

  async delete(id: string) {
    return this.prisma.quote.delete({
      where: { id },
    });
  }

  async updateStatus(id: string, status: QuoteStatus) {
    return this.prisma.quote.update({
      where: { id },
      data: { status },
      select: this.selectFields,
    });
  }

  // ITEM MANAGEMENT
  async findItemById(itemId: string) {
    return this.prisma.quoteItem.findUnique({
      where: { id: itemId },
    });
  }

  async deleteItem(itemId: string) {
    return this.prisma.quoteItem.delete({
      where: { id: itemId },
    });
  }
}
