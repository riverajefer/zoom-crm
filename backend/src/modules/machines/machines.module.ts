import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';
import { MachinesRepository } from './machines.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [MachinesController],
  providers: [MachinesService, MachinesRepository],
  exports: [MachinesService, MachinesRepository],
})
export class MachinesModule {}
