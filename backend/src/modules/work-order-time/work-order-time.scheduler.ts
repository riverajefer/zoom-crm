import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
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
export const PRODUCTION_MISSED_CLOSE_JOB = 'production-timer-missed-close';

/** Cada hora, en el minuto 5: revisa si quedó algo abierto que un cierre se saltó. */
export const MISSED_CLOSE_CRON = '0 5 * * * *';

/**
 * Cierra las tareas del temporizador que el operario olvidó finalizar:
 *
 * - **Fin de jornada** (`PRODUCTION_WORKDAY_END`, por defecto 18:00): cierra las
 *   que no se extendieron con «Sigo trabajando».
 * - **Tope** (23:59): cierra todas, también las extendidas y las que se
 *   iniciaron después del cierre.
 * - **Red de seguridad** (al arrancar y cada hora): si el proceso no estaba vivo
 *   en alguno de los dos cierres, cierra lo que quedó abierto con la hora que le
 *   tocaba. Ver `closeMissedTasks`.
 *
 * Es independiente del cierre de asistencia (19:00) y del cierre por
 * inactividad: un operario frente a la máquina no toca el computador, y eso no
 * significa que dejó de trabajar.
 *
 * Igual que en asistencia, los jobs se registran en `onModuleInit` porque la
 * hora es configurable y `@Cron` se evalúa antes de leer el `.env`.
 */
@Injectable()
export class WorkOrderTimeScheduler implements OnModuleInit, OnApplicationBootstrap {
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
    this.register(PRODUCTION_MISSED_CLOSE_JOB, MISSED_CLOSE_CRON, () =>
      this.handleMissedClose('revisión horaria'),
    );

    this.logger.log(
      `[Temporizador] Cierre de tareas a las ${workdayEnd.label} y tope a las 23:59 (${BUSINESS_TIMEZONE}).`,
    );
  }

  /**
   * Al arrancar (después de un deploy o una caída) cierra lo que los cierres de
   * las 18:00 y las 23:59 no alcanzaron. Va en `onApplicationBootstrap` para que
   * la base ya esté conectada.
   */
  onApplicationBootstrap() {
    void this.handleMissedClose('al arrancar');
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

  async handleMissedClose(trigger: string) {
    try {
      const count = await this.service.closeMissedTasks();
      if (count > 0) {
        this.logger.warn(
          `[Temporizador] Red de seguridad (${trigger}): se cerraron ${count} tarea(s) que un cierre automático no alcanzó.`,
        );
      }
    } catch (error) {
      this.logger.error(`[Temporizador] Error en la red de seguridad (${trigger})`, error);
    }
  }
}
