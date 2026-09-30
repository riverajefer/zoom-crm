import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsPayablePaymentReversalRequestsService } from './accounts-payable-payment-reversal-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createMockPrismaService } from '../../database/prisma.service.mock';
import { ApPaymentReversalStatus, Prisma } from '../../generated/prisma';

const authRequestStub = (overrides: Record<string, any> = {}) => ({
  id: 'auth-1',
  status: 'COMPLETED',
  amount: new Prisma.Decimal(40000),
  accountPayable: { id: 'ap-1', apNumber: 'CP-2026-001' },
  createdPayment: { id: 'pay-1', amount: new Prisma.Decimal(40000), isReversed: false },
  reversalRequest: null,
  ...overrides,
});

const reversalStub = (overrides: Record<string, any> = {}) => ({
  id: 'rev-1',
  status: ApPaymentReversalStatus.PENDING_GERENCIA,
  requestedById: 'user-1',
  reason: 'pago duplicado',
  paymentAuthRequest: {
    amount: new Prisma.Decimal(40000),
    accountPayable: { id: 'ap-1', apNumber: 'CP-2026-001', totalAmount: new Prisma.Decimal(100000) },
    createdPayment: {
      id: 'pay-1',
      amount: new Prisma.Decimal(40000),
      isReversed: false,
      cashMovementId: 'cm-1',
    },
  },
  ...overrides,
});

