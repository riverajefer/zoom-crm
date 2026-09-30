import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AttendanceSource, AttendanceType } from '../../generated/prisma';
import { AttendanceFilterDto, AdjustAttendanceDto } from './dto';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { getRequestLocation } from '../../common/utils/location-context';
import { businessDate } from '../../common/utils/date-range.util';

@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca el registro de asistencia activo (sin clockOut) de un usuario
   */
  async findActiveRecord(userId: string) {
    return this.prisma.attendanceRecord.findFirst({
      where: { userId, clockOut: null },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
              phone: true,
            cargo: { select: { id: true, name: true, productionArea: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  /**
   * Último registro cerrado del usuario desde `since`: cuándo se cerró y quién lo
   * cerró. Sirve para saber si el sistema le cerró hoy la jornada.
   */
  async findLastClosedRecordSince(userId: string, since: Date) {
    return this.prisma.attendanceRecord.findFirst({
      where: { userId, clockOut: { gte: since } },
      orderBy: { clockOut: 'desc' },
      select: { clockOut: true, source: true },
    });
  }

  /**
   * Crea un registro de clock-in
   */
  async createClockIn(userId: string, now: Date, notes?: string, metadata?: any) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);

    return this.prisma.attendanceRecord.create({
      data: {
        userId,
        date,
        clockIn: now,
        // Dónde estuvo la persona: la sede activa al marcar (docs/PLAN_SEDES.md §5).
        locationId: getRequestLocation()?.locationId ?? null,
        type: AttendanceType.MANUAL,
        source: AttendanceSource.BUTTON,
        notes,
        metadata: metadata ?? undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
              phone: true,
            cargo: { select: { id: true, name: true, productionArea: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  /**
   * Actualiza un registro con clockOut y calcula totalMinutes
   */
  async updateClockOut(
    recordId: string,
    now: Date,
    source: AttendanceSource,
    notes?: string,
  ) {
    const record = await this.prisma.attendanceRecord.findUnique({ where: { id: recordId } });
    const totalMinutes = record
      ? Math.floor((now.getTime() - new Date(record.clockIn).getTime()) / 60000)
      : null;

    return this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        clockOut: now,
        source,
        type: source === AttendanceSource.BUTTON ? AttendanceType.MANUAL : AttendanceType.AUTO,
        notes: notes ?? record?.notes,
        totalMinutes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
              phone: true,
            cargo: { select: { id: true, name: true, productionArea: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  /**
   * Lista todos los registros con filtros y paginación (admin)
   */
  async findAll(filters: AttendanceFilterDto) {
    const { startDate, endDate, userId, productionAreaId, cargoId, type, source, page = 1, limit = 20 } = filters;
    const take = clampPageSize(limit, 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: any = {};

    if (startDate) where.clockIn = { ...(where.clockIn || {}), gte: new Date(startDate) };
    if (endDate) where.clockIn = { ...(where.clockIn || {}), lte: new Date(endDate) };
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (source) where.source = source;

    if (productionAreaId || cargoId) {
      where.user = { cargo: {} };
      if (cargoId) where.user.cargo.id = cargoId;
      if (productionAreaId) where.user.cargo.productionArea = { id: productionAreaId };
    }

    const [data, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        skip,
        take,
        orderBy: { clockIn: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              cargo: { select: { id: true, name: true, productionArea: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  /**
   * Lista los registros del propio usuario con filtros y paginación
   */
  async findMyRecords(userId: string, filters: AttendanceFilterDto) {
    return this.findAll({ ...filters, userId });
  }

  /**
   * Ajusta (corrige) un registro manualmente
   */
  async adjustRecord(id: string, dto: AdjustAttendanceDto) {
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { id } });
    if (!existing) return null;

    const clockIn = dto.clockIn ? new Date(dto.clockIn) : existing.clockIn;
    const clockOut = dto.clockOut ? new Date(dto.clockOut) : existing.clockOut;

    const totalMinutes =
      clockOut
        ? Math.floor((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000)
        : existing.totalMinutes;

    return this.prisma.attendanceRecord.update({
      where: { id },
      data: {
        clockIn,
        clockOut,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
        totalMinutes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
              phone: true,
            cargo: { select: { id: true, name: true, productionArea: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  /**
   * Encuentra registros abiertos cuyo usuario no ha tenido heartbeat en X minutos
   */
  async findOpenRecordsInactiveFor(minutesAgo: number) {
    const threshold = new Date(Date.now() - minutesAgo * 60000);

    // Obtener registros sin clockOut
    const openRecords = await this.prisma.attendanceRecord.findMany({
      where: { clockOut: null },
      select: { id: true, userId: true, clockIn: true },
    });

    if (openRecords.length === 0) return [];

    // Verificar cada registro si el usuario tuvo actividad reciente
    const inactive: typeof openRecords = [];
    for (const record of openRecords) {
      const lastHeartbeat = await this.prisma.activityHeartbeat.findFirst({
        where: { userId: record.userId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });

      const noRecentActivity = !lastHeartbeat || lastHeartbeat.timestamp < threshold;
      if (noRecentActivity) {
        inactive.push(record);
      }
    }

    return inactive;
  }

  /**
   * Encuentra todos los registros abiertos (para cierre de fin de día)
   */
  async findAllOpenRecords() {
    return this.prisma.attendanceRecord.findMany({
      where: { clockOut: null },
      select: { id: true, userId: true, clockIn: true },
    });
  }

  /**
   * Obtiene el último heartbeat de un usuario
   */
  async getLastHeartbeat(userId: string) {
    return this.prisma.activityHeartbeat.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Crea un heartbeat de actividad
   */
  async createHeartbeat(userId: string, endpoint?: string) {
    return this.prisma.activityHeartbeat.create({
      data: { userId, endpoint },
    });
  }

  /**
   * Obtiene el resumen de asistencia de un usuario para un rango de fechas
   */
  async getSummary(userId: string, weekStart: Date, weekEnd: Date, todayStart: Date, todayEnd: Date) {
    const [todayRecords, weekRecords] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          userId,
          clockIn: { gte: todayStart, lte: todayEnd },
        },
        select: { totalMinutes: true, clockIn: true, clockOut: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          userId,
          clockIn: { gte: weekStart, lte: weekEnd },
        },
        select: { totalMinutes: true, clockIn: true, clockOut: true, date: true },
      }),
    ]);

    // Hours today: sum totalMinutes of completed + elapsed of active
    const now = new Date();
    let todayMinutes = 0;
    for (const r of todayRecords) {
      if (r.totalMinutes != null) {
        todayMinutes += r.totalMinutes;
      } else if (r.clockIn && !r.clockOut) {
        todayMinutes += Math.floor((now.getTime() - new Date(r.clockIn).getTime()) / 60000);
      }
    }

    // Hours this week
    let weekMinutes = 0;
    const uniqueDays = new Set<string>();
    for (const r of weekRecords) {
      if (r.totalMinutes != null) {
        weekMinutes += r.totalMinutes;
      } else if (r.clockIn && !r.clockOut) {
        weekMinutes += Math.floor((now.getTime() - new Date(r.clockIn).getTime()) / 60000);
      }
      // El día en hora de Bogotá: un turno que empieza de noche no cuenta como el día siguiente.
      const dayKey = businessDate(new Date(r.clockIn));
      uniqueDays.add(dayKey);
    }

    const daysWorked = uniqueDays.size;
    const dailyAverage = daysWorked > 0 ? weekMinutes / daysWorked : 0;

    return {
      hoursToday: Number((todayMinutes / 60).toFixed(2)),
      hoursThisWeek: Number((weekMinutes / 60).toFixed(2)),
      daysWorkedThisWeek: daysWorked,
      dailyAverage: Number((dailyAverage / 60).toFixed(2)),
    };
  }

  /**
   * Elimina heartbeats anteriores a una fecha (cleanup)
   */
  async deleteOldHeartbeats(before: Date) {
    return this.prisma.activityHeartbeat.deleteMany({
      where: { timestamp: { lt: before } },
    });
  }
}
