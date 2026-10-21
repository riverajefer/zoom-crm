import { BadRequestException } from '@nestjs/common';
import { ProductionSettingsService } from './production-settings.service';
import { WorkOrderTimeRepository } from './work-order-time.repository';

describe('ProductionSettingsService', () => {
  const repository = {
    findProductionSettings: jest.fn(),
    saveProductionSettings: jest.fn(),
  };
  const service = new ProductionSettingsService(repository as unknown as WorkOrderTimeRepository);
  const dto = { hourlyDivisor: 220, overtimeFactor: 1.35, laborShareWarningPct: 12, laborShareCriticalPct: 25 };

  afterEach(() => jest.clearAllMocks());

  it('sin fila guardada rigen los valores de arranque', async () => {
    repository.findProductionSettings.mockResolvedValue(null);

    await expect(service.get()).resolves.toEqual({
      hourlyDivisor: 210,
      overtimeFactor: 1.25,
      laborShareWarningPct: 15,
      laborShareCriticalPct: 30,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('convierte los decimales de la base y entrega los umbrales como fracción al reporte', async () => {
    repository.findProductionSettings.mockResolvedValue({
      hourlyDivisor: '220.00',
      overtimeFactor: '1.35',
      laborShareWarningPct: '12.50',
      laborShareCriticalPct: '25.00',
      updatedAt: new Date('2026-10-21T15:00:00Z'),
      updatedBy: { id: 'u1', firstName: 'Ana', lastName: 'Gómez' },
    });

    await expect(service.getCostSettings()).resolves.toEqual({
      hourlyDivisor: 220,
      overtimeFactor: 1.35,
      laborShareWarning: 0.125,
      laborShareCritical: 0.25,
    });
  });

  it('guarda quién los cambió', async () => {
    repository.findProductionSettings.mockResolvedValue(null);

    await service.update(dto, 'u1');

    expect(repository.saveProductionSettings).toHaveBeenCalledWith({ ...dto, updatedById: 'u1' });
  });

  it('el umbral de atención debe ser menor que el de alerta', async () => {
    await expect(service.update({ ...dto, laborShareWarningPct: 25 }, 'u1')).rejects.toThrow(BadRequestException);
    expect(repository.saveProductionSettings).not.toHaveBeenCalled();
  });
});
