import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateSupplyDto, UpdateSupplyDto } from './dto';
import { SuppliesRepository } from './supplies.repository';
import { PrismaService } from '../../../database/prisma.service';
import { InventoryMovementType, Prisma } from '../../../generated/prisma';
import { getRequestLocation } from '../../../common/utils/location-context';

@Injectable()
export class SuppliesService {
  constructor(
    private readonly suppliesRepository: SuppliesRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtiene todos los insumos
   */
  async findAll(includeInactive = false, categoryId?: string) {
    return this.suppliesRepository.findAll(includeInactive, categoryId);
  }

  /**
   * Obtiene un insumo por ID
   */
  async findOne(id: string) {
    const supply = await this.suppliesRepository.findById(id);

    if (!supply) {
      throw new NotFoundException(`Insumo con ID ${id} no encontrado`);
    }

    return supply;
  }

  /**
   * Obtiene insumos con stock bajo
   */
  async findLowStock() {
    return this.suppliesRepository.findLowStock();
  }

  /**
   * Crea un nuevo insumo
   */
  async create(createSupplyDto: CreateSupplyDto, createdById: string) {
    // Verificar SKU único si se proporciona
    if (createSupplyDto.sku) {
      const existingSku = await this.suppliesRepository.findBySku(
        createSupplyDto.sku,
      );

      if (existingSku) {
        throw new BadRequestException(
          `Ya existe un insumo con el SKU "${createSupplyDto.sku}"`,
        );
      }
    }

    // Verificar nombre único dentro de la categoría
    const existingNameInCategory =
      await this.suppliesRepository.findByNameAndCategory(
        createSupplyDto.name,
        createSupplyDto.categoryId,
      );

    if (existingNameInCategory) {
      throw new BadRequestException(
        `Ya existe un insumo con el nombre "${createSupplyDto.name}" en esta categoría`,
      );
    }

    // Convertir campos numéricos a Decimal
    const purchasePriceDecimal = createSupplyDto.purchasePrice
      ? new Prisma.Decimal(createSupplyDto.purchasePrice)
      : null;

    const conversionFactorDecimal = createSupplyDto.conversionFactor
      ? new Prisma.Decimal(createSupplyDto.conversionFactor)
      : new Prisma.Decimal(1);

    const currentStockDecimal = createSupplyDto.currentStock
      ? new Prisma.Decimal(createSupplyDto.currentStock)
      : new Prisma.Decimal(0);

    const minimumStockDecimal = createSupplyDto.minimumStock
      ? new Prisma.Decimal(createSupplyDto.minimumStock)
      : new Prisma.Decimal(0);

    // El insumo y su carga inicial nacen juntos. Antes el stock inicial se
    // escribía directo y no dejaba rastro en el kardex: el insumo aparecía con
    // saldo y cero movimientos que lo explicaran.
    return this.prisma.$transaction(async (tx) => {
      const supply = await this.suppliesRepository.create(
        {
          name: createSupplyDto.name,
          sku: createSupplyDto.sku,
          description: createSupplyDto.description,
          purchasePrice: purchasePriceDecimal,
          conversionFactor: conversionFactorDecimal,
          currentStock: currentStockDecimal,
          minimumStock: minimumStockDecimal,
          category: {
            connect: { id: createSupplyDto.categoryId },
          },
          purchaseUnit: {
            connect: { id: createSupplyDto.purchaseUnitId },
          },
          consumptionUnit: {
            connect: { id: createSupplyDto.consumptionUnitId },
          },
        },
        tx,
      );

      if (currentStockDecimal.greaterThan(0)) {
        await tx.inventoryMovement.create({
          data: {
            supplyId: supply.id,
            type: InventoryMovementType.INITIAL,
            quantity: currentStockDecimal,
            unitCost: purchasePriceDecimal ?? undefined,
            previousStock: new Prisma.Decimal(0),
            newStock: currentStockDecimal,
            referenceType: 'MANUAL',
            reason: 'Carga inicial al crear el insumo',
            performedById: createdById,
            locationId: getRequestLocation()?.locationId ?? null,
          },
        });
      }

      return supply;
    });
  }

  /**
   * Actualiza un insumo
   */
  async update(id: string, updateSupplyDto: UpdateSupplyDto) {
    // Verificar que existe
    await this.findOne(id);

    // Si se actualiza el SKU, verificar que no exista
    if (updateSupplyDto.sku) {
      const existingSku = await this.suppliesRepository.findBySkuExcludingId(
        updateSupplyDto.sku,
        id,
      );

      if (existingSku) {
        throw new BadRequestException(
          `Ya existe un insumo con el SKU "${updateSupplyDto.sku}"`,
        );
      }
    }

    // Si se actualiza el nombre y/o categoría, verificar unicidad
    if (updateSupplyDto.name || updateSupplyDto.categoryId) {
      const currentSupply = await this.suppliesRepository.findById(id);
      if (!currentSupply) {
        throw new NotFoundException(`Insumo con ID ${id} no encontrado`);
      }

      const nameToCheck = updateSupplyDto.name || currentSupply.name;
      const categoryToCheck =
        updateSupplyDto.categoryId || currentSupply.categoryId;

      const existingNameInCategory =
        await this.suppliesRepository.findByNameAndCategoryExcludingId(
          nameToCheck,
          categoryToCheck,
          id,
        );

      if (existingNameInCategory) {
        throw new BadRequestException(
          `Ya existe un insumo con el nombre "${nameToCheck}" en esta categoría`,
        );
      }
    }

    // Preparar datos para actualización
    const updateData: any = {
      ...(updateSupplyDto.name && { name: updateSupplyDto.name }),
      ...(updateSupplyDto.sku !== undefined && { sku: updateSupplyDto.sku }),
      ...(updateSupplyDto.description !== undefined && {
        description: updateSupplyDto.description,
      }),
      ...(updateSupplyDto.purchasePrice !== undefined && {
        purchasePrice: updateSupplyDto.purchasePrice
          ? new Prisma.Decimal(updateSupplyDto.purchasePrice)
          : null,
      }),
      ...(updateSupplyDto.conversionFactor !== undefined && {
        conversionFactor: new Prisma.Decimal(updateSupplyDto.conversionFactor),
      }),
      ...(updateSupplyDto.minimumStock !== undefined && {
        minimumStock: new Prisma.Decimal(updateSupplyDto.minimumStock),
      }),
      ...(updateSupplyDto.categoryId && {
        category: { connect: { id: updateSupplyDto.categoryId } },
      }),
      ...(updateSupplyDto.purchaseUnitId && {
        purchaseUnit: { connect: { id: updateSupplyDto.purchaseUnitId } },
      }),
      ...(updateSupplyDto.consumptionUnitId && {
        consumptionUnit: { connect: { id: updateSupplyDto.consumptionUnitId } },
      }),
    };

    return this.suppliesRepository.update(id, updateData);
  }

  /**
   * Soft delete de un insumo
   */
  async remove(id: string) {
    // Verificar que existe
    await this.findOne(id);

    // TODO: En el futuro, verificar que no esté siendo usado en otros módulos
    // (órdenes de trabajo, producción, etc.)

    // Soft delete
    await this.suppliesRepository.update(id, { isActive: false });

    return {
      message: `Insumo con ID ${id} eliminado correctamente`,
    };
  }
}
