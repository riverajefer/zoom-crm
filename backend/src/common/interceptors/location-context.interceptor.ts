import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import {
  ALL_LOCATIONS,
  LOCATION_HEADER,
  RequestLocation,
  setRequestLocation,
  VIEW_ALL_LOCATIONS_PERMISSION,
} from '../utils/location-context';

/** Código que el frontend reconoce para volver a la sede predeterminada. */
export const LOCATION_NOT_ALLOWED = 'LOCATION_NOT_ALLOWED';

/**
 * Resuelve la sede activa del request y la deja en el contexto del request.
 *
 * Corre después de los guards (los interceptores van después), así que
 * `req.user` ya existe. Sin usuario (rutas públicas) no hace nada.
 *
 * - Header con el id de una sede: tiene que estar entre las permitidas.
 * - Header `all`: solo con `view_all_locations`.
 * - Sin header: la sede predeterminada del usuario, o la primera permitida.
 *
 * Con `view_all_locations` (admin, soporte, contabilidad) se permiten todas las
 * sedes activas. Un header no permitido es 403, nunca un cambio silencioso de
 * sede: desde la fase 2 eso haría que un documento naciera en la sede
 * equivocada. Ver docs/PLAN_SEDES.md §5 y §15.1.
 */
@Injectable()
export class LocationContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request & { location?: RequestLocation }>();
    const userId = (request as any)?.user?.id as string | undefined;
    if (!userId) return next.handle();

    const header = request.headers[LOCATION_HEADER];
    const requested = typeof header === 'string' && header.trim() ? header.trim() : undefined;

    const location = await this.resolve(userId, requested);
    request.location = location;
    setRequestLocation(location);

    return next.handle();
  }

  private async resolve(userId: string, requested: string | undefined): Promise<RequestLocation> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultLocationId: true,
        locations: {
          where: { location: { isActive: true } },
          select: { locationId: true },
          orderBy: { location: { sortOrder: 'asc' } },
        },
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

    const viewAll = (user?.role.permissions.length ?? 0) > 0;
    const permittedIds = viewAll
      ? (
          await this.prisma.location.findMany({
            where: { isActive: true },
            select: { id: true },
            orderBy: { sortOrder: 'asc' },
          })
        ).map((l) => l.id)
      : (user?.locations ?? []).map((l) => l.locationId);

    if (requested === ALL_LOCATIONS) {
      if (!viewAll) this.deny('No tienes acceso a la vista de todas las sedes');
      return { locationId: null, all: true, permittedIds };
    }

    if (requested) {
      if (!permittedIds.includes(requested)) this.deny('No tienes acceso a esa sede');
      return { locationId: requested, all: false, permittedIds };
    }

    const fallback =
      user?.defaultLocationId && permittedIds.includes(user.defaultLocationId)
        ? user.defaultLocationId
        : (permittedIds[0] ?? null);
    return { locationId: fallback, all: false, permittedIds };
  }

  private deny(message: string): never {
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message,
      code: LOCATION_NOT_ALLOWED,
    });
  }
}
