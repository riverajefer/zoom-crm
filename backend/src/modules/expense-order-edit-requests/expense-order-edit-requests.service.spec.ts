import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EDIT_APPROVAL_VALIDITY_HOURS,
  ExpenseOrderEditRequestsService,
} from './expense-order-edit-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ApprovalRequestType,
  EditRequestStatus,
  ExpenseOrderStatus,
  NotificationType,
} from '../../generated/prisma';

describe('ExpenseOrderEditRequestsService', () => {
  let service: ExpenseOrderEditRequestsService;

  const prisma = {
    expenseOrder: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    expenseOrderEditRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const notifications = { notifyAllAdmins: jest.fn(), create: jest.fn() };
  const registry = { register: jest.fn() };
  const whatsapp = {
    getAdminPhones: jest.fn().mockResolvedValue([]),
    sendApprovalNotification: jest.fn(),
  };

  const paidOg = { id: 'og-1', ogNumber: 'OG-2026-0700', status: ExpenseOrderStatus.PAID };
  const advisor = { id: 'u-1', firstName: 'Ana', lastName: 'Pérez', email: 'ana@x.co', role: { name: 'asesor' } };
  const admin = { id: 'admin-1', role: { name: 'admin' } };
  const pendingRequest = {
    id: 'req-1',
    expenseOrderId: 'og-1',
    requestedById: 'u-1',
    reason: 'Se olvidó incluir el IVA',
    status: EditRequestStatus.PENDING,
    requestedBy: { id: 'u-1', email: 'ana@x.co', firstName: 'Ana', lastName: 'Pérez' },
    expenseOrder: { id: 'og-1', ogNumber: 'OG-2026-0700' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseOrderEditRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: ApprovalRequestRegistry, useValue: registry },
        { provide: WhatsappService, useValue: whatsapp },
      ],
    }).compile();

    service = module.get(ExpenseOrderEditRequestsService);
  });

  it('se registra para las aprobaciones por WhatsApp', () => {
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(ApprovalRequestType.EXPENSE_ORDER_EDIT, service);
  });

  describe('create', () => {
    it('crea la solicitud sobre una OG pagada y avisa a los admins', async () => {
      prisma.expenseOrder.findUnique.mockResolvedValue(paidOg);
      prisma.user.findUnique.mockResolvedValue(advisor);
      prisma.expenseOrderEditRequest.findFirst.mockResolvedValue(null);
      prisma.expenseOrderEditRequest.create.mockResolvedValue(pendingRequest);

      const result = await service.create('u-1', {
        expenseOrderId: 'og-1',
        reason: '  Se olvidó incluir el IVA  ',
      });

      expect(result).toBe(pendingRequest);
      expect(prisma.expenseOrderEditRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: 'Se olvidó incluir el IVA' }),
        }),
      );
      expect(notifications.notifyAllAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.EXPENSE_ORDER_EDIT_REQUEST_PENDING,
          relatedType: 'ExpenseOrderEditRequest',
        }),
      );
    });

    it('rechaza una OG que no está pagada: esa se edita directo', async () => {
      prisma.expenseOrder.findUnique.mockResolvedValue({ ...paidOg, status: ExpenseOrderStatus.CREATED });

      await expect(
        service.create('u-1', { expenseOrderId: 'og-1', reason: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el admin no necesita solicitud', async () => {
      prisma.expenseOrder.findUnique.mockResolvedValue(paidOg);
      prisma.user.findUnique.mockResolvedValue(admin);

      await expect(
        service.create('admin-1', { expenseOrderId: 'og-1', reason: 'x' }),
      ).rejects.toThrow(/directamente/);
    });

    it('no deja pedir otra mientras tenga una aprobada sin usar', async () => {
      prisma.expenseOrder.findUnique.mockResolvedValue(paidOg);
      prisma.user.findUnique.mockResolvedValue(advisor);
      prisma.expenseOrderEditRequest.findFirst.mockResolvedValueOnce({ id: 'req-0' });

      await expect(
        service.create('u-1', { expenseOrderId: 'og-1', reason: 'x' }),
      ).rejects.toThrow(/edición aprobada/);
      expect(prisma.expenseOrderEditRequest.create).not.toHaveBeenCalled();
    });

    it('si un doble clic choca con el índice, devuelve la gemela sin notificar otra vez', async () => {
      prisma.expenseOrder.findUnique.mockResolvedValue(paidOg);
      prisma.user.findUnique.mockResolvedValue(advisor);
      prisma.expenseOrderEditRequest.findFirst
        .mockResolvedValueOnce(null) // aprobación activa
        .mockResolvedValueOnce(null) // pendiente previa
        .mockResolvedValueOnce(pendingRequest); // gemela
      prisma.expenseOrderEditRequest.create.mockRejectedValue({
        code: 'P2002',
        meta: { driverAdapterError: 'expense_order_edit_requests_pending_unique' },
      });

      const result = await service.create('u-1', { expenseOrderId: 'og-1', reason: 'x' });

      expect(result).toBe(pendingRequest);
      expect(notifications.notifyAllAdmins).not.toHaveBeenCalled();
    });
  });

  describe('approve / reject', () => {
    it('solo un admin aprueba', async () => {
      prisma.user.findUnique.mockResolvedValue(advisor);

      await expect(service.approve('req-1', 'u-1', {})).rejects.toThrow(ForbiddenException);
    });

    it(`al aprobar deja la edición vigente ${EDIT_APPROVAL_VALIDITY_HOURS} horas y avisa al solicitante`, async () => {
      prisma.user.findUnique.mockResolvedValue(admin);
      prisma.expenseOrderEditRequest.findFirst.mockResolvedValue(pendingRequest);
      prisma.expenseOrderEditRequest.update.mockResolvedValue({ id: 'req-1' });
      const before = Date.now();

      await service.approve('req-1', 'admin-1', { reviewNotes: 'ok' });

      const { data } = prisma.expenseOrderEditRequest.update.mock.calls[0][0];
      expect(data.status).toBe(EditRequestStatus.APPROVED);
      expect(data.reviewedById).toBe('admin-1');
      expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
        EDIT_APPROVAL_VALIDITY_HOURS * 60 * 60 * 1000 - 1000,
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          type: NotificationType.EXPENSE_ORDER_EDIT_REQUEST_APPROVED,
        }),
      );
    });

    it('una solicitud ya procesada no se vuelve a responder', async () => {
      prisma.user.findUnique.mockResolvedValue(admin);
      prisma.expenseOrderEditRequest.findFirst.mockResolvedValue(null);

      await expect(service.reject('req-1', 'admin-1', {})).rejects.toThrow(NotFoundException);
    });

    it('al rechazar avisa al solicitante con el motivo', async () => {
      prisma.user.findUnique.mockResolvedValue(admin);
      prisma.expenseOrderEditRequest.findFirst.mockResolvedValue(pendingRequest);
      prisma.expenseOrderEditRequest.update.mockResolvedValue({ id: 'req-1' });

      await service.reject('req-1', 'admin-1', { reviewNotes: 'Falta la factura' });

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.EXPENSE_ORDER_EDIT_REQUEST_REJECTED,
          message: expect.stringContaining('Falta la factura'),
        }),
      );
    });
  });

  describe('aprobación de un solo uso', () => {
    it('solo cuenta una aprobada, sin usar y sin vencer', async () => {
      prisma.expenseOrderEditRequest.findFirst.mockResolvedValue(null);

      await service.findActiveApproval('og-1', 'u-1');

      expect(prisma.expenseOrderEditRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: EditRequestStatus.APPROVED,
            consumedAt: null,
            expiresAt: { gt: expect.any(Date) },
          }),
        }),
      );
    });

    it('consumir es condicional: el segundo guardado no la encuentra libre', async () => {
      prisma.expenseOrderEditRequest.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(service.consumeApproval('req-1')).resolves.toBe(true);
      await expect(service.consumeApproval('req-1')).resolves.toBe(false);
      expect(prisma.expenseOrderEditRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });
  });
});
