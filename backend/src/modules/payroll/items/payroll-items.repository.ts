import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma';

export interface ExtraShiftInput {
  shiftDate: string;
  description?: string;
  amount: number;
}

const itemSelect = {
  id: true,
  periodId: true,
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
  orderDeductions: true,
  totalPayment: true,
  observations: true,
  createdAt: true,
  updatedAt: true,
  payments: {
    where: { isVoided: false },
    select: { id: true, amount: true, paymentMethod: true, paidAt: true, bankEntity: true, reference: true },
    orderBy: { paidAt: 'asc' as const },
  },
  extraShifts: {
    select: {
      id: true,
      shiftDate: true,
      description: true,
      amount: true,
    },
    orderBy: { shiftDate: 'asc' as const },
  },
  employee: {
    select: {
      id: true,
      employeeType: true,
      monthlySalary: true,
      dailyRate: true,
      identificationType: true,
      identificationNumber: true,
      firstName: true,
      middleName: true,
      firstLastName: true,
      secondLastName: true,
      startDate: true,
      contractType: true,
      eps: true,
      pensionFund: true,
      cargo: { select: { name: true } },
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
};

@Injectable()
export class PayrollItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriod(periodId: string) {
    return this.prisma.payrollItem.findMany({
      where: { periodId },
      select: itemSelect,
      orderBy: { employee: { user: { firstName: 'asc' } } },
    });
  }

  async findById(id: string) {
    return this.prisma.payrollItem.findUnique({
      where: { id },
      select: itemSelect,
    });
  }

  async findByPeriodAndEmployee(periodId: string, employeeId: string) {
    return this.prisma.payrollItem.findUnique({
      where: { periodId_employeeId: { periodId, employeeId } },
      select: itemSelect,
    });
  }

  async create(
    data: Prisma.PayrollItemCreateInput,
    extraShifts?: ExtraShiftInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.payrollItem.create({ data, select: { id: true } });
      if (extraShifts?.length) {
        await tx.payrollExtraShift.createMany({
          data: this.mapShifts(item.id, extraShifts),
        });
      }
      return tx.payrollItem.findUniqueOrThrow({ where: { id: item.id }, select: itemSelect });
    });
  }

  async update(
    id: string,
    data: Prisma.PayrollItemUpdateInput,
    extraShifts?: ExtraShiftInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.payrollItem.update({ where: { id }, data, select: { id: true } });
      if (extraShifts !== undefined) {
        await tx.payrollExtraShift.deleteMany({ where: { payrollItemId: id } });
        if (extraShifts.length) {
          await tx.payrollExtraShift.createMany({
            data: this.mapShifts(id, extraShifts),
          });
        }
      }
      return tx.payrollItem.findUniqueOrThrow({ where: { id }, select: itemSelect });
    });
  }

  private mapShifts(payrollItemId: string, shifts: ExtraShiftInput[]) {
    return shifts.map((s) => ({
      payrollItemId,
      shiftDate: new Date(s.shiftDate),
      description: s.description ?? null,
      amount: s.amount,
    }));
  }

  async delete(id: string) {
    return this.prisma.payrollItem.delete({ where: { id } });
  }

  /** Lo pagado vigente (sin anulados) y cuántos pagos tiene en total, anulados incluidos. */
  async getPaymentTotals(payrollItemId: string) {
    const [active, count] = await Promise.all([
      this.prisma.payrollPayment.aggregate({
        where: { payrollItemId, isVoided: false },
        _sum: { amount: true },
      }),
      this.prisma.payrollPayment.count({ where: { payrollItemId } }),
    ]);
    return { paidAmount: Number(active._sum.amount ?? 0), count };
  }

  /** Descuentos por nómina ya aplicados sobre este registro. */
  async countAppliedDeductions(payrollItemId: string) {
    return this.prisma.payrollDeduction.count({
      where: { status: 'APPLIED', payrollItemId },
    });
  }

  async createMany(items: Prisma.PayrollItemCreateManyInput[]) {
    return this.prisma.payrollItem.createMany({ data: items, skipDuplicates: true });
  }
}
