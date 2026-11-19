import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HistoricalSaleStatus } from '../../generated/prisma';
import { HISTORICAL_EXPORT_MAX, HistoricalSalesService } from './historical-sales.service';
import { HistoricalSalesRepository } from './historical-sales.repository';

describe('HistoricalSalesService', () => {
  let repository: jest.Mocked<
    Pick<HistoricalSalesRepository, 'findMany' | 'summarize' | 'findById' | 'count' | 'findForExport'>
  >;
  let service: HistoricalSalesService;

  beforeEach(() => {
    repository = {
      findMany: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      summarize: jest.fn(),
      findById: jest.fn(),
      count: jest.fn(),
      findForExport: jest.fn().mockResolvedValue([]),
    };
    service = new HistoricalSalesService(repository as unknown as HistoricalSalesRepository);
  });

  it('compara las fechas como días, a medianoche UTC (la columna es DATE)', async () => {
    await service.findAll({ dateFrom: '2024-01-01', dateTo: '2024-01-31', search: '  4157 ' });

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: new Date('2024-01-01T00:00:00.000Z'),
        dateTo: new Date('2024-01-31T00:00:00.000Z'),
        search: '4157',
      }),
      1,
      25,
    );
  });

  it('arma el resumen con todos los estados y solo el saldo de las OP con saldo', async () => {
    repository.summarize.mockResolvedValue({
      sales: { _count: { _all: 3 }, _sum: { total: 300, receivedAmount: 250 } },
      byStatus: [
        { status: HistoricalSaleStatus.PAID, _count: { _all: 2 }, _sum: { total: 200, balance: -10 } },
        {
          status: HistoricalSaleStatus.WITH_BALANCE,
          _count: { _all: 1 },
          _sum: { total: 100, balance: 50 },
        },
      ],
      byYear: [{ year: 2024, _count: { _all: 3 }, _sum: { total: 300 } }],
    } as never);

    const summary = await service.getSummary({});

    expect(summary).toMatchObject({
      salesCount: 3,
      salesTotal: 300,
      receivedTotal: 250,
      pendingBalance: 50,
      byYear: [{ year: 2024, count: 3, total: 300 }],
    });
    expect(summary.byStatus.ANNULLED).toEqual({ count: 0, total: 0, balance: 0 });
  });

  it('responde 404 si la venta no existe o es de otra sede', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no exporta por encima del tope', async () => {
    repository.count.mockResolvedValue(HISTORICAL_EXPORT_MAX + 1);
    await expect(service.findForExport({})).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findForExport).not.toHaveBeenCalled();
  });
});
