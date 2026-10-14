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
  PaymentAccountingStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma';
import { businessDate, businessToday, endOfDay, startOfDay } from '../../common/utils/date-range.util';
import { withoutLocationScope } from '../../common/utils/location-context';
import { dateOnly } from '../../common/utils/location-support.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CASH_HANDOVER_REFERENCE } from '../cash-movement/cash-movement.helpers';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import {
  CloseGeneralClosingDto,
  FilterGeneralClosingsDto,
  ReceiveHandoverDto,
  ReopenGeneralClosingDto,
  ReviewRegisterDto,
} from './dto';
import {
  ClosingCashMovement,
  ClosingHandover,
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
  /** Efectivo recibido de los locales (solo la Matriz). No es dinero nuevo. */
  handoversIn: number;
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
  'handoversIn',
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
  /** Los pagos del día en la sede de la caja y cuántos revisó contabilidad. */
  payments: { total: number; pending: number; observed: number; verified: number; pendingAmount: number };
  /** El efectivo que la Matriz recogió de esta caja después de su cierre. */
  handover: {
    amount: number;
    baseLeft: number | null;
    receiptNumber: string;
    receivedAt: Date;
    receivedBy: ClosingHandover['performedBy'];
  } | null;
}

export interface ConsolidatedLine {
  location: Pick<ClosingRegister['location'], 'code' | 'name' | 'color'>;
  /** Número de la OP, la OG o la CP; si no hay documento, el del recibo de caja. */
  reference: string;
  detail: string;
  amount: number;
}

/**
 * El "consolidado de caja" de contabilidad: todas las cajas como una sola, solo
 * en efectivo, con el formato de su planilla. La base incluye lo que la Matriz
 * recogió de los locales: es efectivo que ya existía, no un ingreso del día.
 */
export interface ClosingConsolidated {
  base: number;
  /** Efectivo que entró sin ser venta: retiros del banco llevados a la caja. */
  cashDeposits: number;
  cashSales: number;
  expenseGroups: { label: string; amount: number }[];
  /** Efectivo que salió sin ser gasto: consignaciones. */
  cashWithdrawals: number;
  total: number;
  /** `null` mientras alguna caja del día siga abierta. */
  counted: number | null;
  difference: number | null;
  cashReceived: ConsolidatedLine[];
  cashExpenses: (ConsolidatedLine & { group: string })[];
}

export interface ClosingSnapshot {
  registers: RegisterDayRow[];
  totals: RegisterDayTotals;
  consolidated?: ClosingConsolidated;
}

/** Algo que falta en una caja para poder firmar el día, dicho como acción. */
export interface ClosingBlocker {
  cashRegisterId: string;
  cashRegisterName: string;
  action: string;
}

/** Una caja en un periodo: cómo cuadró y qué dinero manejó. Para comparar sedes. */
export interface LocationPeriodRow {
  cashRegister: ClosingRegister;
  /** Días con al menos una sesión abierta ese día. */
  daysWithCash: number;
  /** Días en que todas sus sesiones cerraron y la diferencia del día dio $0. */
  daysBalanced: number;
  daysShort: number;
  /** Suma de los faltantes del periodo, en positivo. */
  shortTotal: number;
  daysOver: number;
  overTotal: number;
  /** Sesiones del periodo que siguen abiertas. */
  openSessions: number;
  incomeCash: number;
  incomeTransfer: number;
  incomeCard: number;
  incomeOther: number;
  cashExpenses: number;
  /** Efectivo de este local que recibió la Matriz. */
  handedOver: number;
  /** Lo que recibió la Matriz de los locales (solo la Matriz). */
  handoversIn: number;
  payments: RegisterDayRow['payments'];
}

