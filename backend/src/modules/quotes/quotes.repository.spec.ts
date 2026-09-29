import { Test, TestingModule } from '@nestjs/testing';
import { QuotesRepository } from './quotes.repository';
import { PrismaService } from '../../database/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockQuote = {
  id: 'quote-1',
  quoteNumber: 'COT-2026-0001',
  clientId: 'client-1',
  quoteDate: new Date('2026-01-15'),
  validUntil: new Date('2026-02-15'),
  subtotal: 1000,
  taxRate: 0.19,
  tax: 190,
  total: 1190,
  status: 'DRAFT',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  commercialChannelId: null,
  commercialChannel: null,
  client: { id: 'client-1', name: 'Cliente ABC', email: 'abc@test.com', phone: '3001234567' },
  createdBy: { id: 'user-1', email: 'user@test.com', firstName: 'John', lastName: 'Doe' },
  items: [],
  order: null,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('QuotesRepository', () => {
  let repository: QuotesRepository;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<QuotesRepository>(QuotesRepository);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('should call quote.findMany and quote.count with empty where by default', async () => {
      prisma.quote.findMany.mockResolvedValue([mockQuote]);
      prisma.quote.count.mockResolvedValue(1);

      await repository.findAll({});

      expect(prisma.quote.findMany).toHaveBeenCalled();
      expect(prisma.quote.count).toHaveBeenCalled();
    });

    it('should filter by status when provided', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await repository.findAll({ status: 'DRAFT' as any });

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.where.status).toBe('DRAFT');
    });

    it('should filter by clientId when provided', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await repository.findAll({ clientId: 'client-1' });

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.where.clientId).toBe('client-1');
    });

    it('should filter by dateFrom when provided', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      const dateFrom = new Date('2026-01-01');
      await repository.findAll({ dateFrom });

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.where.quoteDate?.gte).toEqual(dateFrom);
    });

    it('should filter by dateTo when provided', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      const dateTo = new Date('2026-01-31');
      await repository.findAll({ dateTo });

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.where.quoteDate?.lte).toEqual(dateTo);
    });

    it('should apply pagination with skip and take', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await repository.findAll({ page: 2, limit: 10 });

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.skip).toBe(10); // (2-1) * 10
      expect(callArg.take).toBe(10);
    });

    it('should default to page=1, limit=20', async () => {
      prisma.quote.findMany.mockResolvedValue([mockQuote]);
      prisma.quote.count.mockResolvedValue(1);

      await repository.findAll({});

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.skip).toBe(0);
      expect(callArg.take).toBe(20);
    });

    it('should sum the total of the filtered quotes into meta.sumTotal', async () => {
      prisma.quote.findMany.mockResolvedValue([mockQuote]);
      prisma.quote.count.mockResolvedValue(2);
      prisma.quote.aggregate.mockResolvedValue({ _sum: { total: 1500 } });

      const result = await repository.findAll({ status: 'SENT' as any });

      expect(prisma.quote.aggregate).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: 'SENT' }),
        _sum: { total: true },
      });
      expect(result.meta.sumTotal).toBe('1500');
    });

    it('should return paginated meta with totalPages', async () => {
      prisma.quote.findMany.mockResolvedValue([mockQuote]);
      prisma.quote.count.mockResolvedValue(45);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result.meta).toEqual({
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3, // ceil(45/20)
        sumTotal: '0',
      });
    });

    it('should order results by quoteDate desc', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await repository.findAll({});

      const callArg = prisma.quote.findMany.mock.calls[0][0];
      expect(callArg.orderBy).toEqual({ quoteDate: 'desc' });
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  describe('findById', () => {
    it('should call quote.findUnique with the given id', async () => {
      prisma.quote.findUnique.mockResolvedValue(mockQuote);

      const result = await repository.findById('quote-1');

      expect(prisma.quote.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'quote-1' } }),
      );
      expect(result).toEqual(mockQuote);
    });

    it('should return null when quote does not exist', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    // El select es explícito: un campo nuevo del modelo que no se liste aquí
    // se guarda en la base pero nunca llega al frontend.
    it('selecciona el motivo y la fecha de rechazo', async () => {
      prisma.quote.findUnique.mockResolvedValue(mockQuote);

      await repository.findById('quote-1');

      const { select } = prisma.quote.findUnique.mock.calls[0][0];
      expect(select.rejectionReason).toBe(true);
      expect(select.rejectedAt).toBe(true);
      expect(select.status).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // findByQuoteNumber
  // -------------------------------------------------------------------------
  describe('findByQuoteNumber', () => {
    it('should call quote.findUnique with the quoteNumber', async () => {
      prisma.quote.findUnique.mockResolvedValue(mockQuote);

      await repository.findByQuoteNumber('COT-2026-0001');

      expect(prisma.quote.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { quoteNumber: 'COT-2026-0001' } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    it('should create a quote and then fetch it by id', async () => {
      prisma.quote.create.mockResolvedValue({ id: 'quote-1' });
      prisma.quote.findUnique.mockResolvedValue(mockQuote);

      const result = await repository.create({ quoteNumber: 'COT-2026-0001' } as any);

      expect(prisma.quote.create).toHaveBeenCalled();
      expect(prisma.quote.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'quote-1' } }),
      );
      expect(result).toEqual(mockQuote);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('should call quote.update with the given id and data', async () => {
      prisma.quote.update.mockResolvedValue(mockQuote);

      await repository.update('quote-1', { notes: 'Updated' } as any);

      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote-1' },
          data: { notes: 'Updated' },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete', () => {
    it('should call quote.delete with the given id', async () => {
      prisma.quote.delete.mockResolvedValue(mockQuote);

      await repository.delete('quote-1');

      expect(prisma.quote.delete).toHaveBeenCalledWith({ where: { id: 'quote-1' } });
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------
  describe('updateStatus', () => {
    it('should update only the status field', async () => {
      prisma.quote.update.mockResolvedValue({ ...mockQuote, status: 'SENT' });

      await repository.updateStatus('quote-1', 'SENT' as any);

      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote-1' },
          data: { status: 'SENT' },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findItemById
  // -------------------------------------------------------------------------
  describe('findItemById', () => {
    it('should call quoteItem.findUnique with the given itemId', async () => {
      const mockItem = { id: 'item-1', description: 'Item 1' };
      prisma.quoteItem.findUnique.mockResolvedValue(mockItem as any);

      const result = await repository.findItemById('item-1');

      expect(prisma.quoteItem.findUnique).toHaveBeenCalledWith({ where: { id: 'item-1' } });
      expect(result).toEqual(mockItem);
    });
  });

  // -------------------------------------------------------------------------
  // deleteItem
  // -------------------------------------------------------------------------
  describe('deleteItem', () => {
    it('should call quoteItem.delete with the given itemId', async () => {
      prisma.quoteItem.delete.mockResolvedValue({ id: 'item-1' } as any);

      await repository.deleteItem('item-1');

      expect(prisma.quoteItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    });
  });
});
