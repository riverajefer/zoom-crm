import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderEditRequestsService } from '../../modules/order-edit-requests/order-edit-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../interfaces/auth.interface';

@Injectable()
export class CanEditOrderGuard implements CanActivate {
  constructor(
    private readonly orderEditRequestsService: OrderEditRequestsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    const orderId = request.params.id;

    if (!orderId) {
      throw new ForbiddenException('Order ID is required');
    }

    // Obtener orden
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${orderId} not found`);
    }

    // Si es DRAFT, siempre permitir
    if (order.status === 'DRAFT') {
      return true;
    }

    // Orden bloqueada: hace falta un permiso temporal. El admin ya no pasa
    // directo: abre la edición con un motivo (POST .../edit-requests/direct), que
    // queda registrado como solicitud aprobada (docs/PLAN_SEDES.md §6.3).
    const hasPermission =
      await this.orderEditRequestsService.hasActivePermission(
        orderId,
        user.id,
      );

    if (!hasPermission) {
      // JwtStrategy no incluye role.name, así que se busca por roleId
      const role = await this.prisma.role.findUnique({
        where: { id: user.roleId },
        select: { name: true },
      });
      throw new ForbiddenException(
        role?.name === 'admin'
          ? 'Para editar esta orden indica el motivo: queda registrado.'
          : 'No tienes permiso para editar esta orden. Solicita permiso al administrador.',
      );
    }

    return true;
  }
}
