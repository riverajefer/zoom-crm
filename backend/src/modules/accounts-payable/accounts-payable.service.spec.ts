import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsPayableService } from './accounts-payable.service';
import { AccountsPayableRepository } from './accounts-payable.repository';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { StorageService } from '../storage/storage.service';
import { createMockPrismaService } from '../../database/prisma.service.mock';
import { AccountPayableStatus, Prisma } from '../../generated/prisma';

// Solo Zoom: los documentos nacen en la sede activa del request, que en un
// test unitario no existe (docs/PLAN_SEDES.md §2).
jest.mock('../../common/utils/location-context', () => ({
  ...jest.requireActual('../../common/utils/location-context'),
  requireActiveLocationId: jest.fn(() => 'loc-125'),
}));


/**
 * Stub de una cuenta por pagar (CP). Los montos se guardan como number para
 * simplificar; el servicio los envuelve con Number() antes de operar.
 */
const apStub = (overrides: Record<string, any> = {}) => ({
  id: 'ap-1',
  apNumber: 'CP-2026-001',
  status: AccountPayableStatus.PENDING,
  totalAmount: 100000,
  paidAmount: 0,
  balance: 100000,
  expenseType: { id: 'type-1', name: 'Servicios' },
  expenseSubcategory: { id: 'sub-1', name: 'Internet' },
  beneficiaryUser: null,
  ...overrides,
});


/**
 * Compara un monto sin importar si el código lo entrega como `Prisma.Decimal`,
 * número o cadena. Los montos guardados pasaron de `number` a `Decimal` para
 * evitar residuos de coma flotante; lo que importa del test es el valor.
 */
const monto = (esperado: number) =>
  expect.objectContaining({
    toString: expect.any(Function),
  }) && ({
    asymmetricMatch: (recibido: unknown) =>
      recibido !== null &&
      recibido !== undefined &&
      Number(recibido.toString()) === esperado,
    toString: () => `monto(${esperado})`,
  } as unknown as number);

