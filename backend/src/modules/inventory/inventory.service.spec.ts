import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException } from '@nestjs/common';
import { InventoryMovementType, NotificationType, Prisma } from '../../generated/prisma';
import { AdjustmentDirection } from './dto';

describe('InventoryService', () => {
  let service: InventoryService;
  let repository: jest.Mocked<InventoryRepository>;
  let prisma: jest.Mocked<PrismaService>;
  let notificationsService: jest.Mocked<NotificationsService>;

  const mockRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findBySupplyId: jest.fn(),
    getLowStockSupplies: jest.fn(),
    getLowStockSuppliesRaw: jest.fn(),
    getInventoryValuation: jest.fn(),
  };

  let mockPrisma: any;

  const mockNotificationsService = {
    createBlockNotification: jest.fn(),
    notifyUsersWithPermission: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = {
      supply: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userRole: {
        findMany: jest.fn(),
      },
      inventoryMovement: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      workOrderItemSupply: {
        findMany: jest.fn(),
      },
      // Solo Zoom: el consumo guarda la sede de la OT.
      workOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ locationId: 'loc-125' }),
      },
    };
    mockPrisma.$transaction = jest.fn((callback) => callback(mockPrisma));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: InventoryRepository, useValue: mockRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    repository = module.get(InventoryRepository);
    prisma = module.get(PrismaService);
    notificationsService = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated movements', async () => {
      mockRepository.findAll.mockResolvedValue({ data: [], meta: {} as any });
      const result = await service.findAll({});
      expect(result.data).toEqual([]);
      expect(repository.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('findById', () => {
    it('should find by id', async () => {
      mockRepository.findById.mockResolvedValue({ id: '1' } as any);
      const res = await service.findById('1');
      expect(res).toEqual({ id: '1' });
    });
  });

  describe('getLowStockSupplies', () => {
    it('should return low stock supplies raw', async () => {
      mockRepository.getLowStockSuppliesRaw.mockResolvedValue([{ id: '1' }] as any);
      const res = await service.getLowStockSupplies();
      expect(res).toEqual([{ id: '1' }]);
    });
  });

  describe('getInventoryValuation', () => {
    it('should return valuation', async () => {
      mockRepository.getInventoryValuation.mockResolvedValue([{ supply_id: '1' }] as any);
      const res = await service.getInventoryValuation();
      expect(res).toEqual([{ supply_id: '1' }]);
    });
  });

  describe('createManualMovement', () => {
    it('should throw BadRequestException if type is EXIT', async () => {
      await expect(
        service.createManualMovement({ type: InventoryMovementType.EXIT } as any, 'user-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should call createMovement with manual fields', async () => {
      const dto = { type: InventoryMovementType.ENTRY, supplyId: 's1', quantity: 10 } as any;
      jest.spyOn(service, 'createMovement').mockResolvedValue({ id: 'm1' } as any);

      const res = await service.createManualMovement(dto, 'user-1');

      expect(res).toEqual({ id: 'm1' });
      expect(service.createMovement).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('createExitFromWorkOrder', () => {
    const woSupply = (overrides: any = {}) => ({
      supplyId: 's1',
      quantity: '10',
      supply: { id: 's1', name: 'S1', minimumStock: '5' },
      ...overrides,
    });

    it('should perform work order exits within a transaction', async () => {
      mockPrisma.workOrderItemSupply.findMany.mockResolvedValue([woSupply()] as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 10 } as any);

      await service.createExitFromWorkOrder('order-1', 'user-1', mockPrisma as any);

      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplyId: 's1',
            type: InventoryMovementType.EXIT,
            referenceType: 'WORK_ORDER',
            referenceId: 'order-1',
          }),
        })
      );
    });

    it('descuenta con `decrement`, no escribiendo un saldo calculado en memoria', async () => {
      mockPrisma.workOrderItemSupply.findMany.mockResolvedValue([woSupply()] as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 10 } as any);

      await service.createExitFromWorkOrder('order-1', 'user-1', mockPrisma as any);

      const data = mockPrisma.supply.update.mock.calls[0][0].data;
      expect(data.currentStock).toEqual({ decrement: expect.any(Prisma.Decimal) });
    });

    // El trabajo ya se hizo: negarlo no devuelve el material. Recortar a cero
    // dejaba `previousStock - quantity` distinto de `newStock`.
    it('permite stock negativo y deja el kardex cuadrado', async () => {
      mockPrisma.workOrderItemSupply.findMany.mockResolvedValue([woSupply()] as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: -4 } as any);

      await service.createExitFromWorkOrder('order-1', 'user-1', mockPrisma as any);

      const data = mockPrisma.inventoryMovement.create.mock.calls[0][0].data;
      expect(Number(data.newStock)).toBe(-4);
      expect(Number(data.previousStock)).toBe(6);
      expect(Number(data.previousStock) - Number(data.quantity)).toBe(
        Number(data.newStock),
      );
    });

    // Avisar desde dentro de la transacción mandaba alertas de consumos que
    // todavía podían revertirse.
    it('devuelve las alertas en vez de notificar dentro de la transacción', async () => {
      mockPrisma.workOrderItemSupply.findMany.mockResolvedValue([woSupply()] as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 2 } as any);

      const alerts = await service.createExitFromWorkOrder(
        'order-1',
        'user-1',
        mockPrisma as any,
      );

      expect(alerts).toEqual([
        { supplyId: 's1', supplyName: 'S1', currentStock: 2, minimumStock: 5 },
      ]);
      expect(mockNotificationsService.notifyUsersWithPermission).not.toHaveBeenCalled();
    });

    it('no avisa si el saldo queda por encima del mínimo', async () => {
      mockPrisma.workOrderItemSupply.findMany.mockResolvedValue([woSupply()] as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 9 } as any);

      const alerts = await service.createExitFromWorkOrder(
        'order-1',
        'user-1',
        mockPrisma as any,
      );

      expect(alerts).toEqual([]);
    });
  });

  describe('checkAndNotifyAllLowStock', () => {
    it('should query low stock, optionally send notifications, and log', async () => {
      mockRepository.getLowStockSuppliesRaw.mockResolvedValue([
        { id: '1', name: 'Supply 1', current_stock: 5, minimum_stock: 10 } as any,
      ]);
      mockNotificationsService.notifyUsersWithPermission.mockResolvedValue(1);

      const res = await service.checkAndNotifyAllLowStock();

      expect(res).toBe(1); 
      expect(mockNotificationsService.notifyUsersWithPermission).toHaveBeenCalled();
    });

    it('should do nothing if no low stock supplies exist', async () => {
      mockRepository.getLowStockSuppliesRaw.mockResolvedValue([]);
      const res = await service.checkAndNotifyAllLowStock();
      expect(res).toBe(0);
      expect(mockNotificationsService.notifyUsersWithPermission).not.toHaveBeenCalled();
    });
  });

  describe('createMovement', () => {
    it('should throw an error if supply is not found', async () => {
      mockPrisma.supply.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement({ supplyId: 'inexistent', type: InventoryMovementType.ENTRY, quantity: 10 } as any, 'user-1')
      ).rejects.toThrow('Insumo con id inexistent no encontrado');
    });

    it('should properly update inventory on ENTRY', async () => {
      const dto = { supplyId: 's1', type: InventoryMovementType.ENTRY, quantity: 5 } as any;
      mockPrisma.supply.findUnique.mockResolvedValue({
        id: 's1', name: 'S1', currentStock: 10, minimumStock: 5, purchasePrice: 50, isActive: true,
      } as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 15 } as any);
      mockRepository.create.mockResolvedValue({ id: 'm1', newStock: 15 } as any);

      const res = await service.createMovement(dto, 'user-1');

      expect(res).toEqual({ id: 'm1', newStock: 15 });
      expect(mockPrisma.supply.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currentStock: expect.any(Object) }) // Using Prisma.Decimal
      }));
      expect(mockRepository.create).toHaveBeenCalled();
    });

    // El descuento se aplica y se comprueba el saldo resultante: el throw
    // revierte la transacción. Comprobar antes, sobre una lectura previa, es lo
    // que permitía que dos movimientos simultáneos dejaran el stock negativo.
    it('should throw out of supply error if trying to EXIT above available stock', async () => {
      const dto = { supplyId: 's1', type: InventoryMovementType.EXIT, quantity: 15 } as any;
      mockPrisma.supply.findUnique.mockResolvedValue({
        id: 's1', name: 'S1', minimumStock: 5, isActive: true,
      } as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: -5 } as any);

      await expect(
        service.createMovement(dto, 'user-1')
      ).rejects.toThrow('Stock insuficiente. Stock actual: 10, cantidad solicitada: 15');

      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('usa `increment` en vez de escribir un saldo calculado en memoria', async () => {
      const dto = { supplyId: 's1', type: InventoryMovementType.ENTRY, quantity: 5 } as any;
      mockPrisma.supply.findUnique.mockResolvedValue({
        id: 's1', name: 'S1', minimumStock: 5, isActive: true,
      } as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 15 } as any);
      mockRepository.create.mockResolvedValue({ id: 'm1' } as any);

      await service.createMovement(dto, 'user-1');

      const data = mockPrisma.supply.update.mock.calls[0][0].data;
      expect(data.currentStock).toEqual({ increment: expect.any(Prisma.Decimal) });
    });

    it('registra el saldo anterior derivado del resultado, no de la lectura previa', async () => {
      const dto = { supplyId: 's1', type: InventoryMovementType.ENTRY, quantity: 5 } as any;
      mockPrisma.supply.findUnique.mockResolvedValue({
        id: 's1', name: 'S1', minimumStock: 5, isActive: true,
      } as any);
      // Otro movimiento entró entremedio: el saldo real quedó en 30, no en 15.
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 30 } as any);
      mockRepository.create.mockResolvedValue({ id: 'm1' } as any);

      await service.createMovement(dto, 'user-1');

      const data = mockRepository.create.mock.calls[0][0];
      expect(Number(data.newStock)).toBe(30);
      expect(Number(data.previousStock)).toBe(25);
    });

    describe('ADJUSTMENT', () => {
      const base = {
        supplyId: 's1',
        type: InventoryMovementType.ADJUSTMENT,
        quantity: 3,
        reason: 'Conteo físico',
      };

      beforeEach(() => {
        mockPrisma.supply.findUnique.mockResolvedValue({
          id: 's1', name: 'S1', minimumStock: 5, isActive: true,
        } as any);
        mockRepository.create.mockResolvedValue({ id: 'm-adj' } as any);
      });

      it('exige motivo', async () => {
        await expect(
          service.createMovement(
            { ...base, reason: undefined, direction: AdjustmentDirection.DECREASE } as any,
            'user-1',
          ),
        ).rejects.toThrow('"reason" es requerido');
      });

      it('exige sentido: un conteo físico puede quedar por encima o por debajo', async () => {
        await expect(
          service.createMovement(base as any, 'user-1'),
        ).rejects.toThrow('"direction" es requerido');
      });

      it('suma cuando el conteo quedó por encima del sistema', async () => {
        mockPrisma.supply.update.mockResolvedValue({ currentStock: 13 } as any);

        await service.createMovement(
          { ...base, direction: AdjustmentDirection.INCREASE } as any,
          'user-1',
        );

        const data = mockPrisma.supply.update.mock.calls[0][0].data;
        expect(data.currentStock).toEqual({ increment: expect.any(Prisma.Decimal) });
      });

      it('resta cuando el conteo quedó por debajo', async () => {
        mockPrisma.supply.update.mockResolvedValue({ currentStock: 7 } as any);

        await service.createMovement(
          { ...base, direction: AdjustmentDirection.DECREASE } as any,
          'user-1',
        );

        const data = mockPrisma.supply.update.mock.calls[0][0].data;
        expect(data.currentStock).toEqual({ decrement: expect.any(Prisma.Decimal) });
      });
    });

    it('should compute decreasing stock on EXIT', async () => {
      const dto = { supplyId: 's1', type: InventoryMovementType.EXIT, quantity: 5 } as any;
      mockPrisma.supply.findUnique.mockResolvedValue({
        id: 's1', name: 'S1', currentStock: 10, minimumStock: 5, purchasePrice: 50, isActive: true,
      } as any);
      mockPrisma.supply.update.mockResolvedValue({ currentStock: 5 } as any);
      mockRepository.create.mockResolvedValue({ id: 'm-exit' } as any);

      const res = await service.createMovement(dto, 'user-1');
      
      expect(res).toEqual({ id: 'm-exit' });
      expect(mockPrisma.supply.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currentStock: expect.any(Object) })
      }));
    });
  });
});
