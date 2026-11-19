import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { HistoricalSalesController } from './historical-sales.controller';
import { HistoricalSalesRepository } from './historical-sales.repository';
import { HistoricalSalesService } from './historical-sales.service';

@Module({
  imports: [DatabaseModule],
  controllers: [HistoricalSalesController],
  providers: [HistoricalSalesService, HistoricalSalesRepository],
})
export class HistoricalSalesModule {}
