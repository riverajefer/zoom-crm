import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatusChangeRequestsService } from './order-status-change-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../../database/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';
import { EditRequestStatus, OrderStatus, Prisma } from '../../generated/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Colaboradores mock
// ─────────────────────────────────────────────────────────────────────────────

const mockNotificationsService = {
  create: jest.fn(),
  notifyAllAdmins: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockOrder = {
  id: 'order-1',
  orderNumber: 'OP-2026-001',
  status: OrderStatus.CONFIRMED,
};

const mockNonAdminUser = {
  id: 'user-1',
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: { id: 'role-2', name: 'manager' },
};

const mockAdminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  role: { id: 'role-1', name: 'admin' },
};

const mockPendingRequest = {
  id: 'req-1',
  orderId: 'order-1',
  requestedById: 'user-1',
  currentStatus: OrderStatus.CONFIRMED,
  requestedStatus: OrderStatus.DELIVERED_ON_CREDIT,
  reason: 'Entrega urgente',
  status: EditRequestStatus.PENDING,
  requestedBy: mockNonAdminUser,
  order: { id: 'order-1', orderNumber: 'OP-2026-001', status: OrderStatus.CONFIRMED },
};

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('OrderStatusChangeRequestsService', () => {
  let service: OrderStatusChangeRequestsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderStatusChangeRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ApprovalRequestRegistry, useValue: { register: jest.fn() } },
        {
          provide: WhatsappService,
          useValue: {
            sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
            getAdminPhones: jest.fn().mockResolvedValue(['573212016229']),
          },
        },
      ],
    }).compile();

    service = module.get<OrderStatusChangeRequestsService>(
      OrderStatusChangeRequestsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      orderId: 'order-1',
      currentStatus: OrderStatus.CONFIRMED,
      requestedStatus: OrderStatus.DELIVERED_ON_CREDIT,
      reason: 'Entrega urgente',
    };

    beforeEach(() => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockNonAdminUser);
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.orderStatusChangeRequest.create as jest.Mock).mockResolvedValue({
        ...mockPendingRequest,
        id: 'req-new',
      });
      mockNotificationsService.notifyAllAdmins.mockResolvedValue(undefined);
    });

    it('should throw NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create('user-1', createDto)).rejects.toThrow(NotFoundException);
      await expect(service.create('user-1', createDto)).rejects.toThrow(
        `Order with id ${createDto.orderId} not found`,
      );
    });

    it('should throw BadRequestException when current order status does not match dto.currentStatus', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.IN_PRODUCTION,
      });

      await expect(service.create('user-1', createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create('user-1', createDto)).rejects.toThrow(
        `Current order status is ${OrderStatus.IN_PRODUCTION}`,
      );
    });

    it('should throw BadRequestException when requester is an admin (admins change directly)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockAdminUser);

      await expect(service.create('admin-1', createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create('admin-1', createDto)).rejects.toThrow(
        'Administrators can change order status directly',
      );
    });

    it('should throw BadRequestException when a PENDING request for the same status already exists', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(
        mockPendingRequest,
      );

      await expect(service.create('user-1', createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create('user-1', createDto)).rejects.toThrow(
        'You already have a pending status change request',
      );
    });

    it('should create the request with PENDING status', async () => {
      await service.create('user-1', createDto);

      expect(prisma.orderStatusChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-1',
            requestedById: 'user-1',
            status: EditRequestStatus.PENDING,
            requestedStatus: OrderStatus.DELIVERED_ON_CREDIT,
          }),
        }),
      );
    });

    it('should notify all admins after creating the request', async () => {
      await service.create('user-1', createDto);

      expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledTimes(1);
      expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nueva solicitud de cambio de estado' }),
      );
    });

    it('should return the created request', async () => {
      const result = await service.create('user-1', createDto);

      expect(result).toMatchObject({ id: 'req-new', status: EditRequestStatus.PENDING });
    });

    // Lo que retiene la empresa al anular viaja en la solicitud: el admin lo
    // aprueba junto con la anulación.
    describe('anulación con dinero', () => {
      const annulDto = {
        ...createDto,
        requestedStatus: OrderStatus.ANULADO,
        reason: 'El trabajo ya estaba en producción',
      };

      beforeEach(() => {
        // OP de 500.000 pagada completa.
        (prisma.order.findUnique as jest.Mock).mockResolvedValue({
          ...mockOrder,
          total: new Prisma.Decimal(500000),
          paidAmount: new Prisma.Decimal(500000),
          appliedCreditAmount: new Prisma.Decimal(0),
          reversedAmount: new Prisma.Decimal(0),
        });
      });

      it('guarda lo que retiene la empresa', async () => {
        await service.create('user-1', { ...annulDto, retainedAmount: 150000 });

        const { data } = (prisma.orderStatusChangeRequest.create as jest.Mock).mock
          .calls[0][0];
        expect(Number(data.retainedAmount)).toBe(150000);
      });

      it('le muestra al admin cuánto retiene la empresa y cuánto queda de saldo', async () => {
        await service.create('user-1', { ...annulDto, retainedAmount: 150000 });

        expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(/retiene \$150\.000 y quedan \$350\.000/),
          }),
        );
      });

      it('rechaza retener más de lo que el cliente pagó', async () => {
        await expect(
          service.create('user-1', { ...annulDto, retainedAmount: 600000 }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.orderStatusChangeRequest.create).not.toHaveBeenCalled();
      });

      it('en otros cambios de estado no guarda valor retenido', async () => {
        await service.create('user-1', { ...createDto, retainedAmount: 150000 });

        const { data } = (prisma.orderStatusChangeRequest.create as jest.Mock).mock
          .calls[0][0];
        expect(data.retainedAmount).toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────
  // approve
  // ─────────────────────────────────────────────
  describe('approve', () => {
    const approveDto = { reviewNotes: 'Aprobado sin observaciones' };
    const updatedRequest = {
      ...mockPendingRequest,
      status: EditRequestStatus.APPROVED,
      reviewedById: 'admin-1',
    };

    beforeEach(() => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(mockPendingRequest);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockAdminUser);
      (prisma.orderStatusChangeRequest.update as jest.Mock).mockResolvedValue(updatedRequest);
      mockNotificationsService.create.mockResolvedValue(undefined);
    });

    it('should throw NotFoundException when request does not exist or is already processed', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.approve('req-1', 'admin-1', approveDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.approve('req-1', 'admin-1', approveDto)).rejects.toThrow(
        'Status change request not found or already processed',
      );
    });

    it('should throw ForbiddenException when reviewer is not an admin', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockNonAdminUser);

      await expect(service.approve('req-1', 'user-1', approveDto)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.approve('req-1', 'user-1', approveDto)).rejects.toThrow(
        'Only administrators can approve requests',
      );
    });

    it('should throw BadRequestException when order status changed since request was created', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue({
        ...mockPendingRequest,
        currentStatus: OrderStatus.CONFIRMED,
        order: { orderNumber: 'OP-001', status: OrderStatus.IN_PRODUCTION }, // changed!
      });

      await expect(service.approve('req-1', 'admin-1', approveDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.approve('req-1', 'admin-1', approveDto)).rejects.toThrow(
        'Order status has changed',
      );
    });

    it('should update the request to APPROVED with reviewedById and reviewedAt', async () => {
      await service.approve('req-1', 'admin-1', approveDto);

      expect(prisma.orderStatusChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-1' },
          data: expect.objectContaining({
            status: EditRequestStatus.APPROVED,
            reviewedById: 'admin-1',
            reviewNotes: approveDto.reviewNotes,
            reviewedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should notify the requester after approval', async () => {
      await service.approve('req-1', 'admin-1', approveDto);

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPendingRequest.requestedById,
          title: 'Solicitud de cambio de estado aprobada',
        }),
      );
    });

    it('should return the updated request', async () => {
      const result = await service.approve('req-1', 'admin-1', approveDto);

      expect(result).toMatchObject({ status: EditRequestStatus.APPROVED });
    });
  });

  // ─────────────────────────────────────────────
  // reject
  // ─────────────────────────────────────────────
  describe('reject', () => {
    const rejectDto = { reviewNotes: 'No autorizado en este momento' };
    const rejectedRequest = {
      ...mockPendingRequest,
      status: EditRequestStatus.REJECTED,
      reviewedById: 'admin-1',
    };

    beforeEach(() => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(mockPendingRequest);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockAdminUser);
      (prisma.orderStatusChangeRequest.update as jest.Mock).mockResolvedValue(rejectedRequest);
      mockNotificationsService.create.mockResolvedValue(undefined);
    });

    it('should throw NotFoundException when request does not exist or is already processed', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.reject('req-1', 'admin-1', rejectDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when reviewer is not an admin', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockNonAdminUser);

      await expect(service.reject('req-1', 'user-1', rejectDto)).rejects.toThrow(ForbiddenException);
      await expect(service.reject('req-1', 'user-1', rejectDto)).rejects.toThrow(
        'Only administrators can reject requests',
      );
    });

    it('should update the request to REJECTED', async () => {
      await service.reject('req-1', 'admin-1', rejectDto);

      expect(prisma.orderStatusChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-1' },
          data: expect.objectContaining({
            status: EditRequestStatus.REJECTED,
            reviewedById: 'admin-1',
          }),
        }),
      );
    });

    it('should notify the requester with rejection message including reviewNotes when provided', async () => {
      await service.reject('req-1', 'admin-1', rejectDto);

      const notificationCall = mockNotificationsService.create.mock.calls[0][0];
      expect(notificationCall.title).toBe('Solicitud de cambio de estado rechazada');
      expect(notificationCall.message).toContain('Motivo: No autorizado en este momento');
    });

    it('should notify the requester without motivo when reviewNotes is empty', async () => {
      await service.reject('req-1', 'admin-1', { reviewNotes: '' } as any);

      const notificationCall = mockNotificationsService.create.mock.calls[0][0];
      expect(notificationCall.message).not.toContain('Motivo:');
    });

    it('should return the rejected request', async () => {
      const result = await service.reject('req-1', 'admin-1', rejectDto);

      expect(result).toMatchObject({ status: EditRequestStatus.REJECTED });
    });
  });

  // ─────────────────────────────────────────────
  // requiresAuthorization
  // ─────────────────────────────────────────────
  describe('requiresAuthorization', () => {
    it('should return { required: false } when user is an admin', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockAdminUser);

      const result = await service.requiresAuthorization(
        'order-1',
        OrderStatus.DELIVERED_ON_CREDIT,
        'admin-1',
      );

      expect(result).toEqual({ required: false });
    });

    it('should return { required: true } when non-admin requests DELIVERED_ON_CREDIT', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockNonAdminUser);

      const result = await service.requiresAuthorization(
        'order-1',
        OrderStatus.DELIVERED_ON_CREDIT,
        'user-1',
      );

      expect(result.required).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('should return { required: false } when non-admin requests other statuses', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockNonAdminUser);

      const result = await service.requiresAuthorization(
        'order-1',
        OrderStatus.IN_PRODUCTION,
        'user-1',
      );

      expect(result).toEqual({ required: false });
    });
  });

  // ─────────────────────────────────────────────
  // hasApprovedRequest
  // ─────────────────────────────────────────────
  describe('hasApprovedRequest', () => {
    it('should return true when an approved request exists', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue({
        ...mockPendingRequest,
        status: EditRequestStatus.APPROVED,
      });

      const result = await service.hasApprovedRequest(
        'order-1',
        'user-1',
        OrderStatus.DELIVERED_ON_CREDIT,
      );

      expect(result).toBe(true);
    });

    it('should return false when no approved request exists', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.hasApprovedRequest(
        'order-1',
        'user-1',
        OrderStatus.DELIVERED_ON_CREDIT,
      );

      expect(result).toBe(false);
    });

    it('should query with correct filters (orderId, userId, requestedStatus, APPROVED)', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(null);

      await service.hasApprovedRequest('order-1', 'user-1', OrderStatus.DELIVERED_ON_CREDIT);

      expect(prisma.orderStatusChangeRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderId: 'order-1',
            requestedById: 'user-1',
            requestedStatus: OrderStatus.DELIVERED_ON_CREDIT,
            status: EditRequestStatus.APPROVED,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // consumeApprovedRequest
  // ─────────────────────────────────────────────
  describe('consumeApprovedRequest', () => {
    it('should find the approved request without modifying its status (audit trail preserved)', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue({
        ...mockPendingRequest,
        status: EditRequestStatus.APPROVED,
      });

      await service.consumeApprovedRequest('order-1', 'user-1', OrderStatus.DELIVERED_ON_CREDIT);

      // The current implementation does NOT update/delete — just reads for audit
      expect(prisma.orderStatusChangeRequest.update).not.toHaveBeenCalled();
      expect(prisma.orderStatusChangeRequest.delete).not.toHaveBeenCalled();
    });

    it('should not throw when no approved request is found', async () => {
      (prisma.orderStatusChangeRequest.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.consumeApprovedRequest('order-1', 'user-1', OrderStatus.DELIVERED_ON_CREDIT),
      ).resolves.toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // findPendingRequests
  // ─────────────────────────────────────────────
  describe('findPendingRequests', () => {
    it('should return all PENDING requests ordered by createdAt desc', async () => {
      (prisma.orderStatusChangeRequest.findMany as jest.Mock).mockResolvedValue([
        mockPendingRequest,
      ]);

      const result = await service.findPendingRequests();

      expect(prisma.orderStatusChangeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: EditRequestStatus.PENDING }),
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should filter by orderId when provided', async () => {
      (prisma.orderStatusChangeRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.findPendingRequests('order-1');

      expect(prisma.orderStatusChangeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderId: 'order-1',
            status: EditRequestStatus.PENDING,
          }),
        }),
      );
    });

    it('should not include orderId in where when not provided', async () => {
      (prisma.orderStatusChangeRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.findPendingRequests();

      const whereArg = (prisma.orderStatusChangeRequest.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('orderId');
    });

    // Si la orden llegó al estado pedido por otra vía, la solicitud ya no decide
    // nada. Las tres pendientes en producción eran anulaciones ya ejecutadas.
    it('descarta las solicitudes cuya orden ya está en el estado pedido', async () => {
      (prisma.orderStatusChangeRequest.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockPendingRequest,
          requestedStatus: OrderStatus.ANULADO,
          order: { id: 'order-1', orderNumber: 'OP-1', status: OrderStatus.ANULADO },
        },
        {
          ...mockPendingRequest,
          id: 'vigente',
          requestedStatus: OrderStatus.ANULADO,
          order: { id: 'order-2', orderNumber: 'OP-2', status: OrderStatus.CONFIRMED },
        },
      ]);

      const result = await service.findPendingRequests();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vigente');
    });
  });

  describe('closePendingRequestsForReachedStatus', () => {
    it('marca APPROVED las que pedían el estado alcanzado, con quien lo ejecutó', async () => {
      (prisma.orderStatusChangeRequest.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const cerradas = await service.closePendingRequestsForReachedStatus(
        'order-1',
        OrderStatus.ANULADO,
        'user-1',
      );

      expect(cerradas).toBe(1);
      expect(prisma.orderStatusChangeRequest.updateMany).toHaveBeenCalledWith({
        where: {
          orderId: 'order-1',
          requestedStatus: OrderStatus.ANULADO,
          status: EditRequestStatus.PENDING,
        },
        data: expect.objectContaining({
          status: EditRequestStatus.APPROVED,
          reviewedById: 'user-1',
        }),
      });
    });

    it('no toca las solicitudes que pedían otro estado', async () => {
      (prisma.orderStatusChangeRequest.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.closePendingRequestsForReachedStatus('order-1', OrderStatus.CONFIRMED, 'user-1'),
      ).resolves.toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // findByUser
  // ─────────────────────────────────────────────
  describe('findByUser', () => {
    it('should return all requests for the specified user', async () => {
      (prisma.orderStatusChangeRequest.findMany as jest.Mock).mockResolvedValue([
        mockPendingRequest,
      ]);

      const result = await service.findByUser('user-1');

      expect(prisma.orderStatusChangeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedById: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return the request when found', async () => {
      (prisma.orderStatusChangeRequest.findUnique as jest.Mock).mockResolvedValue(
        mockPendingRequest,
      );

      const result = await service.findOne('req-1');

      expect(result).toMatchObject({ id: 'req-1' });
    });

    it('should throw NotFoundException when request does not exist', async () => {
      (prisma.orderStatusChangeRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('bad-id')).rejects.toThrow(
        'Status change request not found',
      );
    });
  });
});
