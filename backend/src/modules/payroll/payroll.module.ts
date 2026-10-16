import { Module } from '@nestjs/common';
import { PayrollEmployeesController } from './employees/payroll-employees.controller';
import { PayrollEmployeesService } from './employees/payroll-employees.service';
import { PayrollEmployeesRepository } from './employees/payroll-employees.repository';
import { PayrollPeriodsController } from './periods/payroll-periods.controller';
import { PayrollPeriodsService } from './periods/payroll-periods.service';
import { PayrollPeriodsRepository } from './periods/payroll-periods.repository';
import { PayrollItemsService } from './items/payroll-items.service';
import { PayrollItemsRepository } from './items/payroll-items.repository';
import { PayrollPaymentsService } from './payments/payroll-payments.service';
import { PayrollPaymentsRepository } from './payments/payroll-payments.repository';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [UsersModule, RolesModule],
  controllers: [PayrollEmployeesController, PayrollPeriodsController],
  providers: [
    PayrollEmployeesService,
    PayrollEmployeesRepository,
    PayrollPeriodsService,
    PayrollPeriodsRepository,
    PayrollItemsService,
    PayrollItemsRepository,
    PayrollPaymentsService,
    PayrollPaymentsRepository,
  ],
})
export class PayrollModule {}
