import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountsPayableAuthRequestsService } from './accounts-payable-auth-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { createMockPrismaService } from '../../database/prisma.service.mock';
import { ApprovalRequestType, EditRequestStatus } from '../../generated/prisma';

const apStub = (overrides: Record<string, any> = {}) => ({
  id: 'ap-1',
  apNumber: 'CP-2026-001',
  status: 'PENDING',
  ...overrides,
});

const requestStub = (overrides: Record<string, any> = {}) => ({
  id: 'req-1',
  status: EditRequestStatus.PENDING,
  requestedById: 'user-1',
  accountPayableId: 'ap-1',
  reason: 'Necesita pago',
  accountPayable: { id: 'ap-1', apNumber: 'CP-2026-001' },
  requestedBy: { id: 'user-1', email: 'u@e.com', firstName: 'Ana', lastName: 'Gómez' },
  ...overrides,
});

describe('AccountsPayableAuthRequestsService', () => {
  let service: AccountsPayableAuthRequestsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let notifications: { create: jest.Mock; notifyAllAdmins: jest.Mock };
  let whatsapp: { sendApprovalNotification: jest.Mock; getAdminPhones: jest.Mock };
  let registry: { register: jest.Mock };
  let accountsPayable: { adminAuthorize: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
      notifyAllAdmins: jest.fn().mockResolvedValue(undefined),
    };
    whatsapp = {
      sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
      getAdminPhones: jest.fn().mockResolvedValue(['573212016229']),
    };
    registry = { register: jest.fn() };
    accountsPayable = { adminAuthorize: jest.fn().mockResolvedValue(undefined) };
    // Sin admins con teléfono → el helper de WhatsApp no envía nada.
    prisma.role.findUnique.mockResolvedValue({ users: [] } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsPayableAuthRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: ApprovalRequestRegistry, useValue: registry },
        { provide: WhatsappService, useValue: whatsapp },
        { provide: AccountsPayableService, useValue: accountsPayable },
      ],
    }).compile();

    service = module.get<AccountsPayableAuthRequestsService>(AccountsPayableAuthRequestsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('onModuleInit', () => {
    it('registra el handler AP_AUTH', () => {
      service.onModuleInit();
      expect(registry.register).toHaveBeenCalledWith(ApprovalRequestType.AP_AUTH, service);
    });
  });

  describe('findPendingRequest', () => {
    it('devuelve null si no existe', async () => {
      prisma.accountPayableAuthRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.findPendingRequest('req-1')).resolves.toBeNull();
    });

    it('devuelve la info de la solicitud', async () => {
      prisma.accountPayableAuthRequest.findUnique.mockResolvedValue(
        requestStub({ accountPayable: { apNumber: 'CP-2026-001' } }) as any,
      );
      const info = await service.findPendingRequest('req-1');
      expect(info?.displayLabel).toContain('CP-2026-001');
    });
  });

  describe('approveViaWhatsApp', () => {
    it('aprueba, auto-autoriza la CP y notifica', async () => {
      prisma.accountPayableAuthRequest.update.mockResolvedValue(requestStub() as any);
      await service.approveViaWhatsApp('req-1', 'admin-1');
      expect(accountsPayable.adminAuthorize).toHaveBeenCalledWith('ap-1', 'admin-1');
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('rejectViaWhatsApp', () => {
    it('rechaza vía WhatsApp y notifica sin autorizar', async () => {
      prisma.accountPayableAuthRequest.update.mockResolvedValue(requestStub() as any);
      await service.rejectViaWhatsApp('req-1', 'admin-1');
      expect(accountsPayable.adminAuthorize).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto = { accountPayableId: 'ap-1', reason: 'urgente' } as any;

    it('lanza NotFound si la CP no existe', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(null as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la CP no está en PENDING', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub({ status: 'PARTIAL' }) as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(/estado PENDING/);
    });

    it('rechaza si el solicitante es admin (puede autorizar directo)', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'admin' } } as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(/directamente/);
    });

    it('rechaza si ya hay una solicitud pendiente del usuario', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'asesor' } } as any);
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue({ id: 'req-old' } as any);
      await expect(service.create('user-1', dto)).rejects.toThrow(/solicitud de autorización pendiente/);
    });

    it('crea la solicitud y notifica a los admins', async () => {
      prisma.accountPayable.findUnique.mockResolvedValue(apStub() as any);
      prisma.user.findUnique.mockResolvedValue({ firstName: 'Ana', role: { name: 'asesor' } } as any);
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue(null as any);
      prisma.accountPayableAuthRequest.create.mockResolvedValue(requestStub() as any);

      const result = await service.create('user-1', dto);

      expect(prisma.accountPayableAuthRequest.create).toHaveBeenCalled();
      expect(notifications.notifyAllAdmins).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('approve', () => {
    const dto = { reviewNotes: 'ok' } as any;

    it('lanza NotFound si la solicitud no existe o ya procesada', async () => {
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue(null as any);
      await expect(service.approve('req-1', 'admin-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el revisor no es admin', async () => {
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'asesor' } } as any);
      await expect(service.approve('req-1', 'admin-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('aprueba, auto-autoriza y notifica', async () => {
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'admin' } } as any);
      prisma.accountPayableAuthRequest.update.mockResolvedValue(requestStub() as any);

      await service.approve('req-1', 'admin-1', dto);

      expect(prisma.accountPayableAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EditRequestStatus.APPROVED }),
        }),
      );
      expect(accountsPayable.adminAuthorize).toHaveBeenCalledWith('ap-1', 'admin-1');
    });
  });

  describe('reject', () => {
    const dto = { reviewNotes: 'no' } as any;

    it('rechaza si el revisor no es admin', async () => {
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'asesor' } } as any);
      await expect(service.reject('req-1', 'admin-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza la solicitud y notifica', async () => {
      prisma.accountPayableAuthRequest.findFirst.mockResolvedValue(requestStub() as any);
      prisma.user.findUnique.mockResolvedValue({ role: { name: 'admin' } } as any);
      prisma.accountPayableAuthRequest.update.mockResolvedValue(requestStub() as any);

      await service.reject('req-1', 'admin-1', dto);

      expect(prisma.accountPayableAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EditRequestStatus.REJECTED }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });
  });

  describe('queries', () => {
    it('findPending filtra por PENDING', async () => {
      prisma.accountPayableAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findPending();
      expect(prisma.accountPayableAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: EditRequestStatus.PENDING, accountPayable: {} } }),
      );
    });

    it('findAll devuelve todas', async () => {
      prisma.accountPayableAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findAll();
      expect(prisma.accountPayableAuthRequest.findMany).toHaveBeenCalled();
    });

    it('findByUser filtra por solicitante', async () => {
      prisma.accountPayableAuthRequest.findMany.mockResolvedValue([] as any);
      await service.findByUser('user-1');
      expect(prisma.accountPayableAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { requestedById: 'user-1' } }),
      );
    });
  });

  describe('getEntityId', () => {
    it('devuelve el accountPayableId', async () => {
      prisma.accountPayableAuthRequest.findUnique.mockResolvedValue({
        accountPayableId: 'ap-9',
      } as any);
      await expect(service.getEntityId('req-1')).resolves.toBe('ap-9');
    });

    it('devuelve null si no existe', async () => {
      prisma.accountPayableAuthRequest.findUnique.mockResolvedValue(null as any);
      await expect(service.getEntityId('req-1')).resolves.toBeNull();
    });
  });
});
