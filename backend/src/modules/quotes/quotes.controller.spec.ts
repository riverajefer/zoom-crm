// Mock uuid before any imports that depend on it (StorageService → uuid ESM)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto, FilterQuotesDto, UpdateQuoteDto } from './dto';
import { QuoteStatus } from '../../generated/prisma';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────────────────────

const mockQuotesService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  findOneForView: jest.fn(),
  lookupInOtherLocations: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  convertToOrder: jest.fn(),
  uploadItemSampleImage: jest.fn(),
  deleteItemSampleImage: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
};

const mockRequest = {
  user: mockUser,
} as any;

const mockQuote = {
  id: 'quote-1',
  quoteNumber: 'COT-001',
  status: QuoteStatus.DRAFT,
  clientId: 'client-1',
  subtotal: 100,
  tax: 19,
  total: 119,
  items: [
    { id: 'item-1', description: 'Item 1', quantity: 1, unitPrice: 100 },
  ],
};

const createQuoteDto: CreateQuoteDto = {
  clientId: 'client-1',
  items: [
    {
      description: 'Test Item',
      quantity: 1,
      unitPrice: 100,
    },
  ],
};

const updateQuoteDto: UpdateQuoteDto = {
  notes: 'Updated notes',
};

const filterQuotesDto: FilterQuotesDto = {
  page: 1,
  limit: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('QuotesController', () => {
  let controller: QuotesController;
  let service: QuotesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        {
          provide: QuotesService,
          useValue: mockQuotesService,
        },
      ],
    })
      // El controlador ahora exige permisos por ruta. En el spec del controlador
      // se anulan los guards: lo que se prueba acá es el enrutamiento y la
      // delegación al servicio, no la autorización.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QuotesController>(QuotesController);
    service = module.get<QuotesService>(QuotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a new quote', async () => {
      mockQuotesService.create.mockResolvedValue(mockQuote);

      const result = await controller.create(createQuoteDto, mockRequest);

      expect(service.create).toHaveBeenCalledWith(createQuoteDto, mockUser.id);
      expect(result).toEqual(mockQuote);
    });

    it('should pass through the correct user ID from request', async () => {
      const otherRequest = { user: { id: 'user-2', email: 'other@example.com' } } as any;
      mockQuotesService.create.mockResolvedValue(mockQuote);

      await controller.create(createQuoteDto, otherRequest);

      expect(service.create).toHaveBeenCalledWith(createQuoteDto, 'user-2');
    });

    it('should propagate BadRequestException from service', async () => {
      mockQuotesService.create.mockRejectedValue(
        new BadRequestException('Quote must have at least one item'),
      );

      await expect(controller.create({ ...createQuoteDto, items: [] }, mockRequest)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────
  describe('findAll', () => {
    it('should return a list of quotes', async () => {
      const mockResult = {
        data: [mockQuote],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      mockQuotesService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(filterQuotesDto, mockRequest);

      expect(service.findAll).toHaveBeenCalledWith(filterQuotesDto, mockRequest.user.id);
      expect(result).toEqual(mockResult);
    });

    it('should pass filter parameters correctly', async () => {
      const filtersWithStatus: FilterQuotesDto = {
        page: 2,
        limit: 20,
        status: QuoteStatus.SENT,
        clientId: 'client-1',
      };
      mockQuotesService.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 2, limit: 20, totalPages: 0 },
      });

      await controller.findAll(filtersWithStatus, mockRequest);

      expect(service.findAll).toHaveBeenCalledWith(filtersWithStatus, mockRequest.user.id);
    });

    it('should return empty result when no quotes match', async () => {
      const emptyResult = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
      mockQuotesService.findAll.mockResolvedValue(emptyResult);

      const result = await controller.findAll(filterQuotesDto, mockRequest);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a single quote', async () => {
      mockQuotesService.findOneForView.mockResolvedValue(mockQuote);

      const result = await controller.findOne('quote-1');

      expect(service.findOneForView).toHaveBeenCalledWith('quote-1');
      expect(result).toEqual(mockQuote);
    });

    it('should propagate NotFoundException from service', async () => {
      mockQuotesService.findOneForView.mockRejectedValue(
        new NotFoundException('Quote with ID non-existent not found'),
      );

      await expect(controller.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe('update', () => {
    it('should update a quote', async () => {
      const updatedQuote = { ...mockQuote, ...updateQuoteDto };
      mockQuotesService.update.mockResolvedValue(updatedQuote);

      const result = await controller.update('quote-1', updateQuoteDto, mockRequest);

      expect(service.update).toHaveBeenCalledWith('quote-1', updateQuoteDto, mockUser.id);
      expect(result).toEqual(updatedQuote);
    });

    it('should pass userId from request to service', async () => {
      const otherRequest = { user: { id: 'user-3', email: 'admin@example.com' } } as any;
      mockQuotesService.update.mockResolvedValue(mockQuote);

      await controller.update('quote-1', updateQuoteDto, otherRequest);

      expect(service.update).toHaveBeenCalledWith('quote-1', updateQuoteDto, 'user-3');
    });

    it('should propagate BadRequestException for converted quotes', async () => {
      mockQuotesService.update.mockRejectedValue(
        new BadRequestException('Cannot update a converted quote'),
      );

      await expect(
        controller.update('quote-1', updateQuoteDto, mockRequest),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle status update to CONVERTED', async () => {
      const convertDto: UpdateQuoteDto = { status: QuoteStatus.CONVERTED };
      const mockOrder = { id: 'order-1', orderNumber: 'ORD-001' };
      mockQuotesService.update.mockResolvedValue(mockOrder);

      const result = await controller.update('quote-1', convertDto, mockRequest);

      expect(service.update).toHaveBeenCalledWith(
        'quote-1',
        { status: QuoteStatus.CONVERTED },
        mockUser.id,
      );
      expect(result).toEqual(mockOrder);
    });

    it('should handle update with items', async () => {
      const updateWithItems: UpdateQuoteDto = {
        items: [
          { id: 'item-1', description: 'Updated', quantity: 2, unitPrice: 150 },
          { description: 'New item', quantity: 1, unitPrice: 50 },
        ],
      };
      mockQuotesService.update.mockResolvedValue({ ...mockQuote, items: updateWithItems.items });

      await controller.update('quote-1', updateWithItems, mockRequest);

      expect(service.update).toHaveBeenCalledWith('quote-1', updateWithItems, mockUser.id);
    });
  });

  // ─────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────
  describe('remove', () => {
    it('should remove a quote', async () => {
      const expectedResult = { message: 'Quote deleted successfully' };
      mockQuotesService.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove('quote-1');

      expect(service.remove).toHaveBeenCalledWith('quote-1');
      expect(result).toEqual(expectedResult);
    });

    it('should propagate NotFoundException from service', async () => {
      mockQuotesService.remove.mockRejectedValue(
        new NotFoundException('Quote with ID non-existent not found'),
      );

      await expect(controller.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should propagate BadRequestException for converted quotes', async () => {
      mockQuotesService.remove.mockRejectedValue(
        new BadRequestException('Cannot delete a converted quote'),
      );

      await expect(controller.remove('quote-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  // convertToOrder
  // ─────────────────────────────────────────────
  describe('convertToOrder', () => {
    it('should convert a quote to an order', async () => {
      const mockOrder = { id: 'order-1', orderNumber: 'ORD-001' };
      mockQuotesService.convertToOrder.mockResolvedValue(mockOrder);

      const result = await controller.convertToOrder('quote-1', mockRequest);

      expect(service.convertToOrder).toHaveBeenCalledWith('quote-1', mockUser.id);
      expect(result).toEqual(mockOrder);
    });

    it('should propagate BadRequestException if already converted', async () => {
      mockQuotesService.convertToOrder.mockRejectedValue(
        new BadRequestException('Quote already converted to an order'),
      );

      await expect(controller.convertToOrder('quote-1', mockRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should propagate NotFoundException if quote does not exist', async () => {
      mockQuotesService.convertToOrder.mockRejectedValue(
        new NotFoundException('Quote with ID non-existent not found'),
      );

      await expect(controller.convertToOrder('non-existent', mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // uploadSampleImage
  // ─────────────────────────────────────────────
  describe('uploadSampleImage', () => {
    const mockFile = {
      buffer: Buffer.from('test'),
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    it('should upload a sample image', async () => {
      const expectedResult = { id: 'file-1', url: 'http://example.com/image.jpg' };
      mockQuotesService.uploadItemSampleImage.mockResolvedValue(expectedResult);

      const result = await controller.uploadSampleImage(
        'quote-1',
        'item-1',
        mockFile,
        mockRequest,
      );

      expect(service.uploadItemSampleImage).toHaveBeenCalledWith(
        'quote-1',
        'item-1',
        mockFile,
        mockUser.id,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should propagate NotFoundException if quote does not exist', async () => {
      mockQuotesService.uploadItemSampleImage.mockRejectedValue(
        new NotFoundException('Quote with ID non-existent not found'),
      );

      await expect(
        controller.uploadSampleImage('non-existent', 'item-1', mockFile, mockRequest),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate NotFoundException if item does not belong to quote', async () => {
      mockQuotesService.uploadItemSampleImage.mockRejectedValue(
        new NotFoundException('Quote item with ID bad-item not found in quote quote-1'),
      );

      await expect(
        controller.uploadSampleImage('quote-1', 'bad-item', mockFile, mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // deleteSampleImage
  // ─────────────────────────────────────────────
  describe('deleteSampleImage', () => {
    it('should delete a sample image', async () => {
      const expectedResult = { message: 'Sample image deleted successfully' };
      mockQuotesService.deleteItemSampleImage.mockResolvedValue(expectedResult);

      const result = await controller.deleteSampleImage('quote-1', 'item-1');

      expect(service.deleteItemSampleImage).toHaveBeenCalledWith('quote-1', 'item-1');
      expect(result).toEqual(expectedResult);
    });

    it('should propagate NotFoundException if item does not exist', async () => {
      mockQuotesService.deleteItemSampleImage.mockRejectedValue(
        new NotFoundException('Quote item with ID bad-item not found'),
      );

      await expect(controller.deleteSampleImage('quote-1', 'bad-item')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate BadRequestException if item has no sample image', async () => {
      mockQuotesService.deleteItemSampleImage.mockRejectedValue(
        new BadRequestException('Quote item item-1 does not have a sample image'),
      );

      await expect(controller.deleteSampleImage('quote-1', 'item-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
