import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import { WS_EVENTS } from '../ws-events/ws-events.types';
import {
  LocationSupportKind,
  LocationSupportStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma';
import { createOrReturnTwin } from '../../common/utils/unique-violation.util';
import { businessToday } from '../../common/utils/date-range.util';
import { VIEW_ALL_LOCATIONS_PERMISSION } from '../../common/utils/location-context';
import {
  AUTHORIZE_LOCATION_SUPPORT_PERMISSION,
  CASH_SESSION_OPEN,
  dateOnly,
  findActiveLocationSupport,
  findOpenCashSessionInLocation,
} from '../../common/utils/location-support.util';
import {
  EndLocationSupportDto,
  FilterLocationSupportsDto,
  RequestLocationSupportDto,
  ReviewLocationSupportDto,
  ScheduleLocationSupportDto,
} from './dto';

const personSelect = { id: true, firstName: true, lastName: true, username: true } as const;
const locationSelect = { id: true, code: true, name: true, color: true, type: true } as const;

const include = {
  user: { select: personSelect },
  location: { select: locationSelect },
  requestedBy: { select: personSelect },
  reviewedBy: { select: personSelect },
  endedBy: { select: personSelect },
  replaces: { select: { id: true, locationId: true, endDate: true, location: { select: locationSelect } } },
} satisfies Prisma.LocationSupportInclude;

type Person = { firstName: string | null; lastName: string | null; username: string | null } | null;

const personName = (p: Person) =>
  (p && ([p.firstName, p.lastName].filter(Boolean).join(' ') || p.username)) || 'Usuario';

/** `2026-10-05` → `5 oct.`, para los mensajes. */
const shortDay = (day: string) =>
  new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dateOnly(day));

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const range = (start: string, end: string) =>
  start === end ? `el ${shortDay(start)}` : `del ${shortDay(start)} al ${shortDay(end)}`;

/**
 * Apoyo en otra sede autorizado por Gerencia (solo Zoom, docs/PLAN_SEDES.md §16).
 *
 * Gerencia lo programa (nace aprobado) o el empleado lo pide y Gerencia lo
 * aprueba. Mientras está vigente, su sede es la única permitida del usuario
 * (`LocationContextInterceptor`), así que cambiar de sede antes de que venza es
 * otra solicitud (`replacesId`). Con la caja abierta en la sede del apoyo no se
 * cambia ni se termina.
 */
@Injectable()
export class LocationSupportsService {
  private readonly logger = new Logger(LocationSupportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ws: WsEventsGateway,
  ) {}

  // ─── Empleado ───

  async request(userId: string, dto: RequestLocationSupportDto) {
    const employee = await this.loadEmployee(userId);
    const location = await this.loadLocation(dto.locationId);
    const today = businessToday();
    const active = await findActiveLocationSupport(this.prisma, userId);

    let kind: LocationSupportKind = LocationSupportKind.SUPPORT;
    let startDate: string;
    let endDate: string;
    if (active) {
      if (active.locationId === location.id) {
        throw new BadRequestException(`Ya estás de apoyo en ${location.name}`);
      }
      // Un cambio vale desde que Gerencia lo aprueba.
      startDate = today;
      if (employee.fixedIds.includes(location.id)) {
        kind = LocationSupportKind.RETURN;
        endDate = today;
      } else {
        const activeEnd = dayOf(active.endDate);
        endDate = dto.endDate ?? (activeEnd >= today ? activeEnd : today);
      }
    } else {
      if (employee.fixedIds.includes(location.id)) {
        throw new BadRequestException(`Ya puedes trabajar en ${location.name}: cámbiala desde el selector de sede`);
      }
      startDate = dto.startDate ?? today;
      endDate = dto.endDate ?? startDate;
      if (startDate < today) throw new BadRequestException('El apoyo no puede empezar en una fecha pasada');
    }
    this.assertRange(startDate, endDate);
    if (kind === LocationSupportKind.SUPPORT) {
      await this.assertNoOverlap(userId, startDate, endDate, active?.id);
    }

    const pending = await this.prisma.locationSupport.findFirst({
      where: { userId, status: LocationSupportStatus.PENDING },
      select: { id: true },
    });
    if (pending) {
      throw new BadRequestException('Ya tienes una solicitud de sede pendiente: espera la respuesta o cancélala');
    }

    const { request, wasDuplicate } = await createOrReturnTwin({
      constraint: 'location_supports_pending_unique',
      create: () =>
        this.prisma.locationSupport.create({
          data: {
            userId,
            locationId: location.id,
            kind,
            status: LocationSupportStatus.PENDING,
            startDate: dateOnly(startDate),
            endDate: dateOnly(endDate),
            reason: dto.reason.trim(),
            requestedById: userId,
            replacesId: active?.id ?? null,
          },
          include,
        }),
      findTwin: () =>
        this.prisma.locationSupport.findFirst({ where: { userId, status: LocationSupportStatus.PENDING }, include }),
    });
    if (wasDuplicate) {
      this.logger.warn(`Solicitud de sede duplicada de ${userId}: se devuelve ${request.id} sin notificar de nuevo`);
      return request;
    }

    const who = personName(request.user);
    const what =
      kind === LocationSupportKind.RETURN
        ? `volver a ${location.name} antes de terminar su apoyo en ${active!.location.name}`
        : active
          ? `cambiar su apoyo de ${active.location.name} a ${location.name} ${range(startDate, endDate)}`
          : `trabajar en ${location.name} ${range(startDate, endDate)}`;
    await this.notifications.notifyUsersWithPermission(AUTHORIZE_LOCATION_SUPPORT_PERMISSION, {
      type: NotificationType.LOCATION_SUPPORT_REQUEST_PENDING,
      title: active ? 'Solicitud de cambio de sede' : 'Solicitud de apoyo en otra sede',
      message: `${who} pide ${what}. Motivo: ${request.reason}`,
      relatedId: request.id,
      relatedType: 'LocationSupport',
    });
    return request;
  }

