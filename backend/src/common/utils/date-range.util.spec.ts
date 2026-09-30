import { startOfDay, endOfDay, businessToday, businessDate } from './date-range.util';

describe('date-range.util', () => {
  describe('startOfDay', () => {
    it('returns undefined when no date is provided', () => {
      expect(startOfDay(undefined)).toBeUndefined();
      expect(startOfDay('')).toBeUndefined();
    });

    it('expands a plain YYYY-MM-DD to start-of-day in Colombia time', () => {
      // 00:00 en Bogotá (UTC-5) son las 05:00 UTC del mismo día.
      expect(startOfDay('2026-07-01')?.toISOString()).toBe(
        '2026-07-01T05:00:00.000Z',
      );
    });

    it('respects a full ISO datetime as-is (exact instant)', () => {
      const iso = '2026-06-15T05:00:00.000Z';
      expect(startOfDay(iso)?.toISOString()).toBe(iso);
    });

    it('returns undefined for an unparseable value instead of Invalid Date', () => {
      expect(startOfDay('not-a-date')).toBeUndefined();
    });
  });

  describe('endOfDay', () => {
    it('returns undefined when no date is provided', () => {
      expect(endOfDay(undefined)).toBeUndefined();
      expect(endOfDay('')).toBeUndefined();
    });

    it('expands a plain YYYY-MM-DD to end-of-day in Colombia time', () => {
      // 23:59:59.999 en Bogotá son las 04:59:59.999 UTC del día siguiente.
      expect(endOfDay('2026-07-01')?.toISOString()).toBe(
        '2026-07-02T04:59:59.999Z',
      );
    });

    it('respects a full ISO datetime as-is (exact instant)', () => {
      const iso = '2026-07-16T04:59:59.999Z';
      expect(endOfDay(iso)?.toISOString()).toBe(iso);
    });

    it('returns undefined for an unparseable value instead of Invalid Date', () => {
      expect(endOfDay('not-a-date')).toBeUndefined();
    });
  });

  describe('businessDate', () => {
    it('un instante de la noche en Bogotá es de ese día, aunque en UTC sea el siguiente', () => {
      // 7:02 p. m. del 29 en Bogotá = 00:02 UTC del 30.
      expect(businessDate(new Date('2026-09-30T00:02:00.000Z'))).toBe('2026-09-29');
    });

    it('en la mañana coincide con UTC', () => {
      expect(businessDate(new Date('2026-09-29T15:00:00.000Z'))).toBe('2026-09-29');
    });
  });

  describe('rango completo', () => {
    it('cubre las 24 horas del día en Colombia sin solaparse con el siguiente', () => {
      const from = startOfDay('2026-07-01')!;
      const to = endOfDay('2026-07-01')!;
      const nextFrom = startOfDay('2026-07-02')!;

      expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
      expect(nextFrom.getTime()).toBe(to.getTime() + 1);
    });

    it('incluye una orden creada a las 8:00 p. m. hora Colombia en su propio día', () => {
      // 20:00 del 01/07 en Bogotá = 01:00 UTC del 02/07.
      const order = new Date('2026-07-02T01:00:00.000Z');
      expect(order >= startOfDay('2026-07-01')!).toBe(true);
      expect(order <= endOfDay('2026-07-01')!).toBe(true);
      expect(order >= startOfDay('2026-07-02')!).toBe(false);
    });
  });

  describe('businessToday', () => {
    it('returns a YYYY-MM-DD string', () => {
      expect(businessToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('does not roll over to the next day at 8:00 p. m. Colombia time', () => {
      // 20:00 del 01/07 en Bogotá = 01:00 UTC del 02/07: en UTC ya es día 2.
      jest.useFakeTimers().setSystemTime(new Date('2026-07-02T01:00:00.000Z'));
      expect(businessToday()).toBe('2026-07-01');
      jest.useRealTimers();
    });
  });
});
