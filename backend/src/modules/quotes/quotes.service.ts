import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { QuotesRepository } from './quotes.repository';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  findForView,
  lookupInOtherLocations,
  LOOKUP_MIN_QUERY_LENGTH,
} from '../../common/utils/location-consulta';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';
import { StorageService } from '../storage/storage.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  FilterQuotesDto,
  AddQuoteItemDto,
  UpdateQuoteItemDto,
} from './dto';
import { QuoteStatus, OrderStatus, ProspectStatus, Prisma } from '../../generated/prisma';
import { isValidQuoteTransition, getValidNextQuoteStatuses } from './quote-status-transitions';
import { PrismaService } from '../../database/prisma.service';
import { startOfDay, endOfDay } from '../../common/utils/date-range.util';
import { requireStoreLocationId } from '../../common/utils/location-context';

@Injectable()
export class QuotesService {
  constructor(
    private readonly quotesRepository: QuotesRepository,
    private readonly consecutivesService: ConsecutivesService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Listado de cotizaciones, acotado al asesor cuando corresponde.
   *
   * El alcance NO puede decidirse en el cliente. Antes, el tablero kanban
   * inyectaba `createdById` cuando el usuario no tenía `read_all_quotes`, pero
   * `createdById` es un filtro más de la query: bastaba quitarlo de la petición
   * para ver las cotizaciones de todos. Ahora el alcance se deriva del usuario
   * del token y pisa lo que venga del cliente.
   */
  async findAll(filters: FilterQuotesDto, userId: string) {
    const puedeVerTodas = await this.userHasPermission(userId, 'read_all_quotes');

    return this.quotesRepository.findAll({
      ...filters,
      // Sin `read_all_quotes` solo se ven las propias, venga lo que venga en la
      // query. Con el permiso, `createdById` sigue sirviendo como filtro.
      createdById: puedeVerTodas ? filters.createdById : userId,
      // `new Date('2026-09-06')` es medianoche UTC, que en Colombia es el 5 a
      // las 7 p. m. Usado como `lte` dejaba fuera el día entero que el usuario
      // había elegido: filtrar «del 24 al 24 de julio» devolvía 0 de las 10
      // cotizaciones de ese día. `startOfDay`/`endOfDay` expanden el día
      // completo en hora Colombia, igual que órdenes, OG, OT y clientes.
      dateFrom: startOfDay(filters.dateFrom),
      dateTo: endOfDay(filters.dateTo),
    });
  }

  /** ¿El usuario tiene este permiso? Mismo patrón que el resto de servicios. */
  private async userHasPermission(
    userId: string,
    permission: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    return (
      user?.role?.permissions?.some(
        (rp) => rp.permission.name === permission,
      ) ?? false
    );
  }

  async findOne(id: string) {
    const quote = await this.quotesRepository.findById(id);
    if (!quote) {
      throw new NotFoundException(`Quote with ID ${id} not found`);
    }
    return quote;
  }

  /** Detalle para la pantalla, con modo consulta para otra sede. Ver `OrdersService.findOneForView`. */
  async findOneForView(id: string) {
    const quote = await findForView(this.prisma, 'Quote', () => this.quotesRepository.findById(id));
    if (!quote) {
      throw new NotFoundException(`Quote with ID ${id} not found`);
    }
    return quote;
  }

  /** COT de las otras sedes que coinciden con la búsqueda. Ver `OrdersService.lookupInOtherLocations`. */
  async lookupInOtherLocations(q: string) {
    const search = q.trim();
    if (search.length < LOOKUP_MIN_QUERY_LENGTH) return [];
    const where: Prisma.QuoteWhereInput = {
      OR: [
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ],
    };
    return lookupInOtherLocations(where, {
      count: (w) =>
        this.prisma.quote.groupBy({ by: ['locationId'], where: w, _count: { _all: true } }),
      find: (w, take) =>
        this.prisma.quote.findMany({
          where: w,
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            quoteDate: true,
            total: true,
            client: { select: { id: true, name: true } },
            locationId: true,
            location: { select: LOCATION_SUMMARY_SELECT },
          },
          orderBy: { quoteDate: 'desc' },
          take,
        }),
    });
  }

