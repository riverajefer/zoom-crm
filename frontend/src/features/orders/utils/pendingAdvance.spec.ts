import { describe, it, expect } from 'vitest';
import { getPendingAdvanceInfo } from './pendingAdvance';
import type { Order } from '../../../types/order.types';

const buildOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    total: '80000',
    paidAmount: '100000',
    balance: '-20000',
    payments: [],
    advancePaymentApprovals: [],
    advancePaymentStatus: null,
    ...overrides,
  }) as unknown as Order;

describe('getPendingAdvanceInfo', () => {
  it('reporta saldo a favor cuando lo pagado supera el total', () => {
    const info = getPendingAdvanceInfo(buildOrder());

    expect(info.effectiveBalance).toBe(-20000);
    expect(info.hasPendingAdvance).toBe(false);
  });

  it('una OP anulada no tiene saldo por cobrar', () => {
    const info = getPendingAdvanceInfo(
      buildOrder({
        status: 'ANULADO',
        total: '696000',
        paidAmount: '0',
        balance: '696000',
      }),
    );

    expect(info.effectiveBalance).toBe(0);
  });

  it('una OP anulada conserva su saldo a favor', () => {
    const info = getPendingAdvanceInfo(
      buildOrder({
        status: 'ANULADO',
        total: '120000',
        paidAmount: '60000',
        reversedAmount: '120000',
        balance: '-60000',
      }),
    );

    expect(info.effectiveBalance).toBe(-60000);
  });

  it('no cuenta como saldo a favor el excedente ya aplicado a otras órdenes', () => {
    const info = getPendingAdvanceInfo(
      buildOrder({ appliedCreditAmount: '20000', balance: '0' }),
    );

    expect(info.effectiveBalance).toBe(0);
  });

  it('deja disponible solo la parte del excedente no aplicada', () => {
    // total 70.000, pagado 100.000 → 30.000 de excedente, 20.000 ya gastados
    const info = getPendingAdvanceInfo(
      buildOrder({
        total: '70000',
        appliedCreditAmount: '20000',
        balance: '-10000',
      }),
    );

    expect(info.effectiveBalance).toBe(-10000);
  });

  it('no descuenta los abonos pendientes de aprobación de Caja', () => {
    const info = getPendingAdvanceInfo(
      buildOrder({
        total: '100000',
        paidAmount: '40000',
        payments: [{ id: 'pay-1', amount: '40000' }],
        advancePaymentApprovals: [
          { status: 'PENDING', paymentId: 'pay-1' },
        ],
      } as unknown as Partial<Order>),
    );

    expect(info.hasPendingAdvance).toBe(true);
    expect(info.pendingAmount).toBe(40000);
    expect(info.effectiveBalance).toBe(100000);
  });

  it('la venta anulada por una devolución no queda como saldo a cobrar', () => {
    // OP de 595.000 con 150.000 abonados que se cae entera: se devuelven los
    // 150.000 y se anula la venta. El cliente no debe los 445.000 restantes.
    const info = getPendingAdvanceInfo({
      total: '595000',
      paidAmount: '0',
      reversedAmount: '595000',
    } as any);

    expect(info.effectiveBalance).toBe(0);
  });

  it('la devolución parcial deja pendiente solo lo que sigue vivo', () => {
    // Total 6.300, se anularon 3.000, el cliente abonó 3.300 de los 3.300 vivos.
    const info = getPendingAdvanceInfo({
      total: '6300',
      paidAmount: '3300',
      reversedAmount: '3000',
    } as any);

    expect(info.effectiveBalance).toBe(0);
  });
});
