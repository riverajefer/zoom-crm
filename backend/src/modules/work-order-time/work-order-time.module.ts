import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkOrderTimeController } from './work-order-time.controller';
import { WorkOrderTimeService } from './work-order-time.service';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import { WorkOrderTimeScheduler } from './work-order-time.scheduler';
import { ProductionReportController } from './production-report.controller';
import { ProductionReportService } from './production-report.service';
import { ProductionSettingsController } from './production-settings.controller';
import { ProductionSettingsService } from './production-settings.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderTimeController, ProductionReportController, ProductionSettingsController],
  providers: [
    WorkOrderTimeService,
    WorkOrderTimeRepository,
    WorkOrderTimeScheduler,
    ProductionReportService,
    ProductionSettingsService,
  ],
  exports: [WorkOrderTimeService],
})
export class WorkOrderTimeModule {}
