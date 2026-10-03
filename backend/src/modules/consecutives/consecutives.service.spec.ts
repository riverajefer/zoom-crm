import { NotFoundException } from '@nestjs/common';
import { ConsecutivesService } from './consecutives.service';

/**
 * Numeración global por tipo, con el código de la sede y sin año (solo Zoom, docs/PLAN_SEDES.md §3).
 */
describe('ConsecutivesService', () => {
  let repository: any;
  let service: ConsecutivesService;

  beforeEach(() => {
    repository = {
      getNextNumber: jest.fn().mockResolvedValue('125-OP-0001'),
      syncCounterFromTable: jest.fn(),
      findLocationCode: jest.fn().mockResolvedValue('125'),
      findAll: jest.fn(),
      reset: jest.fn(),
    };
    service = new ConsecutivesService(repository);
  });

  it.each([
    ['ORDER', 'OP', 'orders'],
    ['QUOTE', 'COT', 'quotes'],
    ['WORK_ORDER', 'OT', 'work_orders'],
    ['PRODUCTION_ORDER', 'OPROD', 'production_orders'],
    ['EXPENSE', 'OG', 'expense_orders'],
    ['ACCOUNT_PAYABLE', 'CP', 'accounts_payable'],
    ['CASH_RECEIPT', 'RC', 'cash_movements'],
    ['DTF_UV', 'DTF-UV', 'dtf_records'],
  ] as const)('%s usa el prefijo %s y la tabla %s, con el código de la sede pedida', async (type, prefix, table) => {
    await service.generateNumber(type, 'loc-125');

    expect(repository.getNextNumber).toHaveBeenCalledWith(
      type,
      prefix,
      '125',
      expect.objectContaining({ table }),
    );
  });

  it('PRODUCTION no tiene tabla: usa solo el contador', async () => {
    await service.generateNumber('PRODUCTION', 'loc-125');

    expect(repository.getNextNumber).toHaveBeenCalledWith('PRODUCTION', 'PROD', '125', undefined);
  });

  it('cachea el código de la sede', async () => {
    await service.generateNumber('ORDER', 'loc-125');
    await service.generateNumber('QUOTE', 'loc-125');

    expect(repository.findLocationCode).toHaveBeenCalledTimes(1);
  });

  it('una sede que no existe es 404', async () => {
    repository.findLocationCode.mockResolvedValue(null);

    await expect(service.generateNumber('ORDER', 'loc-x')).rejects.toThrow(NotFoundException);
  });

  it('syncCounter sincroniza el contador global del tipo', async () => {
    await service.syncCounter('QUOTE');

    expect(repository.syncCounterFromTable).toHaveBeenCalledWith(
      'QUOTE',
      'quotes',
      'quote_number',
      'COT',
    );
  });

  it('syncWorkOrderCounter es el syncCounter de OT', async () => {
    await service.syncWorkOrderCounter();

    expect(repository.syncCounterFromTable).toHaveBeenCalledWith(
      'WORK_ORDER',
      'work_orders',
      'work_order_number',
      'OT',
    );
  });

  it('reset delega con el tipo', async () => {
    await service.reset('ORDER');

    expect(repository.reset).toHaveBeenCalledWith('ORDER');
  });
});
