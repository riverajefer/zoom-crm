import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayrollPaymentsService } from './payroll-payments.service';
import { PayrollPaymentsRepository } from './payroll-payments.repository';

describe('PayrollPaymentsService', () => {
  let service: PayrollPaymentsService;
  let repository: jest.Mocked<PayrollPaymentsRepository>;
  const tx = {} as any;

  const item = (totalPayment: number, paid: number[] = []) => ({
    id: 'i1',
    periodId: 'p1',
    totalPayment,
    payments: paid.map((amount) => ({ amount })),
  });

  beforeEach(() => {
    repository = {
      transaction: jest.fn((fn: any) => fn(tx)),
      lockPeriod: jest.fn().mockResolvedValue(undefined),
      findItemWithPayments: jest.fn(),
      createPayments: jest.fn().mockResolvedValue([{ id: 'pay1' }]),
      findPaymentById: jest.fn(),
      voidPayment: jest.fn().mockResolvedValue({ id: 'pay1', isVoided: true }),
      findPeriodItemsForStatus: jest.fn(),
      findPeriodStatus: jest.fn().mockResolvedValue({ status: 'CALCULATED' }),
      updatePeriodStatus: jest.fn().mockResolvedValue(undefined),
      findByPeriod: jest.fn(),
    } as any;
    service = new PayrollPaymentsService(repository);
  });

  const dto = (lines: { amount: number; paymentMethod: 'CASH' | 'TRANSFER' }[]) => ({
    paidAt: '2026-10-15',
    lines,
  });

  describe('register', () => {
    it('registra un pago mixto como dos filas y bloquea el periodo antes de leer', async () => {
      repository.findItemWithPayments.mockResolvedValue(item(632000) as any);
      repository.findPeriodItemsForStatus.mockResolvedValue([item(632000, [632000])] as any);

      await service.register(
        'p1',
        'i1',
        dto([
          { amount: 612000, paymentMethod: 'CASH' },
          { amount: 20000, paymentMethod: 'TRANSFER' },
        ]),
        'u1',
      );

      expect(repository.lockPeriod).toHaveBeenCalledWith(tx, 'p1');
      expect(repository.lockPeriod.mock.invocationCallOrder[0]).toBeLessThan(
        repository.findItemWithPayments.mock.invocationCallOrder[0],
      );
      const rows = repository.createPayments.mock.calls[0][1];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ amount: 612000, paymentMethod: 'CASH', createdById: 'u1' });
      expect(rows[1]).toMatchObject({ amount: 20000, paymentMethod: 'TRANSFER' });
    });

    it('rechaza un pago que supera el saldo', async () => {
      repository.findItemWithPayments.mockResolvedValue(item(632000, [600000]) as any);

      await expect(
        service.register('p1', 'i1', dto([{ amount: 40000, paymentMethod: 'CASH' }]), 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(repository.createPayments).not.toHaveBeenCalled();
    });

    it('rechaza pagar a quien ya no tiene saldo', async () => {
      repository.findItemWithPayments.mockResolvedValue(item(632000, [632000]) as any);

      await expect(
        service.register('p1', 'i1', dto([{ amount: 1, paymentMethod: 'CASH' }]), 'u1'),
      ).rejects.toThrow('ya se le pagó');
    });

    it('rechaza un registro de otro periodo', async () => {
      repository.findItemWithPayments.mockResolvedValue({ ...item(100), periodId: 'p2' } as any);
      await expect(
        service.register('p1', 'i1', dto([{ amount: 1, paymentMethod: 'CASH' }]), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('404 si el registro no existe', async () => {
      repository.findItemWithPayments.mockResolvedValue(null);
      await expect(
        service.register('p1', 'i1', dto([{ amount: 1, paymentMethod: 'CASH' }]), 'u1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('un abono deja el periodo abierto', async () => {
      repository.findItemWithPayments.mockResolvedValue(item(632000) as any);
      repository.findPeriodItemsForStatus.mockResolvedValue([item(632000, [300000])] as any);

      const result = await service.register(
        'p1',
        'i1',
        dto([{ amount: 300000, paymentMethod: 'CASH' }]),
        'u1',
      );
      expect(result.periodStatus).toBe('CALCULATED');
      expect(repository.updatePeriodStatus).not.toHaveBeenCalled();
    });

    it('cierra el periodo como «Pagado» con el último pago', async () => {
      repository.findItemWithPayments.mockResolvedValue(item(632000) as any);
      repository.findPeriodItemsForStatus.mockResolvedValue([
        item(970000, [970000]),
        item(0),
        item(632000, [632000]),
      ] as any);

      const result = await service.register(
        'p1',
        'i1',
        dto([{ amount: 632000, paymentMethod: 'TRANSFER' }]),
        'u1',
      );
      expect(result.periodStatus).toBe('PAID');
      expect(repository.updatePeriodStatus).toHaveBeenCalledWith(tx, 'p1', 'PAID');
    });
  });

  describe('void', () => {
    beforeEach(() => {
      repository.findPaymentById.mockResolvedValue({
        id: 'pay1',
        isVoided: false,
        payrollItem: { periodId: 'p1' },
      } as any);
    });

    it('anula con motivo y reabre un periodo pagado', async () => {
      repository.findPeriodStatus.mockResolvedValue({ status: 'PAID' } as any);
      repository.findPeriodItemsForStatus.mockResolvedValue([item(632000, [612000])] as any);

      const result = await service.void('p1', 'pay1', { reason: '  Era transferencia  ' }, 'u2');

      expect(repository.voidPayment).toHaveBeenCalledWith(tx, 'pay1', 'u2', 'Era transferencia');
      expect(result.periodStatus).toBe('CALCULATED');
      expect(repository.updatePeriodStatus).toHaveBeenCalledWith(tx, 'p1', 'CALCULATED');
    });

    it('no anula dos veces', async () => {
      repository.findPaymentById.mockResolvedValue({
        id: 'pay1',
        isVoided: true,
        payrollItem: { periodId: 'p1' },
      } as any);
      await expect(service.void('p1', 'pay1', { reason: 'error' }, 'u2')).rejects.toThrow(
        'ya fue anulado',
      );
    });

    it('404 si el pago no existe', async () => {
      repository.findPaymentById.mockResolvedValue(null);
      await expect(service.void('p1', 'x', { reason: 'error' }, 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
