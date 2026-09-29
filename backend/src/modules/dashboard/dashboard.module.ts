import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { SedesDashboardService } from './sedes-dashboard.service';
import { SedesDashboardRepository } from './sedes-dashboard.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, SedesDashboardService, SedesDashboardRepository],
})
export class DashboardModule {}
