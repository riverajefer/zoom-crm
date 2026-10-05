import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PaymentAccountingStatus } from '../../generated/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { reopenPaymentAccountingReview } from './payment-accounting.util';
import { PaymentVerificationsRepository } from './payment-verifications.repository';
import { PaymentVerificationsService } from './payment-verifications.service';

const mockRepository = {
  findMany: jest.fn(),
  countByStatus: jest.fn(),
  findReviewable: jest.fn(),
  setStatus: jest.fn(),
  findHistory: jest.fn(),
};

const mockNotifications = {
  create: jest.fn(),
  notifyUsersWithPermission: jest.fn(),
};

const payment = (id: string, accountingStatus: PaymentAccountingStatus) => ({
  id,
  amount: 150000,
  accountingStatus,
  receivedById: 'cajero-1',
  order: { id: 'order-1', orderNumber: '125-OP-0012' },
});

describe('PaymentVerificationsService', () => {
  let service: PaymentVerificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentVerificationsService,
        { provide: PaymentVerificationsRepository, useValue: mockRepository },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(PaymentVerificationsService);
  });

  describe('findAll', () => {
    it('convierte las fechas a días completos de Colombia y pagina', async () => {
      mockRepository.findMany.mockResolvedValue({ data: [], total: 60, totalAmount: 900 });

      const result = await service.findAll({
        status: PaymentAccountingStatus.PENDING,
        dateFrom: '2026-10-01',
        dateTo: '2026-10-01',
        search: '  OP-0012 ',
        page: 2,
        limit: 25,
      });

      const [filters, page, limit] = mockRepository.findMany.mock.calls[0];
      expect(filters.dateFrom).toEqual(new Date('2026-10-01T00:00:00-05:00'));
      expect(filters.dateTo.getTime()).toBeGreaterThan(
        new Date('2026-10-01T23:59:58-05:00').getTime(),
      );
      expect(filters.search).toBe('OP-0012');
      expect([page, limit]).toEqual([2, 25]);
      expect(result.meta).toEqual({
        total: 60,
        page: 2,
        limit: 25,
        totalPages: 3,
        totalAmount: 900,
      });
    });
  });

  describe('getSummary', () => {
    it('devuelve los tres estados aunque alguno no tenga pagos', async () => {
      mockRepository.countByStatus.mockResolvedValue([
        { accountingStatus: 'PENDING', _count: { _all: 4 }, _sum: { amount: 1000 } },
      ]);

      await expect(service.getSummary()).resolves.toEqual({
        PENDING: { count: 4, amount: 1000 },
        OBSERVED: { count: 0, amount: 0 },
        VERIFIED: { count: 0, amount: 0 },
      });
    });
  });

  describe('verify', () => {
    it('verifica en lote y se salta los que ya estaban verificados', async () => {
      mockRepository.findReviewable.mockResolvedValue([
        payment('p1', PaymentAccountingStatus.PENDING),
        payment('p2', PaymentAccountingStatus.OBSERVED),
        payment('p3', PaymentAccountingStatus.VERIFIED),
      ]);

      const result = await service.verify(
        { paymentIds: ['p1', 'p2', 'p3', 'p1'], notes: ' ok ' },
        'conta-1',
      );

      expect(mockRepository.findReviewable).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
      expect(mockRepository.setStatus).toHaveBeenCalledWith(
        ['p1', 'p2'],
        PaymentAccountingStatus.VERIFIED,
        'conta-1',
        'ok',
      );
      expect(result).toEqual({ verified: 2, skipped: 1 });
      expect(mockNotifications.create).not.toHaveBeenCalled();
    });

    it('falla sin tocar nada si un pago no está en la bandeja (otra sede, anulado, sin aprobar)', async () => {
      mockRepository.findReviewable.mockResolvedValue([
        payment('p1', PaymentAccountingStatus.PENDING),
      ]);

      await expect(
        service.verify({ paymentIds: ['p1', 'p2'] }, 'conta-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepository.setStatus).not.toHaveBeenCalled();
    });
  });

  describe('observe', () => {
    it('exige motivo', async () => {
      await expect(service.observe('p1', { notes: '   ' }, 'conta-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepository.setStatus).not.toHaveBeenCalled();
    });

    it('deja el pago observado y avisa a quien lo recibió y a la caja de su sede', async () => {
      mockRepository.findReviewable.mockResolvedValue([
        payment('p1', PaymentAccountingStatus.PENDING),
      ]);

      await service.observe('p1', { notes: 'El comprobante no coincide' }, 'conta-1');

      expect(mockRepository.setStatus).toHaveBeenCalledWith(
        ['p1'],
        PaymentAccountingStatus.OBSERVED,
        'conta-1',
        'El comprobante no coincide',
      );
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'cajero-1',
          type: NotificationType.PAYMENT_ACCOUNTING_OBSERVED,
          relatedId: 'order-1',
          message: expect.stringContaining('125-OP-0012'),
        }),
      );
      expect(mockNotifications.notifyUsersWithPermission).toHaveBeenCalledWith(
        'approve_advance_payments',
        expect.objectContaining({ type: NotificationType.PAYMENT_ACCOUNTING_OBSERVED }),
        { orderId: 'order-1' },
        ['cajero-1', 'conta-1'],
      );
    });
  });
});

describe('reopenPaymentAccountingReview', () => {
  const tx = {
    payment: { updateMany: jest.fn() },
    paymentAccountingReview: { create: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('devuelve a pendiente un pago ya revisado y lo deja en la bitácora', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 1 });

    await reopenPaymentAccountingReview(tx as any, 'p1', 'user-1');

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', accountingStatus: { not: PaymentAccountingStatus.PENDING } },
      data: {
        accountingStatus: PaymentAccountingStatus.PENDING,
        accountingReviewedById: null,
        accountingReviewedAt: null,
        accountingNotes: null,
      },
    });
    expect(tx.paymentAccountingReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: 'p1',
        status: PaymentAccountingStatus.PENDING,
        reviewedById: 'user-1',
      }),
    });
  });

  it('no escribe bitácora si nadie había revisado el pago', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    await reopenPaymentAccountingReview(tx as any, 'p1', 'user-1');

    expect(tx.paymentAccountingReview.create).not.toHaveBeenCalled();
  });
});
