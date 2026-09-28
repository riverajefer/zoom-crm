import { Test, TestingModule } from '@nestjs/testing';
import { InventoryRepository } from './inventory.repository';
import { PrismaService } from '../../database/prisma.service';
import { FilterInventoryMovementsDto } from './dto';

describe('InventoryRepository', () => {
  let repository: InventoryRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrisma = {
    inventoryMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    supply: {
      findMany: jest.fn(),
      fields: { minimumStock: 'mock-field' },
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<InventoryRepository>(InventoryRepository);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create an inventory movement', async () => {
      mockPrisma.inventoryMovement.create.mockResolvedValue({ id: 'mov-1' });
      const data = { supplyId: 's1', quantity: 10, type: 'ENTRY' } as any;

      const result = await repository.create(data);
      
      expect(result).toEqual({ id: 'mov-1' });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        // Solo Zoom: sin sede activa (test unitario) la sede queda vacía.
        expect.objectContaining({ data: { locationId: null, ...data } })
      );
    });

    it('should use transaction client if provided', async () => {
      const tx = {
        inventoryMovement: {
          create: jest.fn().mockResolvedValue({ id: 'tx-mov' }),
        },
      } as any;
      const data = { supplyId: 's1', quantity: 5, type: 'ENTRY' } as any;

      const result = await repository.create(data, tx);
      
      expect(result).toEqual({ id: 'tx-mov' });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        // Solo Zoom: sin sede activa (test unitario) la sede queda vacía.
        expect.objectContaining({ data: { locationId: null, ...data } })
      );
    });
  });

  describe('findAll', () => {
    it('should query movements with filters', async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([{ id: 'm1' }]);
      mockPrisma.inventoryMovement.count.mockResolvedValue(1);

      const filters: FilterInventoryMovementsDto = {
        supplyId: 's1',
        type: 'ENTRY',
        referenceType: 'MANUAL',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        page: 1,
        limit: 10,
      };

      const result = await repository.findAll(filters);

      expect(result.data).toEqual([{ id: 'm1' }]);
      expect(result.meta.total).toBe(1);
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalled();
      expect(prisma.inventoryMovement.count).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find movement by id', async () => {
      mockPrisma.inventoryMovement.findUnique.mockResolvedValue({ id: 'm1' });
      const res = await repository.findById('m1');
      expect(res).toEqual({ id: 'm1' });
      expect(prisma.inventoryMovement.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1' } })
      );
    });
  });

  describe('findBySupplyId', () => {
    it('should find movements by supply id', async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([{ id: 'm1' }]);
      const res = await repository.findBySupplyId('s1', 10);
      expect(res).toEqual([{ id: 'm1' }]);
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplyId: 's1' }, take: 10 })
      );
    });
  });

  describe('getLowStockSupplies', () => {
    it('should find low stock supplies', async () => {
      mockPrisma.supply.findMany.mockResolvedValue([{ id: 's1' }]);
      const res = await repository.getLowStockSupplies();
      expect(res).toEqual([{ id: 's1' }]);
      expect(prisma.supply.findMany).toHaveBeenCalled();
    });
  });

  describe('getLowStockSuppliesRaw', () => {
    it('should use raw query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 's1', current_stock: 5 }]);
      const res = await repository.getLowStockSuppliesRaw();
      expect(res).toEqual([{ id: 's1', current_stock: 5 }]);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('getInventoryValuation', () => {
    it('should use raw query to value inventory', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ supply_id: 's1', total_value: 100 }]);
      const res = await repository.getInventoryValuation();
      expect(res).toEqual([{ supply_id: 's1', total_value: 100 }]);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    // El precio es por unidad de compra y el stock por unidad de consumo:
    // multiplicarlos directo inflaba el valor por el factor de conversión.
    it('pasa el stock a unidades de compra antes de multiplicar por el precio', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repository.getInventoryValuation();

      const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[])
        .join('')
        .replace(/\s+/g, ' ');
      expect(sql).toContain(
        's.current_stock / NULLIF(s.conversion_factor, 0) * s.purchase_price',
      );
      expect(sql).not.toContain('s.current_stock * s.purchase_price');
    });
  });
});
