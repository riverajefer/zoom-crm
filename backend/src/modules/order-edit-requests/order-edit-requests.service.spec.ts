import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderEditRequestsService } from './order-edit-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';
import { EditRequestStatus } from '../../generated/prisma';

// ---------------------------------------------------------------------------
// Mock: NotificationsService
// ---------------------------------------------------------------------------
const mockNotificationsService = {
  create: jest.fn(),
  notifyAllAdmins: jest.fn(),
};

// ---------------------------------------------------------------------------
// Mock: WhatsappService
// ---------------------------------------------------------------------------
const mockWhatsappService = {
  sendTemplateMessage: jest.fn().mockResolvedValue('mock-message-id'),
  notificarSolicitudEdicionOP: jest.fn().mockResolvedValue('mock-message-id'),
  notificarSolicitudConBotones: jest.fn().mockResolvedValue(undefined),
  getAdminPhones: jest.fn().mockResolvedValue(['573212016229']),
};

const mockApprovalRegistry = {
  register: jest.fn(),
  getHandler: jest.fn(),
  hasHandler: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockOrder = { id: 'order-1', orderNumber: 'OP-2026-001', status: 'CONFIRMED' };
const mockEditableStatus = { orderStatus: 'CONFIRMED', allowEditRequests: true };

const mockNonAdminUser = {
  id: 'user-1',
  email: 'user@test.com',
  firstName: 'Ana',
  role: { name: 'manager' },
};
const mockAdminUser = { id: 'admin-1', email: 'admin@test.com', role: { name: 'admin' } };

const mockPendingRequest = {
  id: 'req-1',
  orderId: 'order-1',
  requestedById: 'user-1',
  status: EditRequestStatus.PENDING,
  observations: 'Necesito editar la orden',
  requestedBy: {
    id: 'user-1',
    email: 'user@test.com',
    firstName: 'Ana',
    lastName: 'García',
  },
  order: { id: 'order-1', orderNumber: 'OP-2026-001' },
};

const mockApprovedRequest = {
  ...mockPendingRequest,
  status: EditRequestStatus.APPROVED,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
};

const mockExpiredRequest = {
  ...mockApprovedRequest,
  expiresAt: new Date(Date.now() - 1000), // already expired
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('OrderEditRequestsService', () => {
  let service: OrderEditRequestsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEditRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: ApprovalRequestRegistry, useValue: mockApprovalRegistry },
      ],
    }).compile();

    service = module.get<OrderEditRequestsService>(OrderEditRequestsService);

    // Default happy-path stubs
    prisma.order.findUnique.mockResolvedValue(mockOrder);
    prisma.editableOrderStatus.findUnique.mockResolvedValue(mockEditableStatus);
    prisma.user.findUnique.mockResolvedValue(mockNonAdminUser);
    prisma.orderEditRequest.findFirst.mockResolvedValue(null); // no pending request
    prisma.orderEditRequest.create.mockResolvedValue(mockPendingRequest);
    prisma.role.findUnique.mockResolvedValue({ name: 'admin', users: [] }); // for WhatsApp notification
    mockNotificationsService.notifyAllAdmins.mockResolvedValue(undefined);
    mockNotificationsService.create.mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    const createDto = { observations: 'Necesito editar la orden' };

    it('should throw NotFoundException when order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.create('order-1', 'user-1', createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when order status does not allow edit requests', async () => {
      prisma.editableOrderStatus.findUnique.mockResolvedValue(null);

      await expect(
        service.create('order-1', 'user-1', createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when order status has allowEditRequests=false', async () => {
      prisma.editableOrderStatus.findUnique.mockResolvedValue({
        orderStatus: 'CONFIRMED',
        allowEditRequests: false,
      });

      await expect(
        service.create('order-1', 'user-1', createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when requester is an admin', async () => {
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);

      await expect(
        service.create('order-1', 'admin-1', createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when a PENDING request already exists for this user+order', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockPendingRequest);

      await expect(
        service.create('order-1', 'user-1', createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create the request with PENDING status', async () => {
      await service.create('order-1', 'user-1', createDto);

      expect(prisma.orderEditRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-1',
            requestedById: 'user-1',
            status: EditRequestStatus.PENDING,
            observations: createDto.observations,
          }),
        }),
      );
    });

    it('should notify all admins after creating the request', async () => {
      await service.create('order-1', 'user-1', createDto);

      expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Nueva solicitud de edición de orden',
        }),
      );
    });

    it('should return the created request', async () => {
      const result = await service.create('order-1', 'user-1', createDto);

      expect(result).toEqual(mockPendingRequest);
    });
  });

  // ---------------------------------------------------------------------------
  // approve
  // ---------------------------------------------------------------------------
  describe('approve', () => {
    const reviewDto = { reviewNotes: 'Aprobado' };

    beforeEach(() => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockPendingRequest);
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);
      prisma.orderEditRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: EditRequestStatus.APPROVED,
      });
    });

    it('should throw NotFoundException when request does not exist or is not PENDING', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.approve('order-1', 'req-1', 'admin-1', reviewDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when reviewer is not an admin', async () => {
      prisma.user.findUnique.mockResolvedValue(mockNonAdminUser);

      await expect(
        service.approve('order-1', 'req-1', 'user-1', reviewDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update the request to APPROVED with expiresAt set to null', async () => {
      const before = Date.now();
      await service.approve('order-1', 'req-1', 'admin-1', reviewDto);
      const after = Date.now();

      const callData = prisma.orderEditRequest.update.mock.calls[0][0].data;
      expect(callData.status).toBe(EditRequestStatus.APPROVED);

      expect(callData.expiresAt).toBeNull();
    });

    it('should set reviewedById to the admin id', async () => {
      await service.approve('order-1', 'req-1', 'admin-1', reviewDto);

      const callData = prisma.orderEditRequest.update.mock.calls[0][0].data;
      expect(callData.reviewedById).toBe('admin-1');
    });

    it('should notify the requester after approval', async () => {
      await service.approve('order-1', 'req-1', 'admin-1', reviewDto);

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          title: 'Solicitud de edición aprobada',
        }),
      );
    });

    it('should return the updated request', async () => {
      const result = await service.approve('order-1', 'req-1', 'admin-1', reviewDto);

      expect(result).toMatchObject({ status: EditRequestStatus.APPROVED });
    });
  });

  // ---------------------------------------------------------------------------
  // reject
  // ---------------------------------------------------------------------------
  describe('reject', () => {
    const reviewDto = { reviewNotes: 'No aplica en este momento' };

    beforeEach(() => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockPendingRequest);
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);
      prisma.orderEditRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: EditRequestStatus.REJECTED,
      });
    });

    it('should throw NotFoundException when request does not exist or is not PENDING', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.reject('order-1', 'req-1', 'admin-1', reviewDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when reviewer is not an admin', async () => {
      prisma.user.findUnique.mockResolvedValue(mockNonAdminUser);

      await expect(
        service.reject('order-1', 'req-1', 'user-1', reviewDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update the request to REJECTED', async () => {
      await service.reject('order-1', 'req-1', 'admin-1', reviewDto);

      expect(prisma.orderEditRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EditRequestStatus.REJECTED }),
        }),
      );
    });

    it('should include reviewNotes in the rejection notification message', async () => {
      await service.reject('order-1', 'req-1', 'admin-1', reviewDto);

      const notifArg = mockNotificationsService.create.mock.calls[0][0];
      expect(notifArg.message).toContain('Motivo: No aplica en este momento');
    });

    it('should not include Motivo in notification when reviewNotes is empty', async () => {
      await service.reject('order-1', 'req-1', 'admin-1', { reviewNotes: '' });

      const notifArg = mockNotificationsService.create.mock.calls[0][0];
      expect(notifArg.message).not.toContain('Motivo:');
    });

    it('should return the rejected request', async () => {
      const result = await service.reject('order-1', 'req-1', 'admin-1', reviewDto);

      expect(result).toMatchObject({ status: EditRequestStatus.REJECTED });
    });
  });

  // ---------------------------------------------------------------------------
  // hasActivePermission
  // ---------------------------------------------------------------------------
  describe('hasActivePermission', () => {
    it('should return true when an unexpired APPROVED request exists', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockApprovedRequest);

      const result = await service.hasActivePermission('order-1', 'user-1');

      expect(result).toBe(true);
      expect(prisma.orderEditRequest.update).not.toHaveBeenCalled();
    });

    it('should return true and activate the permission when expiresAt is null', async () => {
      const mockNullExpires = { ...mockApprovedRequest, expiresAt: null };
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockNullExpires);
      prisma.orderEditRequest.update.mockResolvedValue({ ...mockNullExpires, expiresAt: new Date() });

      const result = await service.hasActivePermission('order-1', 'user-1');

      expect(result).toBe(true);
      expect(prisma.orderEditRequest.update).toHaveBeenCalledWith({
        where: { id: mockNullExpires.id },
        data: { expiresAt: expect.any(Date) },
      });
    });

    it('should return false when no active APPROVED request exists', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);

      const result = await service.hasActivePermission('order-1', 'user-1');

      expect(result).toBe(false);
    });

    it('should query with expiresAt > now or null filter', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);

      await service.hasActivePermission('order-1', 'user-1');

      const whereArg = prisma.orderEditRequest.findFirst.mock.calls[0][0].where;
      expect(whereArg.status).toBe(EditRequestStatus.APPROVED);
      expect(whereArg.OR).toBeDefined();
      expect(whereArg.OR[0]).toEqual({ expiresAt: null });
      expect(whereArg.OR[1].expiresAt.gt).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------------
  // getActivePermission
  // ---------------------------------------------------------------------------
  describe('getActivePermission', () => {
    it('should return the active permission when found with expiresAt', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockApprovedRequest);

      const result = await service.getActivePermission('order-1', 'user-1');

      expect(result).toEqual(mockApprovedRequest);
      expect(prisma.orderEditRequest.update).not.toHaveBeenCalled();
    });

    it('should activate permission on first access (expiresAt is null)', async () => {
      const mockNullExpires = { ...mockApprovedRequest, expiresAt: null };
      const expectedUpdatedRequest = { ...mockNullExpires, expiresAt: expect.any(Date) };
      
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockNullExpires);
      prisma.orderEditRequest.update.mockResolvedValue(expectedUpdatedRequest);

      const result = await service.getActivePermission('order-1', 'user-1');

      expect(prisma.orderEditRequest.update).toHaveBeenCalledWith({
        where: { id: mockNullExpires.id },
        data: { expiresAt: expect.any(Date) },
        include: expect.any(Object),
      });
      expect(result).toEqual(expectedUpdatedRequest);
    });

    it('should return null when no active permission exists', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);

      const result = await service.getActivePermission('order-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findByOrder
  // ---------------------------------------------------------------------------
  describe('findByOrder', () => {
    it('should return all requests for the order ordered by createdAt desc', async () => {
      const requests = [mockPendingRequest];
      prisma.orderEditRequest.findMany.mockResolvedValue(requests);

      const result = await service.findByOrder('order-1');

      expect(prisma.orderEditRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: 'order-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(requests);
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('should return the request when found', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(mockPendingRequest);

      const result = await service.findOne('order-1', 'req-1');

      expect(result).toEqual(mockPendingRequest);
    });

    it('should throw NotFoundException when request does not exist', async () => {
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);

      await expect(service.findOne('order-1', 'req-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // Solo Zoom (docs/PLAN_SEDES.md §6.3)
  describe('createDirect (edición directa del admin)', () => {
    it('registra una solicitud aprobada con el motivo', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);
      prisma.orderEditRequest.findFirst.mockResolvedValue(null);
      prisma.orderEditRequest.create.mockResolvedValue({ id: 'direct-1' });

      await service.createDirect('order-1', 'admin-1', { observations: ' Corregir cantidades ' });

      expect(prisma.orderEditRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-1',
          requestedById: 'admin-1',
          reviewedById: 'admin-1',
          observations: 'Corregir cantidades',
          status: EditRequestStatus.APPROVED,
          isDirect: true,
          expiresAt: null,
        }),
      });
    });

    it('solo el admin', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.user.findUnique.mockResolvedValue(mockNonAdminUser);

      await expect(
        service.createDirect('order-1', 'user-1', { observations: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('exige motivo', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);

      await expect(
        service.createDirect('order-1', 'admin-1', { observations: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.orderEditRequest.create).not.toHaveBeenCalled();
    });

    it('no aplica a borradores ni a órdenes anuladas', async () => {
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);
      for (const status of ['DRAFT', 'ANULADO']) {
        prisma.order.findUnique.mockResolvedValueOnce({ ...mockOrder, status });
        await expect(
          service.createDirect('order-1', 'admin-1', { observations: 'motivo' }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('con una ventana abierta no duplica el registro', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);
      const open = { id: 'direct-0', expiresAt: new Date(Date.now() + 60_000), isDirect: true };
      prisma.orderEditRequest.findFirst.mockResolvedValue(open);

      const result = await service.createDirect('order-1', 'admin-1', { observations: 'motivo' });

      expect(result).toBe(open);
      expect(prisma.orderEditRequest.create).not.toHaveBeenCalled();
    });

    it('la ventana de una edición directa es de 30 minutos (5 con solicitud)', async () => {
      const before = Date.now();
      prisma.orderEditRequest.findFirst.mockResolvedValueOnce({ id: 'd', expiresAt: null, isDirect: true });
      prisma.orderEditRequest.update.mockResolvedValue({});
      await service.hasActivePermission('order-1', 'admin-1');
      const directExpiry = prisma.orderEditRequest.update.mock.calls[0][0].data.expiresAt.getTime();

      prisma.orderEditRequest.findFirst.mockResolvedValueOnce({ id: 'n', expiresAt: null, isDirect: false });
      await service.hasActivePermission('order-1', 'user-1');
      const normalExpiry = prisma.orderEditRequest.update.mock.calls[1][0].data.expiresAt.getTime();

      expect(directExpiry - before).toBeGreaterThanOrEqual(30 * 60 * 1000);
      expect(normalExpiry - before).toBeLessThan(6 * 60 * 1000);
    });
  });
});
