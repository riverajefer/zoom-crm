import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  GeneralClosingReviewStatus,
  GeneralClosingStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma';
import { businessDate, businessToday, endOfDay, startOfDay } from '../../common/utils/date-range.util';
import { dateOnly } from '../../common/utils/location-support.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CloseGeneralClosingDto,
  FilterGeneralClosingsDto,
  ReopenGeneralClosingDto,
  ReviewRegisterDto,
} from './dto';
import {
  ClosingRegister,
  ClosingSession,
  ClosingWithDetail,
  GeneralClosingsRepository,
} from './general-closings.repository';

/** Cuántos días hacia atrás se buscan días con caja y sin cierre general. */
export const PENDING_DAYS_LOOKBACK = 60;

export type RegisterDayStatus = 'CLOSED' | 'OPEN' | 'NO_SESSION';

/** Los números de una caja en un día. Son también las columnas del total. */
export interface RegisterDayTotals {
  openingAmount: number;
  incomeCash: number;
  incomeTransfer: number;
  incomeCard: number;
  incomeOther: number;
  deposits: number;
  cashExpenses: number;
  otherExpenses: number;
  withdrawals: number;
  expected: number | null;
  counted: number | null;
  discrepancy: number | null;
}

const TOTAL_FIELDS: readonly (keyof RegisterDayTotals)[] = [
  'openingAmount',
  'incomeCash',
  'incomeTransfer',
  'incomeCard',
  'incomeOther',
  'deposits',
  'cashExpenses',
  'otherExpenses',
  'withdrawals',
  'expected',
  'counted',
  'discrepancy',
];

type Review = ClosingWithDetail['reviews'][number];
type MovementSum = Awaited<ReturnType<GeneralClosingsRepository['sumMovements']>>[number];

export interface RegisterDayRow {
  cashRegister: ClosingRegister;
  status: RegisterDayStatus;
  sessions: ClosingSession[];
  totals: RegisterDayTotals;
  review: Pick<Review, 'status' | 'notes' | 'reviewedAt' | 'reviewedBy'> | null;
}

export interface ClosingSnapshot {
  registers: RegisterDayRow[];
  totals: RegisterDayTotals;
}

export interface ClosingDrift {
  cashRegisterId: string;
  cashRegisterName: string;
  field: keyof RegisterDayTotals;
  signed: number | null;
  current: number | null;
}

const emptyTotals = (): RegisterDayTotals => ({
  openingAmount: 0,
  incomeCash: 0,
  incomeTransfer: 0,
  incomeCard: 0,
  incomeOther: 0,
  deposits: 0,
  cashExpenses: 0,
  otherExpenses: 0,
  withdrawals: 0,
  expected: null,
  counted: null,
  discrepancy: null,
});

const isInflow = (type: CashMovementType) =>
  type === CashMovementType.INCOME || type === CashMovementType.DEPOSIT;

/**
 * Cierre general diario (solo Zoom, docs/PLAN_SEDES.md §14).
 *
 * Cada sede cierra su caja como siempre. Contabilidad abre el día, ve las cajas
 * de todas las sedes lado a lado, marca cada una como verificada u observada y
 * firma el cierre. Es un **control posterior**, como la verificación de pagos:
 * no cierra sesiones, no bloquea movimientos y no entra en ningún saldo.
 */