  async create(createQuoteDto: CreateQuoteDto, createdById: string) {
    if (!createQuoteDto.items || createQuoteDto.items.length === 0) {
      throw new BadRequestException('Quote must have at least one item');
    }

    let subtotal = new Prisma.Decimal(0);
    const items = createQuoteDto.items.map((item, index) => {
      const itemTotal = new Prisma.Decimal(item.quantity).mul(item.unitPrice);
      subtotal = subtotal.add(itemTotal);

      const itemData: any = {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: itemTotal,
        specifications: item.specifications || undefined,
        sortOrder: index + 1,
        ...(item.productId && {
          product: { connect: { id: item.productId } },
        }),
        ...(item.sampleImageId && {
          sampleImageId: item.sampleImageId,
        }),
      };

      // Add production areas if provided
      if (item.productionAreaIds && item.productionAreaIds.length > 0) {
        itemData.productionAreas = {
          create: item.productionAreaIds.map((areaId: string) => ({
            productionArea: { connect: { id: areaId } },
          })),
        };
      }

      return itemData;
    });

    const providedTaxRate = createQuoteDto.taxRate !== undefined ? createQuoteDto.taxRate : 0.19;
    const taxRate = new Prisma.Decimal(providedTaxRate);
    const tax = subtotal.mul(taxRate);
    const total = subtotal.add(tax);

    // Generar el consecutivo y crear, con reintento ante número duplicado.
    // El contador `consecutives` puede quedar por detrás de los datos reales
    // (p. ej. tras sembrar cotizaciones), y entonces `generateNumber` devuelve
    // un número ya usado → P2002. Mismo patrón que órdenes, OT y DTF.
    // La COT nace en la sede activa (docs/PLAN_SEDES.md §2).
    const locationId = requireStoreLocationId();
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const quoteNumber = await this.consecutivesService.generateNumber('QUOTE', locationId);

      try {
        return await this.quotesRepository.create({
          quoteNumber,
          quoteDate: new Date(),
          validUntil: createQuoteDto.validUntil
            ? new Date(createQuoteDto.validUntil)
            : undefined,
          subtotal,
          taxRate,
          tax,
          total,
          notes: createQuoteDto.notes,
          location: { connect: { id: locationId } },
          client: { connect: { id: createQuoteDto.clientId } },
          createdBy: { connect: { id: createdById } },
          ...(createQuoteDto.commercialChannelId && {
            commercialChannel: {
              connect: { id: createQuoteDto.commercialChannelId },
            },
          }),
          items: {
            create: items,
          },
        });
      } catch (error: any) {
        // La única restricción única en `quotes` es `quote_number`, así que
        // basta con el código de error, igual que en órdenes y OT.
        const isUniqueViolation = error?.code === 'P2002';

        if (isUniqueViolation && attempt < MAX_RETRIES - 1) {
          // Realinea el contador con el máximo real de la tabla y reintenta.
          await this.consecutivesService.syncCounter('QUOTE', locationId);
          continue;
        }
        throw error;
      }
    }

