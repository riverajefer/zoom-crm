import { describe, expect, it } from 'vitest';
import type { LocationSupport } from '../../../types';
import {
  addSupportDays,
  apiErrorMessage,
  describeSupportPeriod,
  formatSupportDay,
  formatSupportMoment,
  formatSupportRange,
  nextSaturday,
  supportKindLabel,
  supportMoments,
  supportStatus,
} from './locationSupport';

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

  it('muestra cuándo se pidió y cuándo se respondió, en hora de Bogotá', () => {
    // 14:15 UTC son las 9:15 a. m. en Bogotá.
    expect(formatSupportMoment('2026-09-30T14:15:00.000Z')).toMatch(/^30 .*9:15/);

    const asesor = { id: 'u-1', username: 'asesor.104', firstName: 'ASESOR', lastName: '104' };
    const admin = { id: 'u-2', username: 'admin.zoom', firstName: 'ADMIN', lastName: 'ZOOM' };
    const base = { createdAt: '2026-09-30T14:15:00.000Z', requestedBy: asesor, reviewedBy: null, reviewedAt: null };

    expect(supportMoments({ ...base, status: 'PENDING' })).toEqual([expect.stringMatching(/^Solicitada el 30 /)]);
    const approved = supportMoments({
      ...base,
      status: 'APPROVED',
      reviewedBy: admin,
      reviewedAt: '2026-09-30T15:02:00.000Z',
    });
    expect(approved).toHaveLength(2);
    expect(approved[1]).toMatch(/^Aprobada el 30 .*10:02.* por ADMIN ZOOM$/);
    expect(
      supportMoments({ ...base, status: 'REJECTED', reviewedBy: admin, reviewedAt: '2026-09-30T15:02:00.000Z' })[1],
    ).toMatch(/^Rechazada el /);
    // Lo que programa Gerencia nace aprobado.
    expect(
      supportMoments({ ...base, status: 'APPROVED', requestedBy: admin, reviewedBy: admin, reviewedAt: base.createdAt }),
    ).toEqual([expect.stringMatching(/^Programado el 30 /)]);
  });

  it('dice el periodo como se dice', () => {
    // 2026-10-01 es jueves.
    expect(addSupportDays('2026-09-30', 2)).toBe('2026-10-02');
    expect(nextSaturday('2026-10-01')).toBe('2026-10-03');
    expect(nextSaturday('2026-10-03')).toBe('2026-10-03');
    expect(nextSaturday('2026-10-04')).toBe('2026-10-10');
    expect(describeSupportPeriod('2026-10-01', '2026-10-01', '2026-10-01')).toBe('Solo hoy');
    expect(describeSupportPeriod('2026-10-02', '2026-10-02', '2026-10-01')).toBe('Solo mañana');
    expect(describeSupportPeriod('2026-10-01', '2026-10-03', '2026-10-01')).toMatch(
      /^Desde hoy hasta el sábado, 3 .* · 3 días$/,
    );
  });

  it('toma el mensaje del backend, o el de respaldo', () => {
    expect(apiErrorMessage({ response: { data: { message: 'Primero debe cerrar la Caja Local 125' } } }, 'x')).toBe(
      'Primero debe cerrar la Caja Local 125',
    );
    expect(apiErrorMessage({ response: { data: { message: ['Indica el motivo'] } } }, 'x')).toBe('Indica el motivo');
    expect(apiErrorMessage(new Error('red'), 'No se pudo')).toBe('No se pudo');
  });
});
