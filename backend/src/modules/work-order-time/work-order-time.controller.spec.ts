import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrderTimeController } from './work-order-time.controller';
import { WorkOrderTimeService } from './work-order-time.service';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';

const user = { id: 'user-1', username: 'carlos', roleId: 'role-1' } as AuthenticatedUser;

const mockService = {
  findMyRunning: jest.fn(),
  findActiveMachines: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  extend: jest.fn(),
  findPendingReview: jest.fn(),
  findOperators: jest.fn(),
  findPlant: jest.fn(),
  createManual: jest.fn(),
  adjust: jest.fn(),
  void: jest.fn(),
  markReviewed: jest.fn(),
};

const permissionsOf = (method: keyof WorkOrderTimeController) =>
  Reflect.getMetadata(PERMISSIONS_KEY, WorkOrderTimeController.prototype[method]);

describe('WorkOrderTimeController', () => {
  let controller: WorkOrderTimeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkOrderTimeController],
      providers: [
        { provide: WorkOrderTimeService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get(WorkOrderTimeController);
  });

  afterEach(() => jest.clearAllMocks());

  it('el operario solo marca sus tareas con el usuario de la sesión', async () => {
    const dto = { workOrderId: 'wo-1' };
    await controller.start(dto, user);
    await controller.stop('entry-1', user);
    await controller.extend('entry-1', user);

    expect(mockService.start).toHaveBeenCalledWith(dto, 'user-1');
    expect(mockService.stop).toHaveBeenCalledWith('entry-1', 'user-1');
    expect(mockService.extend).toHaveBeenCalledWith('entry-1', 'user-1');
  });

  it('las acciones del operario piden track_work_order_time', () => {
    for (const method of ['findMyRunning', 'start', 'stop', 'extend'] as const) {
      expect(permissionsOf(method)).toEqual(['track_work_order_time']);
    }
  });

  it('la lista de máquinas la puede leer operario o supervisor', () => {
    expect(permissionsOf('findActiveMachines')).toBeUndefined();
  });

  it('las correcciones piden adjust_work_order_time', () => {
    for (const method of [
      'findPendingReview',
      'findOperators',
      'createManual',
      'adjust',
      'void',
      'markReviewed',
    ] as const) {
      expect(permissionsOf(method)).toEqual(['adjust_work_order_time']);
    }
  });

  it('«Planta hoy» pide read_production_plant y pasa la fecha', async () => {
    expect(permissionsOf('findPlant')).toEqual(['read_production_plant']);

    await controller.findPlant({ date: '2026-10-17' });
    await controller.findPlant({});

    expect(mockService.findPlant).toHaveBeenNthCalledWith(1, '2026-10-17');
    expect(mockService.findPlant).toHaveBeenNthCalledWith(2, undefined);
  });
});
