import { Module } from '@nestjs/common';
import { PaymentEditApprovalsController } from './payment-edit-approvals.controller';
import { PaymentEditApprovalsService } from './payment-edit-approvals.service';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WsEventsModule } from '../ws-events/ws-events.module';
import { StorageModule } from '../storage/storage.module';
import { CreditBalanceModule } from '../credit-balance/credit-balance.module';
import { ConsecutivesModule } from '../consecutives/consecutives.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    DatabaseModule,
    NotificationsModule,
    WsEventsModule,
    StorageModule,
    CreditBalanceModule,
    ConsecutivesModule,
    AuditLogsModule,
  ],
  controllers: [PaymentEditApprovalsController],
  providers: [PaymentEditApprovalsService],
  exports: [PaymentEditApprovalsService],
})
export class PaymentEditApprovalsModule {}
