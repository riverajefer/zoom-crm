import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CashSessionRepository } from './cash-session.repository';
import { PendingCashEntriesService } from './pending-cash-entries.service';
import {
  CloseCashSessionDto,
  DenominationCountItemDto,
  FilterCashSessionsDto,
  OpenCashSessionDto,
} from './dto';
import { Prisma } from '../../generated/prisma';
import {
  COLOMBIAN_BILLS,
  COLOMBIAN_COINS,
} from './helpers/denomination.helpers';
import { EXCLUDE_REVERSALS } from '../cash-movement/cash-movement.helpers';

@Injectable()
export class CashSessionService {
  constructor(
    private readonly repository: CashSessionRepository,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly pendingCashEntriesService: PendingCashEntriesService,
  ) {}

  async findAll(filters: FilterCashSessionsDto) {
    return this.repository.findAll(filters);
  }

  async findOne(id: string) {
    const session = await this.repository.findById(id);
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }
    return session;
  }

  async getLastClosingDenominations(cashRegisterId: string) {
    const lastSession =
      await this.repository.findLastClosedByRegisterId(cashRegisterId);
    if (!lastSession) return { denominations: [] };
    return {
      sessionId: lastSession.id,
      closedAt: lastSession.closedAt,
      denominations: lastSession.denominations,
    };
  }

  async openSession(dto: OpenCashSessionDto, userId: string) {
    // La caja tiene que ser de la sede activa: la búsqueda pasa por el filtro de
    // sede, así que la de otra sede no existe (docs/PLAN_SEDES.md §4).
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: dto.cashRegisterId },
      select: { id: true, locationId: true },
    });
    if (!register) {
      throw new NotFoundException(`Caja registradora ${dto.cashRegisterId} no encontrada`);
    }

    // Check for existing open session
    const existing = await this.repository.findOpenByRegisterId(
      dto.cashRegisterId,
    );
    if (existing) {
      throw new ConflictException(
        `La caja ya tiene una sesión abierta (ID: ${existing.id}). Ciérrela antes de abrir una nueva.`,
      );
    }

    const openingAmount = this.sumDenominations(dto.denominations);

    const session = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.cashSession.create({
        data: {
          cashRegisterId: dto.cashRegisterId,
          openedById: userId,
          openingAmount,
          notes: dto.notes,
        },
      });

      if (dto.denominations.length > 0) {
        await tx.cashDenominationCount.createMany({
          data: dto.denominations
            .filter((d) => d.quantity > 0)
            .map((d) => ({
              cashSessionId: created.id,
              countType: 'OPENING' as const,
              denomType: COLOMBIAN_BILLS.includes(d.denomination as any)
                ? ('BILL' as const)
                : ('COIN' as const),
              denomination: d.denomination,
              quantity: d.quantity,
              subtotal: new Prisma.Decimal(d.denomination * d.quantity),
            })),
        });
      }

      // Ingresar los abonos que se registraron sin caja abierta. Va dentro de
      // la misma transacción: si la apertura falla, la cola queda intacta.
      // Solo los de la sede de esta caja (§4).
      await this.pendingCashEntriesService.flushInto(tx, created.id, userId, register.locationId);

      return created;
    });

    setImmediate(() => {
      this.auditLogsService
        .logCreate('CashSession', session.id, session, userId)
        .catch(() => {});
    });

    return this.repository.findById(session.id);
  }

  async closeSession(id: string, dto: CloseCashSessionDto, userId: string) {
    const session = await this.repository.findById(id);
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }
    if (session.status !== 'OPEN') {
      throw new BadRequestException('La sesión ya está cerrada');
    }

    const systemBalance = await this.repository.computeSystemBalance(id);
    const openingAmount = new Prisma.Decimal(session.openingAmount.toString());
    const totalSystemBalance = openingAmount.add(systemBalance);

    const closingAmount = this.sumDenominations(dto.denominations);
    const discrepancy = closingAmount.sub(totalSystemBalance);

    const closed = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.cashSession.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closingAmount,
          systemBalance: totalSystemBalance,
          discrepancy,
          closedById: userId,
          closedAt: new Date(),
          notes: dto.notes ?? session.notes,
        },
      });

      if (dto.denominations.length > 0) {
        await tx.cashDenominationCount.createMany({
          data: dto.denominations
            .filter((d) => d.quantity > 0)
            .map((d) => ({
              cashSessionId: id,
              countType: 'CLOSING' as const,
              denomType: COLOMBIAN_BILLS.includes(d.denomination as any)
                ? ('BILL' as const)
                : ('COIN' as const),
              denomination: d.denomination,
              quantity: d.quantity,
              subtotal: new Prisma.Decimal(d.denomination * d.quantity),
            })),
        });
      }

      return updated;
    });

    setImmediate(() => {
      this.auditLogsService
        .logUpdate('CashSession', id, session, closed, userId)
        .catch(() => {});
    });

    return this.repository.findById(id);
  }

  async getBalancePreview(id: string) {
    const session = await this.repository.findById(id);
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }

    const movementsBalance = await this.repository.computeSystemBalance(id);
    const openingAmount = new Prisma.Decimal(session.openingAmount.toString());
    const systemBalance = openingAmount.add(movementsBalance);
    const movementCount = await this.repository.getMovementCount(id);

    // Breakdown by payment type (for detailed preview)
    const movements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: id, isVoided: false, ...EXCLUDE_REVERSALS },
      select: { movementType: true, amount: true },
    });

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);
    let totalWithdrawals = new Prisma.Decimal(0);
    let totalDeposits = new Prisma.Decimal(0);

    for (const m of movements) {
      switch (m.movementType) {
        case 'INCOME':
          totalIncome = totalIncome.add(m.amount);
          break;
        case 'EXPENSE':
          totalExpense = totalExpense.add(m.amount);
          break;
        case 'WITHDRAWAL':
          totalWithdrawals = totalWithdrawals.add(m.amount);
          break;
        case 'DEPOSIT':
          totalDeposits = totalDeposits.add(m.amount);
          break;
      }
    }

    return {
      sessionId: id,
      status: session.status,
      openingAmount: session.openingAmount,
      systemBalance,
      totalIncome,
      totalExpense,
      totalWithdrawals,
      totalDeposits,
      movementCount,
    };
  }

  private sumDenominations(
    denominations: DenominationCountItemDto[],
  ): Prisma.Decimal {
    return denominations.reduce((acc, d) => {
      return acc.add(new Prisma.Decimal(d.denomination * d.quantity));
    }, new Prisma.Decimal(0));
  }
}
