// Mock uuid before any imports (uuid v13 is ESM-only)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesRepository } from './quotes.repository';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { QuoteStatus, OrderStatus, ProspectStatus, Prisma } from '../../generated/prisma';

// Solo Zoom: los documentos nacen en la sede activa del request, que en un
// test unitario no existe (docs/PLAN_SEDES.md §2).
jest.mock('../../common/utils/location-context', () => ({
  ...jest.requireActual('../../common/utils/location-context'),
  requireActiveLocationId: jest.fn(() => 'loc-125'),
}));


// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────────────────────

const mockQuotesRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByQuoteNumber: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  updateStatus: jest.fn(),
  findItemById: jest.fn(),
  deleteItem: jest.fn(),
};

const mockConsecutivesService = {
  generateNumber: jest.fn(),
  syncCounter: jest.fn(),
};

/** Error de Prisma por violación de restricción única, como el de `quote_number`. */
const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), {
  code: 'P2002',
});

const mockAuditLogsService = {
  create: jest.fn(),
};

const mockStorageService = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
};

const txMock = {
  quote: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  quoteItem: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  quoteItemProductionArea: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  order: {
    create: jest.fn(),
  },
  prospect: {
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockPrismaService = {
  ...txMock,
  $transaction: jest.fn((callback: (tx: typeof txMock) => Promise<any>) =>
    callback(txMock),
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const mockQuote = {
  id: 'quote-1',
  quoteNumber: 'COT-001',
  locationId: 'loc-119',
  clientId: 'client-1',
  quoteDate: new Date(),
  validUntil: new Date(),
  subtotal: new Prisma.Decimal(100),
  taxRate: new Prisma.Decimal(0.19),
  tax: new Prisma.Decimal(19),
  total: new Prisma.Decimal(119),
  status: QuoteStatus.DRAFT,
  notes: 'Test note',
  commercialChannelId: 'channel-1',
  items: [
    {
      id: 'item-1',
      description: 'Item 1',
      quantity: 1,
      unitPrice: 100,
      total: new Prisma.Decimal(100),
      sortOrder: 1,
      productId: 'prod-1',
      sampleImageId: null,
    },
  ],
};

const createQuoteDto = {
  clientId: 'client-1',
  items: [
    {
      description: 'New Item',
      quantity: 2,
      unitPrice: 50,
      productId: 'prod-1',
    },
  ],
  notes: 'New quote',
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('QuotesService', () => {
  let service: QuotesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: QuotesRepository, useValue: mockQuotesRepository },
        { provide: ConsecutivesService, useValue: mockConsecutivesService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────
  describe('findAll', () => {
    // Por defecto, un usuario que ve todas: estos casos verifican el armado de
    // filtros, no el alcance. El alcance tiene su propio bloque más abajo.
    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        role: { permissions: [{ permission: { name: 'read_all_quotes' } }] },
      });
    });

    it('should return a paginated list of quotes', async () => {
      const filters = { page: 1, limit: 10 };
      mockQuotesRepository.findAll.mockResolvedValue({
        data: [mockQuote],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const result = await service.findAll(filters, 'user-1');

      expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10 }),
      );
      expect(result.data).toEqual([mockQuote]);
    });

    // Los filtros por día se expanden al día completo en hora Colombia. Con
    // `new Date(...)` a secas, el `dateTo` era medianoche UTC —el 30 a las 7
    // p. m. en Bogotá— y el día elegido como «hasta» desaparecía entero:
    // filtrar del 24 al 24 de julio devolvía 0 de las 10 cotizaciones de ese día.
    it('expande los filtros de fecha al día completo en hora Colombia', async () => {
      const filters = {
        page: 1,
        limit: 10,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      };
      mockQuotesRepository.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await service.findAll(filters, 'user-1');

      expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: new Date('2026-01-01T00:00:00.000-05:00'),
          dateTo: new Date('2026-01-31T23:59:59.999-05:00'),
        }),
      );
    });

    // El caso que reventaba: una cotización creada ese mismo día a media mañana
    // tiene que caer dentro del rango.
    it('incluye una cotización del propio día elegido como "hasta"', async () => {
      mockQuotesRepository.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await service.findAll(
        { page: 1, limit: 10, dateFrom: '2026-07-24', dateTo: '2026-07-24' },
        'user-1',
      );

      const { dateFrom, dateTo } = mockQuotesRepository.findAll.mock.calls[0][0];
      // 24 de julio, 10:00 de la mañana en Colombia.
      const cotizacion = new Date('2026-07-24T10:00:00.000-05:00');

      expect(cotizacion >= dateFrom).toBe(true);
      expect(cotizacion <= dateTo).toBe(true);
    });

    it('should pass undefined for optional date filters when not provided', async () => {
      const filters = { page: 1, limit: 10, status: QuoteStatus.DRAFT };
      mockQuotesRepository.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await service.findAll(filters, 'user-1');

      expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: undefined,
          dateTo: undefined,
          status: QuoteStatus.DRAFT,
        }),
      );
    });

    // El alcance por asesor no puede vivir en el cliente: `createdById` es un
    // filtro más de la query y basta quitarlo de la petición para ver todo.
    describe('alcance por asesor', () => {
      const conPermiso = (nombres: string[]) => ({
        role: { permissions: nombres.map((name) => ({ permission: { name } })) },
      });

      beforeEach(() => {
        mockQuotesRepository.findAll.mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        });
      });

      it('sin read_all_quotes solo devuelve las propias', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(
          conPermiso(['read_quotes']),
        );

        await service.findAll({ page: 1, limit: 10 }, 'asesor-1');

        expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
          expect.objectContaining({ createdById: 'asesor-1' }),
        );
      });

      // El intento de evasión: mandar el id de otro asesor en la query.
      it('sin read_all_quotes ignora el createdById que venga del cliente', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(
          conPermiso(['read_quotes']),
        );

        await service.findAll(
          { page: 1, limit: 10, createdById: 'otro-asesor' },
          'asesor-1',
        );

        expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
          expect.objectContaining({ createdById: 'asesor-1' }),
        );
      });

      it('con read_all_quotes no acota nada', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(
          conPermiso(['read_quotes', 'read_all_quotes']),
        );

        await service.findAll({ page: 1, limit: 10 }, 'admin-1');

        expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
          expect.objectContaining({ createdById: undefined }),
        );
      });

      it('con read_all_quotes respeta el filtro por asesor de la pantalla', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(
          conPermiso(['read_quotes', 'read_all_quotes']),
        );

        await service.findAll(
          { page: 1, limit: 10, createdById: 'asesor-2' },
          'admin-1',
        );

        expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
          expect.objectContaining({ createdById: 'asesor-2' }),
        );
      });

      it('un usuario sin rol tampoco ve las de los demás', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(null);

        await service.findAll(
          { page: 1, limit: 10, createdById: 'otro-asesor' },
          'huerfano-1',
        );

        expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
          expect.objectContaining({ createdById: 'huerfano-1' }),
        );
      });
    });

    it('should pass clientId filter when provided', async () => {
      const filters = { page: 1, limit: 10, clientId: 'client-1' };
      mockQuotesRepository.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await service.findAll(filters, 'user-1');

      expect(mockQuotesRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'client-1' }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a single quote if it exists', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);

      const result = await service.findOne('quote-1');

      expect(mockQuotesRepository.findById).toHaveBeenCalledWith('quote-1');
      expect(result).toEqual(mockQuote);
    });

    it('should throw NotFoundException if quote does not exist', async () => {
      mockQuotesRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a new quote and calculate totals', async () => {
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-001');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      const result = await service.create(createQuoteDto, 'user-1');

      expect(mockConsecutivesService.generateNumber).toHaveBeenCalledWith('QUOTE', 'loc-125');
      expect(mockQuotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteNumber: 'COT-001',
          subtotal: new Prisma.Decimal(100),
          tax: new Prisma.Decimal(19),
          total: new Prisma.Decimal(119),
          createdBy: { connect: { id: 'user-1' } },
        }),
      );
      expect(result).toEqual(mockQuote);
    });

    it('should throw BadRequestException if no items are provided', async () => {
      await expect(service.create({ ...createQuoteDto, items: [] }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    // El contador `consecutives` puede quedar por detrás de los datos reales y
    // devolver un número ya usado. Antes esto reventaba con P2002 sin reintento.
    it('should sync the counter and retry when quote_number is duplicated', async () => {
      mockConsecutivesService.generateNumber
        .mockResolvedValueOnce('COT-2026-0001') // ya existe
        .mockResolvedValueOnce('COT-2026-0002'); // libre tras sincronizar
      mockQuotesRepository.create
        .mockRejectedValueOnce(uniqueViolation())
        .mockResolvedValueOnce(mockQuote);

      const result = await service.create(createQuoteDto, 'user-1');

      expect(mockConsecutivesService.syncCounter).toHaveBeenCalledWith('QUOTE', 'loc-125');
      expect(mockConsecutivesService.generateNumber).toHaveBeenCalledTimes(2);
      expect(mockQuotesRepository.create).toHaveBeenCalledTimes(2);
      // El reintento debe usar el número nuevo, no repetir el que falló.
      expect(mockQuotesRepository.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ quoteNumber: 'COT-2026-0002' }),
      );
      expect(result).toEqual(mockQuote);
    });

    it('should give up after 3 attempts and rethrow the unique violation', async () => {
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-2026-0001');
      mockQuotesRepository.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(createQuoteDto, 'user-1')).rejects.toMatchObject({
        code: 'P2002',
      });

      expect(mockQuotesRepository.create).toHaveBeenCalledTimes(3);
      // No sincroniza tras el último intento fallido.
      expect(mockConsecutivesService.syncCounter).toHaveBeenCalledTimes(2);
    });

    it('should not retry on errors other than a unique violation', async () => {
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-2026-0001');
      mockQuotesRepository.create.mockRejectedValue(
        Object.assign(new Error('FK violation'), { code: 'P2003' }),
      );

      await expect(service.create(createQuoteDto, 'user-1')).rejects.toThrow('FK violation');

      expect(mockQuotesRepository.create).toHaveBeenCalledTimes(1);
      expect(mockConsecutivesService.syncCounter).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if items is undefined', async () => {
      await expect(
        service.create({ clientId: 'client-1', items: undefined as any }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create items with productionAreaIds', async () => {
      const dtoWithAreas = {
        clientId: 'client-1',
        items: [
          {
            description: 'Item with areas',
            quantity: 1,
            unitPrice: 200,
            productionAreaIds: ['area-1', 'area-2'],
          },
        ],
      };
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-002');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoWithAreas, 'user-1');

      expect(mockQuotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({
                productionAreas: {
                  create: [
                    { productionArea: { connect: { id: 'area-1' } } },
                    { productionArea: { connect: { id: 'area-2' } } },
                  ],
                },
              }),
            ]),
          },
        }),
      );
    });

    it('should create items with sampleImageId', async () => {
      const dtoWithImage = {
        clientId: 'client-1',
        items: [
          {
            description: 'Item with image',
            quantity: 1,
            unitPrice: 100,
            sampleImageId: 'image-1',
          },
        ],
      };
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-003');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoWithImage, 'user-1');

      expect(mockQuotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({
                sampleImageId: 'image-1',
              }),
            ]),
          },
        }),
      );
    });

    it('should connect commercialChannel when provided', async () => {
      const dtoWithChannel = {
        ...createQuoteDto,
        commercialChannelId: 'channel-1',
      };
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-004');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoWithChannel, 'user-1');

      expect(mockQuotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          commercialChannel: { connect: { id: 'channel-1' } },
        }),
      );
    });

    it('should set validUntil when provided', async () => {
      const dtoWithValidity = {
        ...createQuoteDto,
        validUntil: '2026-03-01',
      };
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-005');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoWithValidity, 'user-1');

      expect(mockQuotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validUntil: new Date('2026-03-01'),
        }),
      );
    });

    it('should calculate correct totals for multiple items', async () => {
      const dtoMultipleItems = {
        clientId: 'client-1',
        items: [
          { description: 'Item A', quantity: 3, unitPrice: 100 },
          { description: 'Item B', quantity: 2, unitPrice: 250 },
        ],
      };
      // subtotal = 3*100 + 2*250 = 300 + 500 = 800
      // tax = 800 * 0.19 = 152
      // total = 800 + 152 = 952
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-006');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoMultipleItems, 'user-1');

      expect(mockQuotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: new Prisma.Decimal(800),
          tax: new Prisma.Decimal(152),
          total: new Prisma.Decimal(952),
        }),
      );
    });

    it('should set sortOrder incrementally for items', async () => {
      const dtoMultipleItems = {
        clientId: 'client-1',
        items: [
          { description: 'First', quantity: 1, unitPrice: 100 },
          { description: 'Second', quantity: 1, unitPrice: 200 },
        ],
      };
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-007');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoMultipleItems, 'user-1');

      const createArg = mockQuotesRepository.create.mock.calls[0][0];
      expect(createArg.items.create[0].sortOrder).toBe(1);
      expect(createArg.items.create[1].sortOrder).toBe(2);
    });

    it('should connect product when productId is provided', async () => {
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-008');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(createQuoteDto, 'user-1');

      const createArg = mockQuotesRepository.create.mock.calls[0][0];
      expect(createArg.items.create[0].product).toEqual({ connect: { id: 'prod-1' } });
    });

    it('should not include product connect when productId is not provided', async () => {
      const dtoNoProduct = {
        clientId: 'client-1',
        items: [{ description: 'Item', quantity: 1, unitPrice: 100 }],
      };
      mockConsecutivesService.generateNumber.mockResolvedValue('COT-009');
      mockQuotesRepository.create.mockResolvedValue(mockQuote);

      await service.create(dtoNoProduct, 'user-1');

      const createArg = mockQuotesRepository.create.mock.calls[0][0];
      expect(createArg.items.create[0].product).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe('update', () => {
    it('should update a quote without items (simple field update)', async () => {
      const updatedQuote = { ...mockQuote, notes: 'Updated' };
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)     // for update validation
        .mockResolvedValueOnce(updatedQuote); // for findOne at the end
      mockQuotesRepository.update.mockResolvedValue(updatedQuote);

      const result = await service.update('quote-1', { notes: 'Updated' }, 'user-1');

      expect(mockQuotesRepository.update).toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(result.notes).toBe('Updated');
    });

    it('should throw BadRequestException if quote is already converted', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.CONVERTED,
      });

      await expect(service.update('quote-1', { notes: 'Updated' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if quote does not exist', async () => {
      mockQuotesRepository.findById.mockResolvedValue(null);

      await expect(service.update('non-existent', { notes: 'x' }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    describe('rechazo (REJECTED)', () => {
      const sentQuote = { ...mockQuote, status: QuoteStatus.SENT };

      it('rechaza la transición a REJECTED sin motivo', async () => {
        mockQuotesRepository.findById.mockResolvedValue(sentQuote);

        await expect(
          service.update('quote-1', { status: QuoteStatus.REJECTED }, 'user-1'),
        ).rejects.toThrow(BadRequestException);
        expect(mockQuotesRepository.update).not.toHaveBeenCalled();
      });

      it('rechaza la transición a REJECTED con motivo en blanco', async () => {
        mockQuotesRepository.findById.mockResolvedValue(sentQuote);

        await expect(
          service.update(
            'quote-1',
            { status: QuoteStatus.REJECTED, rejectionReason: '   ' },
            'user-1',
          ),
        ).rejects.toThrow(BadRequestException);
        expect(mockQuotesRepository.update).not.toHaveBeenCalled();
      });

      it('guarda motivo y fecha de rechazo al rechazar', async () => {
        const rejected = {
          ...sentQuote,
          status: QuoteStatus.REJECTED,
          rejectionReason: 'El cliente eligió otro proveedor',
        };
        mockQuotesRepository.findById
          .mockResolvedValueOnce(sentQuote)
          .mockResolvedValueOnce(rejected);
        mockQuotesRepository.update.mockResolvedValue(rejected);

        await service.update(
          'quote-1',
          {
            status: QuoteStatus.REJECTED,
            rejectionReason: '  El cliente eligió otro proveedor  ',
          },
          'user-1',
        );

        const data = mockQuotesRepository.update.mock.calls[0][1];
        expect(data.status).toBe(QuoteStatus.REJECTED);
        expect(data.rejectionReason).toBe('El cliente eligió otro proveedor');
        expect(data.rejectedAt).toBeInstanceOf(Date);
        expect(data.rejectedFromStatus).toBe(QuoteStatus.SENT);
      });

      it.each([
        ['aceptada', QuoteStatus.ACCEPTED],
        ['sin respuesta', QuoteStatus.NO_RESPONSE],
      ])('permite rechazar una cotización %s', async (_label, fromStatus) => {
        const source = { ...mockQuote, status: fromStatus };
        mockQuotesRepository.findById
          .mockResolvedValueOnce(source)
          .mockResolvedValueOnce({ ...source, status: QuoteStatus.REJECTED });
        mockQuotesRepository.update.mockResolvedValue(source);

        await service.update(
          'quote-1',
          { status: QuoteStatus.REJECTED, rejectionReason: 'El cliente se echó atrás' },
          'user-1',
        );

        const data = mockQuotesRepository.update.mock.calls[0][1];
        expect(data.status).toBe(QuoteStatus.REJECTED);
        expect(data.rejectionReason).toBe('El cliente se echó atrás');
        expect(data.rejectedAt).toBeInstanceOf(Date);
        expect(data.rejectedFromStatus).toBe(fromStatus);
      });

      it('no permite rechazar una cotización en borrador', async () => {
        mockQuotesRepository.findById.mockResolvedValue({
          ...mockQuote,
          status: QuoteStatus.DRAFT,
        });

        await expect(
          service.update(
            'quote-1',
            { status: QuoteStatus.REJECTED, rejectionReason: 'motivo' },
            'user-1',
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('no sella rejectedAt en transiciones que no son rechazo', async () => {
        mockQuotesRepository.findById
          .mockResolvedValueOnce(sentQuote)
          .mockResolvedValueOnce({ ...sentQuote, status: QuoteStatus.ACCEPTED });
        mockQuotesRepository.update.mockResolvedValue(sentQuote);

        await service.update('quote-1', { status: QuoteStatus.ACCEPTED }, 'user-1');

        const data = mockQuotesRepository.update.mock.calls[0][1];
        expect(data.rejectedAt).toBeUndefined();
        expect(data.rejectionReason).toBeUndefined();
      });

      it('permite corregir el motivo de una cotización ya rechazada', async () => {
        const rejectedQuote = {
          ...mockQuote,
          status: QuoteStatus.REJECTED,
          rejectionReason: 'motivo viejo',
        };
        mockQuotesRepository.findById
          .mockResolvedValueOnce(rejectedQuote)
          .mockResolvedValueOnce(rejectedQuote);
        mockQuotesRepository.update.mockResolvedValue(rejectedQuote);

        await service.update('quote-1', { rejectionReason: 'motivo corregido' }, 'user-1');

        const data = mockQuotesRepository.update.mock.calls[0][1];
        expect(data.rejectionReason).toBe('motivo corregido');
        expect(data.rejectedAt).toBeUndefined();
      });
    });

    it('should reconcile items when items are provided in update', async () => {
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)   // for update validation
        .mockResolvedValueOnce(mockQuote);  // for findOne at the end
      txMock.quoteItem.findMany.mockResolvedValue(mockQuote.items);
      txMock.quote.findUnique.mockResolvedValue({ taxRate: new Prisma.Decimal(0.19) });

      const updateDto = {
        items: [
          { id: 'item-1', description: 'Updated Item', quantity: 1, unitPrice: 100 },
          { description: 'New Item', quantity: 2, unitPrice: 50 },
        ],
      };

      await service.update('quote-1', updateDto, 'user-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(txMock.quoteItem.update).toHaveBeenCalled();
      expect(txMock.quoteItem.create).toHaveBeenCalled();
    });

    it('should delete removed items during reconciliation', async () => {
      const quoteWithMultipleItems = {
        ...mockQuote,
        items: [
          { id: 'item-1', description: 'Keep', quantity: 1, unitPrice: 100, total: new Prisma.Decimal(100) },
          { id: 'item-2', description: 'Remove', quantity: 1, unitPrice: 200, total: new Prisma.Decimal(200) },
        ],
      };
      mockQuotesRepository.findById
        .mockResolvedValueOnce(quoteWithMultipleItems)
        .mockResolvedValueOnce(quoteWithMultipleItems);
      txMock.quoteItem.findMany.mockResolvedValue(quoteWithMultipleItems.items);
      txMock.quote.findUnique.mockResolvedValue({ taxRate: new Prisma.Decimal(0.19) });

      const updateDto = {
        items: [
          { id: 'item-1', description: 'Keep', quantity: 1, unitPrice: 100 },
          // item-2 is removed
        ],
      };

      await service.update('quote-1', updateDto, 'user-1');

      expect(txMock.quoteItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['item-2'] } },
      });
    });

    it('should handle production areas during item reconciliation', async () => {
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)
        .mockResolvedValueOnce(mockQuote);
      txMock.quoteItem.findMany.mockResolvedValue(mockQuote.items);
      txMock.quote.findUnique.mockResolvedValue({ taxRate: new Prisma.Decimal(0.19) });

      const updateDto = {
        items: [
          {
            id: 'item-1',
            description: 'Item with areas',
            quantity: 1,
            unitPrice: 100,
            productionAreaIds: ['area-1', 'area-2'],
          },
        ],
      };

      await service.update('quote-1', updateDto, 'user-1');

      // Should delete existing production areas
      expect(txMock.quoteItemProductionArea.deleteMany).toHaveBeenCalledWith({
        where: { quoteItemId: 'item-1' },
      });
      // Should create new production areas
      expect(txMock.quoteItemProductionArea.createMany).toHaveBeenCalledWith({
        data: [
          { quoteItemId: 'item-1', productionAreaId: 'area-1' },
          { quoteItemId: 'item-1', productionAreaId: 'area-2' },
        ],
      });
    });

    it('should create production areas for new items', async () => {
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)
        .mockResolvedValueOnce(mockQuote);
      txMock.quoteItem.findMany.mockResolvedValue([]);
      txMock.quoteItem.create.mockResolvedValue({ id: 'new-item-1' });
      txMock.quote.findUnique.mockResolvedValue({ taxRate: new Prisma.Decimal(0.19) });

      const updateDto = {
        items: [
          {
            description: 'New item with areas',
            quantity: 1,
            unitPrice: 100,
            productionAreaIds: ['area-1'],
          },
        ],
      };

      await service.update('quote-1', updateDto, 'user-1');

      expect(txMock.quoteItem.create).toHaveBeenCalled();
      expect(txMock.quoteItemProductionArea.createMany).toHaveBeenCalledWith({
        data: [{ quoteItemId: 'new-item-1', productionAreaId: 'area-1' }],
      });
    });

    it('should convert to order if status is set to CONVERTED', async () => {
      // Quote must be ACCEPTED to transition to CONVERTED
      const acceptedQuote = { ...mockQuote, status: QuoteStatus.ACCEPTED };
      mockQuotesRepository.findById.mockResolvedValue(acceptedQuote);

      const convertToOrderSpy = jest
        .spyOn(service, 'convertToOrder')
        .mockResolvedValue({ id: 'order-1' } as any);

      await service.update('quote-1', { status: QuoteStatus.CONVERTED }, 'user-1');

      expect(convertToOrderSpy).toHaveBeenCalledWith('quote-1', 'user-1');
    });

    it('should update clientId when provided', async () => {
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)
        .mockResolvedValueOnce(mockQuote);
      mockQuotesRepository.update.mockResolvedValue(mockQuote);

      await service.update('quote-1', { clientId: 'client-2' }, 'user-1');

      expect(mockQuotesRepository.update).toHaveBeenCalledWith(
        'quote-1',
        expect.objectContaining({
          client: { connect: { id: 'client-2' } },
        }),
      );
    });

    it('should update commercialChannelId when provided', async () => {
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)
        .mockResolvedValueOnce(mockQuote);
      mockQuotesRepository.update.mockResolvedValue(mockQuote);

      await service.update('quote-1', { commercialChannelId: 'channel-2' }, 'user-1');

      expect(mockQuotesRepository.update).toHaveBeenCalledWith(
        'quote-1',
        expect.objectContaining({
          commercialChannel: { connect: { id: 'channel-2' } },
        }),
      );
    });

    it('should update status without converting if status is not CONVERTED', async () => {
      const sentQuote = { ...mockQuote, status: QuoteStatus.SENT };
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)  // for update validation
        .mockResolvedValueOnce(sentQuote); // for findOne at the end
      mockQuotesRepository.update.mockResolvedValue(sentQuote);

      const result = await service.update(
        'quote-1',
        { status: QuoteStatus.SENT },
        'user-1',
      );

      expect(mockQuotesRepository.update).toHaveBeenCalledWith(
        'quote-1',
        expect.objectContaining({ status: QuoteStatus.SENT }),
      );
      expect(result.status).toBe(QuoteStatus.SENT);
    });

    it('should recalculate totals after item reconciliation', async () => {
      mockQuotesRepository.findById
        .mockResolvedValueOnce(mockQuote)
        .mockResolvedValueOnce(mockQuote);
      txMock.quoteItem.findMany
        .mockResolvedValueOnce(mockQuote.items)   // for reconciliation
        .mockResolvedValueOnce([                   // for recalculateQuoteTotals
          { total: new Prisma.Decimal(300) },
          { total: new Prisma.Decimal(200) },
        ]);
      txMock.quote.findUnique.mockResolvedValue({ taxRate: new Prisma.Decimal(0.19) });

      await service.update(
        'quote-1',
        { items: [{ id: 'item-1', description: 'Updated', quantity: 3, unitPrice: 100 }] },
        'user-1',
      );

      // recalculateQuoteTotals should update with recalculated values
      expect(txMock.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote-1' },
          data: expect.objectContaining({
            subtotal: expect.any(Prisma.Decimal),
            tax: expect.any(Prisma.Decimal),
            total: expect.any(Prisma.Decimal),
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────
  describe('remove', () => {
    it('should delete a quote if it is not converted', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockQuotesRepository.delete.mockResolvedValue(mockQuote);

      const result = await service.remove('quote-1');

      expect(mockQuotesRepository.delete).toHaveBeenCalledWith('quote-1');
      expect(result.message).toBe('Quote deleted successfully');
    });

    it('should throw BadRequestException if quote is converted', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.CONVERTED,
      });

      await expect(service.remove('quote-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if quote does not exist', async () => {
      mockQuotesRepository.findById.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should allow deletion of REJECTED quotes', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.REJECTED,
      });
      mockQuotesRepository.delete.mockResolvedValue(mockQuote);

      await expect(service.remove('quote-1')).resolves.toBeDefined();
      expect(mockQuotesRepository.delete).toHaveBeenCalledWith('quote-1');
    });

    it('should allow deletion of DRAFT quotes', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.DRAFT,
      });
      mockQuotesRepository.delete.mockResolvedValue(mockQuote);

      const result = await service.remove('quote-1');
      expect(result.message).toBeDefined();
    });

    it('should allow deletion of SENT quotes', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.SENT,
      });
      mockQuotesRepository.delete.mockResolvedValue(mockQuote);

      const result = await service.remove('quote-1');
      expect(result.message).toBeDefined();
    });

    it('should allow deletion of NO_RESPONSE quotes', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.NO_RESPONSE,
      });
      mockQuotesRepository.delete.mockResolvedValue(mockQuote);

      const result = await service.remove('quote-1');
      expect(result.message).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // convertToOrder
  // ─────────────────────────────────────────────
  describe('convertToOrder', () => {
    it('should create an order from a quote and update quote status', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockConsecutivesService.generateNumber.mockResolvedValue('ORD-001');
      txMock.order.create.mockResolvedValue({ id: 'order-1' });

      await service.convertToOrder('quote-1', 'user-1');

      expect(mockConsecutivesService.generateNumber).toHaveBeenCalledWith('ORDER', 'loc-119');
      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderNumber: 'ORD-001',
            status: OrderStatus.DRAFT,
            quote: { connect: { id: 'quote-1' } },
          }),
        }),
      );
      expect(txMock.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote-1' },
          data: { status: QuoteStatus.CONVERTED, orderId: 'order-1' },
        }),
      );
    });

    // Cierra el ciclo del Pipeline de Ventas: sin esto el prospecto se queda en
    // "Cotizado" aunque su cotización ya se haya vuelto una orden.
    it('should mark the originating prospect as CONVERTIDO', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockConsecutivesService.generateNumber.mockResolvedValue('ORD-001');
      txMock.order.create.mockResolvedValue({ id: 'order-1' });

      await service.convertToOrder('quote-1', 'user-1');

      expect(txMock.prospect.updateMany).toHaveBeenCalledWith({
        where: { quoteId: 'quote-1' },
        data: { orderId: 'order-1', status: ProspectStatus.CONVERTIDO },
      });
    });

    it('should throw BadRequestException if already converted', async () => {
      mockQuotesRepository.findById.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.CONVERTED,
      });

      await expect(service.convertToOrder('quote-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if quote does not exist', async () => {
      mockQuotesRepository.findById.mockResolvedValue(null);

      await expect(service.convertToOrder('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should copy financial data from quote to order', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockConsecutivesService.generateNumber.mockResolvedValue('ORD-002');
      txMock.order.create.mockResolvedValue({ id: 'order-2' });

      await service.convertToOrder('quote-1', 'user-1');

      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: mockQuote.clientId,
            subtotal: mockQuote.subtotal,
            taxRate: mockQuote.taxRate,
            tax: mockQuote.tax,
            total: mockQuote.total,
            paidAmount: 0,
            balance: mockQuote.total,
          }),
        }),
      );
    });

    it('should copy items from quote to order', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockConsecutivesService.generateNumber.mockResolvedValue('ORD-003');
      txMock.order.create.mockResolvedValue({ id: 'order-3' });

      await service.convertToOrder('quote-1', 'user-1');

      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  description: 'Item 1',
                  quantity: 1,
                  unitPrice: 100,
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('should include quote reference in order notes', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockConsecutivesService.generateNumber.mockResolvedValue('ORD-004');
      txMock.order.create.mockResolvedValue({ id: 'order-4' });

      await service.convertToOrder('quote-1', 'user-1');

      const createCall = txMock.order.create.mock.calls[0][0];
      expect(createCall.data.notes).toContain(mockQuote.quoteNumber);
    });

    it('should set commercialChannelId on the order', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockConsecutivesService.generateNumber.mockResolvedValue('ORD-005');
      txMock.order.create.mockResolvedValue({ id: 'order-5' });

      await service.convertToOrder('quote-1', 'user-1');

      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            commercialChannelId: mockQuote.commercialChannelId,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // uploadItemSampleImage
  // ─────────────────────────────────────────────
  describe('uploadItemSampleImage', () => {
    const mockFile = {
      buffer: Buffer.from('test'),
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    it('should upload a sample image to a quote item', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue(mockQuote.items[0]);
      mockStorageService.uploadFile.mockResolvedValue({ id: 'file-1' });

      await service.uploadItemSampleImage('quote-1', 'item-1', mockFile, 'user-1');

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(mockFile, {
        entityType: 'quote-item',
        entityId: 'item-1',
        userId: 'user-1',
      });
      expect(mockPrismaService.quoteItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: { sampleImageId: 'file-1' },
        }),
      );
    });

    it('should throw NotFoundException if quote does not exist', async () => {
      mockQuotesRepository.findById.mockResolvedValue(null);

      await expect(
        service.uploadItemSampleImage('non-existent', 'item-1', mockFile, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if item does not belong to quote', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadItemSampleImage('quote-1', 'bad-item', mockFile, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete existing image before uploading new one', async () => {
      const itemWithImage = { ...mockQuote.items[0], sampleImageId: 'old-file' };
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue(itemWithImage);
      mockStorageService.uploadFile.mockResolvedValue({ id: 'new-file' });

      await service.uploadItemSampleImage('quote-1', 'item-1', mockFile, 'user-1');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith('old-file');
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockPrismaService.quoteItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sampleImageId: 'new-file' },
        }),
      );
    });

    it('should continue if deleting existing image fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const itemWithImage = { ...mockQuote.items[0], sampleImageId: 'old-file' };
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue(itemWithImage);
      mockStorageService.deleteFile.mockRejectedValue(new Error('File not found'));
      mockStorageService.uploadFile.mockResolvedValue({ id: 'new-file' });

      // Should not throw even though delete failed
      await expect(
        service.uploadItemSampleImage('quote-1', 'item-1', mockFile, 'user-1'),
      ).resolves.toBeDefined();

      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete existing sample image'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should return the uploaded file', async () => {
      const uploadedFile = { id: 'file-1', url: 'https://example.com/file.jpg' };
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue(mockQuote.items[0]);
      mockStorageService.uploadFile.mockResolvedValue(uploadedFile);

      const result = await service.uploadItemSampleImage('quote-1', 'item-1', mockFile, 'user-1');

      expect(result).toEqual(uploadedFile);
    });
  });

  // ─────────────────────────────────────────────
  // deleteItemSampleImage
  // ─────────────────────────────────────────────
  describe('deleteItemSampleImage', () => {
    it('should delete a sample image from a quote item', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue({
        ...mockQuote.items[0],
        sampleImageId: 'file-1',
      });
      mockStorageService.deleteFile.mockResolvedValue(undefined);

      const result = await service.deleteItemSampleImage('quote-1', 'item-1');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith('file-1');
      expect(mockPrismaService.quoteItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: { sampleImageId: null },
        }),
      );
      expect(result.message).toBe('Sample image deleted successfully');
    });

    it('should throw NotFoundException if quote does not exist', async () => {
      mockQuotesRepository.findById.mockResolvedValue(null);

      await expect(service.deleteItemSampleImage('non-existent', 'item-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if item does not belong to quote', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue(null);

      await expect(service.deleteItemSampleImage('quote-1', 'bad-item')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if item has no sample image', async () => {
      mockQuotesRepository.findById.mockResolvedValue(mockQuote);
      mockPrismaService.quoteItem.findFirst.mockResolvedValue({
        ...mockQuote.items[0],
        sampleImageId: null,
      });

      await expect(service.deleteItemSampleImage('quote-1', 'item-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
