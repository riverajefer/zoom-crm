import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseOrdersService } from './expense-orders.service';
import { ExpenseOrdersRepository } from './expense-orders.repository';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { PrismaService } from '../../database/prisma.service';
import { ExpenseOrderAuthRequestsService } from '../expense-order-auth-requests/expense-order-auth-requests.service';
import { ExpenseOrderStatus } from '../../generated/prisma';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateExpenseOrderDto, UpdateExpenseOrderDto } from './dto';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';

// Solo Zoom: los documentos nacen en la sede activa del request, que en un
// test unitario no existe (docs/PLAN_SEDES.md §2).
jest.mock('../../common/utils/location-context', () => ({
  ...jest.requireActual('../../common/utils/location-context'),
  requireActiveLocationId: jest.fn(() => 'loc-125'),
}));


describe('ExpenseOrdersService', () => {
  let service: ExpenseOrdersService;
  let repository: jest.Mocked<ExpenseOrdersRepository>;
  let consecutivesService: jest.Mocked<ConsecutivesService>;
  let prisma: jest.Mocked<PrismaService>;
  let authRequestsService: jest.Mocked<ExpenseOrderAuthRequestsService>;
  let accountsPayableService: jest.Mocked<AccountsPayableService>;

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      replaceItems: jest.fn(),
      addItem: jest.fn(),
      updateStatus: jest.fn(),
      claimCajaAuthorization: jest.fn().mockResolvedValue(true),
      delete: jest.fn(),
    } as any;

    consecutivesService = {
      generateNumber: jest.fn().mockResolvedValue('OG-001'),
      syncCounter: jest.fn(),
    } as any;

    prisma = {
      workOrder: {
        findUnique: jest.fn(),
      },
      expenseSubcategory: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      accountPayable: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      },
      expenseOrder: {
        delete: jest.fn(),
      },
      cashSession: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      cashMovement: {
        create: jest.fn(),
      },
      // `remove` borra la CxP y la OG en una transacción; el mock ejecuta el
      // callback contra el mismo cliente simulado.
      $transaction: jest.fn((callback: any) => callback(prisma)),
    } as any;

    authRequestsService = {
      hasApprovedRequest: jest.fn(),
      getApprovedRequest: jest.fn(),
      consumeApprovedRequest: jest.fn(),
      closePendingRequestsForAuthorizedOrder: jest.fn().mockResolvedValue(0),
    } as any;

    accountsPayableService = {
      createFromExpenseOrder: jest.fn(),
      findByExpenseOrderId: jest.fn(),
      syncFromExpenseOrder: jest.fn(),
      settleFromExpenseOrderMovements: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseOrdersService,
        { provide: ExpenseOrdersRepository, useValue: repository },
        { provide: ConsecutivesService, useValue: consecutivesService },
        { provide: PrismaService, useValue: prisma },
        { provide: ExpenseOrderAuthRequestsService, useValue: authRequestsService },
        { provide: AccountsPayableService, useValue: accountsPayableService },
      ],
    }).compile();

    service = module.get<ExpenseOrdersService>(ExpenseOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cajaAuthorize', () => {
    const currentUser = { id: 'caja-1' } as any;
    const adminAuthorized = {
      id: 'og-1',
      ogNumber: 'OG-2026-0500',
      status: ExpenseOrderStatus.ADMIN_AUTHORIZED,
      items: [
        { total: 100000, paymentMethod: 'CASH' },
        { total: 50000, paymentMethod: 'TRANSFER' },
      ],
    };

    beforeEach(() => {
      (repository.findById as jest.Mock).mockResolvedValue(adminAuthorized);
      (prisma.cashSession.findMany as jest.Mock).mockResolvedValue([{ id: 'session-1', cashRegisterId: 'cr-1' }]);
      (repository.updateStatus as jest.Mock).mockResolvedValue({
        ...adminAuthorized,
        status: ExpenseOrderStatus.PAID,
      });
    });

    it('crea un egreso por ítem, deja la OG pagada y concilia su CP', async () => {
      await service.cajaAuthorize('og-1', currentUser);

      expect(repository.claimCajaAuthorization).toHaveBeenCalledWith('og-1', 'caja-1');
      expect(prisma.cashMovement.create).toHaveBeenCalledTimes(2);
      expect(repository.updateStatus).toHaveBeenCalledWith('og-1', ExpenseOrderStatus.PAID);
      expect(accountsPayableService.settleFromExpenseOrderMovements).toHaveBeenCalledWith(
        'og-1',
        'caja-1',
      );
    });

    // Antes marcaba AUTHORIZED y después descubría que no había caja: la OG
    // quedaba fuera de ADMIN_AUTHORIZED, sin pago y sin forma de reintentar.
    it('sin caja abierta no toca el estado de la OG', async () => {
      (prisma.cashSession.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.cajaAuthorize('og-1', currentUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.claimCajaAuthorization).not.toHaveBeenCalled();
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    // Dos autorizaciones simultáneas leían ADMIN_AUTHORIZED y creaban los
    // egresos de caja dos veces.
    it('si otra autorización ganó la carrera, no crea egresos', async () => {
      (repository.claimCajaAuthorization as jest.Mock).mockResolvedValue(false);

      await expect(service.cajaAuthorize('og-1', currentUser)).rejects.toThrow(
        /ya fue autorizada/,
      );
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('idempotencia al crear', () => {
    const dto = {
      expenseTypeId: 'type-id',
      expenseSubcategoryId: 'sub-id',
      idempotencyKey: '11111111-2222-3333-4444-555555555555',
      items: [{ quantity: 1, unitPrice: 600000, name: 'Item', paymentMethod: 'CASH' }],
    } as any;

    it('devuelve la OG existente sin crear otra cuando la llave ya se usó', async () => {
      (repository.findByIdempotencyKey as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0485',
      } as any);

      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(
        expect.objectContaining({ ogNumber: 'OG-2026-0485' }),
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(consecutivesService.generateNumber).not.toHaveBeenCalled();
    });

    it('devuelve la OG gemela cuando la petición paralela ganó la carrera', async () => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' } as any);
      // La lectura previa no ve nada: las dos peticiones entran a la vez.
      (repository.findByIdempotencyKey as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'order-1', ogNumber: 'OG-2026-0485' } as any);
      // Forma real del P2002 con el adaptador de Postgres: `target` viene vacío
      // y el nombre de la restricción va dentro de `driverAdapterError`.
      (repository.create as jest.Mock).mockRejectedValue(
        Object.assign(new Error('unique'), {
          code: 'P2002',
          meta: {
            modelName: 'ExpenseOrder',
            driverAdapterError: {
              cause: {
                originalMessage:
                  'duplicate key value violates unique constraint "expense_orders_idempotency_key_key"',
                constraint: { fields: ['idempotency_key'] },
              },
            },
          },
        }),
      );

      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(
        expect.objectContaining({ ogNumber: 'OG-2026-0485' }),
      );
      // No debe reintentar con otro consecutivo: eso es lo que creaba el duplicado.
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('guarda la llave en la OG creada', async () => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' } as any);
      (repository.findByIdempotencyKey as jest.Mock).mockResolvedValue(null);
      (repository.create as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-001',
        items: [{ total: 600000 }],
      } as any);

      await service.create(dto, 'user-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: '11111111-2222-3333-4444-555555555555',
        }),
      );
    });
  });

  describe('retenciones', () => {
    const withholdingsDto = {
      expenseTypeId: 'type-id',
      expenseSubcategoryId: 'sub-id',
      applyIva: true,
      ivaRate: 0.19,
      retefuenteRate: 0.04,
      reteICARate: 0.00966,
      items: [{ quantity: 1, unitPrice: 1000000, name: 'Item', paymentMethod: 'CASH' }],
    } as any;

    it('crea la cuenta por pagar con el total neto de retenciones', async () => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' } as any);
      (repository.create as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-001',
        items: [{ total: 1000000 }],
      } as any);

      await service.create(withholdingsDto, 'user-1');

      // 1.000.000 - 40.000 - 9.660 + 190.000
      expect(accountsPayableService.createFromExpenseOrder).toHaveBeenCalledWith(
        'order-1',
        'Orden de Gasto OG-001',
        1140340,
        'user-1',
        1000000,
      );
    });

    it('guarda las tasas de retención en la OG', async () => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' } as any);
      (repository.create as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-001',
        items: [{ total: 1000000 }],
      } as any);

      await service.create(withholdingsDto, 'user-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          retefuenteRate: 0.04,
          reteICARate: 0.00966,
          reteIVARate: 0,
        }),
      );
    });

    it('sincroniza la cuenta por pagar al editar las retenciones', async () => {
      (repository.findById as jest.Mock)
        .mockResolvedValueOnce({
          id: 'order-1',
          status: ExpenseOrderStatus.CREATED,
          expenseType: { id: 'type-id' },
          expenseSubcategory: { id: 'sub-id' },
          items: [{ total: 1000000 }],
        } as any)
        .mockResolvedValueOnce({
          id: 'order-1',
          applyIva: true,
          ivaRate: 0.19,
          retefuenteRate: 0.025,
          reteICARate: 0,
          reteIVARate: 0.15,
          items: [{ total: 1000000 }],
        } as any);
      (accountsPayableService.findByExpenseOrderId as jest.Mock).mockResolvedValue({
        id: 'ap-1',
        status: 'PENDING',
      } as any);

      await service.update('order-1', { retefuenteRate: 0.025, reteIVARate: 0.15 } as any);

      // 1.000.000 - 25.000 + 190.000 - 28.500
      expect(accountsPayableService.syncFromExpenseOrder).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({
          totalAmount: 1136500,
          subtotalAmount: 1000000,
          retefuenteRate: 0.025,
          reteIVARate: 0.15,
        }),
      );
    });
  });

  describe('create', () => {
    const createDto = {
      expenseTypeId: 'type-id',
      expenseSubcategoryId: 'sub-id',
      authorizedToId: 'auth-1',
      observations: 'Test',
      items: [
        {
          quantity: 2,
          unitPrice: 10,
          name: 'Item 1',
          paymentMethod: 'CASH',
        },
      ],
    } as any;
    const createdById = 'user-1';

    it('should create an expense order successfully without work order', async () => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' } as any);
      (repository.create as jest.Mock).mockResolvedValue({ id: 'order-1', ogNumber: 'OG-001', items: [{ total: 20 }] } as any);

      const result = await service.create(createDto, createdById);

      expect(prisma.expenseSubcategory.findFirst).toHaveBeenCalled();
      expect(consecutivesService.generateNumber).toHaveBeenCalledWith('EXPENSE', 'loc-125');
      expect(repository.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'order-1', ogNumber: 'OG-001', items: [{ total: 20 }] });
    });

    it('should throw BadRequestException if subcategory not found', async () => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.create(createDto, createdById)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if workOrder provided but not found', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({ ...createDto, workOrderId: 'missing' }, createdById),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if productionAreaIds used without workOrderId', async () => {
      const dtoWithProductionArea: CreateExpenseOrderDto = {
        ...createDto,
        items: [{ ...createDto.items[0], productionAreaIds: ['prod-1'] }],
      };

      await expect(service.create(dtoWithProductionArea, createdById)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return a list of expense orders', async () => {
      const filters = { page: 1, limit: 10 };
      (repository.findAll as jest.Mock).mockResolvedValue({ data: [], meta: { total: 0 } } as any);

      const result = await service.findAll(filters);

      expect(repository.findAll).toHaveBeenCalledWith(filters);
      expect(result.data).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return an expense order if found', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({ id: 'order-1' } as any);

      const result = await service.findOne('order-1');

      expect(repository.findById).toHaveBeenCalledWith('order-1');
      expect(result.id).toBe('order-1');
    });

    it('should throw NotFoundException if expense order not found', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto: UpdateExpenseOrderDto = {
      observations: 'Updated',
    };

    it('should update an expense order if editable', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.DRAFT,
      } as any);
      (repository.update as jest.Mock).mockResolvedValue(true as any);

      await service.update('order-1', updateDto);

      expect(repository.update).toHaveBeenCalledWith('order-1', updateDto);
    });

    it('should throw NotFoundException if expense order not found', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.update('missing', updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if expense order is not editable', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.PAID,
      } as any);

      await expect(service.update('order-1', updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should remove an expense order if DRAFT', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0001',
        status: ExpenseOrderStatus.DRAFT,
      } as any);

      await service.remove('order-1');

      expect((prisma as any).expenseOrder.delete).toHaveBeenCalledWith({
        where: { id: 'order-1' },
      });
    });

    it('should remove an expense order if CREATED', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0486',
        status: ExpenseOrderStatus.CREATED,
      } as any);

      await service.remove('order-1');

      expect((prisma as any).expenseOrder.delete).toHaveBeenCalledWith({
        where: { id: 'order-1' },
      });
    });

    it('should also delete the linked account payable when it has no payments', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0486',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (prisma as any).accountPayable.findUnique.mockResolvedValue({
        id: 'ap-1',
        apNumber: 'CP-2026-659',
        paidAmount: 0,
        _count: { payments: 0 },
      });

      await service.remove('order-1');

      expect((prisma as any).accountPayable.delete).toHaveBeenCalledWith({
        where: { id: 'ap-1' },
      });
    });

    it('should refuse to delete when the account payable already has payments', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0486',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (prisma as any).accountPayable.findUnique.mockResolvedValue({
        id: 'ap-1',
        apNumber: 'CP-2026-659',
        paidAmount: 100000,
        _count: { payments: 1 },
      });

      await expect(service.remove('order-1')).rejects.toThrow(BadRequestException);
      expect((prisma as any).expenseOrder.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException once authorized', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0485',
        status: ExpenseOrderStatus.ADMIN_AUTHORIZED,
      } as any);

      await expect(service.remove('order-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if not found', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('order-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should throw BadRequestException for invalid transitions', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.DRAFT,
      } as any);

      await expect(
        service.updateStatus('order-1', { status: ExpenseOrderStatus.PAID } as any, { id: 'u1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update status if valid transition (DRAFT -> CREATED)', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.DRAFT,
      } as any);
      (repository.updateStatus as jest.Mock).mockResolvedValue({ id: 'order-1', status: ExpenseOrderStatus.CREATED } as any);

      const result = await service.updateStatus(
        'order-1',
        { status: ExpenseOrderStatus.CREATED } as any,
        { id: 'u1' } as any,
      );

      expect(repository.updateStatus).toHaveBeenCalledWith('order-1', 'CREATED');
      expect(result!.status).toBe('CREATED');
    });

    it('should update status to ADMIN_AUTHORIZED directly if admin (first auth)', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'admin' } } as any);
      (repository.updateStatus as jest.Mock).mockResolvedValue({ id: 'order-1', status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any);
      (repository.findById as jest.Mock).mockResolvedValueOnce({ id: 'order-1', status: ExpenseOrderStatus.CREATED } as any)
        .mockResolvedValueOnce({ id: 'order-1', status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any);

      await service.updateStatus('order-1', { status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any, { id: 'admin1', roleId: 'r1' } as any);

      expect(repository.updateStatus).toHaveBeenCalledWith('order-1', 'ADMIN_AUTHORIZED', { authorizedById: 'admin1', authorizedAt: expect.any(Date) });
    });

    // Sin esto las solicitudes quedaban PENDING para siempre aunque la OG ya
    // estuviera firmada, y seguían apareciendo en la pantalla de "Solicitudes".
    it('cierra las solicitudes pendientes de la OG al firmarla el admin', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'admin' } } as any);
      (repository.updateStatus as jest.Mock).mockResolvedValue({ id: 'order-1', status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any);

      await service.updateStatus('order-1', { status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any, { id: 'admin1', roleId: 'r1' } as any);

      expect(authRequestsService.closePendingRequestsForAuthorizedOrder).toHaveBeenCalledWith(
        'order-1',
        'admin1',
      );
    });

    it('cierra las pendientes con el admin que aprobó cuando autoriza un no-admin', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'user' } } as any);
      (authRequestsService.hasApprovedRequest as jest.Mock).mockResolvedValue(true);
      (authRequestsService.getApprovedRequest as jest.Mock).mockResolvedValue({ reviewedById: 'admin-que-aprobo' } as any);
      (repository.updateStatus as jest.Mock).mockResolvedValue({ id: 'order-1', status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any);

      await service.updateStatus('order-1', { status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any, { id: 'u1', roleId: 'r1' } as any);

      expect(authRequestsService.closePendingRequestsForAuthorizedOrder).toHaveBeenCalledWith(
        'order-1',
        'admin-que-aprobo',
      );
    });

    it('should throw ForbiddenException if non-admin tries to pre-authorize without approved request', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'user' } } as any);
      (authRequestsService.hasApprovedRequest as jest.Mock).mockResolvedValue(false);

      await expect(
        service.updateStatus('order-1', { status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any, { id: 'u1', roleId: 'r1' } as any)
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
