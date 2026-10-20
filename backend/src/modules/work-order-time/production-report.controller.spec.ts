import { ProductionReportController } from './production-report.controller';
import { ProductionReportService } from './production-report.service';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';

describe('ProductionReportController', () => {
  it('pide read_production_reports y pasa el filtro al servicio', async () => {
    const service = { getReport: jest.fn().mockResolvedValue({}) };
    const controller = new ProductionReportController(service as unknown as ProductionReportService);

    expect(Reflect.getMetadata(PERMISSIONS_KEY, ProductionReportController.prototype.getProductivity)).toEqual([
      'read_production_reports',
    ]);

    const query = { from: '2026-10-01', to: '2026-10-15', areaId: 'a1' };
    await controller.getProductivity(query, { id: 'u1', username: 'x', roleId: 'role-1' });
    expect(service.getReport).toHaveBeenCalledWith(query, 'role-1');
  });
});