@Injectable()
export class GeneralClosingsService {
  constructor(
    private readonly repository: GeneralClosingsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /** El consolidado de un día. Firmado, devuelve la foto y lo que cambió después. */
  async getDay(day: string) {
    this.assertDay(day);
    const [live, closing] = await Promise.all([
      this.buildLive(day),
      this.repository.findByDate(dateOnly(day)),
    ]);
    const registers = this.attachReviews(live, closing?.reviews ?? []);
    const blockers = this.closeBlockers(registers);
    const snapshot =
      closing?.status === GeneralClosingStatus.CLOSED
        ? (closing.snapshot as unknown as ClosingSnapshot | null)
        : null;

    return {
      date: day,
      closing: closing
        ? {
            id: closing.id,
            status: closing.status,
            notes: closing.notes,
            closedAt: closing.closedAt,
            closedBy: closing.closedBy,
            events: closing.events,
          }
        : null,
      registers: snapshot?.registers ?? registers,
      totals: snapshot?.totals ?? this.sumTotals(registers),
      blockers: snapshot ? [] : blockers,
      drift: snapshot ? this.computeDrift(snapshot.registers, registers) : [],
    };
  }

  async reviewRegister(day: string, cashRegisterId: string, dto: ReviewRegisterDto, userId: string) {
    this.assertDay(day);
    const closing = await this.repository.findByDate(dateOnly(day));
    this.assertNotClosed(closing);

    const row = (await this.buildLive(day)).find((r) => r.cashRegister.id === cashRegisterId);
    if (!row) {
      throw new NotFoundException(`Caja ${cashRegisterId} no encontrada en el cierre de ${day}`);
    }
    if (row.status === 'OPEN') {
      throw new BadRequestException(
        `${row.cashRegister.name} sigue abierta: se revisa cuando la sede la cierre`,
      );
    }
    const inconsistency = this.reviewInconsistency(row, dto.status);
    if (inconsistency) throw new BadRequestException(inconsistency);
    if (dto.status === GeneralClosingReviewStatus.OBSERVED && !dto.notes) {
      throw new BadRequestException('Una caja observada lleva nota');
    }

    await this.repository.saveReview(dateOnly(day), cashRegisterId, {
      status: dto.status,
      notes: dto.notes || null,
      reviewedById: userId,
    });
    return this.getDay(day);
  }

  async closeDay(day: string, dto: CloseGeneralClosingDto, userId: string) {
    this.assertDay(day);
    const closing = await this.repository.findByDate(dateOnly(day));
    this.assertNotClosed(closing);

    const registers = this.attachReviews(await this.buildLive(day), closing?.reviews ?? []);
    const blockers = this.closeBlockers(registers);
    if (!closing || blockers.length > 0) {
      throw new BadRequestException({
        message: 'El día todavía no se puede cerrar',
        blockers: blockers.length > 0 ? blockers : ['Ninguna caja está revisada'],
      });
    }

    const snapshot: ClosingSnapshot = { registers, totals: this.sumTotals(registers) };
    const closed = await this.repository.close(closing.id, {
      notes: dto.notes || null,
      // Pasa por JSON para dejar fechas y decimales como texto plano.
      snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
      userId,
    });
    if (!closed) throw new ConflictException(`El cierre general de ${day} ya está firmado`);

    this.audit(closing.id, { status: closing.status }, { status: GeneralClosingStatus.CLOSED, date: day }, userId);
    return this.getDay(day);
  }

  async reopen(id: string, dto: ReopenGeneralClosingDto, userId: string) {
    const closing = await this.repository.findById(id);
    if (!closing) throw new NotFoundException(`Cierre general ${id} no encontrado`);
    const reopened = await this.repository.reopen(id, dto.reason, userId);
    if (!reopened) throw new BadRequestException('El cierre general no está firmado');

    const day = closing.date.toISOString().slice(0, 10);
    this.audit(
      id,
      { status: closing.status, date: day },
      { status: GeneralClosingStatus.OPEN, reason: dto.reason },
      userId,
    );
    return this.getDay(day);
  }

  async findHistory(filters: FilterGeneralClosingsDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { data, total } = await this.repository.findHistory(page, limit);
    return {
      data: data.map(({ snapshot, reviews, date, ...closing }) => ({
        ...closing,
        date: date.toISOString().slice(0, 10),
        totals: (snapshot as unknown as ClosingSnapshot | null)?.totals ?? null,
        observedCount: reviews.filter((r) => r.status === GeneralClosingReviewStatus.OBSERVED).length,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Días pasados con alguna sesión de caja y sin cierre general firmado. */
  async findPendingDays() {
    const today = businessToday();
    const todayStart = startOfDay(today)!;
    const from = new Date(todayStart.getTime() - PENDING_DAYS_LOOKBACK * 24 * 60 * 60 * 1000);
    const [openings, closed] = await Promise.all([
      this.repository.findSessionOpenings(from, todayStart),
      this.repository.findClosedDates(dateOnly(businessDate(from))),
    ]);

    const closedDays = new Set(closed.map((c) => c.date.toISOString().slice(0, 10)));
    const days = new Map<string, { date: string; sessions: number; openSessions: number }>();
    for (const opening of openings) {
      const date = businessDate(opening.openedAt);
      if (closedDays.has(date)) continue;
      const entry = days.get(date) ?? { date, sessions: 0, openSessions: 0 };
      entry.sessions += 1;
      if (opening.status === CashSessionStatus.OPEN) entry.openSessions += 1;
      days.set(date, entry);
    }
    return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  // ---------------------------------------------------------------------------

  private assertDay(day: string) {
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      !Number.isNaN(dateOnly(day).getTime()) &&
      dateOnly(day).toISOString().slice(0, 10) === day;
    if (!valid) throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD');
    if (day > businessToday()) {
      throw new BadRequestException('No hay cierre general para un día que no ha llegado');
    }
  }

  private assertNotClosed(closing: ClosingWithDetail | null) {
    if (closing?.status === GeneralClosingStatus.CLOSED) {
      throw new BadRequestException('El día ya está cerrado: hay que reabrirlo para cambiarlo');
    }
  }

  /** Las cajas del día con sus números en vivo, todavía sin la revisión. */
  private async buildLive(day: string): Promise<RegisterDayRow[]> {
    // Una sesión es del día en que se abrió, en hora de Bogotá (PLAN_SEDES §4).
    const sessions = await this.repository.findSessionsOpenedBetween(startOfDay(day)!, endOfDay(day)!);
    const [registers, movements] = await Promise.all([
      this.repository.findRegisters([...new Set(sessions.map((s) => s.cashRegisterId))]),
      this.repository.sumMovements(sessions.map((s) => s.id)),
    ]);

    return registers.map((cashRegister) => {
      const own = sessions.filter((s) => s.cashRegisterId === cashRegister.id);
      const ownIds = new Set(own.map((s) => s.id));
      return {
        cashRegister,
        status: this.registerStatus(own),
        sessions: own,
        totals: this.registerTotals(own, movements.filter((m) => ownIds.has(m.cashSessionId))),
        review: null,
      };
    });
  }

  private registerStatus(sessions: ClosingSession[]): RegisterDayStatus {
    if (sessions.length === 0) return 'NO_SESSION';
    return sessions.some((s) => s.status === CashSessionStatus.OPEN) ? 'OPEN' : 'CLOSED';
  }

  /**
   * Una caja puede abrir y cerrar más de una vez en el día. La base es la de la
   * primera sesión, el esperado y el contado son los de la última (el efectivo
   * con el que terminó el día), y la diferencia suma la de cada cierre.
   */
  private registerTotals(sessions: ClosingSession[], movements: MovementSum[]): RegisterDayTotals {
    const totals = emptyTotals();
    if (sessions.length === 0) return totals;

    const cashNet = new Map<string, number>();
    for (const m of movements) {
      const amount = Number(m._sum.amount ?? 0);
      const inflow = isInflow(m.movementType);
      if (m.paymentMethod === PaymentMethod.CASH) {
        cashNet.set(m.cashSessionId, (cashNet.get(m.cashSessionId) ?? 0) + (inflow ? amount : -amount));
        if (m.movementType === CashMovementType.INCOME) totals.incomeCash += amount;
        else if (m.movementType === CashMovementType.DEPOSIT) totals.deposits += amount;
        else if (m.movementType === CashMovementType.EXPENSE) totals.cashExpenses += amount;
        else totals.withdrawals += amount;
      } else if (!inflow) {
        totals.otherExpenses += amount;
      } else if (m.paymentMethod === PaymentMethod.TRANSFER) {
        totals.incomeTransfer += amount;
      } else if (m.paymentMethod === PaymentMethod.CARD) {
        totals.incomeCard += amount;
      } else {
        totals.incomeOther += amount;
      }
    }

    const last = sessions[sessions.length - 1];
    totals.openingAmount = Number(sessions[0].openingAmount);
    totals.expected =
      last.systemBalance !== null
        ? Number(last.systemBalance)
        : Number(last.openingAmount) + (cashNet.get(last.id) ?? 0);
    totals.counted = last.closingAmount !== null ? Number(last.closingAmount) : null;

    const closed = sessions.filter((s) => s.discrepancy !== null);
    if (closed.length > 0) {
      totals.discrepancy = closed.reduce((sum, s) => sum + Number(s.discrepancy), 0);
    }
    return totals;
  }

  private attachReviews(rows: RegisterDayRow[], reviews: Review[]): RegisterDayRow[] {
    return rows.map((row) => {
      const review = reviews.find((r) => r.cashRegisterId === row.cashRegister.id);
      return {
        ...row,
        review: review
          ? {
              status: review.status,
              notes: review.notes,
              reviewedAt: review.reviewedAt,
              reviewedBy: review.reviewedBy,
            }
          : null,
      };
    });
  }

  /**
   * Por qué una revisión no le corresponde a la caja: una que no abrió solo
   * puede quedar "sin operación", y una con diferencia no se da por buena sin
   * más (por ahora, cualquier diferencia: PLAN_SEDES §14, pregunta 6).
   */
  private reviewInconsistency(row: RegisterDayRow, status: GeneralClosingReviewStatus): string | null {
    const name = row.cashRegister.name;
    if (row.status === 'NO_SESSION') {
      return status === GeneralClosingReviewStatus.NO_OPERATION
        ? null
        : `${name} no abrió ese día: se marca como sin operación`;
    }
    if (status === GeneralClosingReviewStatus.NO_OPERATION) {
      return `${name} sí tuvo sesión ese día: se marca como verificada u observada`;
    }
    if (status === GeneralClosingReviewStatus.VERIFIED && (row.totals.discrepancy ?? 0) !== 0) {
      return `${name} cerró con diferencia: se marca como observada, con nota`;
    }
    return null;
  }

  /** Lo que falta para poder firmar el día. Vacío = se puede cerrar. */
  private closeBlockers(rows: RegisterDayRow[]): string[] {
    const blockers: string[] = [];
    for (const row of rows) {
      const name = row.cashRegister.name;
      if (row.status === 'OPEN') {
        blockers.push(`${name} sigue abierta`);
      } else if (!row.review) {
        blockers.push(`${name} está sin revisar`);
      } else {
        // La caja pudo abrir, o cerrar con diferencia, después de la revisión.
        const inconsistency = this.reviewInconsistency(row, row.review.status);
        if (inconsistency) blockers.push(inconsistency);
      }
    }
    return blockers;
  }

  private sumTotals(rows: RegisterDayRow[]): RegisterDayTotals {
    const totals = emptyTotals();
    for (const { totals: row } of rows) {
      for (const field of TOTAL_FIELDS) {
        const value = row[field];
        if (value !== null) totals[field] = (totals[field] ?? 0) + value;
      }
    }
    return totals;
  }

  /** Qué números de la foto ya no coinciden con los de hoy. */
  private computeDrift(signed: RegisterDayRow[], live: RegisterDayRow[]): ClosingDrift[] {
    const drift: ClosingDrift[] = [];
    for (const current of live) {
      const before = signed.find((r) => r.cashRegister.id === current.cashRegister.id);
      for (const field of TOTAL_FIELDS) {
        const signedValue = before ? before.totals[field] : null;
        const currentValue = current.totals[field];
        if ((signedValue ?? 0) !== (currentValue ?? 0)) {
          drift.push({
            cashRegisterId: current.cashRegister.id,
            cashRegisterName: current.cashRegister.name,
            field,
            signed: signedValue,
            current: currentValue,
          });
        }
      }
    }
    return drift;
  }

  private audit(id: string, oldData: object, newData: object, userId: string) {
    setImmediate(() => {
      this.auditLogsService.logUpdate('GeneralClosing', id, oldData, newData, userId).catch(() => {});
    });
  }
}
