import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountsPayablePaymentAuthRequestsService } from './accounts-payable-payment-auth-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { createMockPrismaService } from '../../database/prisma.service.mock';
import { ApPaymentAuthRequestStatus, ApprovalRequestType, Prisma } from '../../generated/prisma';

const apStub = (overrides: Record<string, any> = {}) => ({
  id: 'ap-1',
  apNumber: 'CP-2026-001',
  status: 'PENDING',
  balance: new Prisma.Decimal(100000),
  ...overrides,
});

const requestStub = (overrides: Record<string, any> = {}) => ({
  id: 'req-1',
  status: ApPaymentAuthRequestStatus.PENDING,
  requestedById: 'user-1',
  accountPayableId: 'ap-1',
  amount: new Prisma.Decimal(40000),
  paymentMethod: 'CASH',
  paymentDate: new Date('2026-08-20'),
  reference: null,
  notes: null,
  bankEntity: null,
  receiptFileId: null,
  accountPayable: { id: 'ap-1', apNumber: 'CP-2026-001' },
  requestedBy: { id: 'user-1', email: 'u@e.com', firstName: 'Ana', lastName: 'Gómez' },
  ...overrides,
});

describe('AccountsPayablePaymentAuthRequestsService', () => {
  let service: AccountsPayablePaymentAuthRequestsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let notifications: { create: jest.Mock; notifyAllAdmins: jest.Mock };
  let whatsapp: {
    sendApprovalNotification: jest.Mock;
    sendTextMessage: jest.Mock;
    getAdminPhones: jest.Mock;
    getPhonesByPermission: jest.Mock;
  };
  let registry: { register: jest.Mock };
  let accountsPayable: { registerPaymentFromAuthRequest: jest.Mock; assertPayableAmount: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
      notifyAllAdmins: jest.fn().mockResolvedValue(undefined),
    };
    whatsapp = {
      sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
      getAdminPhones: jest.fn().mockResolvedValue(['573212016229']),
      getPhonesByPermission: jest.fn().mockResolvedValue(['573118322699']),
    };
    registry = { register: jest.fn() };
    accountsPayable = {
      registerPaymentFromAuthRequest: jest.fn().mockResolvedValue({ id: 'pay-1' }),
      assertPayableAmount: jest.fn().mockResolvedValue(undefined),
    };
    // Sin admins/caja con teléfono → los helpers de WhatsApp no envían nada.
    prisma.user.findMany.mockResolvedValue([] as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsPayablePaymentAuthRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: WhatsappService, useValue: whatsapp },
        { provide: ApprovalRequestRegistry, useValue: registry },
        { provide: AccountsPayableService, useValue: accountsPayable },
      ],
    }).compile();

    service = module.get<AccountsPayablePaymentAuthRequestsService>(
      AccountsPayablePaymentAuthRequestsService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('onModuleInit', () => {
    it('registra el handler AP_PAYMENT_AUTH', () => {
      service.onModuleInit();
      expect(registry.register).toHaveBeenCalledWith(ApprovalRequestType.AP_PAYMENT_AUTH, service);
    });
  });

  describe('findPendingRequest', () => {
    it('devuelve null si no existe', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.findPendingRequest('req-1')).resolves.toBeNull();
    });

    it('devuelve la info de la solicitud', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        requestStub({ accountPayable: { apNumber: 'CP-2026-001' } }) as any,
      );
      const info = await service.findPendingRequest('req-1');
      expect(info?.displayLabel).toContain('CP-2026-001');
    });
  });

  describe('approveViaWhatsApp', () => {
    it('no hace nada si no está pendiente', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        requestStub({ status: ApPaymentAuthRequestStatus.ADMIN_APPROVED }) as any,
      );
      await service.approveViaWhatsApp('req-1', 'admin-1');
      expect(prisma.accountPayablePaymentAuthRequest.update).not.toHaveBeenCalled();
    });

    it('aprueba (admin) vía WhatsApp y notifica a Caja', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        requestStub({ accountPayable: { apNumber: 'CP-2026-001' } }) as any,
      );
      prisma.accountPayablePaymentAuthRequest.update.mockResolvedValue({} as any);

      await service.approveViaWhatsApp('req-1', 'admin-1');

      expect(prisma.accountPayablePaymentAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentAuthRequestStatus.ADMIN_APPROVED }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('rejectViaWhatsApp', () => {
    it('rechaza vía WhatsApp y notifica', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(
        requestStub({ accountPayable: { apNumber: 'CP-2026-001' } }) as any,
      );
      prisma.accountPayablePaymentAuthRequest.update.mockResolvedValue({} as any);

      await service.rejectViaWhatsApp('req-1', 'admin-1');

      expect(prisma.accountPayablePaymentAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentAuthRequestStatus.ADMIN_REJECTED }),
        }),
      );
    });
  });

  describe('create', () => {
    const dto = {
      accountPayableId: 'ap-1',
      amount: 40000,
      paymentMethod: 'CASH',
      paymentDate: '2026-08-20',
    } as any;

    it('lanza NotFound si la CP no existe', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(null as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la CP está anulada', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub({ status: 'CANCELLED' }) as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(/cuenta anulada/);
    });

    it('rechaza si la CP ya está pagada', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub({ status: 'PAID' }) as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(/completamente pagada/);
    });

    // El tope lo calcula `AccountsPayableService.assertPayableAmount`, que además
    // del saldo descuenta lo ya girado por la Orden de Gasto asociada. Acá solo
    // se verifica que la solicitud pase por ahí y no siga de largo si rechaza.
    it('delega el tope del monto en AccountsPayableService', async () => {
      const ap = apStub({ balance: new Prisma.Decimal(30000) });
      prisma.accountPayable.findUnique.mockResolvedValue(ap as any);
      accountsPayable.assertPayableAmount.mockRejectedValue(
        new BadRequestException('El monto del pago (50000) supera el saldo pendiente (30000)'),
      );

      await expect(service.create('user-1', dto)).rejects.toThrow(/supera el saldo pendiente/);
      expect(accountsPayable.assertPayableAmount).toHaveBeenCalledWith(ap, dto.amount);
      expect(prisma.accountPayablePaymentAuthRequest.create).not.toHaveBeenCalled();
    });

    it('rechaza si el usuario ya tiene una solicitud pendiente', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub() as any);
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue({ id: 'req-old' } as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(/solicitud de pago pendiente/);
    });

    it('crea la solicitud y notifica a los admins', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub() as any);
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(null as any);
      prisma.user.findUnique.mockResolvedValue({ firstName: 'Ana', role: { name: 'asesor' } } as any);
      prisma.accountPayablePaymentAuthRequest.create.mockResolvedValue(requestStub() as any);

      const result = await service.create('user-1', dto);

      expect(prisma.accountPayablePaymentAuthRequest.create).toHaveBeenCalled();
      expect(notifications.notifyAllAdmins).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('adminApprove', () => {
    const dto = { adminNotes: 'ok' } as any;

    it('lanza NotFound si no está pendiente', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.adminApprove('req-1', 'admin-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el revisor no es admin', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'asesor' } } as any);
      await expect(service.adminApprove('req-1', 'admin-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('aprueba y notifica a Caja', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'admin' } } as any);
      prisma.accountPayablePaymentAuthRequest.update.mockResolvedValue({ id: 'req-1' } as any);

      await service.adminApprove('req-1', 'admin-1', dto);

      expect(prisma.accountPayablePaymentAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentAuthRequestStatus.ADMIN_APPROVED }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('adminReject', () => {
    const dto = { adminNotes: 'no' } as any;

    it('rechaza si el revisor no es admin', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'asesor' } } as any);
      await expect(service.adminReject('req-1', 'admin-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza la solicitud y notifica', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'admin' } } as any);
      prisma.accountPayablePaymentAuthRequest.update.mockResolvedValue({ id: 'req-1' } as any);

      await service.adminReject('req-1', 'admin-1', dto);

      expect(prisma.accountPayablePaymentAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentAuthRequestStatus.ADMIN_REJECTED }),
        }),
      );
    });
  });

  describe('cajaApprove', () => {
    const currentUser = { id: 'caja-1' } as any;

    it('lanza NotFound si no está en ADMIN_APPROVED', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.cajaApprove('req-1', currentUser)).rejects.toThrow(NotFoundException);
    });

    it('completa la solicitud y registra el pago real', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(
        requestStub({
          status: ApPaymentAuthRequestStatus.ADMIN_APPROVED,
          accountPayable: { apNumber: 'CP-2026-001', id: 'ap-1' },
        }) as any,
      );
      prisma.accountPayablePaymentAuthRequest.update.mockResolvedValue({} as any);

      const result = await service.cajaApprove('req-1', currentUser);

      expect(prisma.accountPayablePaymentAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApPaymentAuthRequestStatus.COMPLETED }),
        }),
      );
      expect(accountsPayable.registerPaymentFromAuthRequest).toHaveBeenCalledWith(
        'ap-1',
        expect.objectContaining({ amount: 40000, paymentMethod: 'CASH' }),
        'caja-1',
        'req-1',
      );
      expect(result).toEqual({ id: 'pay-1' });
    });
  });

  describe('cajaReject', () => {
    const currentUser = { id: 'caja-1' } as any;
    const dto = { reason: 'sin fondos' } as any;

    it('lanza NotFound si no está en ADMIN_APPROVED', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.cajaReject('req-1', dto, currentUser)).rejects.toThrow(NotFoundException);
    });

    it('marca CAJA_REJECTED y notifica', async () => {
      prisma.accountPayablePaymentAuthRequest.findFirst.mockResolvedValue(
        requestStub({ status: ApPaymentAuthRequestStatus.ADMIN_APPROVED }) as any,
      );
      prisma.accountPayablePaymentAuthRequest.update.mockResolvedValue({ id: 'req-1' } as any);

      await service.cajaReject('req-1', dto, currentUser);

      expect(prisma.accountPayablePaymentAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApPaymentAuthRequestStatus.CAJA_REJECTED,
            cajaRejectionReason: 'sin fondos',
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('queries', () => {
    it('findPendingAdmin filtra por PENDING', async () => {
      prisma.accountPayablePaymentAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findPendingAdmin();
      expect(prisma.accountPayablePaymentAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: ApPaymentAuthRequestStatus.PENDING, accountPayable: {} } }),
      );
    });

    it('findPendingCaja filtra por ADMIN_APPROVED', async () => {
      prisma.accountPayablePaymentAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findPendingCaja();
      expect(prisma.accountPayablePaymentAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: ApPaymentAuthRequestStatus.ADMIN_APPROVED, accountPayable: {} } }),
      );
    });

    it('findByUser filtra por solicitante', async () => {
      prisma.accountPayablePaymentAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findByUser('user-1');
      expect(prisma.accountPayablePaymentAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { requestedById: 'user-1' } }),
      );
    });

    it('findByAccountPayable filtra por CP', async () => {
      prisma.accountPayablePaymentAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findByAccountPayable('ap-1');
      expect(prisma.accountPayablePaymentAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountPayableId: 'ap-1' } }),
      );
    });

    it('findOne devuelve la solicitud', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(requestStub() as any);
      await expect(service.findOne('req-1')).resolves.toBeDefined();
    });

    it('findOne lanza NotFound', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.findOne('req-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEntityId', () => {
    it('devuelve el accountPayableId', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue({
        accountPayableId: 'ap-9',
      } as any);
      await expect(service.getEntityId('req-1')).resolves.toBe('ap-9');
    });

    it('devuelve null si no existe', async () => {
      prisma.accountPayablePaymentAuthRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.getEntityId('req-1')).resolves.toBeNull();
    });
  });
});
