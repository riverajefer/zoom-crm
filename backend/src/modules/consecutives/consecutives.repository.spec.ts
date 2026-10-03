import { ConsecutivesRepository, formatNumber } from './consecutives.repository';

/**
 * Numeración global por tipo, con el código de la sede y sin año (solo Zoom, docs/PLAN_SEDES.md §3).
 */
describe('ConsecutivesRepository', () => {
  const LOC = '125';
  let prisma: any;
  let repository: ConsecutivesRepository;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      consecutive: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      location: { findUnique: jest.fn() },
    };
    repository = new ConsecutivesRepository(prisma);
  });

  describe('formatNumber', () => {
    it('lleva la sede, el prefijo y el número relleno a 4 dígitos', () => {
      expect(formatNumber('125', 'OP', 1)).toBe('125-OP-0001');
      expect(formatNumber('MAT', 'CP', 42)).toBe('MAT-CP-0042');
    });

    it('sigue creciendo sin tope después de 9999', () => {
      expect(formatNumber('104', 'OP', 10000)).toBe('104-OP-10000');
    });
  });

  describe('getNextNumber', () => {
    it('sin tabla de origen usa el contador del tipo, sin sede, y no reinicia por año', async () => {
      prisma.$queryRaw.mockResolvedValue([{ last_number: 7 }]);

      const result = await repository.getNextNumber('PRODUCTION', 'PROD', LOC);

      expect(result).toBe('125-PROD-0007');
      const sql = prisma.$queryRaw.mock.calls[0][0].join('?');
      expect(sql).toContain('ON CONFLICT (type)');
      expect(sql).not.toContain('location_id');
      expect(sql).not.toContain('year =');
    });

    it('con tabla de origen toma el máximo real de ese prefijo en todas las sedes', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ last_number: 12 }]);

      const result = await repository.getNextNumber('ORDER', 'OP', LOC, {
        table: 'orders',
        column: 'order_number',
      });

      expect(result).toBe('125-OP-0012');
      const [sql, type, prefix, pattern] = prisma.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('FROM "orders"');
      expect(sql).toContain('ON CONFLICT (type)');
      expect(sql).not.toContain('location_id');
      expect(sql).toContain('AS INTEGER'); // máximo numérico, no de texto
      expect([type, prefix, pattern]).toEqual(['ORDER', 'OP', '^[A-Z0-9]+-OP-[0-9]+$']);
    });

    it('el patrón cubre cualquier sede y deja fuera otros prefijos y el formato de High', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ last_number: 1 }]);

      await repository.getNextNumber('ORDER', 'OP', LOC, { table: 'orders', column: 'order_number' });

      const pattern = new RegExp(prisma.$queryRawUnsafe.mock.calls[0][3]);
      expect(pattern.test('104-OP-0011')).toBe(true);
      expect(pattern.test('MAT-OP-10000')).toBe(true);
      expect(pattern.test('104-OPROD-0011')).toBe(false);
      expect(pattern.test('OP-2026-0001')).toBe(false);
    });

    it('limpia los nombres de tabla y columna antes de interpolarlos', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ last_number: 1 }]);

      await repository.getNextNumber('ORDER', 'OP', LOC, {
        table: 'orders"; DROP TABLE x; --',
        column: 'order_number',
      });

      expect(prisma.$queryRawUnsafe.mock.calls[0][0]).not.toContain('DROP TABLE x');
    });

    it('acepta bigint de PostgreSQL', async () => {
      prisma.$queryRaw.mockResolvedValue([{ last_number: BigInt(3) }]);

      expect(await repository.getNextNumber('PRODUCTION', 'PROD', LOC)).toBe('125-PROD-0003');
    });

    it('falla si la consulta no devuelve fila', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(repository.getNextNumber('PRODUCTION', 'PROD', LOC)).rejects.toThrow(
        /Failed to generate next number/,
      );
    });
  });

  describe('syncCounterFromTable', () => {
    it('alinea el contador del tipo con el máximo real de todas las sedes', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ max_num: 9 }]);

      await repository.syncCounterFromTable('QUOTE', 'quotes', 'quote_number', 'COT');

      expect(prisma.$queryRawUnsafe.mock.calls[0][1]).toBe('^[A-Z0-9]+-COT-[0-9]+$');
      expect(prisma.consecutive.upsert).toHaveBeenCalledWith({
        where: { type: 'QUOTE' },
        create: { type: 'QUOTE', prefix: 'COT', year: 0, lastNumber: 9 },
        update: { lastNumber: 9 },
      });
    });
  });

  describe('reset y getCurrentNumber', () => {
    it('trabajan sobre el contador del tipo', async () => {
      prisma.consecutive.findUnique.mockResolvedValue({ lastNumber: 5 });

      expect(await repository.getCurrentNumber('ORDER')).toBe(5);
      await repository.reset('ORDER');

      const where = { type: 'ORDER' };
      expect(prisma.consecutive.findUnique).toHaveBeenCalledWith({ where });
      expect(prisma.consecutive.update).toHaveBeenCalledWith({ where, data: { lastNumber: 0 } });
    });
  });
});