describe('AccountsPayablePaymentReversalRequestsService', () => {
  let service: AccountsPayablePaymentReversalRequestsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let notifications: { create: jest.Mock; notifyAllAdmins: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
      notifyAllAdmins: jest.fn().mockResolvedValue(undefined),
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.user.findMany.mockResolvedValue([] as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsPayablePaymentReversalRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<AccountsPayablePaymentReversalRequestsService>(
      AccountsPayablePaymentReversalRequestsService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const dto = { paymentAuthRequestId: 'auth-1', reason: 'pago duplicado' } as any;

    it('lanza NotFound si la solicitud de pago no existe', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el pago no está COMPLETED', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        authRequestStub({ status: 'ADMIN_APPROVED' }) as any,
      );
      await expect(service.create('user-1', dto)).rejects.toThrow(/pagos completados/);
    });

    it('rechaza si no hay pago registrado asociado', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        authRequestStub({ createdPayment: null }) as any,
      );
      await expect(service.create('user-1', dto)).rejects.toThrow(/no tiene un pago registrado/);
    });

    it('rechaza si el pago ya fue revertido', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        authRequestStub({
          createdPayment: { id: 'pay-1', amount: new Prisma.Decimal(40000), isReversed: true },
        }) as any,
      );
      await expect(service.create('user-1', dto)).rejects.toThrow(/ya fue revertido/);
    });

    it('rechaza si ya existe una solicitud de reversión', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        authRequestStub({ reversalRequest: { id: 'rev-old' } }) as any,
      );
      await expect(service.create('user-1', dto)).rejects.toThrow(/Ya existe una solicitud/);
    });

    it('crea la reversión y notifica a los admins', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(authRequestStub() as any);
      prisma.accountPayablePaymentReversalRequest.create.mockResolvedValue(reversalStub() as any);

      const result = await service.create('user-1', dto);

      expect(prisma.accountPayablePaymentReversalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentReversalStatus.PENDING_GERENCIA }),
        }),
      );
      expect(notifications.notifyAllAdmins).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('gerenciaApprove', () => {
    it('lanza NotFound si no está en PENDING_GERENCIA', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.gerenciaApprove('rev-1', 'ger-1')).rejects.toThrow(NotFoundException);
    });

    it('avanza a PENDING_CAJA y notifica', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(reversalStub() as any);
      prisma.accountPayablePaymentReversalRequest.update.mockResolvedValue({ id: 'rev-1' } as any);

      await service.gerenciaApprove('rev-1', 'ger-1');

      expect(prisma.accountPayablePaymentReversalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentReversalStatus.PENDING_CAJA }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('gerenciaReject', () => {
    const dto = { rejectionNotes: 'no procede' } as any;

    it('lanza NotFound si no existe', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.gerenciaReject('rev-1', 'ger-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('marca REJECTED_BY_GERENCIA y notifica', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(reversalStub() as any);
      prisma.accountPayablePaymentReversalRequest.update.mockResolvedValue({ id: 'rev-1' } as any);

      await service.gerenciaReject('rev-1', 'ger-1', dto);

      expect(prisma.accountPayablePaymentReversalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentReversalStatus.REJECTED_BY_GERENCIA }),
        }),
      );
    });
  });

  describe('cajaApprove', () => {
    const currentUser = { id: 'caja-1' } as any;

    it('lanza NotFound si no está en PENDING_CAJA', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.cajaApprove('rev-1', currentUser)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el pago ya fue revertido', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(
        reversalStub({
          status: ApPaymentReversalStatus.PENDING_CAJA,
          paymentAuthRequest: {
            amount: new Prisma.Decimal(40000),
            accountPayable: { id: 'ap-1', apNumber: 'CP-2026-001', totalAmount: new Prisma.Decimal(100000) },
            createdPayment: { id: 'pay-1', amount: new Prisma.Decimal(40000), isReversed: true, cashMovementId: 'cm-1' },
          },
        }) as any,
      );
      await expect(service.cajaApprove('rev-1', currentUser)).rejects.toThrow(/ya fue revertido/);
    });

    it('ejecuta la reversión: marca pago revertido, anula CashMovement y recalcula el saldo', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(
        reversalStub({ status: ApPaymentReversalStatus.PENDING_CAJA }) as any,
      );
      prisma.accountPayablePaymentReversalRequest.update.mockResolvedValue({} as any);
      prisma.accountPayablePayment.update.mockResolvedValue({} as any);
      prisma.cashMovement.update.mockResolvedValue({} as any);
      // El saldo se recalcula desde los pagos vivos, no restando del acumulado:
      // era el único pago, así que al revertirlo no queda ninguno → paid 0,
      // balance 100000, PENDING.
      prisma.accountPayablePayment.findMany.mockResolvedValue([] as any);
      prisma.accountPayable.findUniqueOrThrow.mockResolvedValue({
        id: 'ap-1',
        paidAmount: new Prisma.Decimal(40000),
        totalAmount: new Prisma.Decimal(100000),
      } as any);
      prisma.accountPayable.update.mockResolvedValue({} as any);

      const result = await service.cajaApprove('rev-1', currentUser);

      expect(prisma.accountPayablePayment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isReversed: true }) }),
      );
      expect(prisma.cashMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cm-1' },
          data: expect.objectContaining({ isVoided: true }),
        }),
      );
      const apUpdate = prisma.accountPayable.update.mock.calls[0][0].data;
      expect(Number(apUpdate.paidAmount)).toBe(0);
      expect(Number(apUpdate.balance)).toBe(100000);
      expect(apUpdate.status).toBe('PENDING');
      expect(result).toEqual({ success: true, reversalId: 'rev-1', accountPayableId: 'ap-1' });
    });

    // Con otros pagos vivos, el saldo no vuelve a cero: se recalcula desde lo
    // que sigue en pie, así que una CP descuadrada se corrige sola al revertir.
    it('recalcula el saldo desde los pagos que siguen vivos', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(
        reversalStub({ status: ApPaymentReversalStatus.PENDING_CAJA }) as any,
      );
      prisma.accountPayablePaymentReversalRequest.update.mockResolvedValue({} as any);
      prisma.accountPayablePayment.update.mockResolvedValue({} as any);
      prisma.cashMovement.update.mockResolvedValue({} as any);
      prisma.accountPayablePayment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(25000) },
      ] as any);
      prisma.accountPayable.findUniqueOrThrow.mockResolvedValue({
        id: 'ap-1',
        // Acumulado inconsistente a propósito: si el código restara sobre este
        // valor, el resultado quedaría mal.
        paidAmount: new Prisma.Decimal(999999),
        totalAmount: new Prisma.Decimal(100000),
      } as any);
      prisma.accountPayable.update.mockResolvedValue({} as any);

      await service.cajaApprove('rev-1', currentUser);

      const apUpdate = prisma.accountPayable.update.mock.calls[0][0].data;
      expect(Number(apUpdate.paidAmount)).toBe(25000);
      expect(Number(apUpdate.balance)).toBe(75000);
      expect(apUpdate.status).toBe('PARTIAL');
    });
  });

  describe('cajaReject', () => {
    const currentUser = { id: 'caja-1' } as any;
    const dto = { rejectionNotes: 'no' } as any;

    it('lanza NotFound si no está en PENDING_CAJA', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.cajaReject('rev-1', currentUser, dto)).rejects.toThrow(NotFoundException);
    });

    it('marca REJECTED_BY_CAJA y notifica', async () => {
      prisma.accountPayablePaymentReversalRequest.findFirst.mockResolvedValue(
        reversalStub({ status: ApPaymentReversalStatus.PENDING_CAJA }) as any,
      );
      prisma.accountPayablePaymentReversalRequest.update.mockResolvedValue({ id: 'rev-1' } as any);

      await service.cajaReject('rev-1', currentUser, dto);

      expect(prisma.accountPayablePaymentReversalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentReversalStatus.REJECTED_BY_CAJA }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('queries', () => {
    it('findPendingGerencia filtra por PENDING_GERENCIA', async () => {
      prisma.accountPayablePaymentReversalRequest.findMany.mockResolvedValue([] as any);
      await service.findPendingGerencia();
      expect(prisma.accountPayablePaymentReversalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: ApPaymentReversalStatus.PENDING_GERENCIA, paymentAuthRequest: { accountPayable: {} } } }),
      );
    });

    it('findPendingCaja filtra por PENDING_CAJA', async () => {
      prisma.accountPayablePaymentReversalRequest.findMany.mockResolvedValue([] as any);
      await service.findPendingCaja();
      expect(prisma.accountPayablePaymentReversalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: ApPaymentReversalStatus.PENDING_CAJA, paymentAuthRequest: { accountPayable: {} } } }),
      );
    });

    it('findAll devuelve todas', async () => {
      prisma.accountPayablePaymentReversalRequest.findMany.mockResolvedValue([] as any);
      await service.findAll();
      expect(prisma.accountPayablePaymentReversalRequest.findMany).toHaveBeenCalled();
    });

    it('findOne devuelve la reversión', async () => {
      prisma.accountPayablePaymentReversalRequest.findUnique.mockResolvedValue(reversalStub() as any);
      await expect(service.findOne('rev-1')).resolves.toBeDefined();
    });

    it('findOne lanza NotFound', async () => {
      prisma.accountPayablePaymentReversalRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.findOne('rev-1')).rejects.toThrow(NotFoundException);
    });

    it('findByPaymentAuthRequest filtra por la solicitud de pago', async () => {
      prisma.accountPayablePaymentReversalRequest.findUnique.mockResolvedValue(null as any);
      await service.findByPaymentAuthRequest('auth-1');
      expect(prisma.accountPayablePaymentReversalRequest.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { paymentAuthRequestId: 'auth-1' } }),
      );
    });
  });
});
