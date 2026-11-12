import { describe, expect, it } from 'vitest';
import {
  dtfCreditBalance,
  dtfIvaAmount,
  dtfPendingBalance,
  dtfTotalToCharge,
} from './dtfTotals';

describe('dtfTotalToCharge', () => {
  it('cobra el total redondeado a múltiplo de 50, igual que la OP', () => {
    // 35.000 + 19% = 41.650, ya es múltiplo de 50: no se toca
    expect(dtfTotalToCharge(35000, true)).toBe(41650);
    // 45.000 + 19% = 53.550, tampoco
    expect(dtfTotalToCharge(45000, true)).toBe(53550);
    // 12.345 + 19% = 14.690,55 → 14.700
    expect(dtfTotalToCharge(12345, true)).toBe(14700);
  });

  it('redondea también sin IVA', () => {
    expect(dtfTotalToCharge(11880, false)).toBe(11900);
    expect(dtfTotalToCharge(11860, false)).toBe(11850);
    expect(dtfTotalToCharge(35000, false)).toBe(35000);
  });
});

describe('dtfIvaAmount', () => {
  it('absorbe el redondeo en el IVA para que base + IVA sea el total cobrado', () => {
    const base = 12345;
    expect(dtfIvaAmount(base, true)).toBe(2355);
    expect(base + dtfIvaAmount(base, true)).toBe(dtfTotalToCharge(base, true));
  });

  it('es cero cuando no aplica IVA', () => {
    expect(dtfIvaAmount(35000, false)).toBe(0);
  });
});

describe('dtfPendingBalance', () => {
  it('queda en cero cuando el abono cubre el total redondeado', () => {
    expect(dtfPendingBalance(12345, true, 14700)).toBe(0);
  });

  it('deja el residuo visible si se abona el valor sin redondear', () => {
    expect(dtfPendingBalance(12345, true, 14690)).toBe(10);
  });
});

describe('dtfCreditBalance', () => {
  it('devuelve el excedente cuando el cliente abona de más', () => {
    // Caso del formulario: total 280.000 y abono de 300.000.
    expect(dtfCreditBalance(280000, false, 300000)).toBe(20000);
    expect(dtfCreditBalance(35000, true, 50000)).toBe(8350);
  });

  it('es cero mientras el abono no supere el total', () => {
    expect(dtfCreditBalance(35000, true, 41650)).toBe(0);
    expect(dtfCreditBalance(35000, true, 10000)).toBe(0);
    expect(dtfCreditBalance(35000, true, 0)).toBe(0);
  });
});
