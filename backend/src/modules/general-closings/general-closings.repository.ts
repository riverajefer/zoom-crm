import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  GeneralClosingEventType,
  GeneralClosingReviewStatus,
  GeneralClosingStatus,
  Prisma,
} from '../../generated/prisma';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';
import { withoutLocationScope } from '../../common/utils/location-context';
import { EXCLUDE_REVERSALS } from '../cash-movement/cash-movement.helpers';

const USER_SELECT = { id: true, firstName: true, lastName: true } as const;

const REGISTER_SELECT = {
  id: true,
  name: true,
  isActive: true,
  location: { select: LOCATION_SUMMARY_SELECT },
} as const;

const SESSION_SELECT = {
  id: true,
  cashRegisterId: true,
  status: true,
  openingAmount: true,
  closingAmount: true,
  systemBalance: true,
  discrepancy: true,
  notes: true,
  openedAt: true,
  closedAt: true,
  openedBy: { select: USER_SELECT },
  closedBy: { select: USER_SELECT },
} as const;

const CLOSING_INCLUDE = {
  closedBy: { select: USER_SELECT },
  reviews: { include: { reviewedBy: { select: USER_SELECT } } },
  events: {
    include: { user: { select: USER_SELECT } },
    orderBy: { createdAt: 'desc' },
  },
} as const satisfies Prisma.GeneralClosingInclude;

export type ClosingRegister = Prisma.CashRegisterGetPayload<{ select: typeof REGISTER_SELECT }>;
export type ClosingSession = Prisma.CashSessionGetPayload<{ select: typeof SESSION_SELECT }>;
export type ClosingWithDetail = Prisma.GeneralClosingGetPayload<{ include: typeof CLOSING_INCLUDE }>;

/**
 * El cierre general es de todas las cajas, sin importar la sede activa de quien
 * lo consulta: todo lo que lee cajas o sesiones sale del filtro de sede a
 * propósito (`withoutLocationScope`, docs/PLAN_SEDES.md §15.1).
 */
@Injectable()
export class GeneralClosingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Las cajas activas, más las inactivas que tuvieron sesión ese día. */
  findRegisters(withSessionIds: string[]) {
    return withoutLocationScope(() =>
      this.prisma.cashRegister.findMany({
        where: { OR: [{ isActive: true }, { id: { in: withSessionIds } }] },
        select: REGISTER_SELECT,
        orderBy: [{ location: { sortOrder: 'asc' } }, { name: 'asc' }],
      }),
    );
  }

  findSessionsOpenedBetween(from: Date, to: Date) {
    return withoutLocationScope(() =>
      this.prisma.cashSession.findMany({
        where: { openedAt: { gte: from, lte: to } },
        select: SESSION_SELECT,
        orderBy: { openedAt: 'asc' },
      }),
    );
  }

  /** Para la lista de días sin cerrar: solo cuándo abrió cada sesión. */
  findSessionOpenings(from: Date, before: Date) {
    return withoutLocationScope(() =>
      this.prisma.cashSession.findMany({
        where: { openedAt: { gte: from, lt: before } },
        select: { openedAt: true, status: true },
      }),
    );
  }

  /**
   * Movimientos vivos de las sesiones, agrupados. Mismas reglas que el saldo
   * de una sesión (`computeSystemBalance`): sin anulados y sin las reversas.
   */
  sumMovements(sessionIds: string[]) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    return withoutLocationScope(() =>
      this.prisma.cashMovement.groupBy({
        by: ['cashSessionId', 'movementType', 'paymentMethod'],
        where: { cashSessionId: { in: sessionIds }, isVoided: false, ...EXCLUDE_REVERSALS },
        _sum: { amount: true },
      }),
    );
  }

  findByDate(date: Date) {
    return this.prisma.generalClosing.findUnique({ where: { date }, include: CLOSING_INCLUDE });
  }

  findById(id: string) {
    return this.prisma.generalClosing.findUnique({ where: { id }, include: CLOSING_INCLUDE });
  }

  /** Guarda la revisión de una caja; crea el cierre del día si aún no existe. */
  async saveReview(
    date: Date,
    cashRegisterId: string,
    data: { status: GeneralClosingReviewStatus; notes: string | null; reviewedById: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const closing = await tx.generalClosing.upsert({
        where: { date },
        create: { date },
        update: {},
        select: { id: true },
      });
      return tx.generalClosingRegisterReview.upsert({
        where: {
          generalClosingId_cashRegisterId: { generalClosingId: closing.id, cashRegisterId },
        },
        create: { generalClosingId: closing.id, cashRegisterId, ...data },
        update: { ...data, reviewedAt: new Date() },
      });
    });
  }

  /** Firma el día. Devuelve `false` si alguien más lo firmó primero. */
  async close(id: string, data: { notes: string | null; snapshot: Prisma.InputJsonValue; userId: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.generalClosing.updateMany({
        where: { id, status: GeneralClosingStatus.OPEN },
        data: {
          status: GeneralClosingStatus.CLOSED,
          notes: data.notes,
          snapshot: data.snapshot,
          closedById: data.userId,
          closedAt: new Date(),
        },
      });
      if (count === 0) return false;
      await tx.generalClosingEvent.create({
        data: {
          generalClosingId: id,
          type: GeneralClosingEventType.CLOSED,
          notes: data.notes,
          userId: data.userId,
        },
      });
      return true;
    });
  }

  /** Quita la firma. Las revisiones de cada caja se conservan. */
  async reopen(id: string, reason: string, userId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.generalClosing.updateMany({
        where: { id, status: GeneralClosingStatus.CLOSED },
        data: {
          status: GeneralClosingStatus.OPEN,
          snapshot: Prisma.DbNull,
          closedById: null,
          closedAt: null,
        },
      });
      if (count === 0) return false;
      await tx.generalClosingEvent.create({
        data: {
          generalClosingId: id,
          type: GeneralClosingEventType.REOPENED,
          notes: reason,
          userId,
        },
      });
      return true;
    });
  }

  async findHistory(page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.generalClosing.findMany({
        select: {
          id: true,
          date: true,
          status: true,
          notes: true,
          snapshot: true,
          closedAt: true,
          closedBy: { select: USER_SELECT },
          reviews: { select: { status: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.generalClosing.count(),
    ]);
    return { data, total };
  }

  findClosedDates(from: Date) {
    return this.prisma.generalClosing.findMany({
      where: { date: { gte: from }, status: GeneralClosingStatus.CLOSED },
      select: { date: true },
    });
  }
}
