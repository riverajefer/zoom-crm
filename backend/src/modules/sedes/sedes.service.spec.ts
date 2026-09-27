import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SedesService } from './sedes.service';

describe('SedesService', () => {
  const repo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(async (data) => ({ id: 'l-new', ...data })),
    update: jest.fn(async (id, data) => ({ id, ...data })),
  };
  const service = new SedesService(repo as any);

  afterEach(() => jest.clearAllMocks());

  it('lista solo las activas salvo que se pidan todas', async () => {
    await service.findAll();
    expect(repo.findAll).toHaveBeenCalledWith(false);

    await service.findAll(true);
    expect(repo.findAll).toHaveBeenCalledWith(true);
  });

  it('crea una sede limpiando espacios y vacíos', async () => {
    repo.findByCode.mockResolvedValue(null);

    await service.create({ code: '130', name: ' Local 130 ', color: '#123456', address: '  ', phone: ' 300 ' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: '130', name: 'Local 130', address: null, phone: '300' }),
    );
  });

  it('no repite un código', async () => {
    repo.findByCode.mockResolvedValue({ id: 'l-104', code: '104' });

    await expect(service.create({ code: '104', name: 'Otra', color: '#123456' })).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('edita solo lo que llega', async () => {
    repo.findById.mockResolvedValue({ id: 'l-104' });

    await service.update('l-104', { isActive: false });

    expect(repo.update).toHaveBeenCalledWith('l-104', { isActive: false });
  });

  it('una sede que no existe es 404', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.findOne('l-x')).rejects.toThrow(NotFoundException);
  });
});
