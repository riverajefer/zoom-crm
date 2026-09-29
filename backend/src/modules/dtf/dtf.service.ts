import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DtfRepository } from './dtf.repository';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { StorageService } from '../storage/storage.service';
import { OrdersService } from '../orders/orders.service';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { CreateDtfRecordDto, BulkCreateDtfDto } from './dto/create-dtf-record.dto';
import { UpdateDtfRecordDto } from './dto/update-dtf-record.dto';
import { ChangeDtfStatusDto } from './dto/change-dtf-status.dto';
import { FilterDtfDto } from './dto/filter-dtf.dto';
import { DtfStatus, PaymentMethod, Prisma } from '../../generated/prisma';
import { isValidDtfTransition } from './dtf-status-transitions';
import { startOfDay, endOfDay } from '../../common/utils/date-range.util';
import { computeDtfTotalToCharge } from '../../common/utils/rounding.util';
import { requireStoreLocationId } from '../../common/utils/location-context';

@Injectable()
export class DtfService {
  constructor(
    private readonly dtfRepository: DtfRepository,
    private readonly prisma: PrismaService,
    private readonly consecutivesService: ConsecutivesService,
    private readonly storageService: StorageService,
    private readonly ordersService: OrdersService,
    private readonly creditBalanceService: CreditBalanceService,
  ) {}

  async findAll(filters: FilterDtfDto) {
    const { createdAtFrom, createdAtTo, ...rest } = filters;
    return this.dtfRepository.findAllWithFilters({
      ...rest,
      createdAtFrom: startOfDay(createdAtFrom),
      createdAtTo: endOfDay(createdAtTo),
    });
  }

  async findOne(id: string) {
    const record = await this.dtfRepository.findById(id);
    if (!record) {
      throw new NotFoundException(`Registro DTF con id ${id} no encontrado`);
    }
    return record;
  }

  async bulkCreate(dto: BulkCreateDtfDto, userId: string) {
    const created = await Promise.all(
      dto.items.map((item) => this.createOne(item, userId)),
    );
    return created;
  }

