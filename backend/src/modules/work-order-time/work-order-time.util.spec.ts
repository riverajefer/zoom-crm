import {
  DEFAULT_PRODUCTION_WORKDAY_END,
  businessDate,
  hoursBetween,
  parseProductionWorkdayEnd,
  systemCloseTime,
  workedDateFor,
} from './work-order-time.util';

describe('work-order-time.util', () => {
  describe('parseProductionWorkdayEnd', () => {
    it('usa las 18:00 si no hay valor', () => {
      expect(DEFAULT_PRODUCTION_WORKDAY_END).toBe('18:00');
      expect(parseProductionWorkdayEnd(undefined)).toMatchObject({ hour: 18, minute: 0, valid: true });
    });

    it('respeta un valor configurado', () => {
      expect(parseProductionWorkdayEnd('18:30')).toMatchObject({ label: '18:30', valid: true });
    });

    it('marca como no válido un valor mal escrito y cae a las 18:00', () => {
      expect(parseProductionWorkdayEnd('6pm')).toMatchObject({ label: '18:00', valid: false });
    });
  });

  describe('hoursBetween', () => {
    it('redondea a dos decimales', () => {
      const start = new Date('2026-10-17T13:00:00Z');
      expect(hoursBetween(start, new Date('2026-10-17T14:20:00Z'))).toBe(1.33);
    });

    it('nunca devuelve negativo', () => {
      const start = new Date('2026-10-17T13:00:00Z');
      expect(hoursBetween(start, new Date('2026-10-17T12:00:00Z'))).toBe(0);
    });
  });

  describe('fechas en hora Colombia', () => {
    it('a las 8 p. m. de Colombia sigue siendo el mismo día (en UTC ya es el siguiente)', () => {
      const evening = new Date('2026-10-18T01:00:00Z'); // 17 oct, 20:00 en Bogotá
      expect(businessDate(evening)).toBe('2026-10-17');
      expect(workedDateFor(evening).toISOString()).toBe('2026-10-17T00:00:00.000Z');
    });
  });

  describe('systemCloseTime', () => {
    it('cierra con la hora actual si la tarea es de hoy', () => {
      const start = new Date('2026-10-17T13:00:00Z'); // 8:00 Bogotá
      const now = new Date('2026-10-17T23:00:00Z'); // 18:00 Bogotá
      expect(systemCloseTime(start, now)).toEqual(now);
    });

    it('cierra al final de su propio día si la tarea es de un día anterior', () => {
      const start = new Date('2026-10-16T20:00:00Z'); // 16 oct, 15:00 Bogotá
      const now = new Date('2026-10-17T23:00:00Z'); // 17 oct, 18:00 Bogotá
      expect(systemCloseTime(start, now).toISOString()).toBe('2026-10-17T04:59:59.000Z');
    });
  });
});
