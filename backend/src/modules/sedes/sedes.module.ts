import { Module } from '@nestjs/common';
import { SedesController } from './sedes.controller';
import { SedesService } from './sedes.service';
import { SedesRepository } from './sedes.repository';

@Module({
  controllers: [SedesController],
  providers: [SedesService, SedesRepository],
  exports: [SedesService, SedesRepository],
})
export class SedesModule {}