  private async createOne(dto: CreateDtfRecordDto, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException(`Producto con id ${dto.productId} no encontrado`);
    }

    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con id ${dto.clientId} no encontrado`);
    }

    const consecutiveType = this.getConsecutiveType(product.name);

    const unitPrice = dto.unitPrice != null
      ? new Prisma.Decimal(dto.unitPrice)
      : (product.basePrice ?? new Prisma.Decimal(0));
    const quantity = new Prisma.Decimal(dto.quantity);
    // Price is per 100 cm (per meter), so value = unitPrice × quantity / 100
    const value = unitPrice.mul(quantity).div(100);

    await this.assertCreditBalanceAbonoIsValid({
      clientId: dto.clientId,
      abono: dto.abono,
      abonoPaymentMethod: dto.abonoPaymentMethod,
      value,
      applyIva: dto.applyIva ?? false,
    });

    // La DTF nace en la sede activa (docs/PLAN_SEDES.md §2).
    const locationId = requireStoreLocationId();
    const buildData = (consecutive: string) => ({
      consecutive,
      locationId,
      productId: dto.productId,
      clientId: dto.clientId,
      quantity,
      unitPrice,
      value,
      abono: dto.abono != null ? new Prisma.Decimal(dto.abono) : undefined,
      abonoPaymentMethod: dto.abonoPaymentMethod ?? null,
      abonoBankEntity: dto.abonoBankEntity ?? null,
      abonoNotes: dto.abonoNotes ?? null,
      applyIva: dto.applyIva ?? false,
      createdById: userId,
      notes: dto.notes,
    });

    try {
      const consecutive = await this.consecutivesService.generateNumber(consecutiveType, locationId);
      return await this.dtfRepository.create(buildData(consecutive));
    } catch (error) {
      // El contador de consecutivos quedó desincronizado con los registros reales
      // (p.ej. datos sembrados). Re-sincroniza desde la tabla y reintenta una vez.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.consecutivesService.syncCounter(consecutiveType, locationId);
        const consecutive = await this.consecutivesService.generateNumber(consecutiveType, locationId);
        return await this.dtfRepository.create(buildData(consecutive));
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDtfRecordDto) {
    const record = await this.dtfRepository.findByIdRaw(id);
    if (!record) throw new NotFoundException(`Registro DTF con id ${id} no encontrado`);

    const editableStatuses: DtfStatus[] = [DtfStatus.BORRADOR, DtfStatus.ENVIADA];
    if (!editableStatuses.includes(record.status)) {
      throw new ForbiddenException('Solo se pueden editar registros en estado BORRADOR o ENVIADA');
    }

    const updates: Parameters<DtfRepository['update']>[1] = {};

    if (dto.clientId !== undefined) updates.clientId = dto.clientId;
    if (dto.notes !== undefined) updates.notes = dto.notes;
    if (dto.abono !== undefined) updates.abono = new Prisma.Decimal(dto.abono);
    if (dto.abonoPaymentMethod !== undefined) updates.abonoPaymentMethod = dto.abonoPaymentMethod ?? null;
    if (dto.abonoBankEntity !== undefined) updates.abonoBankEntity = dto.abonoBankEntity ?? null;
    if (dto.abonoNotes !== undefined) updates.abonoNotes = dto.abonoNotes ?? null;
    if (dto.applyIva !== undefined) updates.applyIva = dto.applyIva;

    if (dto.unitPrice !== undefined) {
      updates.unitPrice = new Prisma.Decimal(dto.unitPrice);
    }

    if (dto.quantity !== undefined || dto.unitPrice !== undefined) {
      const qty = dto.quantity !== undefined
        ? new Prisma.Decimal(dto.quantity)
        : record.quantity;
      const price = updates.unitPrice ?? record.unitPrice;
      updates.quantity = qty;
      updates.value = price.mul(qty).div(100);
    }

    // El abono con saldo a favor se valida contra los valores que quedarán
    // guardados: en la misma edición pueden cambiar el cliente, la cantidad, el
    // precio o el IVA.
    await this.assertCreditBalanceAbonoIsValid({
      clientId: updates.clientId ?? record.clientId,
      abono: updates.abono ?? record.abono,
      abonoPaymentMethod: updates.abonoPaymentMethod ?? record.abonoPaymentMethod,
      value: updates.value ?? record.value,
      applyIva: updates.applyIva ?? record.applyIva,
    });

    return this.dtfRepository.update(id, updates);
  }

  /**
   * El abono puede pagarse con el saldo a favor que el cliente dejó en otras OPs
   * sobrepagadas. Ese saldo no se consume aquí sino al convertir en OP (el abono
   * viaja como pago `CREDIT_BALANCE` y `ordersService.create` lo aplica FIFO),
   * así que se valida ahora para no guardar una DTF que después no se pueda
   * convertir.
   *
   * A diferencia del abono en dinero, este no puede superar el total a cobrar:
   * mover saldo a favor de una OP a otra no le devuelve nada al cliente, solo
   * bloquea plata suya en una orden que no la necesita.
   */
  private async assertCreditBalanceAbonoIsValid(params: {
    clientId: string;
    abono: Prisma.Decimal | number | string | null | undefined;
    abonoPaymentMethod: PaymentMethod | null | undefined;
    value: Prisma.Decimal | number | string;
    applyIva: boolean;
  }) {
    if (params.abonoPaymentMethod !== PaymentMethod.CREDIT_BALANCE) return;
    if (params.abono == null) return;

    const abono = new Prisma.Decimal(params.abono);
    if (abono.lessThanOrEqualTo(0)) return;

    const totalToCharge = computeDtfTotalToCharge(params.value, params.applyIva);
    if (abono.gt(totalToCharge)) {
      throw new BadRequestException(
        `El abono con saldo a favor (${abono.toFixed(0)}) no puede superar el total a cobrar (${totalToCharge.toFixed(0)}).`,
      );
    }

    await this.creditBalanceService.assertEnoughCredit(params.clientId, abono);
  }

  async changeStatus(id: string, dto: ChangeDtfStatusDto, changedById: string) {
    const record = await this.dtfRepository.findByIdRaw(id);
    if (!record) throw new NotFoundException(`Registro DTF con id ${id} no encontrado`);

    if (!isValidDtfTransition(record.status, dto.status)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${record.status} → ${dto.status}`,
      );
    }

    const result = await this.dtfRepository.updateStatus(id, dto.status);
    await this.dtfRepository.createStatusHistory({
      dtfId: id,
      fromStatus: record.status,
      toStatus: dto.status,
      changedById,
    });
    return result;
  }

  async getStatusHistory(id: string) {
    const record = await this.dtfRepository.findByIdRaw(id);
    if (!record) throw new NotFoundException(`Registro DTF con id ${id} no encontrado`);
    return this.dtfRepository.getStatusHistory(id);
  }

  async convertToOrder(id: string, userId: string) {
    const record = await this.dtfRepository.findByIdRaw(id);
    if (!record) throw new NotFoundException(`Registro DTF con id ${id} no encontrado`);

    if (record.status === DtfStatus.CONVERTIDA_EN_OP) {
      throw new BadRequestException('Este registro ya fue convertido en Orden de Pedido');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: record.productId },
    });

    // Resolve production area by product type (DTF UV vs DTF Textil)
    const productionAreaName = product?.name?.toLowerCase().includes('uv')
      ? 'DTF UV'
      : 'DTF Textil';
    const productionArea = await this.prisma.productionArea.findFirst({
      where: { name: { contains: productionAreaName, mode: 'insensitive' } },
    });

    // Fetch DTF files before creating the order
    const [dtfImages, dtfComprobantes] = await Promise.all([
      this.storageService.getFilesByEntity('DTF_IMAGE', id),
      this.storageService.getFilesByEntity('DTF_COMPROBANTE', id),
    ]);

    const dtfImage = dtfImages[0] ?? null;
    const dtfComprobante = dtfComprobantes[0] ?? null;

    // El abono del cliente viaja como pago inicial de la OP en vez de crearse
    // aparte: así `ordersService.create` le genera el movimiento de caja, ajusta
    // los totales y abre la solicitud de aprobación, todo en un solo lugar.
    // Antes se insertaba con Prisma directo "para evitar la maquinaria de
    // cash-session / receipt_number", y el resultado fue que el 90% de los
    // abonos DTF nunca llegaron al historial de caja. Esa maquinaria ya se
    // recupera sola de las colisiones de consecutivo (retry + syncCounter en
    // `create`), así que el atajo dejó de tener motivo.
    //
    // El abono puede superar el total a cobrar: igual que en el formulario de
    // OP, el excedente queda como saldo a favor del cliente (la OP nace con
    // balance negativo y ese excedente se consume en otra OP o se devuelve por
    // el flujo de RefundRequest).
    const abonoAmount = Number(record.abono);
    const hasAbono = abonoAmount > 0;

    const order = await this.ordersService.create(
      {
        clientId: record.clientId,
        notes: `[DTF] ${record.consecutive}`,
        items: [
          {
            description: `${product?.name ?? 'DTF'} - ${record.consecutive}`,
            quantity: Number(record.quantity) / 100, // DTF stores cm, OP uses meters
            unitPrice: Number(record.unitPrice),
            productId: record.productId,
            ...(productionArea && { productionAreaIds: [productionArea.id] }),
          },
        ],
        // Traslada el IVA de la DTF a la OP (19% si aplica, 0 si no)
        taxRate: record.applyIva ? 0.19 : 0,
        ...(hasAbono && {
          initialPayment: {
            amount: abonoAmount,
            paymentMethod: record.abonoPaymentMethod ?? PaymentMethod.TRANSFER,
            bankEntity: record.abonoBankEntity ?? undefined,
            reference: record.consecutive,
            notes: record.abonoNotes?.trim()
              ? record.abonoNotes
              : `Anticipo DTF ${record.consecutive}`,
          },
        }),
      },
      userId,
      // La OP hereda la sede de la DTF (docs/PLAN_SEDES.md §2).
      record.locationId,
    );

    // Transfer reference image → order item sampleImageId
    if (dtfImage && order?.items?.[0]) {
      const orderItem = order.items[0] as { id: string };
      await this.prisma.uploadedFile.update({
        where: { id: dtfImage.id },
        data: { entityType: 'order-item', entityId: orderItem.id },
      });
      await this.prisma.orderItem.update({
        where: { id: orderItem.id },
        data: { sampleImageId: dtfImage.id },
      });
    }

    // El pago, sus totales, el movimiento de caja y la solicitud de aprobación
    // ya los creó `ordersService.create`. Lo único que queda por hacer aquí es
    // colgar el comprobante DTF del pago, porque `InitialPaymentDto` no acepta
    // `receiptFileId` y el archivo necesita el id del pago para reasignarse.
    if (hasAbono && dtfComprobante && order?.id) {
      const payment = await this.prisma.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (payment) {
        await this.prisma.uploadedFile.update({
          where: { id: dtfComprobante.id },
          data: { entityType: 'payment', entityId: payment.id },
        });
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { receiptFileId: dtfComprobante.id },
        });
      }
    }

    await this.dtfRepository.updateStatus(id, DtfStatus.CONVERTIDA_EN_OP, order?.id);
    await this.dtfRepository.createStatusHistory({
      dtfId: id,
      fromStatus: record.status,
      toStatus: DtfStatus.CONVERTIDA_EN_OP,
      changedById: userId,
    });

    return order;
  }

  async uploadImage(id: string, file: Express.Multer.File, userId: string) {
    await this.findOne(id);
    return this.storageService.uploadFile(file, {
      entityType: 'DTF_IMAGE',
      entityId: id,
      userId,
    });
  }

  async uploadComprobante(id: string, file: Express.Multer.File, userId: string) {
    await this.findOne(id);
    return this.storageService.uploadFile(file, {
      entityType: 'DTF_COMPROBANTE',
      entityId: id,
      userId,
    });
  }

  async getFiles(id: string) {
    await this.findOne(id);
    const [images, comprobantes] = await Promise.all([
      this.storageService.getFilesByEntity('DTF_IMAGE', id),
      this.storageService.getFilesByEntity('DTF_COMPROBANTE', id),
    ]);
    return { images, comprobantes };
  }

  private getConsecutiveType(productName: string): 'DTF_TEXTIL' | 'DTF_UV' {
    const nameLower = productName.toLowerCase();
    if (nameLower.includes('uv')) return 'DTF_UV';
    return 'DTF_TEXTIL';
  }
}
