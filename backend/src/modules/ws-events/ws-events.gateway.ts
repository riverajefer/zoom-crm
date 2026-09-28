import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { WS_EVENTS, WS_ROOMS, advancePaymentSedeRoom } from './ws-events.types';
import {
  VIEW_ALL_LOCATIONS_PERMISSION,
  withoutLocationScope,
} from '../../common/utils/location-context';

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class WsEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsEventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: no token`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });
      const userId = payload.sub;

      if (!userId) {
        client.disconnect();
        return;
      }

      // Check if user has approve_advance_payments permission
      const hasPermission = await this.prisma.user.findFirst({
        where: {
          id: userId,
          isActive: true,
          role: {
            permissions: {
              some: { permission: { name: 'approve_advance_payments' } },
            },
          },
        },
        select: { id: true },
      });

      client.data.userId = userId;

      if (hasPermission) {
        // La sala general sigue recibiendo lo que no se sabe de qué sede es.
        // Además, una sala por cada sede permitida (solo Zoom, docs/PLAN_SEDES.md
        // §15.2): así la caja del 104 no recibe las solicitudes del 119.
        const rooms = [WS_ROOMS.ADVANCE_PAYMENT_APPROVALS, ...(await this.sedeRoomsFor(userId))];
        client.join(rooms);
        this.logger.log(
          `Client ${client.id} (user: ${userId}) joined ${rooms.join(', ')}`,
        );
      }

      this.logger.log(`Client ${client.id} connected (user: ${userId})`);
    } catch (error) {
      this.logger.warn(
        `Client ${client.id} disconnected: invalid token - ${error.message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  emitApprovalCreated(data: unknown) {
    void this.emitToSede(WS_EVENTS.APPROVAL_REQUEST_CREATED, data);
  }

  emitApprovalUpdated(data: unknown) {
    void this.emitToSede(WS_EVENTS.APPROVAL_REQUEST_UPDATED, data);
  }

  /**
   * Emite a la sala de la sede de la OP de la solicitud y a la de quienes ven
   * todas las sedes. Sin `orderId` (algunas actualizaciones de estado solo
   * traen `{ id, status }`) no se sabe la sede y va a la sala general.
   */
  private async emitToSede(event: string, data: unknown): Promise<void> {
    try {
      const orderId = (data as { orderId?: unknown } | null)?.orderId;
      const order =
        typeof orderId === 'string'
          ? await withoutLocationScope(() =>
              this.prisma.order.findUnique({ where: { id: orderId }, select: { locationId: true } }),
            )
          : null;
      const rooms = order
        ? [advancePaymentSedeRoom(order.locationId), advancePaymentSedeRoom('all')]
        : [WS_ROOMS.ADVANCE_PAYMENT_APPROVALS];
      this.server.to(rooms).emit(event, data);
    } catch (error) {
      this.logger.warn(`No se pudo emitir ${event}: ${(error as Error).message}`);
    }
  }

  /** Salas de sede del usuario: las permitidas, o la de "todas" con `view_all_locations`. */
  private async sedeRoomsFor(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
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
    if (!user) return [];
    if (user.role.permissions.length > 0) return [advancePaymentSedeRoom('all')];
    return user.locations.map((l) => advancePaymentSedeRoom(l.locationId));
  }
}