    // Inalcanzable: el bucle retorna o lanza en el último intento.
    throw new BadRequestException(
      'No se pudo generar un número de cotización disponible',
    );
  }

  async update(id: string, updateQuoteDto: UpdateQuoteDto, userId: string) {
    const oldQuote = await this.findOne(id);

    if (oldQuote.status === QuoteStatus.CONVERTED) {
      throw new BadRequestException('Cannot update a converted quote');
    }

    // Validar transición de estado
    if (updateQuoteDto.status && updateQuoteDto.status !== oldQuote.status) {
      if (!isValidQuoteTransition(oldQuote.status as QuoteStatus, updateQuoteDto.status)) {
        const validNext = getValidNextQuoteStatuses(oldQuote.status as QuoteStatus);
        throw new BadRequestException(
          `Transición no permitida: ${oldQuote.status} → ${updateQuoteDto.status}. ` +
          `Transiciones válidas: ${validNext.length ? validNext.join(', ') : 'ninguna (estado terminal)'}.`,
        );
      }
    }

    const isConverting = updateQuoteDto.status === QuoteStatus.CONVERTED;
    const isRejecting =
      updateQuoteDto.status === QuoteStatus.REJECTED &&
      oldQuote.status !== QuoteStatus.REJECTED;

    if (isRejecting && !updateQuoteDto.rejectionReason?.trim()) {
      throw new BadRequestException(
        'Debe indicar el motivo del rechazo para rechazar la cotización',
      );
    }

    // El motivo se sella junto con el rechazo. Una cotización ya rechazada puede
    // corregir su motivo sin volver a cambiar de estado.
    const rejectionData =
      isRejecting
        ? {
            rejectionReason: updateQuoteDto.rejectionReason!.trim(),
            rejectedAt: new Date(),
            // Destino de una restauración autorizada (quote-restore-requests)
            rejectedFromStatus: oldQuote.status as QuoteStatus,
          }
        : oldQuote.status === QuoteStatus.REJECTED &&
            updateQuoteDto.rejectionReason !== undefined
          ? { rejectionReason: updateQuoteDto.rejectionReason.trim() }
          : {};

    if (updateQuoteDto.items) {
      await this.prisma.$transaction(async (tx) => {
        // Handle basic fields
        await tx.quote.update({
          where: { id },
          data: {
            ...(updateQuoteDto.clientId && { client: { connect: { id: updateQuoteDto.clientId } } }),
            ...(updateQuoteDto.validUntil && { validUntil: new Date(updateQuoteDto.validUntil) }),
            ...(updateQuoteDto.notes !== undefined && { notes: updateQuoteDto.notes }),
            ...(updateQuoteDto.status && !isConverting && { status: updateQuoteDto.status }),
            ...rejectionData,
            ...(updateQuoteDto.commercialChannelId && {
              commercialChannel: { connect: { id: updateQuoteDto.commercialChannelId } },
            }),
            ...(updateQuoteDto.taxRate !== undefined && {
              taxRate: new Prisma.Decimal(updateQuoteDto.taxRate),
            }),
          },
        });

        // Reconcile items
        const currentItems = await tx.quoteItem.findMany({ where: { quoteId: id } });
        const currentIds = new Set(currentItems.map((i) => i.id));
        
        const itemsToUpdate = updateQuoteDto.items!.filter(i => i.id && currentIds.has(i.id));
        const itemsToCreate = updateQuoteDto.items!.filter(i => !i.id || !currentIds.has(i.id));
        const keepIds = new Set(itemsToUpdate.map(i => i.id!));
        
        const idsToDelete = [...currentIds].filter(dbId => !keepIds.has(dbId));
        if (idsToDelete.length > 0) {
          await tx.quoteItem.deleteMany({ where: { id: { in: idsToDelete } } });
        }

        for (const item of itemsToUpdate) {
          const itemTotal = new Prisma.Decimal(item.quantity).mul(item.unitPrice);
          
          // Delete existing production areas
          await tx.quoteItemProductionArea.deleteMany({
            where: { quoteItemId: item.id! },
          });
          
          // Update item
          await tx.quoteItem.update({
            where: { id: item.id! },
            data: {
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: itemTotal,
              specifications: item.specifications || undefined,
              ...(item.productId && { productId: item.productId }),
              ...(item.sampleImageId !== undefined && { sampleImageId: item.sampleImageId }),
            },
          });
          
          // Create new production areas
          if (item.productionAreaIds && item.productionAreaIds.length > 0) {
            await tx.quoteItemProductionArea.createMany({
              data: item.productionAreaIds.map((areaId: string) => ({
                quoteItemId: item.id!,
                productionAreaId: areaId,
              })),
            });
          }
        }

        for (let i = 0; i < itemsToCreate.length; i++) {
          const item = itemsToCreate[i];
          const itemTotal = new Prisma.Decimal(item.quantity).mul(item.unitPrice);
          
          const createdItem = await tx.quoteItem.create({
            data: {
              quoteId: id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: itemTotal,
              specifications: item.specifications || undefined,
              sortOrder: currentItems.length - idsToDelete.length + i + 1,
              ...(item.productId && { productId: item.productId }),
              ...(item.sampleImageId && { sampleImageId: item.sampleImageId }),
            },
          });
          
          // Add production areas for new items
          if (item.productionAreaIds && item.productionAreaIds.length > 0) {
            await tx.quoteItemProductionArea.createMany({
              data: item.productionAreaIds.map((areaId: string) => ({
                quoteItemId: createdItem.id,
                productionAreaId: areaId,
              })),
            });
          }
        }

        await this.recalculateQuoteTotals(id, tx);
      });
    } else {
      await this.quotesRepository.update(id, {
        ...(updateQuoteDto.clientId && { client: { connect: { id: updateQuoteDto.clientId } } }),
        ...(updateQuoteDto.validUntil && { validUntil: new Date(updateQuoteDto.validUntil) }),
        ...(updateQuoteDto.notes !== undefined && { notes: updateQuoteDto.notes }),
        ...(updateQuoteDto.status && !isConverting && { status: updateQuoteDto.status }),
        ...rejectionData,
        ...(updateQuoteDto.commercialChannelId && {
          commercialChannel: { connect: { id: updateQuoteDto.commercialChannelId } },
        }),
        ...(updateQuoteDto.taxRate !== undefined && {
          taxRate: new Prisma.Decimal(updateQuoteDto.taxRate),
        }),
      });

      if (updateQuoteDto.taxRate !== undefined) {
        await this.recalculateQuoteTotals(id, this.prisma);
      }
    }

    if (isConverting) {
      return this.convertToOrder(id, userId);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const quote = await this.findOne(id);
    // Se borra lo que nunca llegó a ser una venta. Una cotización aceptada o
    // convertida ya tiene una orden detrás y no se puede borrar.
    const deletableStatuses: QuoteStatus[] = [
      QuoteStatus.DRAFT,
      QuoteStatus.SENT,
      QuoteStatus.FOLLOW_UP_1,
      QuoteStatus.FOLLOW_UP_2,
      QuoteStatus.FOLLOW_UP_3,
      QuoteStatus.NO_RESPONSE,
      QuoteStatus.REJECTED,
    ];
    if (!deletableStatuses.includes(quote.status as QuoteStatus)) {
      throw new BadRequestException('Only draft, sent, in follow-up, no response or rejected quotes can be deleted');
    }
    await this.quotesRepository.delete(id);
    return { message: 'Quote deleted successfully' };
  }

  async convertToOrder(id: string, userId: string) {
    const quote = await this.findOne(id);

    if (quote.status === QuoteStatus.CONVERTED) {
      throw new BadRequestException('Quote already converted to an order');
    }

    // Start transaction to create order and link to quote
    return this.prisma.$transaction(async (tx) => {
      // 1. Generate order number. La OP hereda la sede de la COT (§2).
      const orderNumber = await this.consecutivesService.generateNumber('ORDER', quote.locationId);

      // 2. Create Order based on Quote
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          locationId: quote.locationId,
          clientId: quote.clientId,
          orderDate: new Date(),
          subtotal: quote.subtotal,
          taxRate: quote.taxRate,
          tax: quote.tax,
          total: quote.total,
          paidAmount: 0,
          balance: quote.total,
          status: OrderStatus.DRAFT,
          notes: `${quote.notes || ''}\nRef: ${quote.quoteNumber}`,
          createdById: userId,
          commercialChannelId: quote.commercialChannelId,
          quote: { connect: { id: quote.id } }, // Link the quote
          items: {
            create: quote.items.map((item: any) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              specifications: item.specifications || undefined,
              sampleImageId: item.sampleImageId || undefined,
              sortOrder: item.sortOrder,
              productId: item.productId,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // 2.5 Copy production areas from quote items to order items
      const productionAreaInserts: { orderItemId: string; productionAreaId: string }[] = [];
      for (const quoteItem of quote.items as any[]) {
        if (quoteItem.productionAreas?.length > 0) {
          // Match order item by sortOrder (same mapping order)
          const orderItem = newOrder.items.find(
            (oi) => oi.sortOrder === quoteItem.sortOrder,
          );
          if (orderItem) {
            for (const pa of quoteItem.productionAreas) {
              productionAreaInserts.push({
                orderItemId: orderItem.id,
                productionAreaId: pa.productionArea.id,
              });
            }
          }
        }
      }

      if (productionAreaInserts.length > 0) {
        await tx.orderItemProductionArea.createMany({
          data: productionAreaInserts,
        });
      }

      // 3. Update Quote status
      await tx.quote.update({
        where: { id: quote.id },
        data: {
          status: QuoteStatus.CONVERTED,
          orderId: newOrder.id
        },
      });

      // 4. Cerrar el ciclo del Pipeline de Ventas: si esta cotización nació de
      // un prospecto, ese prospecto acaba de convertirse en venta. Sin esto se
      // quedaría en "Cotizado" y el tablero contradiría a la orden ya creada.
      await tx.prospect.updateMany({
        where: { quoteId: quote.id },
        data: { orderId: newOrder.id, status: ProspectStatus.CONVERTIDO },
      });

      return newOrder;
    });
  }

  async uploadItemSampleImage(
    quoteId: string,
    itemId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    // Verify quote exists
    const quote = await this.findOne(quoteId);

    // Verify item belongs to this quote
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quoteId: quoteId,
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Quote item with ID ${itemId} not found in quote ${quoteId}`,
      );
    }

    // If item already has a sample image, delete it first
    if (item.sampleImageId) {
      try {
        await this.storageService.deleteFile(item.sampleImageId);
      } catch (error) {
        // Log error but continue - file might already be deleted
        console.error(
          `Failed to delete existing sample image ${item.sampleImageId}:`,
          error,
        );
      }
    }

    // Upload new image
    const uploadedFile = await this.storageService.uploadFile(file, {
      entityType: 'quote-item',
      entityId: itemId,
      userId,
    });

    // Update quote item with new image ID
    await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: { sampleImageId: uploadedFile.id },
    });

    return uploadedFile;
  }

  async deleteItemSampleImage(quoteId: string, itemId: string) {
    // Verify quote exists
    const quote = await this.findOne(quoteId);

    // Verify item belongs to this quote
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quoteId: quoteId,
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Quote item with ID ${itemId} not found in quote ${quoteId}`,
      );
    }

    if (!item.sampleImageId) {
      throw new BadRequestException(
        `Quote item ${itemId} does not have a sample image`,
      );
    }

    // Delete file from storage
    await this.storageService.deleteFile(item.sampleImageId);

    // Remove reference from quote item
    await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: { sampleImageId: null },
    });

    return { message: 'Sample image deleted successfully' };
  }

  private async recalculateQuoteTotals(id: string, tx: Prisma.TransactionClient) {
    const items = await tx.quoteItem.findMany({ where: { quoteId: id } });
    
    let subtotal = new Prisma.Decimal(0);
    for (const item of items) {
      subtotal = subtotal.add(item.total);
    }

    const quote = await tx.quote.findUnique({
      where: { id },
      select: { taxRate: true },
    });

    const taxRate = quote?.taxRate || new Prisma.Decimal(0.19);
    const tax = subtotal.mul(taxRate);
    const total = subtotal.add(tax);

    return tx.quote.update({
      where: { id },
      data: { subtotal, tax, total },
      include: {
        items: { include: { product: true } },
        client: true,
      },
    });
  }
}