describe('AccountsPayableService', () => {
  let service: AccountsPayableService;
  let repository: any;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let consecutives: { generateNumber: jest.Mock };

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByExpenseOrderId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      getPaymentHistory: jest.fn(),
      createPayment: jest.fn(),
      findPaymentById: jest.fn(),
      getSummary: jest.fn(),
      getLastApNumber: jest.fn(),
      markOverdue: jest.fn(),
      createAttachment: jest.fn(),
      findAttachmentById: jest.fn(),
      deleteAttachment: jest.fn(),
      setInstallments: jest.fn(),
      findInstallments: jest.fn(),
      updateInstallment: jest.fn(),
      deleteInstallment: jest.fn(),
      findInstallmentById: jest.fn(),
    } as any;

    prisma = createMockPrismaService();
    consecutives = { generateNumber: jest.fn().mockResolvedValue('REC-001') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsPayableService,
        { provide: AccountsPayableRepository, useValue: repository },
        { provide: PrismaService, useValue: prisma },
        { provide: ConsecutivesService, useValue: consecutives },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();

    service = module.get<AccountsPayableService>(AccountsPayableService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('delega en el repositorio con los filtros', async () => {
      const result = { data: [], meta: {} };
      repository.findAll!.mockResolvedValue(result as any);
      await expect(service.findAll({} as any)).resolves.toBe(result);
      expect(repository.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('findOne', () => {
    it('devuelve la cuenta cuando existe', async () => {
      const ap = apStub();
      repository.findById!.mockResolvedValue(ap as any);
      await expect(service.findOne('ap-1')).resolves.toBe(ap);
    });

    it('lanza NotFoundException cuando no existe', async () => {
      repository.findById!.mockResolvedValue(null as any);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBeneficiaries', () => {
    it('devuelve empleados activos', async () => {
      const employees = [{ id: 'emp-1' }];
      prisma.employee.findMany.mockResolvedValue(employees as any);
      await expect(service.getBeneficiaries()).resolves.toBe(employees);
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      );
    });
  });

  describe('create', () => {
    it('crea una CP no-anticipo con número generado', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Internet',
        expenseType: { name: 'Servicios' },
      } as any);
      repository.create!.mockResolvedValue({ id: 'ap-new' } as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
      } as any;

      consecutives.generateNumber.mockResolvedValueOnce('125-CP-0001');

      await service.create(dto, 'user-1');

      // Solo Zoom: numeración común por sede, en la sede activa (docs/PLAN_SEDES.md §3).
      expect(consecutives.generateNumber).toHaveBeenCalledWith('ACCOUNT_PAYABLE', 'loc-125');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          apNumber: '125-CP-0001',
          location: { connect: { id: 'loc-125' } },
          totalAmount: 50000,
          paidAmount: 0,
          balance: 50000,
          status: AccountPayableStatus.PENDING,
        }),
      );
    });

    it('rechaza si la orden de gasto ya tiene una CP asociada', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      repository.findByExpenseOrderId!.mockResolvedValue({ id: 'ap-existing' } as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
        expenseOrderId: 'og-1',
      } as any;

      await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('vincula anticipo de nómina cuando tipo=personal y subcategoría=anticipos', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Anticipos',
        expenseType: { name: 'Personal' },
      } as any);
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'period-1', name: 'Agosto' } as any);
      prisma.payrollItem.findUnique.mockResolvedValue({ id: 'item-1' } as any);
      repository.create!.mockResolvedValue({ id: 'ap-adv' } as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
        beneficiaryUserId: 'user-benef',
      } as any;

      await service.create(dto, 'user-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          beneficiaryUser: { connect: { id: 'user-benef' } },
          payrollPeriod: { connect: { id: 'period-1' } },
        }),
      );
    });

    it('no vincula anticipo si no se selecciona beneficiario', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Anticipos',
        expenseType: { name: 'Personal' },
      } as any);
      repository.create!.mockResolvedValue({ id: 'ap-adv' } as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
      } as any;

      await service.create(dto, 'user-1');
      const arg = repository.create!.mock.calls[0][0] as any;
      expect(arg.beneficiaryUser).toBeUndefined();
    });

    it('rechaza anticipo si el beneficiario no tiene ficha de empleado', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Anticipos',
        expenseType: { name: 'Personal' },
      } as any);
      prisma.employee.findUnique.mockResolvedValue(null as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
        beneficiaryUserId: 'user-benef',
      } as any;

      await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rechaza anticipo si no hay periodo de nómina en curso', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Anticipos',
        expenseType: { name: 'Personal' },
      } as any);
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
      prisma.payrollPeriod.findFirst.mockResolvedValue(null as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
        beneficiaryUserId: 'user-benef',
      } as any;

      await expect(service.create(dto, 'user-1')).rejects.toThrow(/periodo de nómina en curso/);
    });

    it('rechaza anticipo si el empleado no está en el periodo en curso', async () => {
      repository.getLastApNumber!.mockResolvedValue(null as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Anticipos',
        expenseType: { name: 'Personal' },
      } as any);
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'period-1', name: 'Agosto' } as any);
      prisma.payrollItem.findUnique.mockResolvedValue(null as any);

      const dto = {
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        totalAmount: 50000,
        dueDate: '2026-09-01',
        beneficiaryUserId: 'user-benef',
      } as any;

      await expect(service.create(dto, 'user-1')).rejects.toThrow(/no está incluido en el periodo/);
    });
  });

  describe('adminAuthorize', () => {
    it('autoriza una CP en estado PENDING', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.adminAuthorize('ap-1', 'admin-1');

      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({
          status: AccountPayableStatus.ADMIN_AUTHORIZED,
          authorizedBy: { connect: { id: 'admin-1' } },
        }),
      );
    });

    it('rechaza si la CP no está en PENDING', async () => {
      repository.findById!.mockResolvedValue(apStub({ status: AccountPayableStatus.PARTIAL }) as any);
      await expect(service.adminAuthorize('ap-1', 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('rechaza editar una CP pagada o anulada', async () => {
      repository.findById!.mockResolvedValue(apStub({ status: AccountPayableStatus.PAID }) as any);
      await expect(service.update('ap-1', {} as any)).rejects.toThrow(/No se puede editar/);
    });

    it('rechaza cambiar el total cuando ya hay pagos', async () => {
      repository.findById!.mockResolvedValue(apStub({ paidAmount: 30000 }) as any);
      await expect(service.update('ap-1', { totalAmount: 90000 } as any)).rejects.toThrow(
        /monto total/,
      );
    });

    it('recalcula el balance al cambiar el total sin pagos', async () => {
      repository.findById!.mockResolvedValue(apStub({ paidAmount: 0 }) as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.update('ap-1', { totalAmount: 120000 } as any);

      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({ totalAmount: 120000, balance: monto(120000) }),
      );
    });

    it('desvincula anticipo cuando deja de serlo', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      prisma.expenseSubcategory.findUnique.mockResolvedValue({
        name: 'Internet',
        expenseType: { name: 'Servicios' },
      } as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.update('ap-1', { expenseSubcategoryId: 'sub-2' } as any);

      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({
          beneficiaryUser: { disconnect: true },
          payrollPeriod: { disconnect: true },
        }),
      );
    });
  });

  describe('cancel', () => {
    it('anula una CP pendiente', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.cancel('ap-1', { cancelReason: 'error' } as any, 'user-1');

      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({
          status: AccountPayableStatus.CANCELLED,
          cancelReason: 'error',
        }),
      );
    });

    it('rechaza anular una CP pagada', async () => {
      repository.findById!.mockResolvedValue(apStub({ status: AccountPayableStatus.PAID }) as any);
      await expect(service.cancel('ap-1', {} as any, 'user-1')).rejects.toThrow(/ya fue pagada/);
    });

    it('rechaza anular una CP ya anulada', async () => {
      repository.findById!.mockResolvedValue(
        apStub({ status: AccountPayableStatus.CANCELLED }) as any,
      );
      await expect(service.cancel('ap-1', {} as any, 'user-1')).rejects.toThrow(/ya está anulada/);
    });
  });

  describe('registerPayment', () => {
    const paymentDto = {
      amount: 40000,
      paymentMethod: 'CASH',
      paymentDate: '2026-08-20',
    } as any;

    it('registra un pago parcial sin caja', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.createPayment!.mockResolvedValue({ id: 'pay-1' } as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.registerPayment('ap-1', paymentDto, 'user-1');

      expect(repository.createPayment).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({
          paidAmount: monto(40000),
          balance: monto(60000),
          status: AccountPayableStatus.PARTIAL,
        }),
      );
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    });

    it('marca la CP como PAID cuando el pago cubre el saldo', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.createPayment!.mockResolvedValue({ id: 'pay-1' } as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.registerPayment('ap-1', { ...paymentDto, amount: 100000 }, 'user-1');

      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({ status: AccountPayableStatus.PAID, balance: monto(0) }),
      );
    });

    it('rechaza pago en una CP anulada', async () => {
      repository.findById!.mockResolvedValue(
        apStub({ status: AccountPayableStatus.CANCELLED }) as any,
      );
      await expect(service.registerPayment('ap-1', paymentDto, 'user-1')).rejects.toThrow(
        /cuenta anulada/,
      );
    });

    it('rechaza pago en una CP ya pagada', async () => {
      repository.findById!.mockResolvedValue(apStub({ status: AccountPayableStatus.PAID }) as any);
      await expect(service.registerPayment('ap-1', paymentDto, 'user-1')).rejects.toThrow(
        /ya está completamente pagada/,
      );
    });

    it('rechaza si el pago supera el saldo pendiente', async () => {
      repository.findById!.mockResolvedValue(apStub({ balance: 30000 }) as any);
      await expect(service.registerPayment('ap-1', paymentDto, 'user-1')).rejects.toThrow(
        /supera el saldo pendiente/,
      );
    });

    it('registra el movimiento de caja cuando se indica una sesión abierta', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs-1', status: 'OPEN' } as any);
      prisma.cashMovement.create.mockResolvedValue({ id: 'cm-1' } as any);
      repository.createPayment!.mockResolvedValue({ id: 'pay-1' } as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.registerPayment('ap-1', { ...paymentDto, cashSessionId: 'cs-1' }, 'user-1');

      expect(prisma.cashMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: 'EXPENSE',
            referenceType: 'ACCOUNT_PAYABLE',
            referenceId: 'ap-1',
          }),
        }),
      );
      expect(repository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ cashMovement: { connect: { id: 'cm-1' } } }),
      );
    });

    it('rechaza si la sesión de caja indicada no está abierta', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs-1', status: 'CLOSED' } as any);

      await expect(
        service.registerPayment('ap-1', { ...paymentDto, cashSessionId: 'cs-1' }, 'user-1'),
      ).rejects.toThrow(/sesión de caja/);
    });
  });

  describe('registerPaymentFromAuthRequest', () => {
    const dto = { amount: 40000, paymentMethod: 'CASH', paymentDate: '2026-08-20' } as any;

    it('busca la sesión de caja abierta y vincula la solicitud de autorización', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      prisma.cashSession.findMany.mockResolvedValue([{ id: 'cs-open', cashRegisterId: 'cr-1' }] as any);
      prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs-open', status: 'OPEN' } as any);
      prisma.cashMovement.create.mockResolvedValue({ id: 'cm-1' } as any);
      repository.createPayment!.mockResolvedValue({ id: 'pay-1' } as any);
      repository.update!.mockResolvedValue({ id: 'ap-1' } as any);

      await service.registerPaymentFromAuthRequest('ap-1', dto, 'user-1', 'req-1');

      expect(repository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ paymentAuthRequest: { connect: { id: 'req-1' } } }),
      );
    });

    it('rechaza si la CP está anulada', async () => {
      repository.findById!.mockResolvedValue(
        apStub({ status: AccountPayableStatus.CANCELLED }) as any,
      );
      await expect(
        service.registerPaymentFromAuthRequest('ap-1', dto, 'user-1', 'req-1'),
      ).rejects.toThrow(/cuenta anulada/);
    });
  });

  describe('getPaymentHistory', () => {
    it('valida existencia y delega en el repositorio', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.getPaymentHistory!.mockResolvedValue([] as any);
      await service.getPaymentHistory('ap-1');
      expect(repository.getPaymentHistory).toHaveBeenCalledWith('ap-1');
    });
  });

  // Anular un pago de CP no es borrarlo: la fila sobrevive marcada, el
  // movimiento de caja se anula y el saldo se recalcula desde los pagos vivos.
  // Antes borraba la fila y dejaba la caja registrando una salida que ya no
  // existía: 185 de los 187 pagos de CP en producción tienen movimiento.
  describe('deletePayment', () => {
    const pagoStub = (extra: Record<string, unknown> = {}) => ({
      id: 'pay-1',
      accountPayableId: 'ap-1',
      amount: new Prisma.Decimal(20000),
      cashMovementId: 'mov-1',
      isReversed: false,
      ...extra,
    });

    /** Corre el callback de la transacción con el mock de prisma como `tx`. */
    const conTransaccion = (pagosVivos: Array<{ amount: Prisma.Decimal }>) => {
      prisma.accountPayablePayment.update.mockResolvedValue({} as any);
      prisma.accountPayablePayment.findMany.mockResolvedValue(pagosVivos as any);
      prisma.cashMovement.update.mockResolvedValue({} as any);
      prisma.accountPayable.update.mockResolvedValue({} as any);
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(prisma));
    };

    it('marca el pago como anulado en vez de borrarlo', async () => {
      repository.findById!.mockResolvedValue(apStub({ totalAmount: 100000 }) as any);
      repository.findPaymentById!.mockResolvedValue(pagoStub() as any);
      conTransaccion([{ amount: new Prisma.Decimal(40000) }]);

      await service.deletePayment('ap-1', 'pay-1', 'user-1');

      expect(prisma.accountPayablePayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-1' },
          data: expect.objectContaining({ isReversed: true }),
        }),
      );
      expect(prisma.accountPayablePayment.delete).not.toHaveBeenCalled();
    });

    // El bug: la CP volvía a deber pero la caja seguía contando la salida.
    it('anula el movimiento de caja asociado', async () => {
      repository.findById!.mockResolvedValue(apStub({ totalAmount: 100000 }) as any);
      repository.findPaymentById!.mockResolvedValue(pagoStub() as any);
      conTransaccion([]);

      await service.deletePayment('ap-1', 'pay-1', 'user-1');

      expect(prisma.cashMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mov-1' },
          data: expect.objectContaining({ isVoided: true, voidedById: 'user-1' }),
        }),
      );
    });

    it('no toca la caja cuando el pago no tuvo movimiento', async () => {
      repository.findById!.mockResolvedValue(apStub({ totalAmount: 100000 }) as any);
      repository.findPaymentById!.mockResolvedValue(
        pagoStub({ cashMovementId: null }) as any,
      );
      conTransaccion([]);

      await service.deletePayment('ap-1', 'pay-1', 'user-1');

      expect(prisma.cashMovement.update).not.toHaveBeenCalled();
    });

    // El saldo se recalcula desde los pagos vivos, no restando del acumulado:
    // una CP que ya venía descuadrada se corrige sola al anular.
    it('recalcula el saldo desde los pagos que siguen vivos', async () => {
      repository.findById!.mockResolvedValue(
        apStub({ totalAmount: 100000, paidAmount: 999999, balance: -1 }) as any,
      );
      repository.findPaymentById!.mockResolvedValue(pagoStub() as any);
      conTransaccion([{ amount: new Prisma.Decimal(40000) }]);

      await service.deletePayment('ap-1', 'pay-1', 'user-1');

      const data = (prisma.accountPayable.update as jest.Mock).mock.calls[0][0].data;
      expect(data.paidAmount.toString()).toBe('40000');
      expect(data.balance.toString()).toBe('60000');
      expect(data.status).toBe(AccountPayableStatus.PARTIAL);
    });

    it('vuelve a PENDING cuando se anula el único pago', async () => {
      repository.findById!.mockResolvedValue(apStub({ totalAmount: 100000 }) as any);
      repository.findPaymentById!.mockResolvedValue(pagoStub() as any);
      conTransaccion([]);

      await service.deletePayment('ap-1', 'pay-1', 'user-1');

      const data = (prisma.accountPayable.update as jest.Mock).mock.calls[0][0].data;
      expect(data.paidAmount.toString()).toBe('0');
      expect(data.status).toBe(AccountPayableStatus.PENDING);
    });

    it('no deja anular dos veces el mismo pago', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findPaymentById!.mockResolvedValue(
        pagoStub({ isReversed: true }) as any,
      );

      await expect(
        service.deletePayment('ap-1', 'pay-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el pago no pertenece a la CP', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findPaymentById!.mockResolvedValue(
        pagoStub({ accountPayableId: 'otra' }) as any,
      );
      await expect(service.deletePayment('ap-1', 'pay-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSummary', () => {
    it('delega en el repositorio', async () => {
      repository.getSummary!.mockResolvedValue({ totalPending: 0 } as any);
      await service.getSummary();
      expect(repository.getSummary).toHaveBeenCalled();
    });
  });

  describe('syncFromExpenseOrder', () => {
    it('no hace nada si la CP no existe', async () => {
      repository.findById!.mockResolvedValue(null as any);
      await service.syncFromExpenseOrder('ap-1', { totalAmount: 5000 });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('recalcula balance y actualiza el total', async () => {
      repository.findById!.mockResolvedValue(apStub({ paidAmount: 10000 }) as any);
      repository.update!.mockResolvedValue({} as any);
      await service.syncFromExpenseOrder('ap-1', { totalAmount: 70000 });
      expect(repository.update).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({ totalAmount: 70000, balance: monto(60000) }),
      );
    });

    it('no actualiza si no hay cambios', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      await service.syncFromExpenseOrder('ap-1', {});
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('createFromExpenseOrder', () => {
    it('devuelve la CP existente si ya hay una para la OG', async () => {
      repository.findByExpenseOrderId!.mockResolvedValue({ id: 'ap-existing' } as any);
      const result = await service.createFromExpenseOrder('og-1', 'desc', 5000, 'user-1');
      expect(result).toEqual({ id: 'ap-existing' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('lanza error si la orden de gasto no existe', async () => {
      repository.findByExpenseOrderId!.mockResolvedValue(null as any);
      prisma.expenseOrder.findUnique.mockResolvedValue(null as any);
      await expect(
        service.createFromExpenseOrder('og-1', 'desc', 5000, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea la CP a partir de la OG con vencimiento a 30 días', async () => {
      repository.findByExpenseOrderId!.mockResolvedValue(null as any);
      prisma.expenseOrder.findUnique.mockResolvedValue({
        expenseTypeId: 'type-1',
        expenseSubcategoryId: 'sub-1',
        applyIva: true,
        ivaRate: 0.19,
      } as any);
      repository.getLastApNumber!.mockResolvedValue(null as any);
      repository.create!.mockResolvedValue({ id: 'ap-new' } as any);

      await service.createFromExpenseOrder('og-1', 'Compra', 80000, 'user-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 80000,
          balance: 80000,
          expenseOrder: { connect: { id: 'og-1' } },
        }),
      );
    });
  });

  /**
   * La CP espejo de una OG y la OG misma pagan por rutas distintas: los ítems de
   * la OG generan su `CashMovement` al autorizar Caja, la CP genera el suyo al
   * registrar un pago. Ninguna miraba a la otra, así que una OG pagada dejaba su
   * CP con el saldo completo y volvía a ser pagable.
   */
  describe('pagos girados por la Orden de Gasto', () => {
    /** Deja la CP `ap-1` vinculada a `og-1` con los movimientos de caja dados. */
    const conMovimientosDeOG = (movimientos: Array<Record<string, unknown>>) => {
      prisma.accountPayable.findUnique.mockResolvedValue({ expenseOrderId: 'og-1' } as any);
      prisma.cashMovement.findMany.mockResolvedValue(movimientos as any);
    };

    describe('assertPayableAmount', () => {
      it('descuenta del tope lo ya girado por la OG', async () => {
        conMovimientosDeOG([{ amount: new Prisma.Decimal(100000) }]);

        await expect(
          service.assertPayableAmount(apStub(), 100000),
        ).rejects.toThrow(/ya tiene .* pagados a través de su Orden de Gasto/);
      });

      it('deja pasar la diferencia cuando la OG solo cubre una parte', async () => {
        conMovimientosDeOG([{ amount: new Prisma.Decimal(80000) }]);

        await expect(service.assertPayableAmount(apStub(), 20000)).resolves.toBeUndefined();
        await expect(service.assertPayableAmount(apStub(), 20001)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('ignora los movimientos anulados', async () => {
        // El filtro `isVoided: false` va en la consulta: acá se comprueba que se
        // pida así, porque un movimiento anulado es dinero que volvió a la caja.
        conMovimientosDeOG([]);

        await expect(service.assertPayableAmount(apStub(), 100000)).resolves.toBeUndefined();
        expect(prisma.cashMovement.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ isVoided: false, referenceId: 'og-1' }),
          }),
        );
      });

      it('no vuelve a descontar los movimientos que la CP ya refleja como pagos', async () => {
        // CP-2026-633 en PRD: la OG giró la base ($1.368.855), la conciliación la
        // reflejó como pago de la CP y en `balance` quedó solo el IVA ($260.082).
        // Restar otra vez la base dejaba el disponible en $0 y el IVA impagable.
        prisma.accountPayable.findUnique.mockResolvedValue({ expenseOrderId: 'og-1' } as any);
        const movimientos = [
          { amount: new Prisma.Decimal(1368855), accountPayablePayment: { id: 'pay-1' } },
        ];
        // Replica el filtro de la base: con `accountPayablePayment: { is: null }`
        // solo vuelven los movimientos que ningún pago de CP refleja todavía.
        prisma.cashMovement.findMany.mockImplementation((async (args: any) =>
          args?.where?.accountPayablePayment?.is === null
            ? movimientos.filter((m) => !m.accountPayablePayment)
            : movimientos) as any);
        const ap = apStub({ totalAmount: 1628937, paidAmount: 1368855, balance: 260082 });

        await expect(service.assertPayableAmount(ap, 260082)).resolves.toBeUndefined();
        await expect(service.assertPayableAmount(ap, 260083)).rejects.toThrow(
          /supera el saldo pendiente/,
        );
      });

      it('sigue descontando lo girado por la OG en una CP histórica sin conciliar', async () => {
        // La otra mitad del filtro: un movimiento sin pago de CP es dinero que ya
        // salió y la CP no muestra, así que el tope lo sigue restando.
        prisma.accountPayable.findUnique.mockResolvedValue({ expenseOrderId: 'og-1' } as any);
        const movimientos = [{ amount: new Prisma.Decimal(100000), accountPayablePayment: null }];
        prisma.cashMovement.findMany.mockImplementation((async (args: any) =>
          args?.where?.accountPayablePayment?.is === null
            ? movimientos.filter((m) => !m.accountPayablePayment)
            : movimientos) as any);

        await expect(service.assertPayableAmount(apStub(), 1)).rejects.toThrow(
          /ya tiene .* pagados a través de su Orden de Gasto/,
        );
      });

      it('sin OG asociada mantiene el mensaje de saldo de siempre', async () => {
        prisma.accountPayable.findUnique.mockResolvedValue({ expenseOrderId: null } as any);

        await expect(service.assertPayableAmount(apStub(), 150000)).rejects.toThrow(
          /supera el saldo pendiente/,
        );
      });

      it('bloquea el pago en registerPayment cuando la OG ya lo cubrió', async () => {
        repository.findById!.mockResolvedValue(apStub() as any);
        conMovimientosDeOG([{ amount: new Prisma.Decimal(100000) }]);

        await expect(
          service.registerPayment('ap-1', { amount: 50000, paymentMethod: 'CASH', paymentDate: '2026-09-08' } as any, 'user-1'),
        ).rejects.toThrow(/Orden de Gasto/);
        expect(repository.createPayment).not.toHaveBeenCalled();
      });
    });

    describe('settleFromExpenseOrderMovements', () => {
      const movStub = (extra: Record<string, unknown> = {}) => ({
        id: 'mov-1',
        amount: new Prisma.Decimal(100000),
        paymentMethod: 'CASH',
        createdAt: new Date('2026-09-08T22:32:37Z'),
        performedById: 'caja-1',
        ...extra,
      });

      const conTransaccion = (pagosVivos: Array<{ amount: Prisma.Decimal }>) => {
        prisma.accountPayablePayment.create.mockResolvedValue({} as any);
        prisma.accountPayablePayment.findMany.mockResolvedValue(pagosVivos as any);
        prisma.accountPayable.update.mockResolvedValue({} as any);
        (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(prisma));
      };

      it('refleja el movimiento como abono y deja la CP en PAID', async () => {
        repository.findByExpenseOrderId!.mockResolvedValue(apStub() as any);
        prisma.cashMovement.findMany.mockResolvedValue([movStub()] as any);
        conTransaccion([{ amount: new Prisma.Decimal(100000) }]);

        await service.settleFromExpenseOrderMovements('og-1', 'user-1');

        expect(prisma.accountPayablePayment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              accountPayableId: 'ap-1',
              cashMovementId: 'mov-1',
              registeredById: 'caja-1',
            }),
          }),
        );
        expect(prisma.accountPayable.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              balance: monto(0),
              status: AccountPayableStatus.PAID,
            }),
          }),
        );
      });

      it('deja PARTIAL cuando los movimientos no cubren el total (IVA)', async () => {
        repository.findByExpenseOrderId!.mockResolvedValue(apStub({ totalAmount: 119000 }) as any);
        prisma.cashMovement.findMany.mockResolvedValue([movStub()] as any);
        conTransaccion([{ amount: new Prisma.Decimal(100000) }]);

        await service.settleFromExpenseOrderMovements('og-1', 'user-1');

        expect(prisma.accountPayable.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              balance: monto(19000),
              status: AccountPayableStatus.PARTIAL,
            }),
          }),
        );
      });

      it('no crea nada si los movimientos ya están reflejados', async () => {
        repository.findByExpenseOrderId!.mockResolvedValue(apStub() as any);
        prisma.cashMovement.findMany.mockResolvedValue([] as any);

        await service.settleFromExpenseOrderMovements('og-1', 'user-1');

        expect(prisma.accountPayablePayment.create).not.toHaveBeenCalled();
        expect(prisma.accountPayable.update).not.toHaveBeenCalled();
      });

      it('no toca una CP anulada', async () => {
        repository.findByExpenseOrderId!.mockResolvedValue(
          apStub({ status: AccountPayableStatus.CANCELLED }) as any,
        );

        await service.settleFromExpenseOrderMovements('og-1', 'user-1');

        expect(prisma.cashMovement.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('attachments', () => {
    it('agrega un adjunto', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.createAttachment!.mockResolvedValue({ id: 'att-1' } as any);
      await service.addAttachment(
        'ap-1',
        { fileUrl: 'u', fileName: 'f', fileType: 'pdf' } as any,
        'user-1',
      );
      expect(repository.createAttachment).toHaveBeenCalled();
    });

    it('elimina un adjunto existente', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findAttachmentById!.mockResolvedValue({
        id: 'att-1',
        accountPayableId: 'ap-1',
      } as any);
      repository.deleteAttachment!.mockResolvedValue({} as any);
      await expect(service.removeAttachment('ap-1', 'att-1')).resolves.toEqual({ success: true });
    });

    it('lanza NotFound si el adjunto no pertenece a la CP', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findAttachmentById!.mockResolvedValue({
        id: 'att-1',
        accountPayableId: 'otra',
      } as any);
      await expect(service.removeAttachment('ap-1', 'att-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('installments', () => {
    it('rechaza definir cuotas en una CP anulada', async () => {
      repository.findById!.mockResolvedValue(
        apStub({ status: AccountPayableStatus.CANCELLED }) as any,
      );
      await expect(
        service.setInstallments('ap-1', { installments: [] } as any, 'user-1'),
      ).rejects.toThrow(/anulada/);
    });

    it('rechaza cuotas cuya suma no coincide con el total', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      await expect(
        service.setInstallments(
          'ap-1',
          { installments: [{ amount: 50000, dueDate: '2026-09-01' }] } as any,
          'user-1',
        ),
      ).rejects.toThrow(/no coincide con el total/);
    });

    it('acepta cuotas cuya suma coincide (tolerancia 1)', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.setInstallments!.mockResolvedValue([] as any);
      await service.setInstallments(
        'ap-1',
        {
          installments: [
            { amount: 50000, dueDate: '2026-09-01' },
            { amount: 50000, dueDate: '2026-10-01' },
          ],
        } as any,
        'user-1',
      );
      expect(repository.setInstallments).toHaveBeenCalled();
    });

    it('marca una cuota como pagada', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findInstallmentById!.mockResolvedValue({
        id: 'inst-1',
        accountPayableId: 'ap-1',
      } as any);
      repository.updateInstallment!.mockResolvedValue({} as any);

      await service.toggleInstallmentPaid('ap-1', 'inst-1', { isPaid: true } as any, 'user-1');

      expect(repository.updateInstallment).toHaveBeenCalledWith(
        'inst-1',
        expect.objectContaining({ isPaid: true, paidBy: { connect: { id: 'user-1' } } }),
      );
    });

    it('lanza NotFound al alternar una cuota inexistente', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findInstallmentById!.mockResolvedValue(null as any);
      await expect(
        service.toggleInstallmentPaid('ap-1', 'inst-1', { isPaid: true } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('elimina una cuota existente', async () => {
      repository.findById!.mockResolvedValue(apStub() as any);
      repository.findInstallmentById!.mockResolvedValue({
        id: 'inst-1',
        accountPayableId: 'ap-1',
      } as any);
      repository.deleteInstallment!.mockResolvedValue({} as any);
      await expect(service.deleteInstallment('ap-1', 'inst-1')).resolves.toEqual({ success: true });
    });
  });

  describe('markOverdueAccounts', () => {
    afterEach(() => jest.useRealTimers());

    // `dueDate` se guarda como la medianoche de Colombia (05:00 UTC). El corte
    // es el inicio de hoy en Colombia: lo que vence hoy todavía no está vencido.
    it('corta en el inicio del día de hoy en hora Colombia', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-15T00:30:00-05:00') });
      repository.markOverdue!.mockResolvedValue({ count: 3 } as any);

      await service.markOverdueAccounts();

      expect(repository.markOverdue).toHaveBeenCalledWith(
        new Date('2026-09-15T05:00:00.000Z'),
      );
    });

    // A las 11:30 p. m. de Colombia en UTC ya es el día siguiente: con el
    // calendario del servidor, lo que vence mañana quedaría vencido esta noche.
    it('no usa el calendario UTC del servidor', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-14T23:30:00-05:00') });
      repository.markOverdue!.mockResolvedValue({ count: 0 } as any);

      await service.markOverdueAccounts();

      expect(repository.markOverdue).toHaveBeenCalledWith(
        new Date('2026-09-14T05:00:00.000Z'),
      );
    });
  });
});
