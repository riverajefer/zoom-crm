import { Test, TestingModule } from '@nestjs/testing';
import { AdvancePaymentApprovalsService } from './advance-payment-approvals.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EditRequestStatus, NotificationType, Prisma } from '../../generated/prisma';
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { runWithAuditContext } from '../../common/utils/audit-context';

describe('AdvancePaymentApprovalsService', () => {
  let service: AdvancePaymentApprovalsService;
  let prisma: jest.Mocked<PrismaService>;
  let notificationsService: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      advancePaymentApproval: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        // `syncOrderAdvanceStatus` lo consulta para derivar la bandera de la
        // orden. Sin solicitudes no toca el campo; cada test pone las suyas.
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      payment: {
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      cashMovement: {
        update: jest.fn(),
      },
      $transaction: jest.fn(),
      // `lockOrderForUpdate` bloquea la OP con SQL crudo.
      $queryRaw: jest.fn(),
    } as any;
    // tx === prisma, así los mocks del modelo controlan lo que ocurre dentro
    (prisma.$transaction as unknown as jest.Mock).mockImplementation((fn: any) =>
      fn(prisma),
    );

    notificationsService = {
      notifyUsersWithPermission: jest.fn(),
      create: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancePaymentApprovalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ApprovalRequestRegistry, useValue: { register: jest.fn() } },
        {
          provide: WhatsappService,
          useValue: {
            sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
            getPhonesByPermission: jest.fn().mockResolvedValue(['573212016229']),
          },
        },
        { provide: WsEventsGateway, useValue: { emitApprovalCreated: jest.fn(), emitApprovalUpdated: jest.fn() } },
        {
          provide: CreditBalanceService,
          useValue: {
            applyCredit: jest.fn(),
            releaseCredit: jest.fn().mockResolvedValue(undefined),
            resyncCredit: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AdvancePaymentApprovalsService>(AdvancePaymentApprovalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requiresApproval', () => {
    it('should always require approval, even for users with approve_advance_payments', async () => {
      const result = await service.requiresApproval('u1');
      expect(result.required).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('should require approval for users without the permission', async () => {
      const result = await service.requiresApproval('u2');
      expect(result.required).toBe(true);
      expect(result.reason).toBeDefined();
    });
  });

  describe('createFromOrderCreation', () => {
    it('should create approval request', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ id: 'o1', orderNumber: '123' } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', firstName: 'John' } as any);
      (prisma.advancePaymentApproval.create as jest.Mock).mockResolvedValue({ id: 'req1' } as any);

      const result = await service.createFromOrderCreation('u1', 'o1', 'pay1');

      expect(prisma.advancePaymentApproval.create).toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { advancePaymentStatus: EditRequestStatus.PENDING, advancePaymentRejectedReason: null },
      });
      expect(notificationsService.notifyUsersWithPermission).toHaveBeenCalled();
      expect(result.id).toBe('req1');
    });

    it('should throw NotFoundException if order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.createFromOrderCreation('u1', 'o1', 'pay1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approve', () => {
    it('should approve a request and update order', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        requestedById: 'u1',
        order: { orderNumber: '123' },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.update as jest.Mock).mockResolvedValue({ id: 'req1', status: EditRequestStatus.APPROVED } as any);
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([
        { status: EditRequestStatus.APPROVED, paymentId: 'pay1' },
      ] as any);

      const result = await service.approve('req1', 'rev1', { reviewNotes: 'OK' });

      expect(prisma.advancePaymentApproval.update).toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: {
          advancePaymentStatus: EditRequestStatus.APPROVED,
          advancePaymentRejectedReason: null,
        },
      });
      expect(notificationsService.create).toHaveBeenCalled();
      expect(result.status).toBe(EditRequestStatus.APPROVED);
    });

    it('should throw NotFoundException if request not found', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.approve('req1', 'rev1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if reviewer lacks permission', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [] },
      } as any);

      await expect(service.approve('req1', 'rev1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reject', () => {
    it('should reject a request, delete payment and update order balance', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'pay1',
        requestedById: 'u1',
        order: { orderNumber: '123', total: 1000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({ id: 'req1', status: EditRequestStatus.REJECTED } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 1000 } as any);
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([] as any);
      // El pago se eliminó: la solicitud queda rechazada y sin `paymentId`.
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([
        { status: EditRequestStatus.REJECTED, paymentId: null },
      ] as any);

      const result = await service.reject('req1', 'rev1', { reviewNotes: 'No' });

      expect(prisma.advancePaymentApproval.update).toHaveBeenCalled();
      expect(prisma.payment.delete).toHaveBeenCalledWith({ where: { id: 'pay1' } });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: {
          paidAmount: new Prisma.Decimal(0),
          balance: new Prisma.Decimal(1000),
        },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: {
          advancePaymentStatus: EditRequestStatus.REJECTED,
          advancePaymentRejectedReason: 'No',
        },
      });
      expect(notificationsService.create).toHaveBeenCalled();
      expect(result?.status).toBe(EditRequestStatus.REJECTED);
    });

    // Regresión OP-2026-1504: el asesor registró el mismo pago tres veces, Caja
    // aprobó el bueno y rechazó el duplicado 39 segundos después. Con el campo
    // escrito a mano, ese rechazo borraba la aprobación y trababa la orden para
    // siempre con el dinero completo ya recibido.
    it('should not block the order when another approved payment survives', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req-duplicado',
        orderId: 'o1',
        paymentId: 'pay-duplicado',
        requestedById: 'u1',
        order: { orderNumber: 'OP-2026-1504', total: 7000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req-duplicado',
        status: EditRequestStatus.REJECTED,
      } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 7000 } as any);
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([
        { amount: new Prisma.Decimal(7000) },
      ] as any);
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([
        { status: EditRequestStatus.APPROVED, paymentId: 'pay-bueno' },
        { status: EditRequestStatus.REJECTED, paymentId: null },
      ] as any);

      await service.reject('req-duplicado', 'rev1', {
        reviewNotes: 'El soporte de pago es el mismo del abono.',
      });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: {
          advancePaymentStatus: EditRequestStatus.APPROVED,
          advancePaymentRejectedReason: null,
        },
      });
    });

    it('should keep the order pending when another request is still awaiting Caja', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'pay1',
        requestedById: 'u1',
        order: { orderNumber: '123', total: 1000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 1000 } as any);
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([
        { status: EditRequestStatus.REJECTED, paymentId: null },
        { status: EditRequestStatus.APPROVED, paymentId: 'pay-bueno' },
        { status: EditRequestStatus.PENDING, paymentId: 'pay-otro' },
      ] as any);

      await service.reject('req1', 'rev1', { reviewNotes: 'duplicado' });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: {
          advancePaymentStatus: EditRequestStatus.PENDING,
          advancePaymentRejectedReason: null,
        },
      });
    });

    it('should keep the remaining payments applied to the balance', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'pay1',
        requestedById: 'u1',
        order: { orderNumber: '123', total: 630000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 630000 } as any);
      // Sobreviven un anticipo aprobado y un abono posterior de Caja
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([
        { amount: new Prisma.Decimal(100000) },
        { amount: new Prisma.Decimal(50000) },
      ] as any);

      await service.reject('req1', 'rev1', { reviewNotes: 'error en el comprobante' });

      const updateArgs = (prisma.order.update as jest.Mock).mock.calls[0][0];
      expect(Number(updateArgs.data.paidAmount.toString())).toBe(150000);
      expect(Number(updateArgs.data.balance.toString())).toBe(480000);
    });

    it('should void the linked cash movement so it stops counting as income', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'pay1',
        requestedById: 'u1',
        order: { orderNumber: '123', total: 1000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 1000 } as any);
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        cashMovementId: 'cm1',
      } as any);

      await service.reject('req1', 'rev1', { reviewNotes: 'comprobante ilegible' });

      const voidArgs = (prisma.cashMovement.update as jest.Mock).mock.calls[0][0];
      expect(voidArgs.where).toEqual({ id: 'cm1' });
      expect(voidArgs.data.isVoided).toBe(true);
      expect(voidArgs.data.voidedById).toBe('rev1');
      expect(voidArgs.data.voidReason).toContain('comprobante ilegible');
    });

    it('should void the cash movement before deleting the payment', async () => {
      const order: string[] = [];
      (prisma.cashMovement.update as jest.Mock).mockImplementation(async () => {
        order.push('void');
      });
      (prisma.payment.delete as jest.Mock).mockImplementation(async () => {
        order.push('delete');
      });

      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'pay1',
        requestedById: 'u1',
        order: { orderNumber: '123', total: 1000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 1000 } as any);
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        cashMovementId: 'cm1',
      } as any);

      await service.reject('req1', 'rev1', {});

      // Al borrar el pago se pierde el vínculo con el movimiento (la FK vive en
      // Payment), así que la anulación debe ocurrir antes.
      expect(order).toEqual(['void', 'delete']);
    });

    it('should not touch cash movements when the payment had none', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'pay1',
        requestedById: 'u1',
        order: { orderNumber: '123', total: 1000 },
      } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: { permissions: [{ permission: { name: 'approve_advance_payments' } }] },
      } as any);
      (prisma.advancePaymentApproval.findUnique as jest.Mock).mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      } as any);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ total: 1000 } as any);
      // Pago registrado sin sesión de caja abierta → sin movimiento vinculado
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        cashMovementId: null,
      } as any);

      await service.reject('req1', 'rev1', {});

      expect(prisma.cashMovement.update).not.toHaveBeenCalled();
      expect(prisma.payment.delete).toHaveBeenCalledWith({ where: { id: 'pay1' } });
    });

    it('should throw NotFoundException if request not found', async () => {
      (prisma.advancePaymentApproval.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.reject('req1', 'rev1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('find pending, all, my', () => {
    it('should findPendingRequests', async () => {
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([{ id: '1' }] as any);
      expect(await service.findPendingRequests()).toEqual([{ id: '1' }]);
    });

    it('a un cajero solo le muestra los anticipos de las OP de su sede', async () => {
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([]);
      await runWithAuditContext(
        { location: { locationId: 'loc-104', all: false, permittedIds: ['loc-104'] } },
        () => service.findPendingRequests(),
      );
      const [[{ where }]] = (prisma.advancePaymentApproval.findMany as jest.Mock).mock.calls.slice(-1);
      expect(where).toEqual({ status: EditRequestStatus.PENDING, order: { locationId: { in: ['loc-104'] } } });
    });

    it('al admin le muestra los de todas las sedes aunque tenga una activa', async () => {
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([]);
      await runWithAuditContext(
        { location: { locationId: 'loc-104', all: false, permittedIds: ['loc-104'], viewAll: true } },
        () => service.findPendingRequests(),
      );
      const [[{ where }]] = (prisma.advancePaymentApproval.findMany as jest.Mock).mock.calls.slice(-1);
      expect(where).toEqual({ status: EditRequestStatus.PENDING, order: {} });
    });

    it('should findAll', async () => {
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([{ id: '1' }] as any);
      expect(await service.findAll()).toEqual([{ id: '1' }]);
    });

    it('should findByUser', async () => {
      (prisma.advancePaymentApproval.findMany as jest.Mock).mockResolvedValue([{ id: '1' }] as any);
      expect(await service.findByUser('user1')).toEqual([{ id: '1' }]);
    });
  });
});
