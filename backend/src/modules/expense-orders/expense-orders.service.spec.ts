import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseOrdersService } from './expense-orders.service';
import { ExpenseOrdersRepository } from './expense-orders.repository';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { PrismaService } from '../../database/prisma.service';
import { ExpenseOrderAuthRequestsService } from '../expense-order-auth-requests/expense-order-auth-requests.service';
import { ExpenseOrderStatus } from '../../generated/prisma';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateExpenseOrderDto, UpdateExpenseOrderDto } from './dto';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { ExpenseOrderEditRequestsService } from '../expense-order-edit-requests/expense-order-edit-requests.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  let editRequestsService: jest.Mocked<ExpenseOrderEditRequestsService>;
  let notificationsService: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      replaceItems: jest.fn(),
      replaceWorkOrderItems: jest.fn(),
      clearItemWorkOrderLinks: jest.fn(),
      addItem: jest.fn(),
      updateStatus: jest.fn(),
      claimCajaAuthorization: jest.fn().mockResolvedValue(true),
      claimReturnForCorrection: jest.fn().mockResolvedValue(true),
      attachItemReceipt: jest.fn().mockResolvedValue(1),
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
      workOrderItem: {
        count: jest.fn(),
      },
      machine: {
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
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      accountPayablePayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      expenseOrderEditRequest: {
        update: jest.fn(),
      },
      uploadedFile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }),
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
      paidThroughExpenseOrder: jest.fn().mockResolvedValue(0),
      paidOutsideExpenseOrder: jest.fn().mockResolvedValue(null),
      refreshFromLivePayments: jest.fn().mockResolvedValue(undefined),
    } as any;

    editRequestsService = {
      findActiveApproval: jest.fn().mockResolvedValue(null),
      consumeApproval: jest.fn().mockResolvedValue(true),
    } as any;

    notificationsService = {
      create: jest.fn().mockResolvedValue(undefined),
      notifyUsersWithPermission: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseOrdersService,
        { provide: ExpenseOrdersRepository, useValue: repository },
        { provide: ConsecutivesService, useValue: consecutivesService },
        { provide: PrismaService, useValue: prisma },
        { provide: ExpenseOrderAuthRequestsService, useValue: authRequestsService },
        { provide: AccountsPayableService, useValue: accountsPayableService },
        { provide: ExpenseOrderEditRequestsService, useValue: editRequestsService },
        { provide: NotificationsService, useValue: notificationsService },
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

    // Caja entrega el total que muestra la OG. Con la base del ítem, cada OG
    // con IVA dejaba el cajón corto por el IVA (OG-2026-0782: $48.403 vs $57.600).
    it('registra cada egreso con su parte del total con IVA', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        ...adminAuthorized,
        applyIva: true,
        ivaRate: 0.19,
        items: [
          { total: 24201.5, paymentMethod: 'CASH' },
          { total: 24201.5, paymentMethod: 'CASH' },
        ],
      });

      await service.cajaAuthorize('og-1', currentUser);

      const amounts = (prisma.cashMovement.create as jest.Mock).mock.calls.map(
        ([args]) => args.data.amount,
      );
      expect(amounts).toEqual([28800, 28800]);
      expect(accountsPayableService.createFromExpenseOrder).toHaveBeenCalledWith(
        'og-1',
        expect.any(String),
        57600,
        'caja-1',
        48403,
      );
    });

    // Antes marcaba AUTHORIZED y después descubría que no había caja: la OG
    // quedaba fuera de ADMIN_AUTHORIZED, sin pago y sin forma de reintentar.
    it('durante el arqueo de cierre no paga en efectivo ni toca el estado', async () => {
      (prisma.cashSession.findMany as jest.Mock).mockResolvedValue([{ id: 'session-1', cashRegisterId: 'cr-1', countStartedAt: new Date() }]);

      await expect(service.cajaAuthorize('og-1', currentUser)).rejects.toThrow(
        /arqueo de cierre/,
      );
      expect(repository.claimCajaAuthorization).not.toHaveBeenCalled();
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    });

    it('durante el arqueo sí paga una OG solo por transferencia', async () => {
      (prisma.cashSession.findMany as jest.Mock).mockResolvedValue([{ id: 'session-1', cashRegisterId: 'cr-1', countStartedAt: new Date() }]);
      (repository.findById as jest.Mock).mockResolvedValue({
        ...adminAuthorized,
        items: [{ total: 50000, paymentMethod: 'TRANSFER' }],
      });

      await service.cajaAuthorize('og-1', currentUser);

      expect(prisma.cashMovement.create).toHaveBeenCalledTimes(1);
    });

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

    // OG-2026-0832: Jorge firmó como admin y también autorizó en Caja. Las dos
    // firmas existen para que sean dos personas distintas.
    it('no deja autorizar en Caja a quien firmó la OG como admin', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        ...adminAuthorized,
        authorizedById: 'admin-1',
      });

      await expect(
        service.cajaAuthorize('og-1', { id: 'admin-1' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.claimCajaAuthorization).not.toHaveBeenCalled();
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    });

    it('sí deja autorizar en Caja a un admin distinto del que firmó', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        ...adminAuthorized,
        authorizedById: 'admin-1',
      });

      await service.cajaAuthorize('og-1', { id: 'admin-2' } as any);

      expect(repository.claimCajaAuthorization).toHaveBeenCalledWith('og-1', 'admin-2');
    });

    // OG-2026-0832: Caja pagó la CP espejo y después se autorizó la OG; el
    // mismo gasto salió dos veces de caja y la CP quedó con saldo negativo.
    it('si la CP espejo ya se pagó desde Cuentas por Pagar, no crea egresos', async () => {
      (accountsPayableService.paidOutsideExpenseOrder as jest.Mock).mockResolvedValue({
        apNumber: 'CP-2026-1176',
        amount: 102300,
      });

      await expect(service.cajaAuthorize('og-1', currentUser)).rejects.toThrow(
        /ya se pagó desde Cuentas por Pagar \(CP-2026-1176/,
      );
      expect(accountsPayableService.paidOutsideExpenseOrder).toHaveBeenCalledWith('og-1');
      expect(repository.claimCajaAuthorization).not.toHaveBeenCalled();
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
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

  describe('ítems de la OT', () => {
    const createDto = {
      expenseTypeId: 'type-id',
      expenseSubcategoryId: 'sub-id',
      workOrderId: 'ot-1',
      items: [{ quantity: 1, unitPrice: 10, name: 'Sombrillas', paymentMethod: 'CASH' }],
    } as any;

    beforeEach(() => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue({ id: 'ot-1' });
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' });
      (repository.create as jest.Mock).mockResolvedValue({ id: 'og-1', ogNumber: 'OG-001', items: [{ total: 10 }] });
    });

    it('crea la OG amarrada a los ítems de su OT', async () => {
      (prisma.workOrderItem.count as jest.Mock).mockResolvedValue(2);

      await service.create({ ...createDto, workOrderItemIds: ['woi-1', 'woi-2'] }, 'user-1');

      expect(prisma.workOrderItem.count).toHaveBeenCalledWith({
        where: { id: { in: ['woi-1', 'woi-2'] }, workOrderId: 'ot-1' },
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ workOrderId: 'ot-1', workOrderItemIds: ['woi-1', 'woi-2'] }),
      );
    });

    it('sin ítems es gasto de toda la OT y no consulta ítems', async () => {
      await service.create(createDto, 'user-1');

      expect(prisma.workOrderItem.count).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalled();
    });

    it('rechaza ítems de otra OT', async () => {
      (prisma.workOrderItem.count as jest.Mock).mockResolvedValue(1);

      await expect(
        service.create({ ...createDto, workOrderItemIds: ['woi-1', 'de-otra-ot'] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza ítems sin OT asociada', async () => {
      await expect(
        service.create(
          { ...createDto, workOrderId: undefined, workOrderItemIds: ['woi-1'] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    const draftOg = { id: 'og-1', status: ExpenseOrderStatus.DRAFT, workOrder: { id: 'ot-1' } };

    it('al editar reemplaza los ítems y no los manda como campo escalar', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(draftOg);
      (prisma.workOrderItem.count as jest.Mock).mockResolvedValue(1);

      await service.update('og-1', { observations: 'x', workOrderItemIds: ['woi-2'] });

      expect(repository.update).toHaveBeenCalledWith('og-1', { observations: 'x' });
      expect(repository.replaceWorkOrderItems).toHaveBeenCalledWith('og-1', ['woi-2']);
    });

    it('al cambiar la OT sin ítems nuevos borra los amarres viejos', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(draftOg);

      await service.update('og-1', { workOrderId: 'ot-2' });

      expect(repository.replaceWorkOrderItems).toHaveBeenCalledWith('og-1', []);
    });

    it('valida también los ítems de OT de cada línea', async () => {
      (prisma.workOrderItem.count as jest.Mock).mockResolvedValue(1);

      await expect(
        service.create(
          {
            ...createDto,
            workOrderItemIds: ['woi-1'],
            items: [
              { ...createDto.items[0], workOrderItemId: 'woi-1' },
              { ...createDto.items[0], workOrderItemId: 'de-otra-ot' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.workOrderItem.count).toHaveBeenCalledWith({
        where: { id: { in: ['woi-1', 'de-otra-ot'] }, workOrderId: 'ot-1' },
      });
    });

    it('guarda el ítem de OT de cada línea', async () => {
      (prisma.workOrderItem.count as jest.Mock).mockResolvedValue(1);

      await service.create(
        {
          ...createDto,
          workOrderItemIds: ['woi-1'],
          items: [
            { ...createDto.items[0], workOrderItemId: 'woi-1' },
            { ...createDto.items[0], name: 'Transporte' },
          ],
        },
        'user-1',
      );

      const { items } = (repository.create as jest.Mock).mock.calls[0][0];
      expect(items.map((i: { workOrderItemId: string | null }) => i.workOrderItemId)).toEqual([
        'woi-1',
        null,
      ]);
    });

    it('al cambiar la OT sin líneas nuevas suelta las líneas de sus ítems', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(draftOg);

      await service.update('og-1', { workOrderId: 'ot-2' });

      expect(repository.clearItemWorkOrderLinks).toHaveBeenCalledWith('og-1');
    });

    it('al quitar la OT borra los amarres', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(draftOg);

      await service.update('og-1', { workOrderId: null });

      expect(repository.replaceWorkOrderItems).toHaveBeenCalledWith('og-1', []);
    });

    it('si no cambia la OT ni llegan ítems, no toca los amarres', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(draftOg);

      await service.update('og-1', { workOrderId: 'ot-1', observations: 'x' });

      expect(repository.replaceWorkOrderItems).not.toHaveBeenCalled();
    });

    it('al editar valida los ítems contra la OT nueva', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(draftOg);
      (prisma.workOrderItem.count as jest.Mock).mockResolvedValue(0);

      await expect(
        service.update('og-1', { workOrderId: 'ot-2', workOrderItemIds: ['woi-de-ot-1'] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.workOrderItem.count).toHaveBeenCalledWith({
        where: { id: { in: ['woi-de-ot-1'] }, workOrderId: 'ot-2' },
      });
      expect(repository.replaceWorkOrderItems).not.toHaveBeenCalled();
    });
  });

  describe('máquina', () => {
    const createDto = {
      expenseTypeId: 'type-id',
      expenseSubcategoryId: 'sub-id',
      areaOrMachine: 'Calandra y Sublimacion',
      items: [{ quantity: 1, unitPrice: 10, name: 'Papel', paymentMethod: 'CASH' }],
    } as any;

    beforeEach(() => {
      (prisma.expenseSubcategory.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-id' });
      (repository.create as jest.Mock).mockResolvedValue({ id: 'og-1', ogNumber: 'OG-001', items: [{ total: 10 }] });
    });

    it('crea la OG con una máquina del área encargada', async () => {
      (prisma.machine.findUnique as jest.Mock).mockResolvedValue({
        productionArea: { name: 'Calandra y Sublimacion' },
      });

      await service.create({ ...createDto, machineId: 'maq-1' }, 'user-1');

      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'maq-1' }));
    });

    it('rechaza una máquina de otra área', async () => {
      (prisma.machine.findUnique as jest.Mock).mockResolvedValue({
        productionArea: { name: 'Promocionales POP' },
      });

      await expect(service.create({ ...createDto, machineId: 'maq-1' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('acepta una máquina sin área asignada', async () => {
      (prisma.machine.findUnique as jest.Mock).mockResolvedValue({ productionArea: null });

      await service.create({ ...createDto, machineId: 'maq-1' }, 'user-1');

      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'maq-1' }));
    });

    it('rechaza una máquina que no existe', async () => {
      (prisma.machine.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create({ ...createDto, machineId: 'maq-x' }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sin máquina no la consulta', async () => {
      await service.create(createDto, 'user-1');

      expect(prisma.machine.findUnique).not.toHaveBeenCalled();
    });

    it('al cambiar el área en una edición valida la máquina que ya tenía', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'og-1',
        status: ExpenseOrderStatus.DRAFT,
        areaOrMachine: 'Calandra y Sublimacion',
        machine: { id: 'maq-1' },
      });
      (prisma.machine.findUnique as jest.Mock).mockResolvedValue({
        productionArea: { name: 'Calandra y Sublimacion' },
      });

      await expect(
        service.update('og-1', { areaOrMachine: 'Promocionales POP' }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
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

    it('con la firma del admin no se edita y el mensaje dice cómo seguir', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0888',
        status: ExpenseOrderStatus.ADMIN_AUTHORIZED,
      } as any);

      await expect(service.update('order-1', updateDto)).rejects.toThrow(
        /Devolver a corrección/,
      );
    });
  });

  describe('returnForCorrection', () => {
    const adminAuthorized = {
      id: 'og-1',
      ogNumber: 'OG-2026-0888',
      status: ExpenseOrderStatus.ADMIN_AUTHORIZED,
      createdBy: { id: 'comercial-1' },
      authorizedById: 'admin-1',
    };
    const dto = { reason: 'El ítem 3 no coincide con la factura' };
    const userWithRole = (name: string, permissions: string[] = []) => ({
      role: { name, permissions: permissions.map((p) => ({ permission: { name: p } })) },
    });

    beforeEach(() => {
      (repository.findById as jest.Mock).mockResolvedValue(adminAuthorized);
    });

    it('quien la creó la devuelve a CREATED y se avisa al admin que firmó', async () => {
      await service.returnForCorrection('og-1', dto, { id: 'comercial-1' } as any);

      expect(repository.claimReturnForCorrection).toHaveBeenCalledWith(
        'og-1',
        'comercial-1',
        dto.reason,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', relatedId: 'og-1' }),
      );
    });

    it('Caja la devuelve y se avisa al admin y a quien la creó', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        userWithRole('caja', ['caja_authorize_expense_orders']),
      );

      await service.returnForCorrection('og-1', dto, { id: 'caja-1' } as any);

      expect(repository.claimReturnForCorrection).toHaveBeenCalled();
      const notified = (notificationsService.create as jest.Mock).mock.calls.map(
        ([n]) => n.userId,
      );
      expect(notified.sort()).toEqual(['admin-1', 'comercial-1']);
    });

    it('otro usuario sin permiso de Caja no puede devolverla', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        userWithRole('Comercial', ['update_expense_orders']),
      );

      await expect(
        service.returnForCorrection('og-1', dto, { id: 'otro-1' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.claimReturnForCorrection).not.toHaveBeenCalled();
    });

    it('una OG pagada no se devuelve: se corrige con solicitud de edición', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        ...adminAuthorized,
        status: ExpenseOrderStatus.PAID,
      });

      await expect(
        service.returnForCorrection('og-1', dto, { id: 'comercial-1' } as any),
      ).rejects.toThrow(/solicita la edición/);
      expect(repository.claimReturnForCorrection).not.toHaveBeenCalled();
    });

    it('si Caja la pagó en el mismo instante, no toca nada ni avisa', async () => {
      (repository.claimReturnForCorrection as jest.Mock).mockResolvedValue(false);

      await expect(
        service.returnForCorrection('og-1', dto, { id: 'comercial-1' } as any),
      ).rejects.toThrow(ConflictException);
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('update de una OG pagada', () => {
    // OG de $100.000 sin IVA, pagada completa por Caja: su CP quedó saldada.
    const paidOg = () => ({
      id: 'og-1',
      ogNumber: 'OG-2026-0700',
      status: ExpenseOrderStatus.PAID,
      applyIva: false,
      ivaRate: 0.19,
      retefuenteRate: 0,
      reteICARate: 0,
      reteIVARate: 0,
      createdBy: { id: 'creator-1' },
      expenseType: { id: 'type-1' },
      expenseSubcategory: { id: 'sub-1' },
      items: [
        {
          total: 100000,
          quantity: 1,
          unitPrice: 100000,
          paymentMethod: 'CASH',
          bankEntity: null,
          receiptFileId: 'receipt-1',
        },
      ],
    });
    const paidAp = { id: 'ap-1', status: 'PAID', paidAmount: 100000 };
    const admin = { id: 'admin-1' } as any;
    const advisor = { id: 'advisor-1' } as any;

    const asRole = (roleName: string) =>
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: roleName } });

    beforeEach(() => {
      (repository.findById as jest.Mock).mockImplementation(async () => paidOg());
      (accountsPayableService.findByExpenseOrderId as jest.Mock).mockResolvedValue(paidAp);
    });

    it('sin usuario o sin aprobación responde 403 y no escribe nada', async () => {
      await expect(service.update('og-1', { applyIva: true })).rejects.toThrow(ForbiddenException);

      asRole('asesor');
      await expect(service.update('og-1', { applyIva: true }, advisor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('el admin agrega el IVA: la CP deja de estar saldada y debe la diferencia', async () => {
      asRole('admin');

      await service.update('og-1', { applyIva: true, ivaRate: 0.19 }, admin);

      expect(repository.update).toHaveBeenCalledWith('og-1', { applyIva: true, ivaRate: 0.19 });
      expect(accountsPayableService.syncFromExpenseOrder).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({ subtotalAmount: 100000 }),
      );
      expect(accountsPayableService.settleFromExpenseOrderMovements).toHaveBeenCalledWith(
        'og-1',
        'admin-1',
      );
      expect(accountsPayableService.refreshFromLivePayments).toHaveBeenCalledWith('ap-1');
      expect(editRequestsService.consumeApproval).not.toHaveBeenCalled();
    });

    it('no deja bajar el total por debajo de lo ya pagado', async () => {
      asRole('admin');

      await expect(
        service.update(
          'og-1',
          {
            items: [
              { quantity: 1, unitPrice: 80000, paymentMethod: 'CASH' as any, receiptFileId: 'receipt-1' },
            ],
          },
          admin,
        ),
      ).rejects.toThrow(/por debajo de lo que ya se pagó/);
      expect(repository.replaceItems).not.toHaveBeenCalled();
    });

    it('no deja cambiar el método de pago con la caja cerrada ni quitar ítems ya pagados', async () => {
      asRole('admin');
      ((prisma as any).cashMovement.findMany as jest.Mock).mockResolvedValue([
        { id: 'mov-1', paymentMethod: 'CASH', cashSession: { status: 'CLOSED' } },
      ]);

      await expect(
        service.update(
          'og-1',
          {
            items: [
              { quantity: 1, unitPrice: 100000, paymentMethod: 'TRANSFER' as any, receiptFileId: 'receipt-1' },
            ],
          },
          admin,
        ),
      ).rejects.toThrow(/la caja de donde salió ya se cerró/);
      expect(repository.replaceItems).not.toHaveBeenCalled();

      (repository.findById as jest.Mock).mockImplementation(async () => ({
        ...paidOg(),
        items: [...paidOg().items, { ...paidOg().items[0], receiptFileId: null }],
      }));
      await expect(
        service.update(
          'og-1',
          {
            items: [
              { quantity: 2, unitPrice: 100000, paymentMethod: 'CASH' as any, receiptFileId: 'receipt-1' },
            ],
          },
          admin,
        ),
      ).rejects.toThrow(/no se pueden quitar ítems/);
    });

    describe('corrección del método de pago con la caja abierta', () => {
      // OG-2026-0826: Caja la pagó en efectivo y en realidad fue transferencia.
      const openMovement = { id: 'mov-1', paymentMethod: 'CASH', cashSession: { status: 'OPEN' } };
      const asTransfer = {
        items: [
          {
            quantity: 1,
            unitPrice: 100000,
            paymentMethod: 'TRANSFER' as any,
            bankEntity: 'Bancolombia',
            receiptFileId: 'receipt-1',
          },
        ],
      };

      beforeEach(() => {
        asRole('admin');
        ((prisma as any).cashMovement.findMany as jest.Mock).mockResolvedValue([openMovement]);
      });

      it('cambia el método del ítem, de su egreso y del abono de la CP en una transacción', async () => {
        await service.update('og-1', asTransfer, admin);

        expect((prisma as any).cashMovement.updateMany).toHaveBeenCalledWith({
          where: { id: 'mov-1', isVoided: false, cashSession: { is: { status: 'OPEN' } } },
          data: { paymentMethod: 'TRANSFER' },
        });
        expect((prisma as any).accountPayablePayment.updateMany).toHaveBeenCalledWith({
          where: { cashMovementId: 'mov-1' },
          data: { paymentMethod: 'TRANSFER' },
        });
        expect(repository.replaceItems).toHaveBeenCalledWith(
          'og-1',
          [expect.objectContaining({ paymentMethod: 'TRANSFER', bankEntity: 'Bancolombia' })],
          prisma,
        );
      });

      it('si Caja cerró entre la validación y la escritura, responde 409 y no toca los ítems', async () => {
        ((prisma as any).cashMovement.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

        await expect(service.update('og-1', asTransfer, admin)).rejects.toThrow(ConflictException);
        expect(repository.replaceItems).not.toHaveBeenCalled();
      });

      it('no deja pasar un ítem pagado a crédito', async () => {
        await expect(
          service.update(
            'og-1',
            { items: [{ ...asTransfer.items[0], paymentMethod: 'CREDIT' as any, bankEntity: undefined }] },
            admin,
          ),
        ).rejects.toThrow(/no puede pasar a CREDIT/);
        expect((prisma as any).cashMovement.updateMany).not.toHaveBeenCalled();
      });

      it('sin cambio de método no toca el egreso', async () => {
        await service.update(
          'og-1',
          { items: [{ quantity: 1, unitPrice: 100000, paymentMethod: 'CASH' as any, receiptFileId: 'receipt-1' }] },
          admin,
        );

        expect((prisma as any).cashMovement.updateMany).not.toHaveBeenCalled();
        expect(repository.replaceItems).toHaveBeenCalledWith('og-1', expect.any(Array));
      });

      it('findOne le dice al formulario cuántos ítems pagados admiten la corrección', async () => {
        await expect(service.findOne('og-1')).resolves.toMatchObject({ paymentCorrectableItems: 1 });

        ((prisma as any).cashMovement.findMany as jest.Mock).mockResolvedValue([
          { ...openMovement, cashSession: { status: 'CLOSED' } },
        ]);
        await expect(service.findOne('og-1')).resolves.toMatchObject({ paymentCorrectableItems: 0 });

        // Más egresos que ítems: no se sabe cuál es de cuál.
        ((prisma as any).cashMovement.findMany as jest.Mock).mockResolvedValue([
          openMovement,
          { ...openMovement, id: 'mov-2' },
        ]);
        await expect(service.findOne('og-1')).resolves.toMatchObject({ paymentCorrectableItems: 0 });
      });
    });

    it('con aprobación vigente la consume y deja editar', async () => {
      asRole('asesor');
      (editRequestsService.findActiveApproval as jest.Mock).mockResolvedValue({ id: 'req-1' });

      await service.update('og-1', { applyIva: true }, advisor);

      expect(editRequestsService.consumeApproval).toHaveBeenCalledWith('req-1');
      expect(repository.update).toHaveBeenCalled();
    });

    it('si la aprobación ya se usó en otro guardado, responde 409', async () => {
      asRole('asesor');
      (editRequestsService.findActiveApproval as jest.Mock).mockResolvedValue({ id: 'req-1' });
      (editRequestsService.consumeApproval as jest.Mock).mockResolvedValue(false);

      await expect(service.update('og-1', { applyIva: true }, advisor)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('si la escritura falla, devuelve la aprobación para que pueda reintentar', async () => {
      asRole('asesor');
      (editRequestsService.findActiveApproval as jest.Mock).mockResolvedValue({ id: 'req-1' });
      (repository.update as jest.Mock).mockRejectedValue(new Error('db caída'));

      await expect(service.update('og-1', { applyIva: true }, advisor)).rejects.toThrow('db caída');
      expect((prisma as any).expenseOrderEditRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { consumedAt: null },
      });
    });

    it('OG pagada sin CP: la crea con el nuevo total y la salda contra los egresos', async () => {
      asRole('admin');
      (accountsPayableService.findByExpenseOrderId as jest.Mock).mockResolvedValue(null);
      ((prisma as any).cashMovement.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 100000 },
      });
      (accountsPayableService.createFromExpenseOrder as jest.Mock).mockResolvedValue({ id: 'ap-new' });

      await service.update('og-1', { applyIva: true, ivaRate: 0.19 }, admin);

      expect(accountsPayableService.createFromExpenseOrder).toHaveBeenCalledWith(
        'og-1',
        'Orden de Gasto OG-2026-0700',
        expect.any(Number),
        'admin-1',
        100000,
      );
      expect(accountsPayableService.settleFromExpenseOrderMovements).toHaveBeenCalledWith(
        'og-1',
        'admin-1',
      );
      expect(accountsPayableService.refreshFromLivePayments).toHaveBeenCalledWith('ap-new');
    });
  });

  describe('attachItemReceipt', () => {
    const paidOg = (receiptFileId: string | null) => ({
      id: 'og-1',
      ogNumber: 'OG-001',
      status: ExpenseOrderStatus.PAID,
      items: [{ id: 'item-1', receiptFileId }],
    });

    it('adjunta el comprobante a un ítem de una OG pagada sin pedir autorización de edición', async () => {
      repository.findById.mockResolvedValue(paidOg(null) as any);

      await service.attachItemReceipt('og-1', 'item-1', 'file-1');

      expect(repository.attachItemReceipt).toHaveBeenCalledWith('og-1', 'item-1', 'file-1', null);
      expect(editRequestsService.findActiveApproval).not.toHaveBeenCalled();
    });

    it('reemplaza un comprobante existente condicionado al que se leyó', async () => {
      repository.findById.mockResolvedValue(paidOg('old-file') as any);

      await service.attachItemReceipt('og-1', 'item-1', 'file-1');

      expect(repository.attachItemReceipt).toHaveBeenCalledWith(
        'og-1',
        'item-1',
        'file-1',
        'old-file',
      );
    });

    it('rechaza poner el mismo archivo que ya tiene', async () => {
      repository.findById.mockResolvedValue(paidOg('file-1') as any);

      await expect(service.attachItemReceipt('og-1', 'item-1', 'file-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.attachItemReceipt).not.toHaveBeenCalled();
    });

    it('rechaza un ítem que no es de la OG', async () => {
      repository.findById.mockResolvedValue(paidOg(null) as any);

      await expect(service.attachItemReceipt('og-1', 'otro', 'file-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza un archivo que no existe', async () => {
      repository.findById.mockResolvedValue(paidOg(null) as any);
      (prisma.uploadedFile.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.attachItemReceipt('og-1', 'item-1', 'file-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.attachItemReceipt).not.toHaveBeenCalled();
    });

    it('avisa si otro usuario lo cambió al mismo tiempo', async () => {
      repository.findById.mockResolvedValue(paidOg(null) as any);
      repository.attachItemReceipt.mockResolvedValue(0);

      await expect(service.attachItemReceipt('og-1', 'item-1', 'file-1')).rejects.toThrow(
        ConflictException,
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

    it.each([
      ['devuelta a corrección', ExpenseOrderStatus.CREATED],
      ['rechazada por Caja y pasada a borrador', ExpenseOrderStatus.DRAFT],
    ])('no elimina una OG que ya tuvo la firma del admin (%s)', async (_caso, status) => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0888',
        status,
        authorizedAt: new Date('2026-10-27T22:27:54Z'),
      } as any);

      await expect(service.remove('order-1')).rejects.toThrow(/ya tuvo la firma del admin/);
      expect((prisma as any).expenseOrder.delete).not.toHaveBeenCalled();
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

    it('no deja firmar al admin una OG cuya CP ya se pagó', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0832',
        status: ExpenseOrderStatus.CREATED,
      } as any);
      (accountsPayableService.paidOutsideExpenseOrder as jest.Mock).mockResolvedValue({
        apNumber: 'CP-2026-1176',
        amount: 102300,
      });

      await expect(
        service.updateStatus('order-1', { status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any, { id: 'admin1' } as any),
      ).rejects.toThrow(ConflictException);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    // Antes solo se avisaba al solicitante; Caja no se enteraba de que la OG la
    // esperaba y pagaba la CP por su lado.
    it('avisa a Caja (sin los admins) cuando la OG queda con la firma del admin', async () => {
      (repository.findById as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ogNumber: 'OG-2026-0832',
        status: ExpenseOrderStatus.CREATED,
        locationId: 'loc-104',
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: { name: 'admin' } } as any);

      await service.updateStatus('order-1', { status: ExpenseOrderStatus.ADMIN_AUTHORIZED } as any, { id: 'admin1' } as any);

      expect(notificationsService.notifyUsersWithPermission).toHaveBeenCalledWith(
        'caja_authorize_expense_orders',
        expect.objectContaining({
          type: 'EXPENSE_ORDER_PENDING_CAJA',
          relatedId: 'order-1',
          relatedType: 'ExpenseOrder',
        }),
        { locationId: 'loc-104' },
        [],
        { excludeAdmins: true },
      );
    });
  });
});
