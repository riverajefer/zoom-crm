import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CashSessionStatus, Prisma } from '../../generated/prisma';
import { FilterCashSessionsDto } from './dto';
import {
  CASH_IN_DRAWER_WHERE,
  EXCLUDE_REVERSALS,
} from '../cash-movement/cash-movement.helpers';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';
import { endOfDay, startOfDay } from '../../common/utils/date-range.util';

const SESSION_SELECT = {
  id: true,
  cashRegisterId: true,
  openedById: true,
  closedById: true,
  status: true,
  openingAmount: true,
  closingAmount: true,
  systemBalance: true,
  discrepancy: true,
  notes: true,
  openedAt: true,
  closedAt: true,
  countStartedAt: true,
  createdAt: true,
  updatedAt: true,
  // La sede de la caja: la dirección y el teléfono de los recibos y reportes (docs/PLAN_SEDES.md §9).
  cashRegister: {
    select: { id: true, name: true, description: true, location: { select: LOCATION_SUMMARY_SELECT } },
  },
  openedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  closedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  countStartedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  denominations: {
    orderBy: [{ countType: 'asc' as const }, { denomination: 'desc' as const }],
  },
} satisfies Prisma.CashSessionSelect;

@Injectable()
export class CashSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenByRegisterId(cashRegisterId: string) {
    return this.prisma.cashSession.findFirst({
      where: { cashRegisterId, status: CashSessionStatus.OPEN },
      select: SESSION_SELECT,
    });
  }

  async findById(id: string) {
    return this.prisma.cashSession.findUnique({
      where: { id },
      select: {
        ...SESSION_SELECT,
        movements: {
          orderBy: { createdAt: 'desc' },
          include: {
            performedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            voidedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            // El frontend lo usa para dejar las reversas «-ANUL» fuera de los totales.
            originalMovement: { select: { id: true, receiptNumber: true } },
          },
        },
      },
    });
  }

  async findAll(filters: FilterCashSessionsDto) {
    const {
      cashRegisterId,
      status,
      openedById,
      openedFrom,
      openedTo,
      page = 1,
      limit = 20,
    } = filters;

    const where: Prisma.CashSessionWhereInput = {
      ...(cashRegisterId && { cashRegisterId }),
      ...(status && { status }),
      ...(openedById && { openedById }),
      // Una sesión es del día en que se abrió, en hora de Bogotá: un
      // `YYYY-MM-DD` cubre el día completo allá (docs/PLAN_SEDES.md §4).
      ...(openedFrom || openedTo
        ? {
            openedAt: {
              ...(openedFrom && { gte: startOfDay(openedFrom) }),
              ...(openedTo && { lte: endOfDay(openedTo) }),
            },
          }
        : {}),
    };

    const take = clampPageSize(limit, 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where,
        select: SESSION_SELECT,
        orderBy: { openedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.cashSession.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async create(data: {
    cashRegisterId: string;
    openedById: string;
    openingAmount: Prisma.Decimal;
    notes?: string;
  }) {
    return this.prisma.cashSession.create({ data });
  }

  async update(id: string, data: Prisma.CashSessionUpdateInput) {
    return this.prisma.cashSession.update({ where: { id }, data });
  }

  async computeSystemBalance(cashSessionId: string): Promise<Prisma.Decimal> {
    const allMovements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId, ...CASH_IN_DRAWER_WHERE },
      select: { movementType: true, amount: true },
    });

    let balance = new Prisma.Decimal(0);
    for (const m of allMovements) {
      if (m.movementType === 'INCOME' || m.movementType === 'DEPOSIT') {
        balance = balance.add(m.amount);
      } else {
        balance = balance.sub(m.amount);
      }
    }

    return balance;
  }

  /**
   * Movimientos que movieron lo esperado después de `since` (el inicio del
   * arqueo): efectivo creado después, o cualquier movimiento previo editado o
   * anulado después. Un cambio de método no se puede ver en la fila —solo
   * queda el nuevo—, por eso el segundo caso no filtra por efectivo.
   *
   * Los caminos normales ya bloquean esto durante el arqueo; esta consulta es la
   * red para los que se cuelan: una transacción que leyó la sesión justo antes
   * de que empezara el conteo, o una anulación administrativa.
   */
  async findMovementsChangedSince(cashSessionId: string, since: Date) {
    return this.prisma.cashMovement.findMany({
      where: {
        cashSessionId,
        ...EXCLUDE_REVERSALS,
        OR: [
          { paymentMethod: 'CASH', createdAt: { gt: since } },
          { createdAt: { lte: since }, updatedAt: { gt: since } },
        ],
      },
      select: {
        id: true,
        receiptNumber: true,
        movementType: true,
        paymentMethod: true,
        amount: true,
        description: true,
        isVoided: true,
        createdAt: true,
        updatedAt: true,
        performedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMovementCount(cashSessionId: string): Promise<number> {
    return this.prisma.cashMovement.count({
      where: { cashSessionId, isVoided: false, ...EXCLUDE_REVERSALS },
    });
  }

  async findLastClosedByRegisterId(cashRegisterId: string) {
    return this.prisma.cashSession.findFirst({
      where: {
        cashRegisterId,
        status: CashSessionStatus.CLOSED,
      },
      orderBy: { closedAt: 'desc' },
      select: {
        id: true,
        closedAt: true,
        denominations: {
          where: { countType: 'CLOSING' },
          orderBy: { denomination: 'desc' },
          select: {
            denomination: true,
            quantity: true,
            denomType: true,
          },
        },
      },
    });
  }
}
