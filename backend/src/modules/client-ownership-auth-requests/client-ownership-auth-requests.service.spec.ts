import { Test, TestingModule } from '@nestjs/testing';
import { ClientOwnershipAuthRequestsService } from './client-ownership-auth-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { NotFoundException, ForbiddenException, Logger } from '@nestjs/common';

describe('ClientOwnershipAuthRequestsService', () => {
  let service: ClientOwnershipAuthRequestsService;
  let prisma: any;
  let notificationsService: any;
  let whatsappService: any;
  let approvalRegistry: any;

  const mockPrisma = {
    clientOwnershipAuthRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
    clientAdvisor: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockNotificationsService = {
    create: jest.fn(),
    notifyUsersWithPermission: jest.fn(),
  };

  const mockWhatsappService = {
    sendApprovalNotification: jest.fn(),
    getPhonesByPermission: jest.fn().mockResolvedValue(['573212016229']),
  };

  const mockApprovalRegistry = {
    register: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientOwnershipAuthRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: ApprovalRequestRegistry, useValue: mockApprovalRegistry },
      ],
    }).compile();

    service = module.get(ClientOwnershipAuthRequestsService);
    prisma = module.get(PrismaService);
    notificationsService = module.get(NotificationsService);
    whatsappService = module.get(WhatsappService);
    approvalRegistry = module.get(ApprovalRequestRegistry);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should register handler in approval registry', () => {
      service.onModuleInit();
      expect(approvalRegistry.register).toHaveBeenCalledWith('CLIENT_OWNERSHIP_AUTH', service);
    });
  });

  // ─── ApprovalRequestHandler interface ───

  describe('findPendingRequest', () => {
    it('should return null when request not found', async () => {
      mockPrisma.clientOwnershipAuthRequest.findUnique.mockResolvedValue(null);
      const result = await service.findPendingRequest('nonexistent');
      expect(result).toBeNull();
    });

    it('should return ApprovalRequestInfo when found', async () => {
      mockPrisma.clientOwnershipAuthRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        requestedById: 'u1',
        order: { orderNumber: 'OP-001' },
      });
      const result = await service.findPendingRequest('r1');
      expect(result).toEqual({
        id: 'r1',
        status: 'PENDING',
        requestedById: 'u1',
        displayLabel: 'autorización de cliente - Orden OP-001',
      });
    });
  });

  describe('approveViaWhatsApp', () => {
    it('should update request, order status and notify user', async () => {
      mockPrisma.clientOwnershipAuthRequest.update.mockResolvedValue({
        id: 'r1',
        orderId: 'o1',
        requestedById: 'u1',
        order: { id: 'o1', orderNumber: 'OP-001' },
      });
      mockPrisma.order.update.mockResolvedValue({});
      mockNotificationsService.create.mockResolvedValue({});

      await service.approveViaWhatsApp('r1', 'rev1');

      expect(mockPrisma.clientOwnershipAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'rev1' }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { clientOwnershipAuthStatus: 'APPROVED' },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: 'CLIENT_OWNERSHIP_AUTH_APPROVED',
        }),
      );
    });
  });

  describe('rejectViaWhatsApp', () => {
    it('should update request, order status and notify user', async () => {
      mockPrisma.clientOwnershipAuthRequest.update.mockResolvedValue({
        id: 'r1',
        orderId: 'o1',
        requestedById: 'u1',
        order: { id: 'o1', orderNumber: 'OP-001' },
      });
      mockPrisma.order.update.mockResolvedValue({});
      mockNotificationsService.create.mockResolvedValue({});

      await service.rejectViaWhatsApp('r1', 'rev1');

      expect(mockPrisma.clientOwnershipAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'REJECTED', reviewedById: 'rev1' }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { clientOwnershipAuthStatus: 'REJECTED' },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: 'CLIENT_OWNERSHIP_AUTH_REJECTED',
        }),
      );
    });
  });

  describe('findReviewerByPhone', () => {
    it('should search user with phone variants', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1' });
      const result = await service.findReviewerByPhone('573001234567');
      expect(result).toEqual({ id: 'u1' });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            phone: { in: ['573001234567', '+573001234567', '3001234567'] },
          }),
        }),
      );
    });

    it('should return null when no user found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await service.findReviewerByPhone('1234');
      expect(result).toBeNull();
    });
  });

  // ─── Domain methods ───

  describe('requiresAuth', () => {
    it('should return required false if client has no advisors', async () => {
      mockPrisma.clientAdvisor.findMany.mockResolvedValue([]);
      const result = await service.requiresAuth('creator1', 'client1');
      expect(result).toEqual({ required: false });
    });

    it('should return required false if creator is one of the advisors', async () => {
      mockPrisma.clientAdvisor.findMany.mockResolvedValue([
        { advisorId: 'other-advisor' },
        { advisorId: 'creator1' },
      ]);
      const result = await service.requiresAuth('creator1', 'client1');
      expect(result).toEqual({ required: false });
    });

    it('should return required false if creator has admin bypass permission', async () => {
      mockPrisma.clientAdvisor.findMany.mockResolvedValue([
        { advisorId: 'other-advisor' },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'creator1',
        role: {
          permissions: [
            { permission: { name: 'approve_client_ownership_auth' } },
          ],
        },
      });
      const result = await service.requiresAuth('creator1', 'client1');
      expect(result).toEqual({ required: false });
    });

    it('should return required true if creator is not an advisor and has no admin bypass', async () => {
      mockPrisma.clientAdvisor.findMany.mockResolvedValue([
        { advisorId: 'other-advisor' },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'creator1',
        role: {
          permissions: [
            { permission: { name: 'create_orders' } },
          ],
        },
      });
      const result = await service.requiresAuth('creator1', 'client1');
      expect(result).toEqual({
        required: true,
        advisorId: 'other-advisor',
        reason:
          'Este cliente pertenece a otro(s) asesor(es). Se requiere autorización de un administrador.',
      });
    });
  });

  describe('createFromOrderCreation', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      await expect(service.createFromOrderCreation('u1', 'bad-id', 'adv1')).rejects.toThrow(NotFoundException);
    });

    it('should create request, update order, and notify', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'OP-001' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u@e.com', firstName: 'John', lastName: 'Doe' });
      const createdRequest = {
        id: 'r1',
        orderId: 'o1',
        requestedById: 'u1',
        requestedBy: { id: 'u1', email: 'u@e.com', firstName: 'John', lastName: 'Doe' },
        advisor: { id: 'adv1', email: 'adv@e.com', firstName: 'Adv', lastName: 'Isor' },
        order: { id: 'o1', orderNumber: 'OP-001' },
      };
      mockPrisma.clientOwnershipAuthRequest.create.mockResolvedValue(createdRequest);
      mockPrisma.order.update.mockResolvedValue({});
      mockNotificationsService.notifyUsersWithPermission.mockResolvedValue(undefined);
      // WhatsApp notif is fire & forget, mock users
      mockPrisma.user.findMany.mockResolvedValue([{ phone: '573001234567', role: { name: 'admin' } }]);
      mockWhatsappService.sendApprovalNotification.mockResolvedValue(undefined);

      const result = await service.createFromOrderCreation('u1', 'o1', 'adv1');

      expect(result).toEqual(createdRequest);
      expect(mockPrisma.clientOwnershipAuthRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'o1',
            requestedById: 'u1',
            advisorId: 'adv1',
            status: 'PENDING',
          }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { clientOwnershipAuthStatus: 'PENDING' },
      });
      expect(mockNotificationsService.notifyUsersWithPermission).toHaveBeenCalledWith(
        'approve_client_ownership_auth',
        expect.objectContaining({ type: 'CLIENT_OWNERSHIP_AUTH_PENDING' }),
        // Solo Zoom: el aviso solo llega a la sede de la OP.
        { orderId: expect.any(String) },
      );
    });
  });

  describe('approve', () => {
    const reviewerWithPermission = {
      id: 'rev1',
      role: { permissions: [{ permission: { name: 'approve_client_ownership_auth' } }] },
    };

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.clientOwnershipAuthRequest.findFirst.mockResolvedValue(null);
      await expect(service.approve('bad-id', 'rev1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if reviewer lacks permission', async () => {
      mockPrisma.clientOwnershipAuthRequest.findFirst.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        requestedById: 'u1',
        order: { id: 'o1', orderNumber: 'OP-001' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'rev1',
        role: { permissions: [{ permission: { name: 'read_orders' } }] },
      });
      await expect(service.approve('r1', 'rev1', {})).rejects.toThrow(ForbiddenException);
    });

    it('should approve request, update order and notify', async () => {
      const pendingRequest = {
        id: 'r1',
        status: 'PENDING',
        orderId: 'o1',
        requestedById: 'u1',
        requestedBy: { id: 'u1' },
        order: { id: 'o1', orderNumber: 'OP-001' },
      };
      const updatedRequest = { ...pendingRequest, status: 'APPROVED', reviewedById: 'rev1' };

      mockPrisma.clientOwnershipAuthRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.user.findUnique.mockResolvedValue(reviewerWithPermission);
      mockPrisma.clientOwnershipAuthRequest.update.mockResolvedValue(updatedRequest);
      mockPrisma.order.update.mockResolvedValue({});
      mockNotificationsService.create.mockResolvedValue({});

      const result = await service.approve('r1', 'rev1', { reviewNotes: 'OK' });

      expect(result).toEqual(updatedRequest);
      expect(mockPrisma.clientOwnershipAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'rev1', reviewNotes: 'OK' }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { clientOwnershipAuthStatus: 'APPROVED' },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', type: 'CLIENT_OWNERSHIP_AUTH_APPROVED' }),
      );
    });
  });

  describe('reject', () => {
    const reviewerWithPermission = {
      id: 'rev1',
      role: { permissions: [{ permission: { name: 'approve_client_ownership_auth' } }] },
    };

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.clientOwnershipAuthRequest.findFirst.mockResolvedValue(null);
      await expect(service.reject('bad-id', 'rev1', { reviewNotes: 'No' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if reviewer lacks permission', async () => {
      mockPrisma.clientOwnershipAuthRequest.findFirst.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        requestedById: 'u1',
        order: { id: 'o1', orderNumber: 'OP-001' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'rev1',
        role: { permissions: [{ permission: { name: 'read_orders' } }] },
      });
      await expect(service.reject('r1', 'rev1', { reviewNotes: 'No' })).rejects.toThrow(ForbiddenException);
    });

    it('should reject request, update order and notify with reason', async () => {
      const pendingRequest = {
        id: 'r1',
        status: 'PENDING',
        orderId: 'o1',
        requestedById: 'u1',
        requestedBy: { id: 'u1' },
        order: { id: 'o1', orderNumber: 'OP-001' },
      };
      const rejectedRequest = { ...pendingRequest, status: 'REJECTED', reviewedById: 'rev1' };

      mockPrisma.clientOwnershipAuthRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.user.findUnique.mockResolvedValue(reviewerWithPermission);
      mockPrisma.clientOwnershipAuthRequest.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});
      mockNotificationsService.create.mockResolvedValue({});
      mockPrisma.clientOwnershipAuthRequest.findUnique.mockResolvedValue(rejectedRequest);

      const result = await service.reject('r1', 'rev1', { reviewNotes: 'No procede' });

      expect(result).toEqual(rejectedRequest);
      expect(mockPrisma.clientOwnershipAuthRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'REJECTED', reviewedById: 'rev1', reviewNotes: 'No procede' }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { clientOwnershipAuthStatus: 'REJECTED' },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: 'CLIENT_OWNERSHIP_AUTH_REJECTED',
          message: expect.stringContaining('No procede'),
        }),
      );
    });
  });

  describe('findPendingRequests', () => {
    it('should return pending requests ordered by createdAt desc', async () => {
      const requests = [{ id: 'r1', status: 'PENDING' }];
      mockPrisma.clientOwnershipAuthRequest.findMany.mockResolvedValue(requests);
      const result = await service.findPendingRequests();
      expect(result).toEqual(requests);
      expect(mockPrisma.clientOwnershipAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all requests', async () => {
      const requests = [{ id: 'r1' }, { id: 'r2' }];
      mockPrisma.clientOwnershipAuthRequest.findMany.mockResolvedValue(requests);
      const result = await service.findAll();
      expect(result).toEqual(requests);
    });
  });

  describe('findByUser', () => {
    it('should return requests for specific user', async () => {
      const requests = [{ id: 'r1' }];
      mockPrisma.clientOwnershipAuthRequest.findMany.mockResolvedValue(requests);
      const result = await service.findByUser('u1');
      expect(result).toEqual(requests);
      expect(mockPrisma.clientOwnershipAuthRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { requestedById: 'u1' } }),
      );
    });
  });
});
