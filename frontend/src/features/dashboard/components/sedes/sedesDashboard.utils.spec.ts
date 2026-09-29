import { describe, expect, it } from 'vitest';
import { changeRatio, formatChange, formatMoney, formatPercent } from './sedesDashboard.utils';

describe('sedesDashboard.utils', () => {
  it('calcula la variación contra el periodo anterior', () => {
    expect(changeRatio(112, 100)).toBeCloseTo(0.12);
    expect(changeRatio(50, 0)).toBeNull();
    // Contra un resultado negativo, subir es mejorar.
    expect(changeRatio(-50, -100)).toBeCloseTo(0.5);
  });

  it('escribe la variación y los montos como se leen en pantalla', () => {
    expect(formatChange(0.12)).toBe('+12 % frente al periodo anterior');
    expect(formatChange(-0.3)).toBe('−30 % frente al periodo anterior');
    expect(formatChange(null)).toBe('Sin datos del periodo anterior');
    expect(formatPercent(0.25)).toBe('25 %');
    expect(formatPercent(null)).toBe('—');
    expect(formatMoney(1611500).replace(/\s/g, ' ')).toBe('$ 1.611.500');
    expect(formatMoney(-45000).replace(/\s/g, ' ')).toBe('−$ 45.000');
  });
});
