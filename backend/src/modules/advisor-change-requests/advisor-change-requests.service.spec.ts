import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdvisorChangeRequestsService } from './advisor-change-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';

describe('AdvisorChangeRequestsService', () => {
  let service: AdvisorChangeRequestsService;
  let prisma: MockPrismaService;
  let notifications: { create: jest.Mock; notifyAllAdmins: jest.Mock };
  let whatsapp: { sendApprovalNotification: jest.Mock; getAdminPhones: jest.Mock };
  let registry: { register: jest.Mock };

  const ORDER = {
    id: 'order-1',
    orderNumber: 'OP-2026-0001',
    createdById: 'advisor-old',
  };
  const NON_ADMIN = { id: 'requester-1', role: { name: 'manager' }, firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x.com' };
  const ADMIN = { id: 'admin-1', role: { name: 'admin' } };
  const NEW_ADVISOR = { id: 'advisor-new', isActive: true, firstName: 'Beto', lastName: 'Paz', email: 'beto@x.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    notifications = { create: jest.fn(), notifyAllAdmins: jest.fn() };
    whatsapp = {
      sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
      getAdminPhones: jest.fn().mockResolvedValue(['573212016229']),
    };
    registry = { register: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvisorChangeRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: WhatsappService, useValue: whatsapp },
        { provide: ApprovalRequestRegistry, useValue: registry },
      ],
    }).compile();

    service = module.get(AdvisorChangeRequestsService);
    // tx === prisma so tx.model.method is controllable via the same mock
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  });

  it('registers its handler on module init', () => {
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith('ADVISOR_CHANGE', service);
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.order.findUnique.mockResolvedValue(ORDER);
      // 1st user lookup = new advisor, 2nd = requester
      prisma.user.findUnique
        .mockResolvedValueOnce(NEW_ADVISOR) // requestedAdvisor
        .mockResolvedValueOnce(NON_ADMIN); // requester
      prisma.advisorChangeRequest.findFirst.mockResolvedValue(null);
      prisma.advisorChangeRequest.create.mockResolvedValue({
        id: 'req-1',
        order: ORDER,
        requestedBy: NON_ADMIN,
        currentAdvisor: { firstName: 'Old', lastName: 'One', email: 'old@x.com' },
        requestedAdvisor: NEW_ADVISOR,
      });
      prisma.role.findUnique.mockResolvedValue({ users: [] });
    });

    it('creates a pending request and notifies admins', async () => {
      const result = await service.create('requester-1', {
        orderId: 'order-1',
        requestedAdvisorId: 'advisor-new',
        reason: 'El asesor original ya no trabaja',
      });

      expect(prisma.advisorChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-1',
            requestedById: 'requester-1',
            currentAdvisorId: 'advisor-old',
            requestedAdvisorId: 'advisor-new',
            status: 'PENDING',
          }),
        }),
      );
      expect(notifications.notifyAllAdmins).toHaveBeenCalled();
      expect(result.id).toBe('req-1');
    });

    it('throws when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(
        service.create('requester-1', { orderId: 'x', requestedAdvisorId: 'advisor-new' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an inactive new advisor', async () => {
      prisma.user.findUnique.mockReset();
      prisma.user.findUnique.mockResolvedValueOnce({ ...NEW_ADVISOR, isActive: false });
      await expect(
        service.create('requester-1', { orderId: 'order-1', requestedAdvisorId: 'advisor-new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the new advisor is already the current one', async () => {
      prisma.user.findUnique.mockReset();
      prisma.user.findUnique.mockResolvedValueOnce({ ...NEW_ADVISOR, id: 'advisor-old' });
      await expect(
        service.create('requester-1', { orderId: 'order-1', requestedAdvisorId: 'advisor-old' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids admins from creating a request', async () => {
      prisma.user.findUnique.mockReset();
      prisma.user.findUnique
        .mockResolvedValueOnce(NEW_ADVISOR)
        .mockResolvedValueOnce(ADMIN);
      await expect(
        service.create('admin-1', { orderId: 'order-1', requestedAdvisorId: 'advisor-new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a duplicate pending request', async () => {
      prisma.advisorChangeRequest.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create('requester-1', { orderId: 'order-1', requestedAdvisorId: 'advisor-new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('changeAdvisorDirectly (atajo admin)', () => {
    it('reassigns immediately and records an auto-approved trail', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(ADMIN) // assertAdmin
        .mockResolvedValueOnce(NEW_ADVISOR); // target advisor
      prisma.order.findUnique.mockResolvedValue(ORDER);
      prisma.order.update.mockResolvedValue(ORDER);
      prisma.advisorChangeRequest.create.mockResolvedValue({ id: 'direct-1', status: 'APPROVED' });

      const result = await service.changeAdvisorDirectly('admin-1', {
        orderId: 'order-1',
        requestedAdvisorId: 'advisor-new',
        reason: 'reasignación directa',
      });

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: { createdBy: { connect: { id: 'advisor-new' } } },
        }),
      );
      expect(prisma.advisorChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            reviewedById: 'admin-1',
            currentAdvisorId: 'advisor-old',
            requestedAdvisorId: 'advisor-new',
            isDirect: true,
          }),
        }),
      );
      expect(result.status).toBe('APPROVED');
    });

    // Solo Zoom (docs/PLAN_SEDES.md §6.3)
    it('exige motivo: sin solicitud, es lo único que explica el cambio', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(ADMIN);
      await expect(
        service.changeAdvisorDirectly('admin-1', {
          orderId: 'order-1',
          requestedAdvisorId: 'advisor-new',
          reason: '  ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('forbids non-admins', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(NON_ADMIN);
      await expect(
        service.changeAdvisorDirectly('requester-1', {
          orderId: 'order-1',
          requestedAdvisorId: 'advisor-new',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects reassigning to the same advisor', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(ADMIN)
        .mockResolvedValueOnce({ ...NEW_ADVISOR, id: 'advisor-old' });
      prisma.order.findUnique.mockResolvedValue(ORDER);
      await expect(
        service.changeAdvisorDirectly('admin-1', {
          orderId: 'order-1',
          requestedAdvisorId: 'advisor-old',
          reason: 'motivo',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('approve', () => {
    const PENDING_REQUEST = {
      id: 'req-1',
      orderId: 'order-1',
      requestedById: 'requester-1',
      requestedAdvisorId: 'advisor-new',
      order: ORDER,
      currentAdvisor: { firstName: 'Old', lastName: 'One', email: 'old@x.com' },
      requestedAdvisor: NEW_ADVISOR,
    };

    it('reassigns the order advisor and marks the request approved', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(ADMIN) // assertAdmin
        .mockResolvedValueOnce({ isActive: true }); // new advisor still active
      prisma.advisorChangeRequest.findFirst.mockResolvedValue(PENDING_REQUEST);
      prisma.order.update.mockResolvedValue(ORDER);
      prisma.advisorChangeRequest.update.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });

      const result = await service.approve('req-1', 'admin-1', { reviewNotes: 'ok' });

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: { createdBy: { connect: { id: 'advisor-new' } } },
        }),
      );
      expect(prisma.advisorChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
      );
      expect(notifications.create).toHaveBeenCalled();
      expect(result.status).toBe('APPROVED');
    });

    it('forbids non-admin reviewers', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(NON_ADMIN);
      await expect(
        service.approve('req-1', 'requester-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when the request is not pending', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(ADMIN);
      prisma.advisorChangeRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.approve('req-1', 'admin-1', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('marks the request rejected and notifies the requester', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(ADMIN);
      prisma.advisorChangeRequest.findFirst.mockResolvedValue({
        id: 'req-1',
        orderId: 'order-1',
        requestedById: 'requester-1',
        order: ORDER,
        requestedAdvisor: NEW_ADVISOR,
      });
      prisma.advisorChangeRequest.update.mockResolvedValue({ id: 'req-1', status: 'REJECTED' });

      const result = await service.reject('req-1', 'admin-1', { reviewNotes: 'no procede' });

      expect(prisma.advisorChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalled();
      expect(result.status).toBe('REJECTED');
    });
  });
});
