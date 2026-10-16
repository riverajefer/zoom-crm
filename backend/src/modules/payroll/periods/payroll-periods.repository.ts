import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma';
import {
  computeItemBalance,
  computeItemPaidAmount,
  computeItemPaymentStatus,
} from '../../../common/utils/payroll-payment-status.util';

const periodSelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  periodType: true,
  status: true,
  overtimeDaytimeRate: true,
  overtimeNighttimeRate: true,
  overtimeDaytimeFestiveRate: true,
  overtimeNighttimeFestiveRate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

const userSummarySelect = {
  select: { id: true, firstName: true, lastName: true, email: true },
} as const;

/**
 * Anticipo con su trazabilidad completa: quién lo pidió, quién lo aprobó
 * (Gerencia) y quién lo desembolsó (Caja). La autorización de la CP
 * (`authorizedBy`) no se usa en los anticipos: la aprobación real vive en la
 * doble firma del pago (`AccountPayablePaymentAuthRequest`).
 */
const advanceSelect = {
  id: true,
  apNumber: true,
  description: true,
  observations: true,
  totalAmount: true,
  paidAmount: true,
  balance: true,
  status: true,
  dueDate: true,
  createdAt: true,
  createdBy: userSummarySelect,
  beneficiaryUser: userSummarySelect,
  payments: {
    select: {
      id: true,
      amount: true,
      paymentMethod: true,
      paymentDate: true,
      reference: true,
      notes: true,
      isReversed: true,
      reversedAt: true,
      createdAt: true,
      registeredBy: userSummarySelect,
      paymentAuthRequest: {
        select: {
          id: true,
          reason: true,
          createdAt: true,
          requestedBy: userSummarySelect,
          adminReviewedBy: userSummarySelect,
          adminReviewedAt: true,
          adminNotes: true,
          cajaReviewedBy: userSummarySelect,
          cajaReviewedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  // Solicitudes de pago que no terminaron en desembolso (pendientes,
  // rechazadas o vencidas): explican por qué un anticipo sigue sin pagarse.
  paymentAuthRequests: {
    where: { createdPayment: { is: null } },
    select: {
      id: true,
      status: true,
      amount: true,
      paymentMethod: true,
      reason: true,
      createdAt: true,
      requestedBy: userSummarySelect,
      adminReviewedBy: userSummarySelect,
      adminReviewedAt: true,
      adminNotes: true,
      cajaReviewedBy: userSummarySelect,
      cajaReviewedAt: true,
      cajaRejectionReason: true,
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.AccountPayableSelect;

@Injectable()
export class PayrollPeriodsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.payrollPeriod.findMany({
      select: periodSelect,
      orderBy: { startDate: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.payrollPeriod.findUnique({
      where: { id },
      select: {
        ...periodSelect,
        payrollItems: {
          select: {
            id: true,
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
              select: { id: true, amount: true, paymentMethod: true, paidAt: true },
              orderBy: { paidAt: 'asc' },
            },
            employee: {
              select: {
                id: true,
                employeeType: true,
                status: true,
                monthlySalary: true,
                dailyRate: true,
                cargo: { select: { id: true, name: true } },
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: { employee: { user: { firstName: 'asc' } } },
        },
      },
    });
  }

  /** Periodo de nómina "en curso" (status IN_PROGRESS). Debe haber a lo sumo uno. */
  async findCurrent() {
    return this.prisma.payrollPeriod.findFirst({
      where: { status: 'IN_PROGRESS' },
      orderBy: { startDate: 'desc' },
      select: periodSelect,
    });
  }

  /**
   * Anticipos (cuentas por pagar Personal/Anticipos) vinculados a un periodo,
   * con su beneficiario, estado de pago y trazabilidad de aprobación y
   * desembolso (ver `advanceSelect`). Excluye los anulados.
   */
  async findAdvancesByPeriod(periodId: string) {
    return this.prisma.accountPayable.findMany({
      where: { payrollPeriodId: periodId, status: { not: 'CANCELLED' } },
      select: advanceSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: Prisma.PayrollPeriodCreateInput) {
    return this.prisma.payrollPeriod.create({
      data,
      select: periodSelect,
    });
  }

  /**
   * Crea un periodo junto con sus registros de nómina en una sola transacción,
   * de modo que un fallo al insertar los items no deje un periodo huérfano.
   * Los items llegan sin `periodId`: se inyecta el id del periodo recién creado.
   */
  async createWithItems(
    data: Prisma.PayrollPeriodCreateInput,
    items: Omit<Prisma.PayrollItemCreateManyInput, 'periodId'>[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.create({
        data,
        select: periodSelect,
      });

      let itemsCount = 0;
      if (items.length) {
        const result = await tx.payrollItem.createMany({
          data: items.map((item) => ({ ...item, periodId: period.id })),
        });
        itemsCount = result.count;
      }

      return { period, itemsCount };
    });
  }

  async update(id: string, data: Prisma.PayrollPeriodUpdateInput) {
    return this.prisma.payrollPeriod.update({
      where: { id },
      data,
      select: periodSelect,
    });
  }

  async delete(id: string) {
    return this.prisma.payrollPeriod.delete({ where: { id } });
  }

  /** Descuentos por nómina ya aplicados sobre los registros del periodo. */
  async countAppliedDeductions(periodId: string) {
    return this.prisma.payrollDeduction.count({
      where: { status: 'APPLIED', payrollItem: { periodId } },
    });
  }

  /** Pagos registrados en el periodo, anulados incluidos (guardan la historia). */
  async countPayments(periodId: string) {
    return this.prisma.payrollPayment.count({ where: { payrollItem: { periodId } } });
  }

  async getSummary(id: string) {
    const items = await this.prisma.payrollItem.findMany({
      where: { periodId: id },
      select: {
        totalPayment: true,
        baseSalary: true,
        epsAndPensionDiscount: true,
        employeeFundSavings: true,
        orderDeductions: true,
        payments: {
          where: { isVoided: false },
          select: { amount: true, paymentMethod: true },
        },
      },
    });

    const totalPayment = items.reduce(
      (acc, item) => acc + Number(item.totalPayment),
      0,
    );
    const totalBaseSalary = items.reduce(
      (acc, item) => acc + Number(item.baseSalary),
      0,
    );
    const totalEpsAndPension = items.reduce(
      (acc, item) => acc + Number(item.epsAndPensionDiscount ?? 0),
      0,
    );
    const totalEmployeeFundSavings = items.reduce(
      (acc, item) => acc + Number(item.employeeFundSavings ?? 0),
      0,
    );
    const totalOrderDeductions = items.reduce(
      (acc, item) => acc + Number(item.orderDeductions ?? 0),
      0,
    );

    // Control de pagos uno a uno: cuánto salió en efectivo, cuánto por
    // transferencia y cuánto falta. Solo cuenta pagos no anulados.
    let totalPaidCash = 0;
    let totalPaidTransfer = 0;
    let totalPending = 0;
    const paymentStatusCount = { PENDING: 0, PARTIAL: 0, PAID: 0 };
    for (const item of items) {
      for (const p of item.payments) {
        if (p.paymentMethod === 'CASH') totalPaidCash += Number(p.amount);
        else totalPaidTransfer += Number(p.amount);
      }
      const paid = computeItemPaidAmount(item.payments);
      totalPending += Math.max(computeItemBalance(item.totalPayment, paid), 0);
      paymentStatusCount[computeItemPaymentStatus(item.totalPayment, paid)] += 1;
    }

    return {
      employeeCount: items.length,
      totalPaidCash,
      totalPaidTransfer,
      totalPaid: totalPaidCash + totalPaidTransfer,
      totalPending,
      paymentStatusCount,
      totalBaseSalary,
      totalPayment,
      totalEpsAndPension,
      totalEmployeeFundSavings,
      // Trabajos que los empleados mandaron a hacer en la empresa y se les
      // descuentan acá. A diferencia de los otros descuentos, este no se gira a
      // un tercero: la empresa se lo queda porque es el cobro de esas órdenes.
      totalOrderDeductions,
      // Costo bruto: lo que se le consigna al empleado mas lo que se le retiene
      // y se gira por el (seguridad social y ahorro al fondo de empleados).
      //
      // Las órdenes descontadas también suman: el empleado se ganó ese dinero y
      // la empresa se lo debía; que se lo haya cobrado contra una OP en vez de
      // consignárselo no abarata la nómina. Dejarlas por fuera haría que un
      // periodo con muchos descuentos pareciera más barato de lo que fue.
      totalPayrollCost:
        totalPayment +
        totalEpsAndPension +
        totalEmployeeFundSavings +
        totalOrderDeductions,
    };
  }
}
