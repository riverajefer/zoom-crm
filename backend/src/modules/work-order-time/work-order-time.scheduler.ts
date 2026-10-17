import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { BUSINESS_TIMEZONE } from '../../common/utils/date-range.util';
import {
  OVERTIME_CAP_CRON,
  workdayEndCron,
} from '../attendance/attendance-schedule.util';
import { WorkOrderTimeService } from './work-order-time.service';
import { parseProductionWorkdayEnd } from './work-order-time.util';

export const PRODUCTION_WORKDAY_END_JOB = 'production-timer-workday-end';
export const PRODUCTION_OVERTIME_CAP_JOB = 'production-timer-overtime-cap';

/**
 * Cierra las tareas del temporizador que el operario olvidó finalizar:
 *
 * - **Fin de jornada** (`PRODUCTION_WORKDAY_END`, por defecto 18:00): cierra las
 *   que no se extendieron con «Sigo trabajando».
 * - **Tope** (23:59): cierra todas, también las extendidas y las que se
 *   iniciaron después del cierre.
 *
 * Es independiente del cierre de asistencia (19:00) y del cierre por
 * inactividad: un operario frente a la máquina no toca el computador, y eso no
 * significa que dejó de trabajar.
 *
 * Igual que en asistencia, los jobs se registran en `onModuleInit` porque la
 * hora es configurable y `@Cron` se evalúa antes de leer el `.env`.
 */
@Injectable()
export class WorkOrderTimeScheduler implements OnModuleInit {
  private readonly logger = new Logger(WorkOrderTimeScheduler.name);

  constructor(
    private readonly service: WorkOrderTimeService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const workdayEnd = parseProductionWorkdayEnd(
      this.configService.get<string>('PRODUCTION_WORKDAY_END'),
    );
    if (!workdayEnd.valid) {
      this.logger.warn(
        `[Temporizador] PRODUCTION_WORKDAY_END no tiene formato HH:mm; se usa ${workdayEnd.label}.`,
      );
    }

    this.register(PRODUCTION_WORKDAY_END_JOB, workdayEndCron(workdayEnd), () =>
      this.handleWorkdayEnd(),
    );
    this.register(PRODUCTION_OVERTIME_CAP_JOB, OVERTIME_CAP_CRON, () => this.handleOvertimeCap());

    this.logger.log(
      `[Temporizador] Cierre de tareas a las ${workdayEnd.label} y tope a las 23:59 (${BUSINESS_TIMEZONE}).`,
    );
  }

  private register(name: string, cronTime: string, onTick: () => Promise<void>) {
    const job = CronJob.from({
      cronTime,
      onTick,
      timeZone: BUSINESS_TIMEZONE,
      start: false,
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
  }

  async handleWorkdayEnd() {
    try {
      const count = await this.service.closeRunningTasks(false);
      if (count > 0) {
        this.logger.log(`[Temporizador] Fin de jornada: se cerraron ${count} tarea(s) olvidadas.`);
      }
    } catch (error) {
      this.logger.error('[Temporizador] Error en el cierre de fin de jornada', error);
    }
  }

  async handleOvertimeCap() {
    try {
      const count = await this.service.closeRunningTasks(true);
      if (count > 0) {
        this.logger.log(`[Temporizador] Tope 23:59: se cerraron ${count} tarea(s) en curso.`);
      }
    } catch (error) {
      this.logger.error('[Temporizador] Error en el cierre del tope', error);
    }
  }
}
