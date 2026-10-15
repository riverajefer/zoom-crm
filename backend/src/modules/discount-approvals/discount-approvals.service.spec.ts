import { Test, TestingModule } from '@nestjs/testing';
import { DiscountApprovalsService } from './discount-approvals.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EditRequestStatus, NotificationType } from '../../generated/prisma';

describe('DiscountApprovalsService', () => {
  let service: DiscountApprovalsService;
  let prisma: jest.Mocked<PrismaService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let recalculateOrderTotals: jest.Mock;

  const mockRegistry = { register: jest.fn() };
  const mockWhatsapp = {
    sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
    getPhonesByPermission: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      discountApproval: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      orderDiscount: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;
    (prisma.$transaction as jest.Mock).mockImplementation((cb) => cb(prisma));

    notificationsService = {
      notifyUsersWithPermission: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountApprovalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ApprovalRequestRegistry, useValue: mockRegistry },
        { provide: WhatsappService, useValue: mockWhatsapp },
      ],
    }).compile();

    service = module.get<DiscountApprovalsService>(DiscountApprovalsService);

    recalculateOrderTotals = jest.fn().mockResolvedValue(undefined);
    service.registerOrderTotalsRecalculator(recalculateOrderTotals);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('registers itself at DISCOUNT_APPROVAL key', () => {
      service.onModuleInit();
      expect(mockRegistry.register).toHaveBeenCalledWith('DISCOUNT_APPROVAL', service);
    });
  });

  // ─── findPendingRequest ───

  describe('findPendingRequest', () => {
    it('returns null when not found', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await service.findPendingRequest('req-1');
      expect(res).toBeNull();
    });

    it('returns ApprovalRequestInfo when found', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req-1',
        status: EditRequestStatus.PENDING,
        requestedById: 'user-1',
        order: { orderNumber: 'OP-001' },
      });
      const res = await service.findPendingRequest('req-1');
      expect(res).toMatchObject({ id: 'req-1', status: EditRequestStatus.PENDING });
    });
  });

  // ─── approveViaWhatsApp ───

  describe('approveViaWhatsApp', () => {
    it('does nothing when the request is no longer pending', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(null);

      await service.approveViaWhatsApp('req-1', 'reviewer-1');

      expect(prisma.discountApproval.update).not.toHaveBeenCalled();
      expect(recalculateOrderTotals).not.toHaveBeenCalled();
    });

    it('approves, applies the discount to the order total and notifies requester', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.discountApproval.update as jest.Mock).mockResolvedValue({ id: 'req-1' });
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      await service.approveViaWhatsApp('req-1', 'reviewer-1');

      expect(prisma.discountApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-1' },
          data: expect.objectContaining({ status: EditRequestStatus.APPROVED, reviewedById: 'reviewer-1' }),
        }),
      );
      expect(recalculateOrderTotals).toHaveBeenCalledWith('order-1', prisma);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { discountApprovalStatus: EditRequestStatus.APPROVED } }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.DISCOUNT_APPROVAL_APPROVED }),
      );
    });
  });

  // ─── rejectViaWhatsApp ───

  describe('rejectViaWhatsApp', () => {
    it('does nothing when request not found', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(null);
      await service.rejectViaWhatsApp('req-1', 'reviewer-1');
      expect(prisma.discountApproval.update).not.toHaveBeenCalled();
    });

    it('updates to REJECTED and notifies when found', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.discountApproval.update as jest.Mock).mockResolvedValue({});
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      await service.rejectViaWhatsApp('req-1', 'reviewer-1');

      expect(prisma.discountApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: EditRequestStatus.REJECTED }) }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.DISCOUNT_APPROVAL_REJECTED }),
      );
    });
  });

  // ─── findReviewerByPhone ───

  describe('findReviewerByPhone', () => {
    it('queries user with phone variants', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'reviewer-1' });
      const res = await service.findReviewerByPhone('+573001234567');
      expect(res).toEqual({ id: 'reviewer-1' });
      expect(prisma.user.findFirst).toHaveBeenCalled();
    });

    it('returns null when no reviewer found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      const res = await service.findReviewerByPhone('300');
      expect(res).toBeNull();
    });
  });

  // ─── requiresApproval ───

  describe('requiresApproval', () => {
    it('returns required false when user has approve_discounts permission', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_discounts' } }] },
      });
      const res = await service.requiresApproval('user-1');
      expect(res).toEqual({ required: false });
    });

    it('returns required true when user lacks approve_discounts permission', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [] },
      });
      const res = await service.requiresApproval('user-1');
      expect(res.required).toBe(true);
    });
  });

  // ─── createPendingRequest / notifyPendingRequest ───

  describe('createPendingRequest', () => {
    it('creates the PENDING request and flags the order inside the given transaction', async () => {
      const tx = {
        discountApproval: { create: jest.fn().mockResolvedValue({ id: 'req-new' }) },
        order: { update: jest.fn().mockResolvedValue({}) },
      };

      const res = await service.createPendingRequest(tx as any, {
        requestedById: 'user-1',
        orderId: 'order-1',
        discountId: 'disc-1',
      });

      expect(tx.discountApproval.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          discountId: 'disc-1',
          requestedById: 'user-1',
          status: EditRequestStatus.PENDING,
        },
        select: { id: true },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { discountApprovalStatus: EditRequestStatus.PENDING },
      });
      // Nada sale por fuera de la transacción ni se notifica todavía.
      expect(prisma.discountApproval.create).not.toHaveBeenCalled();
      expect(notificationsService.notifyUsersWithPermission).not.toHaveBeenCalled();
      expect(res).toEqual({ id: 'req-new' });
    });
  });

  describe('notifyPendingRequest', () => {
    const pendingRequest = (discount: unknown) => ({
      id: 'req-new',
      orderId: 'order-1',
      requestedById: 'user-1',
      requestedBy: { id: 'user-1', email: 'u@t.com', firstName: 'Ana', lastName: 'Lopez' },
      order: { id: 'order-1', orderNumber: 'OP-001' },
      discount,
    });

    it('throws NotFoundException when the request does not exist', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.notifyPendingRequest('missing')).rejects.toThrow(NotFoundException);
    });

    it('notifies reviewers in-app with the discount detail', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue(
        pendingRequest({ amount: 50, reason: 'Loyalty' }),
      );

      await service.notifyPendingRequest('req-new');

      expect(notificationsService.notifyUsersWithPermission).toHaveBeenCalledWith(
        'approve_discounts',
        expect.objectContaining({
          type: NotificationType.DISCOUNT_APPROVAL_PENDING,
          relatedId: 'req-new',
          message: expect.stringContaining('Loyalty'),
        }),
        // Solo Zoom: el aviso solo llega a la sede de la OP.
        { orderId: expect.any(String) },
      );
    });

    it('sends WhatsApp notifications when reviewers with phones exist', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue(
        pendingRequest({ amount: 20, reason: 'VIP' }),
      );
      // Los teléfonos llegan ya normalizados y deduplicados desde WhatsappService
      mockWhatsapp.getPhonesByPermission.mockResolvedValue(['573001234567']);

      await service.notifyPendingRequest('req-new');
      // Flush fire-and-forget promises
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(mockWhatsapp.getPhonesByPermission).toHaveBeenCalledWith('approve_discounts');
      expect(mockWhatsapp.sendApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ telefono: '573001234567' }),
      );
    });

    it('handles WhatsApp notification error gracefully', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue(
        pendingRequest({ amount: 10, reason: 'Test' }),
      );
      mockWhatsapp.getPhonesByPermission.mockRejectedValue(new Error('DB error'));

      // Should not throw – fire and forget
      await expect(service.notifyPendingRequest('req-new')).resolves.toBeUndefined();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  });

  // ─── approve ───

  describe('approve', () => {
    it('throws NotFoundException when request not found or not PENDING', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.approve('req-1', 'rev-1', {})).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when reviewer lacks approve_discounts permission', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        requestedBy: {},
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [] },
      });

      await expect(service.approve('req-1', 'rev-no-perm', {})).rejects.toThrow(ForbiddenException);
    });

    it('approves request and notifies requester', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        requestedBy: {},
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_discounts' } }] },
      });
      (prisma.discountApproval.update as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        requestedBy: {},
        reviewedBy: {},
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      const res = await service.approve('req-1', 'rev-1', { reviewNotes: 'Approved' });

      expect(prisma.discountApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: EditRequestStatus.APPROVED }) }),
      );
      // Aprobar es lo que hace que el descuento baje el total.
      expect(recalculateOrderTotals).toHaveBeenCalledWith('order-1', prisma);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { discountApprovalStatus: EditRequestStatus.APPROVED } }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.DISCOUNT_APPROVAL_APPROVED }),
      );
      expect(res.id).toBe('req-1');
    });
  });

  describe('approve — revisar la propia solicitud', () => {
    const ownRequest = {
      id: 'req-1',
      orderId: 'order-1',
      requestedById: 'user-1',
      requestedBy: {},
      order: { id: 'order-1', orderNumber: 'OP-001' },
    };

    it('blocks a non-admin approving their own discount', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(ownRequest);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { name: 'contabilidad', permissions: [{ permission: { name: 'approve_discounts' } }] },
      });

      await expect(service.approve('req-1', 'user-1', {})).rejects.toThrow(
        'No puedes aprobar ni rechazar una solicitud que tú mismo creaste',
      );
      expect(prisma.discountApproval.update).not.toHaveBeenCalled();
      expect(recalculateOrderTotals).not.toHaveBeenCalled();
    });

    it('lets an admin approve their own discount', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(ownRequest);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { name: 'admin', permissions: [{ permission: { name: 'approve_discounts' } }] },
      });
      (prisma.discountApproval.update as jest.Mock).mockResolvedValue({ id: 'req-1' });
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      await expect(service.approve('req-1', 'user-1', {})).resolves.toEqual({ id: 'req-1' });
    });

    it('fails loudly if OrdersService never registered the recalculator', async () => {
      service.registerOrderTotalsRecalculator(null as any);
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(ownRequest);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { name: 'contabilidad', permissions: [{ permission: { name: 'approve_discounts' } }] },
      });

      await expect(service.approve('req-1', 'rev-1', {})).rejects.toThrow(
        'no registró el recálculo',
      );
    });
  });

  // ─── reject ───

  describe('reject', () => {
    it('throws NotFoundException when request not found or not PENDING', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.reject('req-1', 'rev-1', { reviewNotes: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when reviewer lacks approve_discounts permission', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        requestedBy: {},
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [] },
      });

      await expect(service.reject('req-1', 'rev-no-perm', { reviewNotes: 'x' })).rejects.toThrow(ForbiddenException);
    });

    it('rejects request and notifies requester', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        requestedBy: {},
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_discounts' } }] },
      });
      (prisma.discountApproval.update as jest.Mock).mockResolvedValue({});
      (prisma.order.update as jest.Mock).mockResolvedValue({});
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue({ id: 'req-1', status: 'REJECTED' });

      const res = await service.reject('req-1', 'rev-1', { reviewNotes: 'Not justified' });

      expect(prisma.discountApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: EditRequestStatus.REJECTED }) }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.DISCOUNT_APPROVAL_REJECTED }),
      );
    });

    it('reject notification includes reason when reviewNotes provided', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-2', orderId: 'order-2', requestedById: 'user-2', requestedBy: {},
        order: { id: 'order-2', orderNumber: 'OP-002' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_discounts' } }] },
      });
      (prisma.discountApproval.update as jest.Mock).mockResolvedValue({});
      (prisma.order.update as jest.Mock).mockResolvedValue({});
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue({ id: 'req-2' });

      await service.reject('req-2', 'rev-1', { reviewNotes: 'Not enough justification' });

      const notifCall = (notificationsService.create as jest.Mock).mock.calls[0][0];
      expect(notifCall.message).toContain('Not enough justification');
    });
  });

  describe('reject — revisar la propia solicitud', () => {
    it('blocks a non-admin rejecting their own discount', async () => {
      (prisma.discountApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'user-1',
        requestedBy: {},
        order: { id: 'order-1', orderNumber: 'OP-001' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { name: 'contabilidad', permissions: [{ permission: { name: 'approve_discounts' } }] },
      });

      await expect(service.reject('req-1', 'user-1', { reviewNotes: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.discountApproval.update).not.toHaveBeenCalled();
    });
  });

  // ─── findPendingRequests / findAll / findOne / findByUser ───

  describe('findPendingRequests', () => {
    it('delegates to prisma with PENDING status filter', async () => {
      (prisma.discountApproval.findMany as jest.Mock).mockResolvedValue([]);
      const res = await service.findPendingRequests();
      expect(res).toEqual([]);
      expect(prisma.discountApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: EditRequestStatus.PENDING, order: {} } }),
      );
    });
  });

  describe('findAll', () => {
    it('delegates to prisma without filter', async () => {
      (prisma.discountApproval.findMany as jest.Mock).mockResolvedValue([{ id: 'req-1' }]);
      const res = await service.findAll();
      expect(res).toEqual([{ id: 'req-1' }]);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when not found', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the request when found', async () => {
      (prisma.discountApproval.findUnique as jest.Mock).mockResolvedValue({ id: 'req-1' });
      const res = await service.findOne('req-1');
      expect(res).toEqual({ id: 'req-1' });
    });
  });

  describe('findByUser', () => {
    it('delegates to prisma filtering by requestedById', async () => {
      (prisma.discountApproval.findMany as jest.Mock).mockResolvedValue([]);
      const res = await service.findByUser('user-1');
      expect(res).toEqual([]);
      expect(prisma.discountApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { requestedById: 'user-1' } }),
      );
    });
  });
});
