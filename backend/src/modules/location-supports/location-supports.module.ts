import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WsEventsModule } from '../ws-events/ws-events.module';
import { LocationSupportsController } from './location-supports.controller';
import { LocationSupportsService } from './location-supports.service';

@Module({
  imports: [DatabaseModule, NotificationsModule, WsEventsModule],
  controllers: [LocationSupportsController],
  providers: [LocationSupportsService],
})
export class LocationSupportsModule {}
