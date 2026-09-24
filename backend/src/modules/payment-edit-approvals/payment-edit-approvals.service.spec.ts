// uuid v9+ es ESM-only y rompe Jest; debe mockearse antes de los imports
// porque StorageService lo importa transitivamente.
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentEditApprovalsService } from './payment-edit-approvals.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import { StorageService } from '../storage/storage.service';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EditRequestStatus, Prisma } from '../../generated/prisma';

describe('PaymentEditApprovalsService', () => {
  let service: PaymentEditApprovalsService;
  let prisma: any;
  let notificationsService: any;
  let wsEventsGateway: any;
  let storageService: any;
  let consecutivesService: any;
  let auditLogsService: any;

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
      payment: {
        findUnique: jest.fn(),
        // Método vigente del pago antes de aplicar la edición.
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ paymentMethod: 'TRANSFER' }),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      cashMovement: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cashSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentEditApproval: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
      // `lockOrderForUpdate` bloquea la OP con SQL crudo.
      $queryRaw: jest.fn(),
    };
    // tx === prisma para controlar tx.model.method con el mismo mock
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));

    notificationsService = {
      notifyUsersWithPermission: jest.fn(),
      create: jest.fn(),
    };
    wsEventsGateway = {
      emitApprovalCreated: jest.fn(),
      emitApprovalUpdated: jest.fn(),
    };
    storageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      hardDeleteFile: jest.fn(),
    };

    consecutivesService = {
      generateNumber: jest.fn().mockResolvedValue('RC-2026-9999'),
    };
    auditLogsService = {
      logUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEditApprovalsService,
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
        { provide: WsEventsGateway, useValue: wsEventsGateway },
        { provide: StorageService, useValue: storageService },
        {
          provide: CreditBalanceService,
          useValue: {
            applyCredit: jest.fn(),
            releaseCredit: jest.fn().mockResolvedValue(undefined),
            resyncCredit: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ConsecutivesService, useValue: consecutivesService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<PaymentEditApprovalsService>(
      PaymentEditApprovalsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requiresApproval', () => {
    it('returns required:false when user has approve_payment_edits', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      expect(await service.requiresApproval('u1')).toEqual({ required: false });
    });

    it('returns required:true when user lacks permission', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: { permissions: [] },
      });
      const result = await service.requiresApproval('u1');
      expect(result.required).toBe(true);
      expect(result.reason).toBeDefined();
    });
  });

  describe('createRequest', () => {
    it('creates a PENDING request with the new payload and does NOT touch the payment/order totals', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'OP-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', firstName: 'Ana' });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(258000),
        paymentMethod: 'TRANSFER',
        paymentDate: new Date('2026-05-11'),
        reference: null,
        notes: null,
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue(null);
      prisma.paymentEditApproval.create.mockResolvedValue({ id: 'req1' });

      await service.createRequest('o1', 'p1', 'u1', { amount: 107000 });

      // No se modifica el pago ni se recalculan totales
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();

      const createArg = prisma.paymentEditApproval.create.mock.calls[0][0];
      expect(createArg.data.status).toBe(EditRequestStatus.PENDING);
      expect(Number(createArg.data.newAmount.toString())).toBe(107000);
      expect(Number(createArg.data.oldAmount.toString())).toBe(258000);
      expect(notificationsService.notifyUsersWithPermission).toHaveBeenCalled();
    });

    it('does not duplicate a pending request for the same payment', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'OP-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(100),
        paymentMethod: 'CASH',
        paymentDate: new Date(),
        reference: null,
        notes: null,
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue({ id: 'existing' });
      prisma.paymentEditApproval.findUnique.mockResolvedValue({ id: 'existing' });

      await service.createRequest('o1', 'p1', 'u1', { amount: 200 });
      expect(prisma.paymentEditApproval.create).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('applies the new payload to the payment and recalculates paidAmount/balance', async () => {
      // validateReviewerPermission
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'p1',
        requestedById: 'u1',
        status: EditRequestStatus.PENDING,
        newAmount: new Prisma.Decimal(107000),
        newPaymentMethod: null,
        newPaymentDate: null,
        newReference: null,
        newNotes: null,
        order: { id: 'o1', orderNumber: 'OP-1' },
      });
      prisma.payment.update.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(107000),
        paymentMethod: 'TRANSFER',
        cashMovementId: null,
      });
      prisma.payment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(107000) },
      ]);
      prisma.order.findUnique.mockResolvedValue({ total: new Prisma.Decimal(150000) });
      prisma.paymentEditApproval.update.mockResolvedValue({ id: 'req1' });

      await service.approve('req1', 'rev', {});

      // El pago se actualiza con el nuevo monto
      const payUpdate = prisma.payment.update.mock.calls[0][0];
      expect(Number(payUpdate.data.amount.toString())).toBe(107000);

      // Se recalcula (no se suma): paidAmount=107000, balance=150000-107000
      const orderUpdate = prisma.order.update.mock.calls.find(
        (c: any) => c[0].data.paidAmount !== undefined,
      )[0];
      expect(Number(orderUpdate.data.paidAmount.toString())).toBe(107000);
      expect(Number(orderUpdate.data.balance.toString())).toBe(43000);
    });

    it('links the proposed receipt to the payment and deletes the previous one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'p1',
        requestedById: 'u1',
        status: EditRequestStatus.PENDING,
        newAmount: null,
        newPaymentMethod: null,
        newPaymentDate: null,
        newReference: null,
        newNotes: null,
        oldReceiptFileId: 'old-file',
        newReceiptFileId: 'new-file',
        order: { id: 'o1', orderNumber: 'OP-1' },
      });
      prisma.payment.update.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(100),
        paymentMethod: 'CASH',
        cashMovementId: null,
      });
      prisma.payment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(100) },
      ]);
      prisma.order.findUnique.mockResolvedValue({ total: new Prisma.Decimal(100) });
      prisma.paymentEditApproval.update.mockResolvedValue({ id: 'req1' });

      await service.approve('req1', 'rev', {});

      const payUpdate = prisma.payment.update.mock.calls[0][0];
      expect(payUpdate.data.receiptFileId).toBe('new-file');
      expect(storageService.deleteFile).toHaveBeenCalledWith('old-file', 'rev');
    });

    it('throws if reviewer lacks permission', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [] },
      });
      await expect(service.approve('req1', 'rev', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFound if request is not pending', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue(null);
      await expect(service.approve('req1', 'rev', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // Antes la aprobación solo copiaba monto y método al movimiento: un pago que
  // pasaba a saldo a favor dejaba vivo su ingreso en caja (OP-2026-3575).
  describe('approve — movimiento de caja', () => {
    const pendingRequest = (newPaymentMethod: string) => ({
      id: 'req1',
      orderId: 'o1',
      paymentId: 'p1',
      requestedById: 'u1',
      status: EditRequestStatus.PENDING,
      newAmount: null,
      newPaymentMethod,
      newPaymentDate: null,
      newReference: null,
      newNotes: null,
      newBankEntity: null,
      newReceiptFileId: null,
      order: { id: 'o1', orderNumber: 'OP-2026-3575' },
    });

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      prisma.payment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(198300) },
      ]);
      prisma.order.findUnique.mockResolvedValue({
        clientId: 'c1',
        total: new Prisma.Decimal(198300),
      });
      prisma.paymentEditApproval.update.mockResolvedValue({ id: 'req1' });
    });

    it('anula el movimiento y suelta el vínculo cuando el pago pasa a saldo a favor', async () => {
      prisma.paymentEditApproval.findFirst.mockResolvedValue(
        pendingRequest('CREDIT_BALANCE'),
      );
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        paymentMethod: 'TRANSFER',
      });
      prisma.payment.update.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(198300),
        paymentMethod: 'CREDIT_BALANCE',
        cashMovementId: 'mov1',
      });
      prisma.cashMovement.findUnique.mockResolvedValue({
        id: 'mov1',
        amount: new Prisma.Decimal(198300),
        paymentMethod: 'TRANSFER',
        description: 'Abono a Orden OP-2026-3575',
        cashSession: { id: 's1', status: 'OPEN' },
      });

      await service.approve('req1', 'rev', {});

      const movUpdate = prisma.cashMovement.update.mock.calls[0][0];
      expect(movUpdate.where).toEqual({ id: 'mov1' });
      expect(movUpdate.data.isVoided).toBe(true);
      expect(movUpdate.data.voidedById).toBe('rev');
      expect(movUpdate.data.voidReason).toContain('saldo a favor');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { cashMovementId: null },
      });
      // Sesión abierta: no altera un arqueo firmado, no hay rastro que dejar.
      expect(auditLogsService.logUpdate).not.toHaveBeenCalled();
    });

    it('crea el movimiento en la caja abierta cuando el pago deja de ser saldo a favor', async () => {
      prisma.paymentEditApproval.findFirst.mockResolvedValue(
        pendingRequest('CASH'),
      );
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        paymentMethod: 'CREDIT_BALANCE',
      });
      prisma.payment.update.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(198300),
        paymentMethod: 'CASH',
        cashMovementId: null,
      });
      prisma.cashSession.findMany.mockResolvedValue([
        { id: 's1', cashRegisterId: 'r1' },
      ]);
      prisma.cashMovement.create.mockResolvedValue({ id: 'mov-new' });

      await service.approve('req1', 'rev', {});

      const created = prisma.cashMovement.create.mock.calls[0][0].data;
      expect(created.cashSessionId).toBe('s1');
      expect(created.receiptNumber).toBe('RC-2026-9999');
      expect(created.movementType).toBe('INCOME');
      expect(created.paymentMethod).toBe('CASH');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { cashMovementId: 'mov-new' },
      });
    });

    it('deja rastro en auditoría si el movimiento anulado era de una sesión cerrada', async () => {
      prisma.paymentEditApproval.findFirst.mockResolvedValue(
        pendingRequest('CREDIT_BALANCE'),
      );
      prisma.payment.update.mockResolvedValue({
        id: 'p1',
        amount: new Prisma.Decimal(198300),
        paymentMethod: 'CREDIT_BALANCE',
        cashMovementId: 'mov1',
      });
      prisma.cashMovement.findUnique.mockResolvedValue({
        id: 'mov1',
        amount: new Prisma.Decimal(198300),
        paymentMethod: 'TRANSFER',
        description: 'Abono a Orden OP-2026-3575',
        cashSession: { id: 's1', status: 'CLOSED' },
      });

      await service.approve('req1', 'rev', {});

      expect(
        prisma.cashMovement.update.mock.calls[0][0].data.voidReason,
      ).toContain('tras el cierre');
      expect(auditLogsService.logUpdate).toHaveBeenCalledWith(
        'CashMovement',
        'mov1',
        expect.anything(),
        expect.objectContaining({ editedAfterSessionClose: true }),
        'rev',
      );
    });
  });

  describe('reject', () => {
    it('marks REJECTED and does NOT modify the payment', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'p1',
        requestedById: 'u1',
        status: EditRequestStatus.PENDING,
        order: { id: 'o1', orderNumber: 'OP-1' },
      });
      prisma.paymentEditApproval.update.mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      });

      await service.reject('req1', 'rev', { reviewNotes: 'No corresponde' });

      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
      const updateArg = prisma.paymentEditApproval.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe(EditRequestStatus.REJECTED);
    });

    it('hard-deletes the orphaned proposed receipt on rejection', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'rev',
        role: { permissions: [{ permission: { name: 'approve_payment_edits' } }] },
      });
      prisma.paymentEditApproval.findFirst.mockResolvedValue({
        id: 'req1',
        orderId: 'o1',
        paymentId: 'p1',
        requestedById: 'u1',
        status: EditRequestStatus.PENDING,
        newReceiptFileId: 'orphan-file',
        order: { id: 'o1', orderNumber: 'OP-1' },
      });
      prisma.paymentEditApproval.update.mockResolvedValue({
        id: 'req1',
        status: EditRequestStatus.REJECTED,
      });

      await service.reject('req1', 'rev', {});
      expect(storageService.hardDeleteFile).toHaveBeenCalledWith('orphan-file');
    });
  });
});
