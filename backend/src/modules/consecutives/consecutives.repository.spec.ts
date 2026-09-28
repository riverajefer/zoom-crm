import { ConsecutivesRepository, formatNumber } from './consecutives.repository';

/**
 * Numeración por sede y sin año (solo Zoom, docs/PLAN_SEDES.md §3).
 */
describe('ConsecutivesRepository', () => {
  const LOC = { id: 'loc-125', code: '125' };
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
    it('sin tabla de origen usa el contador de (tipo, sede) y no reinicia por año', async () => {
      prisma.$queryRaw.mockResolvedValue([{ last_number: 7 }]);

      const result = await repository.getNextNumber('PRODUCTION', 'PROD', LOC);

      expect(result).toBe('125-PROD-0007');
      const sql = prisma.$queryRaw.mock.calls[0][0].join('?');
      expect(sql).toContain('ON CONFLICT (type, location_id)');
      expect(sql).not.toContain('year =');
    });

    it('con tabla de origen toma el máximo real de esa sede y ese prefijo', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ last_number: 12 }]);

      const result = await repository.getNextNumber('ORDER', 'OP', LOC, {
        table: 'orders',
        column: 'order_number',
      });

      expect(result).toBe('125-OP-0012');
      const [sql, type, prefix, locationId, pattern] = prisma.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('FROM "orders"');
      expect(sql).toContain('ON CONFLICT (type, location_id)');
      expect(sql).toContain('AS INTEGER'); // máximo numérico, no de texto
      expect([type, prefix, locationId, pattern]).toEqual(['ORDER', 'OP', 'loc-125', '125-OP-%']);
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
    it('alinea el contador de (tipo, sede) con el máximo real de esa sede', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ max_num: 9 }]);

      await repository.syncCounterFromTable('QUOTE', 'quotes', 'quote_number', 'COT', LOC);

      expect(prisma.$queryRawUnsafe.mock.calls[0][1]).toBe('125-COT-%');
      expect(prisma.consecutive.upsert).toHaveBeenCalledWith({
        where: { type_locationId: { type: 'QUOTE', locationId: 'loc-125' } },
        create: { type: 'QUOTE', prefix: 'COT', year: 0, lastNumber: 9, locationId: 'loc-125' },
        update: { lastNumber: 9 },
      });
    });
  });

  describe('reset y getCurrentNumber', () => {
    it('trabajan sobre el contador de (tipo, sede)', async () => {
      prisma.consecutive.findUnique.mockResolvedValue({ lastNumber: 5 });

      expect(await repository.getCurrentNumber('ORDER', 'loc-125')).toBe(5);
      await repository.reset('ORDER', 'loc-125');

      const where = { type_locationId: { type: 'ORDER', locationId: 'loc-125' } };
      expect(prisma.consecutive.findUnique).toHaveBeenCalledWith({ where });
      expect(prisma.consecutive.update).toHaveBeenCalledWith({ where, data: { lastNumber: 0 } });
    });
  });
});
