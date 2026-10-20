import { Module } from '@nestjs/common';
import { ExpenseOrderEditRequestsController } from './expense-order-edit-requests.controller';
import { ExpenseOrderEditRequestsService } from './expense-order-edit-requests.service';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [ExpenseOrderEditRequestsController],
  providers: [ExpenseOrderEditRequestsService],
  exports: [ExpenseOrderEditRequestsService],
})
export class ExpenseOrderEditRequestsModule {}
