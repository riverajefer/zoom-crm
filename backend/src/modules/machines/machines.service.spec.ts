import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { MachinesRepository } from './machines.repository';
import { PrismaService } from '../../database/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';

const machine = {
  id: 'machine-1',
  name: 'Plotter Mimaki',
  description: null,
  isActive: true,
  productionArea: null,
};

const mockRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

describe('MachinesService', () => {
  let service: MachinesService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MachinesService,
        { provide: MachinesRepository, useValue: mockRepository },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MachinesService);
    mockRepository.findById.mockResolvedValue(machine);
    mockRepository.findByName.mockResolvedValue(null);
    mockRepository.create.mockImplementation(async (data) => ({ id: 'new', ...data }));
    mockRepository.update.mockImplementation(async (id, data) => ({ id, ...data }));
    (prisma.productionArea.findUnique as jest.Mock).mockResolvedValue({ id: 'area-1' });
  });

  afterEach(() => jest.clearAllMocks());

  it('crea la máquina con el nombre sin espacios sobrantes', async () => {
    await service.create({ name: '  Plotter Roland ', productionAreaId: 'area-1' });
    expect(mockRepository.create).toHaveBeenCalledWith({
      name: 'Plotter Roland',
      description: null,
      productionAreaId: 'area-1',
    });
  });

  it('rechaza un nombre repetido aunque cambien las mayúsculas', async () => {
    mockRepository.findByName.mockResolvedValue({ id: 'x', name: 'Plotter Mimaki' });
    await expect(service.create({ name: 'plotter mimaki' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un área de producción que no existe', async () => {
    (prisma.productionArea.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.create({ name: 'Láser', productionAreaId: 'nope' })).rejects.toThrow(
      'El área de producción no existe',
    );
  });

  it('al actualizar excluye la propia máquina de la validación de nombre', async () => {
    await service.update('machine-1', { name: 'Plotter Mimaki CJV' });
    expect(mockRepository.findByName).toHaveBeenCalledWith('Plotter Mimaki CJV', 'machine-1');
  });

  it('eliminar solo desactiva', async () => {
    await service.remove('machine-1');
    expect(mockRepository.update).toHaveBeenCalledWith('machine-1', { isActive: false });
  });

  it('404 si la máquina no existe', async () => {
    mockRepository.findById.mockResolvedValue(null);
    await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
  });
});