  async cancel(userId: string, id: string) {
    const support = await this.findOrThrow(id);
    if (support.userId !== userId) throw new NotFoundException('Solicitud no encontrada');
    if (support.status !== LocationSupportStatus.PENDING) {
      throw new BadRequestException('Solo se puede cancelar una solicitud pendiente');
    }
    return this.prisma.locationSupport.update({
      where: { id },
      data: { status: LocationSupportStatus.CANCELLED },
      include,
    });
  }

  async findMine(userId: string) {
    return this.prisma.locationSupport.findMany({
      where: { userId },
      include,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── Gerencia ───

  async schedule(authorizerId: string, dto: ScheduleLocationSupportDto) {
    const employee = await this.loadEmployee(dto.userId);
    const location = await this.loadLocation(dto.locationId);
    if (employee.defaultLocationId === location.id) {
      throw new BadRequestException(`${location.name} ya es la sede de ${employee.name}`);
    }
    const today = businessToday();
    const endDate = dto.endDate ?? dto.startDate;
    if (dto.startDate < today) throw new BadRequestException('El apoyo no puede empezar en una fecha pasada');
    this.assertRange(dto.startDate, endDate);
    await this.assertNoOverlap(dto.userId, dto.startDate, endDate);

    const now = new Date();
    const support = await this.prisma.locationSupport.create({
      data: {
        userId: dto.userId,
        locationId: location.id,
        kind: LocationSupportKind.SUPPORT,
        status: LocationSupportStatus.APPROVED,
        startDate: dateOnly(dto.startDate),
        endDate: dateOnly(endDate),
        reason: dto.reason.trim(),
        requestedById: authorizerId,
        reviewedById: authorizerId,
        reviewedAt: now,
      },
      include,
    });

    await this.notifyEmployee(support.userId, support.id, {
      type: NotificationType.LOCATION_SUPPORT_SCHEDULED,
      title: 'Apoyo en otra sede',
      message: `${personName(support.reviewedBy)} te programó de apoyo en ${location.name} ${range(dto.startDate, endDate)}. Motivo: ${support.reason}`,
    });
    return support;
  }

  async approve(reviewerId: string, id: string, dto: ReviewLocationSupportDto) {
    const request = await this.findOrThrow(id);
    if (request.status !== LocationSupportStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue respondida');
    }
    const today = businessToday();

    const replaced = request.replacesId
      ? await this.prisma.locationSupport.findUnique({ where: { id: request.replacesId }, include: { location: true } })
      : null;
    const replacedIsOpen = !!replaced && !replaced.endedAt;
    if (replacedIsOpen) {
      await this.assertCashClosed(request.userId, replaced.locationId, replaced.location.name);
    }

    let startDate = dayOf(request.startDate);
    const endDate = dayOf(request.endDate);
    if (request.kind === LocationSupportKind.SUPPORT) {
      if (endDate < today) throw new BadRequestException('Las fechas de la solicitud ya pasaron');
      if (startDate < today) startDate = today;
      await this.assertNoOverlap(request.userId, startDate, endDate, request.replacesId ?? undefined);
    }

    const now = new Date();
    const approved = await this.prisma.$transaction(async (tx) => {
      if (replacedIsOpen) {
        await tx.locationSupport.update({
          where: { id: replaced.id },
          data: { endedAt: now, endedById: reviewerId, endReason: 'Cambio de sede aprobado' },
        });
      }
      return tx.locationSupport.update({
        where: { id },
        data: {
          status: LocationSupportStatus.APPROVED,
          startDate: dateOnly(startDate),
          reviewedById: reviewerId,
          reviewedAt: now,
          reviewNotes: dto.reviewNotes?.trim() || null,
        },
        include,
      });
    });

    const place = approved.location.name;
    await this.notifyEmployee(approved.userId, approved.id, {
      type: NotificationType.LOCATION_SUPPORT_APPROVED,
      title: approved.kind === LocationSupportKind.RETURN ? 'Vuelves a tu sede' : 'Apoyo en otra sede aprobado',
      message:
        approved.kind === LocationSupportKind.RETURN
          ? `${personName(approved.reviewedBy)} aprobó que vuelvas a ${place}`
          : `${personName(approved.reviewedBy)} aprobó que trabajes en ${place} ${range(startDate, endDate)}`,
    });
    return approved;
  }

  async reject(reviewerId: string, id: string, dto: ReviewLocationSupportDto) {
    const request = await this.findOrThrow(id);
    if (request.status !== LocationSupportStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue respondida');
    }
    const rejected = await this.prisma.locationSupport.update({
      where: { id },
      data: {
        status: LocationSupportStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes?.trim() || null,
      },
      include,
    });
    const note = rejected.reviewNotes ? `: ${rejected.reviewNotes}` : '';
    await this.notifyEmployee(rejected.userId, rejected.id, {
      type: NotificationType.LOCATION_SUPPORT_REJECTED,
      title: 'Solicitud de sede rechazada',
      message: `${personName(rejected.reviewedBy)} rechazó tu solicitud para ${rejected.location.name}${note}`,
    });
    return rejected;
  }

  /** Termina un apoyo vigente antes de tiempo, o cancela uno programado. */
  async end(reviewerId: string, id: string, dto: EndLocationSupportDto) {
    const support = await this.findOrThrow(id);
    if (
      support.kind !== LocationSupportKind.SUPPORT ||
      support.status !== LocationSupportStatus.APPROVED ||
      support.endedAt
    ) {
      throw new BadRequestException('Ese apoyo no está vigente ni programado');
    }
    const today = businessToday();
    const started = dayOf(support.startDate) <= today;
    if (started) {
      const active = await findActiveLocationSupport(this.prisma, support.userId);
      if (active?.id !== support.id) throw new BadRequestException('Ese apoyo ya terminó');
      await this.assertCashClosed(support.userId, support.locationId, support.location.name);
    }

    const ended = await this.prisma.locationSupport.update({
      where: { id },
      data: { endedAt: new Date(), endedById: reviewerId, endReason: dto.reason.trim() },
      include,
    });
    await this.notifyEmployee(ended.userId, ended.id, {
      type: NotificationType.LOCATION_SUPPORT_ENDED,
      title: started ? 'Terminó tu apoyo en otra sede' : 'Se canceló tu apoyo en otra sede',
      message: `${personName(ended.endedBy)} ${started ? 'terminó' : 'canceló'} tu apoyo en ${ended.location.name}. Motivo: ${ended.endReason}`,
    });
    return ended;
  }

  async findAll(filters: FilterLocationSupportsDto) {
    const today = dateOnly(businessToday());
    const byUser = filters.userId ? { userId: filters.userId } : {};
    const approvedSupport = {
      kind: LocationSupportKind.SUPPORT,
      status: LocationSupportStatus.APPROVED,
      endedAt: null,
    };

    switch (filters.view ?? 'pending') {
      case 'pending':
        return this.prisma.locationSupport.findMany({
          where: { ...byUser, status: LocationSupportStatus.PENDING },
          include,
          orderBy: { createdAt: 'asc' },
        });

      case 'scheduled':
        return this.prisma.locationSupport.findMany({
          where: { ...byUser, ...approvedSupport, startDate: { gt: today } },
          include,
          orderBy: { startDate: 'asc' },
        });

      case 'active': {
        const rows = await this.prisma.locationSupport.findMany({
          where: {
            ...byUser,
            ...approvedSupport,
            startDate: { lte: today },
            OR: [
              { endDate: { gte: today } },
              { endDate: { lt: today }, user: { openedCashSessions: { some: { status: 'OPEN' } } } },
            ],
          },
          include,
          orderBy: { endDate: 'asc' },
        });
        const withOverdue = await Promise.all(
          rows.map(async (row) => {
            if (row.endDate >= today) return { ...row, overdue: false };
            const open = await findOpenCashSessionInLocation(this.prisma, row.userId, row.locationId);
            return open ? { ...row, overdue: true } : null;
          }),
        );
        return withOverdue.filter((row) => row !== null);
      }

      case 'history':
        return this.prisma.locationSupport.findMany({
          where: {
            ...byUser,
            OR: [
              { status: { in: [LocationSupportStatus.REJECTED, LocationSupportStatus.CANCELLED] } },
              { status: LocationSupportStatus.APPROVED, kind: LocationSupportKind.RETURN },
              { status: LocationSupportStatus.APPROVED, endedAt: { not: null } },
              { status: LocationSupportStatus.APPROVED, endDate: { lt: today } },
            ],
          },
          include,
          orderBy: { updatedAt: 'desc' },
          take: 200,
        });
    }
  }

  // ─── Apoyo ───

  private async findOrThrow(id: string) {
    const support = await this.prisma.locationSupport.findUnique({ where: { id }, include });
    if (!support) throw new NotFoundException('Solicitud no encontrada');
    return support;
  }

  /** Un empleado que puede ir de apoyo: activo y sin `view_all_locations`. */
  private async loadEmployee(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...personSelect,
        isActive: true,
        defaultLocationId: true,
        locations: { select: { locationId: true } },
        role: {
          select: {
            permissions: {
              where: { permission: { name: VIEW_ALL_LOCATIONS_PERMISSION } },
              select: { permissionId: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!user.isActive) throw new BadRequestException('El usuario está inactivo');
    if (user.role.permissions.length > 0) {
      throw new BadRequestException('Quien opera en todas las sedes no necesita apoyos');
    }
    return {
      name: personName(user),
      defaultLocationId: user.defaultLocationId,
      fixedIds: user.locations.map((l) => l.locationId),
    };
  }

  private async loadLocation(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, isActive: true },
    });
    if (!location || !location.isActive) throw new BadRequestException('La sede no existe o está inactiva');
    return location;
  }

  private assertRange(startDate: string, endDate: string) {
    if (endDate < startDate) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    }
  }

  /** Dos apoyos aprobados del mismo usuario no se pueden cruzar. */
  private async assertNoOverlap(userId: string, startDate: string, endDate: string, exceptId?: string) {
    const clash = await this.prisma.locationSupport.findFirst({
      where: {
        userId,
        kind: LocationSupportKind.SUPPORT,
        status: LocationSupportStatus.APPROVED,
        endedAt: null,
        startDate: { lte: dateOnly(endDate) },
        endDate: { gte: dateOnly(startDate) },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { startDate: true, endDate: true, location: { select: { name: true } } },
    });
    if (clash) {
      throw new BadRequestException(
        `Se cruza con el apoyo en ${clash.location.name} ${range(dayOf(clash.startDate), dayOf(clash.endDate))}`,
      );
    }
  }

  /** Con la caja abierta en la sede del apoyo no se cambia de sede ni se termina el apoyo. */
  private async assertCashClosed(userId: string, locationId: string, locationName: string) {
    const open = await findOpenCashSessionInLocation(this.prisma, userId, locationId);
    if (open) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: CASH_SESSION_OPEN,
        message: `Primero debe cerrar la ${open.cashRegister.name} (${locationName})`,
      });
    }
  }

  /** Notificación y aviso en vivo: la pantalla del empleado cambia de sede sola. */
  private async notifyEmployee(
    userId: string,
    supportId: string,
    data: { type: NotificationType; title: string; message: string },
  ) {
    await this.notifications.create({ userId, ...data, relatedId: supportId, relatedType: 'LocationSupport' });
    this.ws.emitToUser(userId, WS_EVENTS.LOCATION_SUPPORT_CHANGED, { id: supportId });
  }
}
