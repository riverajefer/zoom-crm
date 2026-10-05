import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentVerificationsController } from './payment-verifications.controller';
import { PaymentVerificationsRepository } from './payment-verifications.repository';
import { PaymentVerificationsService } from './payment-verifications.service';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [PaymentVerificationsController],
  providers: [PaymentVerificationsService, PaymentVerificationsRepository],
})
export class PaymentVerificationsModule {}
