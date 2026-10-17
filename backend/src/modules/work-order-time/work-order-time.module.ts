import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkOrderTimeController } from './work-order-time.controller';
import { WorkOrderTimeService } from './work-order-time.service';
import { WorkOrderTimeRepository } from './work-order-time.repository';
import { WorkOrderTimeScheduler } from './work-order-time.scheduler';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderTimeController],
  providers: [WorkOrderTimeService, WorkOrderTimeRepository, WorkOrderTimeScheduler],
  exports: [WorkOrderTimeService],
})
export class WorkOrderTimeModule {}