/** Máximo de días por consulta del comparativo por sede. */
export const BY_LOCATION_MAX_DAYS = 93;

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
  handoversIn: 0,
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
    private readonly cashMovementService: CashMovementService,
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
      consolidated: snapshot?.consolidated ?? (await this.buildConsolidated(registers)),
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

  /**
   * La Matriz recoge el efectivo de un local que ya cerró y le deja una base.
   * Entra como depósito a la caja abierta de la Matriz; en el local no se
   * registra nada, porque su sesión ya cerró con lo que contó: la base es con
   * lo que abre al día siguiente.
   */
  async receiveHandover(day: string, cashRegisterId: string, dto: ReceiveHandoverDto, userId: string) {
    this.assertDay(day);
    this.assertNotClosed(await this.repository.findByDate(dateOnly(day)));

    const row = (await this.buildLive(day)).find((r) => r.cashRegister.id === cashRegisterId);
    if (!row) {
      throw new NotFoundException(`Caja ${cashRegisterId} no encontrada en el cierre de ${day}`);
    }
    const name = row.cashRegister.name;
    if (row.cashRegister.location.type === 'HEADQUARTERS') {
      throw new BadRequestException('La caja de la Matriz es la que recibe el efectivo');
    }
    if (row.status !== 'CLOSED') {
      throw new BadRequestException(`${name} no tiene un cierre ese día del que recoger el efectivo`);
    }
    if (row.handover) {
      throw new ConflictException(
        `El efectivo de ${name} ya se recibió (recibo ${row.handover.receiptNumber}). ` +
          'Para corregirlo, anula ese movimiento en la caja de la Matriz.',
      );
    }
    const counted = row.totals.counted ?? 0;
    const amount = counted - dto.baseLeft;
    if (amount <= 0) {
      throw new BadRequestException(
        `${name} cerró con $${counted.toLocaleString('es-CO')}: con esa base no queda efectivo por recibir`,
      );
    }
    const target = await this.repository.findHeadquartersOpenSession();
    if (!target) {
      throw new BadRequestException('Abre la caja de la Matriz para recibir el efectivo');
    }
    // El efectivo se recibe en una sesión de la Matriz de un día posterior,
    // como pasa en la operación: Constanza lo recoge a la mañana siguiente. Si
    // la recibiera una sesión del mismo día, el consolidado de ese día lo
    // contaría dos veces: en lo que contó el local y en la caja de la Matriz.
    const source = row.sessions[row.sessions.length - 1];
    if (businessDate(target.openedAt) <= day) {
      throw new BadRequestException(
        `El efectivo del cierre del ${day} se recibe en una caja de la Matriz abierta un día después. ` +
          'Cierra la caja de la Matriz de ese día y recíbelo al abrir la del día siguiente.',
      );
    }
    if (source.closedAt && target.openedAt <= source.closedAt) {
      throw new BadRequestException(
        `La caja de la Matriz está abierta desde antes de que cerrara ${name}. ` +
          'Ciérrala y ábrela de nuevo para recibir el efectivo.',
      );
    }

    // Sin filtro de sede: quien recibe puede tener activa otra sede o "Todas".
    await withoutLocationScope(() =>
      this.cashMovementService.createMovement(
        {
          cashSessionId: target.id,
          movementType: CashMovementType.DEPOSIT,
          paymentMethod: PaymentMethod.CASH,
          amount,
          description:
            `Entrega de efectivo de ${name}, cierre del ${day}. ` +
            `Base que queda en el local: $${dto.baseLeft.toLocaleString('es-CO')}`,
          referenceType: CASH_HANDOVER_REFERENCE,
          referenceId: source.id,
        },
        userId,
      ),
    );
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
        blockers:
          blockers.length > 0
            ? blockers.map((b) => `${b.cashRegisterName}: ${b.action}`)
            : ['Ninguna caja está revisada'],
      });
    }

    const snapshot: ClosingSnapshot = {
      registers,
      totals: this.sumTotals(registers),
      consolidated: await this.buildConsolidated(registers),
    };
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

  /**
   * Comparativo de las cajas en un periodo, desde el control de caja: cuántos
   * días cuadró cada una, cuánto faltó o sobró, y qué dinero manejó. Las ventas
   * y los gastos del negocio están en el Dashboard por sede; esto no los repite.
   */
  async getByLocation(from: string, to: string) {
    this.assertDay(from);
    this.assertDay(to);
    if (from > to) throw new BadRequestException('La fecha inicial es posterior a la final');
    const days = (dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000 + 1;
    if (days > BY_LOCATION_MAX_DAYS) {
      throw new BadRequestException(`El periodo puede tener máximo ${BY_LOCATION_MAX_DAYS} días`);
    }

    const sessions = await this.repository.findSessionsOpenedBetween(startOfDay(from)!, endOfDay(to)!);
    const sessionIds = sessions.map((s) => s.id);
    const [registers, movements, handovers, payments] = await Promise.all([
      this.repository.findRegisters([...new Set(sessions.map((s) => s.cashRegisterId))]),
      this.repository.sumMovements(sessionIds),
      this.repository.findHandovers(sessionIds),
      this.repository.findReviewablePayments(startOfDay(from)!, endOfDay(to)!),
    ]);
    const paymentsOwner = new Map<string, string>();
    for (const register of registers) {
      if (!paymentsOwner.has(register.location.id)) paymentsOwner.set(register.location.id, register.id);
    }

    const rows: LocationPeriodRow[] = registers.map((cashRegister) => {
      const own = sessions.filter((s) => s.cashRegisterId === cashRegister.id);
      const ownIds = new Set(own.map((s) => s.id));
      const row: LocationPeriodRow = {
        cashRegister,
        daysWithCash: 0,
        daysBalanced: 0,
        daysShort: 0,
        shortTotal: 0,
        daysOver: 0,
        overTotal: 0,
        openSessions: own.filter((s) => s.status === CashSessionStatus.OPEN).length,
        incomeCash: 0,
        incomeTransfer: 0,
        incomeCard: 0,
        incomeOther: 0,
        cashExpenses: 0,
        handedOver: handovers
          .filter((h) => h.referenceId && ownIds.has(h.referenceId))
          .reduce((sum, h) => sum + Number(h.amount), 0),
        handoversIn: 0,
        payments: this.summarizePayments(
          payments.filter((p) => paymentsOwner.get(p.order.locationId) === cashRegister.id),
        ),
      };

      // El resultado de cada día, con la misma regla del cierre diario: la
      // diferencia del día suma la de cada sesión que abrió ese día.
      const byDay = new Map<string, ClosingSession[]>();
      for (const session of own) {
        const day = businessDate(session.openedAt);
        byDay.set(day, [...(byDay.get(day) ?? []), session]);
      }
      row.daysWithCash = byDay.size;
      for (const daySessions of byDay.values()) {
        if (daySessions.some((s) => s.status === CashSessionStatus.OPEN)) continue;
        const difference = daySessions.reduce((sum, s) => sum + Number(s.discrepancy ?? 0), 0);
        if (difference === 0) row.daysBalanced += 1;
        else if (difference < 0) {
          row.daysShort += 1;
          row.shortTotal += -difference;
        } else {
          row.daysOver += 1;
          row.overTotal += difference;
        }
      }

      const totals = this.registerTotals(own, movements.filter((m) => ownIds.has(m.cashSessionId)));
      row.incomeCash = totals.incomeCash;
      row.incomeTransfer = totals.incomeTransfer;
      row.incomeCard = totals.incomeCard;
      row.incomeOther = totals.incomeOther;
      row.cashExpenses = totals.cashExpenses;
      row.handoversIn = totals.handoversIn;
      return row;
    });

    return { from, to, rows, totals: this.sumPeriodRows(rows) };
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
    const sessionIds = sessions.map((s) => s.id);
    const [registers, movements, handovers, payments] = await Promise.all([
      this.repository.findRegisters([...new Set(sessions.map((s) => s.cashRegisterId))]),
      this.repository.sumMovements(sessionIds),
      this.repository.findHandovers(sessionIds),
      this.repository.findReviewablePayments(startOfDay(day)!, endOfDay(day)!),
    ]);
    // Los pagos son de la sede, no de una sesión: van a la primera caja de la
    // sede (hay una por sede). También cuentan si la caja no abrió ese día.
    const paymentsOwner = new Map<string, string>();
    for (const register of registers) {
      if (!paymentsOwner.has(register.location.id)) paymentsOwner.set(register.location.id, register.id);
    }

    return registers.map((cashRegister) => {
      const own = sessions.filter((s) => s.cashRegisterId === cashRegister.id);
      const ownIds = new Set(own.map((s) => s.id));
      const totals = this.registerTotals(own, movements.filter((m) => ownIds.has(m.cashSessionId)));
      const handover = handovers.find((h) => h.referenceId && ownIds.has(h.referenceId));
      return {
        cashRegister,
        status: this.registerStatus(own),
        sessions: own,
        totals,
        review: null,
        payments: this.summarizePayments(
          payments.filter(
            (p) => paymentsOwner.get(p.order.locationId) === cashRegister.id,
          ),
        ),
        handover: handover
          ? {
              amount: Number(handover.amount),
              baseLeft: totals.counted === null ? null : totals.counted - Number(handover.amount),
              receiptNumber: handover.receiptNumber,
              receivedAt: handover.createdAt,
              receivedBy: handover.performedBy,
            }
          : null,
      };
    });
  }

  private summarizePayments(
    payments: { amount: Prisma.Decimal; accountingStatus: PaymentAccountingStatus }[],
  ): RegisterDayRow['payments'] {
    const summary = { total: payments.length, pending: 0, observed: 0, verified: 0, pendingAmount: 0 };
    for (const payment of payments) {
      if (payment.accountingStatus === PaymentAccountingStatus.PENDING) {
        summary.pending += 1;
        summary.pendingAmount += Number(payment.amount);
      } else if (payment.accountingStatus === PaymentAccountingStatus.OBSERVED) summary.observed += 1;
      else summary.verified += 1;
    }
    return summary;
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
        else if (m.movementType === CashMovementType.DEPOSIT) {
          if (m.referenceType === CASH_HANDOVER_REFERENCE) totals.handoversIn += amount;
          else totals.deposits += amount;
        }
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

  /** Lo que falta para poder firmar el día, caja por caja. Vacío = se puede cerrar. */
  private closeBlockers(rows: RegisterDayRow[]): ClosingBlocker[] {
    const blockers: ClosingBlocker[] = [];
    for (const row of rows) {
      const add = (action: string) =>
        blockers.push({
          cashRegisterId: row.cashRegister.id,
          cashRegisterName: row.cashRegister.name,
          action,
        });
      // Contabilidad revisa cada pago del día antes de firmar. Observado cuenta
      // como revisado: la sede lo corrige con los flujos de siempre.
      const pendingPayments = row.payments?.pending ?? 0;
      if (pendingPayments > 0) {
        add(pendingPayments === 1 ? 'Verificar 1 pago' : `Verificar ${pendingPayments} pagos`);
      }
      if (row.status === 'OPEN') {
        add(
          row.cashRegister.location.type === 'HEADQUARTERS'
            ? 'Cerrar la caja de la Matriz'
            : 'La sede tiene que cerrar la caja',
        );
      } else if (!row.review) {
        if (row.status === 'NO_SESSION') add('Confirmar que no abrió');
        else if ((row.totals.discrepancy ?? 0) !== 0) add('Dejar el cuadre observado, con nota');
        else add('Revisar el cuadre');
      } else {
        // La caja pudo abrir, o cerrar con diferencia, después de la revisión.
        if (this.reviewInconsistency(row, row.review.status)) {
          add(
            row.status === 'NO_SESSION'
              ? 'Revisar de nuevo: la caja no abrió'
              : row.review.status === GeneralClosingReviewStatus.NO_OPERATION
                ? 'Revisar de nuevo: la caja sí abrió'
                : 'Revisar de nuevo: cerró con diferencia, va observada con nota',
          );
        }
      }
    }
    return blockers;
  }

  private async buildConsolidated(rows: RegisterDayRow[]): Promise<ClosingConsolidated> {
    const totals = this.sumTotals(rows);
    const locationOf = new Map<string, ConsolidatedLine['location']>();
    for (const row of rows) {
      const { code, name, color } = row.cashRegister.location;
      for (const session of row.sessions) locationOf.set(session.id, { code, name, color });
    }

    const movements = await this.repository.findCashMovements([...locationOf.keys()]);
    const idsOf = (type: string) => [
      ...new Set(
        movements.filter((m) => m.referenceType === type && m.referenceId).map((m) => m.referenceId!),
      ),
    ];
    const [expenseOrders, accountsPayable] = await Promise.all([
      this.repository.findExpenseOrders(idsOf('EXPENSE_ORDER')),
      this.repository.findAccountsPayable(idsOf('ACCOUNT_PAYABLE')),
    ]);

    /** De qué es el egreso: el tipo de gasto de su OG o CP, si tiene. */
    const describeExpense = (m: ClosingCashMovement) => {
      const og = m.referenceType === 'EXPENSE_ORDER' && expenseOrders.find((o) => o.id === m.referenceId);
      if (og) {
        const suppliers = [...new Set(og.items.map((i) => i.supplier?.name).filter(Boolean))];
        return {
          group: og.expenseType.name,
          reference: og.ogNumber,
          detail: suppliers.join(', ') || m.description,
        };
      }
      const ap =
        m.referenceType === 'ACCOUNT_PAYABLE' && accountsPayable.find((a) => a.id === m.referenceId);
      if (ap) {
        return {
          group: ap.expenseType.name,
          reference: ap.apNumber,
          detail: ap.supplier?.name ?? m.description,
        };
      }
      return {
        group: m.referenceType === 'REFUND' ? 'Devoluciones' : 'Otros egresos',
        reference: m.receiptNumber,
        detail: m.description,
      };
    };

    const cashReceived: ClosingConsolidated['cashReceived'] = [];
    const cashExpenses: ClosingConsolidated['cashExpenses'] = [];
    const groups = new Map<string, number>();
    for (const m of movements) {
      const location = locationOf.get(m.cashSessionId)!;
      const amount = Number(m.amount);
      if (m.movementType === CashMovementType.INCOME) {
        const order = m.linkedPayment?.order;
        cashReceived.push({
          location,
          reference: order?.orderNumber ?? m.receiptNumber,
          detail: order?.client?.name ?? m.description,
          amount,
        });
      } else {
        const expense = describeExpense(m);
        cashExpenses.push({ location, amount, ...expense });
        groups.set(expense.group, (groups.get(expense.group) ?? 0) + amount);
      }
    }

    const base = totals.openingAmount + totals.handoversIn;
    const total =
      base + totals.deposits + totals.incomeCash - totals.cashExpenses - totals.withdrawals;
    const withSession = rows.filter((row) => row.status !== 'NO_SESSION');
    const counted = withSession.some((row) => row.status === 'OPEN')
      ? null
      : withSession.reduce((sum, row) => sum + (row.totals.counted ?? 0), 0);

    return {
      base,
      cashDeposits: totals.deposits,
      cashSales: totals.incomeCash,
      expenseGroups: [...groups.entries()]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount),
      cashWithdrawals: totals.withdrawals,
      total,
      counted,
      difference: counted === null ? null : counted - total,
      cashReceived,
      cashExpenses,
    };
  }

  private sumPeriodRows(rows: LocationPeriodRow[]) {
    const fields = [
      'daysShort',
      'shortTotal',
      'daysOver',
      'overTotal',
      'openSessions',
      'incomeCash',
      'incomeTransfer',
      'incomeCard',
      'incomeOther',
      'cashExpenses',
      'handedOver',
    ] as const;
    const totals = Object.fromEntries(fields.map((f) => [f, 0])) as Record<(typeof fields)[number], number>;
    const payments = { total: 0, pending: 0, observed: 0, verified: 0, pendingAmount: 0 };
    for (const row of rows) {
      for (const f of fields) totals[f] += row[f];
      for (const k of Object.keys(payments) as (keyof typeof payments)[]) payments[k] += row.payments[k];
    }
    return { ...totals, payments };
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
