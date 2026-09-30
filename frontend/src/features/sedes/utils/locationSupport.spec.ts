import { describe, expect, it } from 'vitest';
import type { LocationSupport } from '../../../types';
import { apiErrorMessage, formatSupportDay, formatSupportRange, supportKindLabel, supportStatus } from './locationSupport';

const support = (overrides: Partial<LocationSupport> = {}) =>
  ({
    kind: 'SUPPORT',
    status: 'APPROVED',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-10-05T00:00:00.000Z',
    endedAt: null,
    replacesId: null,
    ...overrides,
  }) as LocationSupport;

describe('locationSupport', () => {
  it('muestra el día guardado sin correrlo por la zona horaria', () => {
    // Medianoche UTC es el 30 a las 7 p. m. en Bogotá: debe seguir diciendo 1.
    expect(formatSupportDay('2026-10-01T00:00:00.000Z')).toMatch(/^1 /);
    expect(formatSupportRange('2026-10-01', '2026-10-01')).toMatch(/^el 1 /);
    expect(formatSupportRange('2026-10-01', '2026-10-05')).toMatch(/^del 1 .* al 5 /);
  });

  it('distingue apoyo, cambio y vuelta', () => {
    expect(supportKindLabel(support())).toBe('Apoyo');
    expect(supportKindLabel(support({ replacesId: 's-0' }))).toBe('Cambio de sede');
    expect(supportKindLabel(support({ kind: 'RETURN', replacesId: 's-0' }))).toBe('Vuelta a su sede');
  });

  it('el estado dice si está programado, vigente, terminado o vencido con caja', () => {
    expect(supportStatus(support(), '2026-09-30').label).toBe('Programado');
    expect(supportStatus(support(), '2026-10-03').label).toBe('Vigente');
    expect(supportStatus(support(), '2026-10-06').label).toBe('Terminado');
    expect(supportStatus(support({ endedAt: '2026-10-02T15:00:00Z' }), '2026-10-03').label).toBe('Terminado antes');
    expect(supportStatus(support({ overdue: true }), '2026-10-06').label).toBe('Vencido, caja abierta');
    expect(supportStatus(support({ status: 'PENDING' })).label).toBe('Pendiente');
  });

  it('toma el mensaje del backend, o el de respaldo', () => {
    expect(apiErrorMessage({ response: { data: { message: 'Primero debe cerrar la Caja Local 125' } } }, 'x')).toBe(
      'Primero debe cerrar la Caja Local 125',
    );
    expect(apiErrorMessage({ response: { data: { message: ['Indica el motivo'] } } }, 'x')).toBe('Indica el motivo');
    expect(apiErrorMessage(new Error('red'), 'No se pudo')).toBe('No se pudo');
  });
});
