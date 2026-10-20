import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  MISSED_CLOSE_CRON,
  PRODUCTION_MISSED_CLOSE_JOB,
  PRODUCTION_OVERTIME_CAP_JOB,
  PRODUCTION_WORKDAY_END_JOB,
  WorkOrderTimeScheduler,
} from './work-order-time.scheduler';
import { WorkOrderTimeService } from './work-order-time.service';

describe('WorkOrderTimeScheduler', () => {
  const service = {
    closeRunningTasks: jest.fn(),
    closeMissedTasks: jest.fn(),
  };
  let registry: SchedulerRegistry;
  let scheduler: WorkOrderTimeScheduler;

  beforeEach(() => {
    registry = new SchedulerRegistry();
    scheduler = new WorkOrderTimeScheduler(
      service as unknown as WorkOrderTimeService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      registry,
    );
    service.closeMissedTasks.mockResolvedValue(0);
  });

  afterEach(() => {
    for (const name of registry.getCronJobs().keys()) registry.deleteCronJob(name);
    jest.clearAllMocks();
  });

  it('registra el fin de jornada, el tope y la revisión horaria', () => {
    scheduler.onModuleInit();

    const jobs = registry.getCronJobs();
    expect([...jobs.keys()].sort()).toEqual(
      [PRODUCTION_MISSED_CLOSE_JOB, PRODUCTION_OVERTIME_CAP_JOB, PRODUCTION_WORKDAY_END_JOB].sort(),
    );
    expect(MISSED_CLOSE_CRON).toBe('0 5 * * * *');
  });

  it('al arrancar corre la red de seguridad', async () => {
    scheduler.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.closeMissedTasks).toHaveBeenCalledTimes(1);
  });

  it('un error en la red de seguridad no tumba el proceso', async () => {
    service.closeMissedTasks.mockRejectedValue(new Error('db caída'));
    const logError = jest.spyOn((scheduler as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation();

    await expect(scheduler.handleMissedClose('al arrancar')).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
