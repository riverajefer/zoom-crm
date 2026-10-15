import { describe, expect, it } from 'vitest';
import type { PayrollAdvance } from '../../../types/payroll-period.types';
import { advanceNotDisbursed, sumDisbursed, sumNotDisbursed } from './advances';

const adv = (totalAmount: string, paidAmount: string) =>
  ({ totalAmount, paidAmount }) as PayrollAdvance;

describe('anticipos: solo se descuenta lo desembolsado', () => {
  it('un anticipo rechazado por Caja no suma al descuento', () => {
    const advances = [adv('150000.00', '150000.00'), adv('150000.00', '0.00')];
    expect(sumDisbursed(advances)).toBe(150000);
    expect(sumNotDisbursed(advances)).toBe(150000);
  });

  it('un desembolso parcial descuenta solo lo pagado', () => {
    expect(sumDisbursed([adv('250000.00', '1500.00')])).toBe(1500);
    expect(advanceNotDisbursed(adv('250000.00', '1500.00'))).toBe(248500);
  });

  it('nunca reporta saldo sin desembolsar negativo', () => {
    expect(advanceNotDisbursed(adv('100000.00', '120000.00'))).toBe(0);
  });
});
