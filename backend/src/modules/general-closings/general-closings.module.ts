import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CashMovementModule } from '../cash-movement/cash-movement.module';
import { GeneralClosingsController } from './general-closings.controller';
import { GeneralClosingsRepository } from './general-closings.repository';
import { GeneralClosingsService } from './general-closings.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule, CashMovementModule],
  controllers: [GeneralClosingsController],
  providers: [GeneralClosingsService, GeneralClosingsRepository],
})
export class GeneralClosingsModule {}
