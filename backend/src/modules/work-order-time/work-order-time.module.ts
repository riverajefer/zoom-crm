import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkOrderTimeController } from './work-order-time.controller';
import { WorkOrderTimeService } from './work-order-time.service';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import { WorkOrderTimeScheduler } from './work-order-time.scheduler';
import { ProductionReportController } from './production-report.controller';
import { ProductionReportService } from './production-report.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderTimeController, ProductionReportController],
  providers: [
    WorkOrderTimeService,
    WorkOrderTimeRepository,
    WorkOrderTimeScheduler,
    ProductionReportService,
  ],
  exports: [WorkOrderTimeService],
})
export class WorkOrderTimeModule {}
