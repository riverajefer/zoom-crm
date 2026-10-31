import {
  assertRefundsStayCovered,
  computeAvailableOverpayment,
  computeNetPaidAmount,
  computeOrderBalance,
  computeReversedNetAmount,
} from './order-balance.util';

const n = (value: { toString(): string }) => Number(value.toString());

describe('order-balance.util', () => {
  describe('computeOrderBalance', () => {
    it('resta lo abonado al total', () => {
      expect(
        n(computeOrderBalance({ total: 100000, paidAmount: 40000, reversedAmount: 0 })),
      ).toBe(60000);
    });

    it('deja el saldo negativo cuando hay sobrepago', () => {
      expect(
        n(computeOrderBalance({ total: 80000, paidAmount: 100000, reversedAmount: 0 })),
      ).toBe(-20000);
    });

    it('neutraliza el excedente ya aplicado a otras órdenes', () => {
      expect(
        n(
          computeOrderBalance({
            total: 80000,
            paidAmount: 100000,
            appliedCreditAmount: 20000,
            reversedAmount: 0,
          }),
        ),
      ).toBe(0);
    });

    it('deja pendiente lo que el cliente debe cuando el total sube tras gastar el saldo', () => {
      // El excedente de 20.000 ya se gastó; luego el total subió a 95.000
      expect(
        n(
          computeOrderBalance({
            total: 95000,
            paidAmount: 100000,
            appliedCreditAmount: 20000,
            reversedAmount: 0,
          }),
        ),
      ).toBe(15000);
    });

    it('trata null/undefined como cero', () => {
      expect(
        n(
          computeOrderBalance({
            total: 100000,
            paidAmount: null,
            appliedCreditAmount: undefined,
            reversedAmount: null,
          }),
        ),
      ).toBe(100000);
    });

    it('la venta anulada baja lo que la orden vale, no lo que el cliente abonó', () => {
      // OP de 500.000 entregada a medias: se anulan 200.000 y se devuelven 200.000.
      expect(
        n(
          computeOrderBalance({
            total: 500000,
            paidAmount: 300000,
            reversedAmount: 200000,
          }),
        ),
      ).toBe(0);
    });

    it('anular la venta completa deja en cero al cliente que solo abonó una parte', () => {
      // El caso que motivó el campo: 500.000 de OP, 200.000 abonados, el trabajo
      // se cae entero. Se le devuelven sus 200.000 y no queda debiendo los otros
      // 300.000 de un trabajo que ya no existe.
      expect(
        n(
          computeOrderBalance({
            total: 500000,
            paidAmount: 0,
            reversedAmount: 500000,
          }),
        ),
      ).toBe(0);
    });
  });

  describe('computeNetPaidAmount', () => {
    it('devuelve la suma de pagos cuando no hubo devoluciones', () => {
      expect(n(computeNetPaidAmount(100000))).toBe(100000);
    });

    it('descuenta lo ya devuelto al cliente', () => {
      expect(n(computeNetPaidAmount(100000, 20000))).toBe(80000);
    });

    it('nunca devuelve un abono negativo', () => {
      expect(n(computeNetPaidAmount(10000, 50000))).toBe(0);
    });
  });

  describe('assertRefundsStayCovered', () => {
    it('acepta pagos que cubren lo devuelto, aunque sea justo', () => {
      expect(() => assertRefundsStayCovered(60000, 56000)).not.toThrow();
      expect(() => assertRefundsStayCovered(56000, 56000)).not.toThrow();
      expect(() => assertRefundsStayCovered(0, null)).not.toThrow();
    });

    it('rechaza dejar los pagos por debajo de lo devuelto', () => {
      expect(() => assertRefundsStayCovered(0, 56000)).toThrow(
        /ya se le devolvieron/,
      );
    });
  });

  describe('computeAvailableOverpayment', () => {
    it('es cero cuando la orden no está sobrepagada', () => {
      expect(
        n(
          computeAvailableOverpayment({
            total: 100000,
            paidAmount: 60000,
            reversedAmount: 0,
          }),
        ),
      ).toBe(0);
    });

    it('expone el excedente disponible', () => {
      expect(
        n(
          computeAvailableOverpayment({
            total: 80000,
            paidAmount: 100000,
            reversedAmount: 0,
          }),
        ),
      ).toBe(20000);
    });

    it('no cuenta el excedente ya aplicado a otras órdenes', () => {
      expect(
        n(
          computeAvailableOverpayment({
            total: 80000,
            paidAmount: 100000,
            appliedCreditAmount: 20000,
            reversedAmount: 0,
          }),
        ),
      ).toBe(0);
    });

    it('anular venta libera dinero para devolver aunque no hubiera saldo a favor', () => {
      // Es la pregunta que responde el diálogo: "si anulo 200.000 de esta venta,
      // ¿cuánto le sobra al cliente?". Sin anular nada, no sobra nada.
      const input = { total: 500000, paidAmount: 500000 };
      expect(n(computeAvailableOverpayment({ ...input, reversedAmount: 0 }))).toBe(0);
      expect(n(computeAvailableOverpayment({ ...input, reversedAmount: 200000 }))).toBe(
        200000,
      );
    });

    it('anular más venta de la que el cliente abonó no le devuelve de más', () => {
      // OP de 500.000 con 200.000 abonados que se cae entera: solo puede salir de
      // la caja lo que el cliente puso.
      expect(
        n(
          computeAvailableOverpayment({
            total: 500000,
            paidAmount: 200000,
            reversedAmount: 500000,
          }),
        ),
      ).toBe(200000);
    });
  });

  describe('computeReversedNetAmount', () => {
    it('prorratea la anulación a la base sin IVA', () => {
      // Total 119.000 (100.000 + IVA). Anular la mitad anula la mitad de la base.
      expect(n(computeReversedNetAmount(59500, 119000, 100000))).toBe(50000);
    });

    it('descuenta el descuento de la base antes de prorratear', () => {
      // Base comisionable: 100.000 - 20.000 = 80.000. Se anula la mitad del total.
      expect(n(computeReversedNetAmount(50000, 100000, 100000, 20000))).toBe(40000);
    });

    it('anular la venta completa anula la base completa', () => {
      expect(n(computeReversedNetAmount(119000, 119000, 100000))).toBe(100000);
    });

    it('no divide por cero en una OP de $0', () => {
      expect(n(computeReversedNetAmount(0, 0, 0))).toBe(0);
    });
  });

  describe('escenario completo: devolución seguida de edición de ítems', () => {
    it('no resucita el dinero ya devuelto al recalcular desde los pagos', () => {
      // OP de 80.000 con 100.000 en pagos → 20.000 a favor, devueltos en efectivo.
      const paymentsTotal = 100000;
      const refunded = 20000;

      const paidAfterRefund = computeNetPaidAmount(paymentsTotal, refunded);
      expect(n(paidAfterRefund)).toBe(80000);
      expect(
        n(
          computeOrderBalance({
            total: 80000,
            paidAmount: paidAfterRefund,
            reversedAmount: 0,
          }),
        ),
      ).toBe(0);

      // Ahora se editan los ítems y baja el total a 70.000: el recálculo vuelve a
      // sumar los pagos, pero sigue restando lo devuelto.
      const paidAfterEdit = computeNetPaidAmount(paymentsTotal, refunded);
      expect(n(paidAfterEdit)).toBe(80000);
      // Saldo a favor real: 10.000, no los 30.000 que saldrían ignorando la devolución
      expect(
        n(
          computeAvailableOverpayment({
            total: 70000,
            paidAmount: paidAfterEdit,
            reversedAmount: 0,
          }),
        ),
      ).toBe(10000);
    });
  });

  describe('escenario completo: dos devoluciones parciales sobre la misma OP', () => {
    it('acumula la venta anulada sin dejar la orden debiendo ni sobrando', () => {
      const total = 500000;
      let paid = 500000;
      let reversed = 0;

      // Primera devolución: se anulan 200.000 y salen 200.000 de la caja.
      reversed += 200000;
      paid -= 200000;
      expect(n(computeOrderBalance({ total, paidAmount: paid, reversedAmount: reversed }))).toBe(0);

      // Segunda devolución: se anula el resto y sale el resto.
      reversed += 300000;
      paid -= 300000;
      expect(n(computeOrderBalance({ total, paidAmount: paid, reversedAmount: reversed }))).toBe(0);
      expect(paid).toBe(0);
      expect(reversed).toBe(total);
    });
  });
});
