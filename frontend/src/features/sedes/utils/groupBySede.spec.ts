import { describe, expect, it } from 'vitest';
import { groupBySede } from './groupBySede';
import type { SedeSummary } from '../../../types';

const sede = (code: string): SedeSummary => ({
  id: `l-${code}`,
  code,
  name: `Local ${code}`,
  type: 'STORE',
  color: '#000',
  address: null,
  phone: null,
});

describe('groupBySede', () => {
  it('pone primero la sede activa, luego las demás por código, sin intercalar filas', () => {
    const rows = [
      { n: 1, location: sede('125') },
      { n: 2, location: sede('104') },
      { n: 3, location: sede('125') },
      { n: 4, location: sede('119') },
    ];

    const groups = groupBySede(rows, 'l-119');

    expect(groups.map((g) => [g.sede?.code, g.rows.map((r) => r.n)])).toEqual([
      ['119', [4]],
      ['104', [2]],
      ['125', [1, 3]],
    ]);
  });

  it('las filas sin sede van en un grupo aparte', () => {
    const groups = groupBySede([{ n: 1 }, { n: 2, location: sede('104') }], 'l-104');
    expect(groups.map((g) => g.sede?.code ?? null)).toEqual(['104', null]);
  });
});
