import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma';

const employeeSelect = {
  id: true,
  userId: true,
  cargoId: true,
  employeeType: true,
  monthlySalary: true,
  dailyRate: true,
  startDate: true,
  contractEndDate: true,
  contractType: true,
  status: true,
  notes: true,
  identificationType: true,
  identificationNumber: true,
  documentIssueDate: true,
  firstName: true,
  middleName: true,
  firstLastName: true,
  secondLastName: true,
  sex: true,
  birthDate: true,
  address: true,
  neighborhood: true,
  phone: true,
  email: true,
  eps: true,
  pensionFund: true,
  emergencyContactName: true,
  emergencyContactRelationship: true,
  emergencyContactPhone: true,
  createdAt: true,
  updatedAt: true,
  cargo: {
    select: { id: true, name: true },
  },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
    },
  },
};

@Injectable()
export class PayrollEmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.employee.findMany({
      select: employeeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      select: employeeSelect,
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: employeeSelect,
    });
  }

  async findUserDefaultLocationId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { defaultLocationId: true },
    });
    return user?.defaultLocationId ?? null;
  }

  async create(data: Prisma.EmployeeCreateInput) {
    return this.prisma.employee.create({
      data,
      select: employeeSelect,
    });
  }

  async update(id: string, data: Prisma.EmployeeUpdateInput) {
    return this.prisma.employee.update({
      where: { id },
      data,
      select: employeeSelect,
    });
  }

  async delete(id: string) {
    return this.prisma.employee.delete({ where: { id } });
  }

  async findHistory(employeeId: string) {
    return this.prisma.payrollItem.findMany({
      where: { employeeId },
      select: {
        id: true,
        employeeId: true,
        daysWorked: true,
        baseSalary: true,
        overtimeDaytimeHours: true,
        overtimeNighttimeHours: true,
        overtimeDaytimeValue: true,
        overtimeNighttimeValue: true,
        commissions: true,
        restDayValue: true,
        transportAllowance: true,
        workdayDiscount: true,
        loans: true,
        advances: true,
        nonPaidDays: true,
        epsAndPensionDiscount: true,
        employeeFundSavings: true,
        totalPayment: true,
        observations: true,
        createdAt: true,
        extraShifts: {
          select: {
            id: true,
            shiftDate: true,
            description: true,
            amount: true,
          },
          orderBy: { shiftDate: 'asc' as const },
        },
        period: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            periodType: true,
            status: true,
          },
        },
      },
      orderBy: { period: { startDate: 'desc' } },
    });
  }
}
