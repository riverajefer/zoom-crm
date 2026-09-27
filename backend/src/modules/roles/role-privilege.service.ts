import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  ADMIN_ROLE_NAME,
  RESERVED_PERMISSIONS,
  SUPPORT_ROLE_NAME,
} from '../../common/constants/roles.constants';

export { ADMIN_ROLE_NAME };

/** ¿El nombre choca con el del rol de administrador? */
export function isReservedAdminName(name: string): boolean {
  return name.trim().toLowerCase() === ADMIN_ROLE_NAME;
}

/**
 * Impide que un usuario se dé a sí mismo, o le dé a otro, más permisos de los
 * que tiene.
 *
 * Antes, quien tuviera `create_users`, `update_users` o `create_roles` podía
 * llegar a admin: crear una cuenta con rol admin, cambiarle la contraseña al
 * admin, o crear un rol con todos los permisos. En producción el rol
 * contabilidad tenía dos de esos permisos.
 *
 * La regla es una sola: **solo puedes asignar, otorgar o modificar lo que ya
 * está contenido en tus propios permisos.** Se compara por conjunto de
 * permisos, no por nombre de rol, así que un rol con los mismos permisos que el
 * tuyo, o con menos, sigue siendo asignable.
 *
 * El rol `admin` es la excepción, en los dos sentidos:
 * - **Quien es admin no tiene restricción.** En producción le faltan permisos
 *   que sí tienen otros roles (los heredados de `*_areas` y los de reversión de
 *   pagos de CP, que se le quitaron a propósito); con la regla estricta, el
 *   admin no podría asignar caja ni contabilidad.
 * - **Tocar el rol admin exige ser admin**, sin importar sus permisos. El
 *   sistema lo reconoce por nombre en decenas de lugares, así que vale más que
 *   su conjunto de permisos y compararlo solo por conjuntos lo subestimaría.
 *
 * Por encima de los dos está `soporte` (solo en Zoom, ver docs/PLAN_SEDES.md
 * §6.1): no tiene restricción, y nadie más puede tocar su rol ni a sus
 * usuarios. Los permisos reservados no los otorga nadie por la API, ni siquiera
 * el admin: solo el seed se los da a `soporte`.
 */
@Injectable()
export class RolePrivilegeService {
  constructor(private readonly prisma: PrismaService) {}

  /** ¿El rol es el de soporte? Decide qué se le muestra (roles, usuarios, permisos). */
  async isSupportRole(roleId: string): Promise<boolean> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });
    return role?.name === SUPPORT_ROLE_NAME;
  }

  /** Puedes asignar el rol solo si sus permisos están contenidos en los tuyos. */
  async assertCanAssignRole(actorRoleId: string, targetRoleId: string) {
    const target = await this.loadRole(targetRoleId);
    if (!target) return; // la existencia la valida quien llama

    await this.assertSubset(
      actorRoleId,
      target,
      `asignar el rol «${target.name}»`,
    );
  }

  /**
   * Puedes modificar a un usuario solo si su rol está contenido en el tuyo.
   * Sin esto, quien tuviera `update_users` podía cambiarle la contraseña al
   * admin y entrar con su cuenta.
   */
  async assertCanManageUser(actorRoleId: string, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { roleId: true, username: true },
    });
    if (!user) return; // la existencia la valida quien llama

    const role = await this.loadRole(user.roleId);
    if (!role) return;

    await this.assertSubset(
      actorRoleId,
      role,
      `modificar al usuario «${user.username}»`,
    );
  }

  /** Puedes modificar un rol solo si sus permisos están contenidos en los tuyos. */
  async assertCanManageRole(actorRoleId: string, targetRoleId: string) {
    const target = await this.loadRole(targetRoleId);
    if (!target) return; // la existencia la valida quien llama

    await this.assertSubset(
      actorRoleId,
      target,
      `modificar el rol «${target.name}»`,
    );
  }

  /** Puedes otorgar permisos solo si ya los tienes. */
  async assertCanGrantPermissions(actorRoleId: string, permissionIds: string[]) {
    await this.assertSubset(
      actorRoleId,
      { name: null, permissionIds },
      'otorgar esos permisos',
    );
  }

  /**
   * @param target Lo que se quiere asignar o tocar. `name` es el nombre del
   *   rol cuando lo hay; `null` cuando son permisos sueltos.
   */
  private async assertSubset(
    actorRoleId: string,
    target: { name: string | null; permissionIds: string[] },
    action: string,
  ) {
    const candidatePermissionIds = target.permissionIds;
    const targetIsAdmin = target.name === ADMIN_ROLE_NAME;
    const targetIsSupport = target.name === SUPPORT_ROLE_NAME;
    if (candidatePermissionIds.length === 0 && !targetIsAdmin && !targetIsSupport) {
      return;
    }

    const actor = await this.loadRole(actorRoleId);
    if (!actor) {
      throw new ForbiddenException('Tu rol no existe');
    }
    if (actor.name === SUPPORT_ROLE_NAME) return;

    if (targetIsSupport) {
      throw new ForbiddenException(`No puedes ${action}: está reservado a soporte.`);
    }
    await this.assertNoReservedPermissions(candidatePermissionIds, action);

    if (actor.name === ADMIN_ROLE_NAME) return;

    // El rol admin vale más que sus permisos: el sistema lo reconoce por
    // nombre para aprobaciones, notificaciones y guards. Comparar solo los
    // conjuntos lo subestimaría, así que tocarlo exige ser admin.
    if (targetIsAdmin) {
      throw new ForbiddenException(
        `No puedes ${action}: solo un administrador puede hacerlo.`,
      );
    }

    const own = new Set(actor.permissionIds);
    const missingIds = [...new Set(candidatePermissionIds)].filter(
      (id) => !own.has(id),
    );
    if (missingIds.length === 0) return;

    const missing = await this.prisma.permission.findMany({
      where: { id: { in: missingIds } },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    // Un id que no existe no es un problema de privilegios sino de datos.
    if (missing.length < missingIds.length) {
      throw new BadRequestException('One or more permission IDs are invalid');
    }

    throw new ForbiddenException(
      `No puedes ${action}: incluye permisos que tu rol no tiene ` +
        `(${missing.map((p) => p.name).join(', ')}).`,
    );
  }

  /** Nadie otorga por la API un permiso reservado, ni siquiera el admin. */
  private async assertNoReservedPermissions(permissionIds: string[], action: string) {
    if (permissionIds.length === 0) return;

    const reserved = await this.prisma.permission.findMany({
      where: {
        id: { in: [...new Set(permissionIds)] },
        name: { in: [...RESERVED_PERMISSIONS] },
      },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    if (reserved.length === 0) return;

    throw new ForbiddenException(
      `No puedes ${action}: incluye permisos reservados a soporte ` +
        `(${reserved.map((p) => p.name).join(', ')}).`,
    );
  }

  private async loadRole(
    roleId: string,
  ): Promise<{ name: string; permissionIds: string[] } | null> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        name: true,
        permissions: { select: { permissionId: true } },
      },
    });
    if (!role) return null;

    return {
      name: role.name,
      permissionIds: role.permissions.map((rp) => rp.permissionId),
    };
  }
}
