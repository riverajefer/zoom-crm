import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  isReservedAdminName,
  RolePrivilegeService,
} from './role-privilege.service';

/**
 * Roles de prueba, por id:
 * - `admin`: sin restricción, aunque le falten permisos (como en producción).
 * - `contabilidad`: p1, p2, p3.
 * - `comercial`: p1, p2 (contenido en contabilidad).
 * - `caja`: p1, p4 (p4 no lo tiene contabilidad).
 */
const ROLES: Record<string, { name: string; permissions: string[] }> = {
  'role-admin': { name: 'admin', permissions: ['p1'] },
  'role-conta': { name: 'contabilidad', permissions: ['p1', 'p2', 'p3'] },
  'role-comercial': { name: 'comercial', permissions: ['p1', 'p2'] },
  'role-caja': { name: 'caja', permissions: ['p1', 'p4'] },
  'role-soporte': { name: 'soporte', permissions: ['p1', 'p2', 'p3', 'p4', 'p5'] },
};

const PERMISSION_NAMES: Record<string, string> = {
  p1: 'read_orders',
  p2: 'create_orders',
  p3: 'create_users',
  p4: 'caja_confirm_ap_payment_reversal',
  p5: 'manage_locations', // reservado a soporte
};

describe('RolePrivilegeService', () => {
  let service: RolePrivilegeService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      role: {
        findUnique: jest.fn(async ({ where }: any) => {
          const role = ROLES[where.id];
          if (!role) return null;
          return {
            name: role.name,
            permissions: role.permissions.map((permissionId) => ({ permissionId })),
          };
        }),
      },
      user: {
        findUnique: jest.fn(async ({ where }: any) => {
          const users: Record<string, any> = {
            'u-admin': { roleId: 'role-admin', username: 'adminsistema' },
            'u-comercial': { roleId: 'role-comercial', username: 'vendedora' },
            'u-conta': { roleId: 'role-conta', username: 'contadora' },
            'u-soporte': { roleId: 'role-soporte', username: 'adminsistema' },
          };
          return users[where.id] ?? null;
        }),
      },
      permission: {
        findMany: jest.fn(async ({ where }: any) =>
          (where.id.in as string[])
            .filter((id) => PERMISSION_NAMES[id])
            .filter((id) => !where.name || where.name.in.includes(PERMISSION_NAMES[id]))
            .map((id) => ({ name: PERMISSION_NAMES[id] })),
        ),
      },
    };
    service = new RolePrivilegeService(prisma);
  });

  describe('asignar un rol', () => {
    it('permite asignar un rol contenido en los permisos propios', async () => {
      await expect(
        service.assertCanAssignRole('role-conta', 'role-comercial'),
      ).resolves.toBeUndefined();
    });

    it('permite asignar el mismo rol que uno tiene', async () => {
      await expect(
        service.assertCanAssignRole('role-conta', 'role-conta'),
      ).resolves.toBeUndefined();
    });

    // El caso de producción: contabilidad creando una cuenta de admin.
    it('impide asignar un rol con permisos que uno no tiene', async () => {
      await expect(
        service.assertCanAssignRole('role-conta', 'role-caja'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('dice qué permisos faltan', async () => {
      await expect(
        service.assertCanAssignRole('role-conta', 'role-caja'),
      ).rejects.toThrow(/caja_confirm_ap_payment_reversal/);
    });

    // En producción al admin le faltan permisos que otros roles sí tienen:
    // con la regla estricta no podría asignar caja.
    it('impide asignar el rol admin aunque sus permisos quepan en los propios', async () => {
      await expect(
        service.assertCanAssignRole('role-conta', 'role-admin'),
      ).rejects.toThrow(/solo un administrador/);
    });

    it('el admin no tiene restricción aunque le falten permisos', async () => {
      await expect(
        service.assertCanAssignRole('role-admin', 'role-caja'),
      ).resolves.toBeUndefined();
    });
  });

  describe('modificar un usuario', () => {
    // Con `update_users` se le podía cambiar la contraseña al admin. El
    // fixture le da al admin menos permisos que a comercial, a propósito:
    // aun así no se puede, porque el rol admin vale más que sus permisos.
    it('impide modificar a un usuario admin aunque sus permisos sean menos', async () => {
      await expect(
        service.assertCanManageUser('role-comercial', 'u-admin'),
      ).rejects.toThrow(/solo un administrador/);
    });

    it('impide modificar a un usuario con más permisos', async () => {
      await expect(
        service.assertCanManageUser('role-comercial', 'u-conta'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite modificar a un usuario con permisos contenidos en los propios', async () => {
      await expect(
        service.assertCanManageUser('role-conta', 'u-comercial'),
      ).resolves.toBeUndefined();
    });

    it('no decide sobre un usuario que no existe: eso lo valida quien llama', async () => {
      await expect(
        service.assertCanManageUser('role-comercial', 'u-nadie'),
      ).resolves.toBeUndefined();
    });
  });

  describe('otorgar permisos', () => {
    // `create_roles` con `permissionIds` permitía crear un rol con todo.
    it('impide otorgar permisos que uno no tiene', async () => {
      await expect(
        service.assertCanGrantPermissions('role-comercial', ['p1', 'p3']),
      ).rejects.toThrow(/create_users/);
    });

    it('permite otorgar permisos propios', async () => {
      await expect(
        service.assertCanGrantPermissions('role-conta', ['p1', 'p3']),
      ).resolves.toBeUndefined();
    });

    it('una lista vacía no exige nada', async () => {
      await expect(
        service.assertCanGrantPermissions('role-comercial', []),
      ).resolves.toBeUndefined();
      expect(prisma.role.findUnique).not.toHaveBeenCalled();
    });

    it('un id inexistente es un error de datos, no de privilegios', async () => {
      await expect(
        service.assertCanGrantPermissions('role-comercial', ['p-fantasma']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('modificar un rol', () => {
    it('impide modificar un rol más alto que el propio', async () => {
      await expect(
        service.assertCanManageRole('role-comercial', 'role-conta'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('soporte y permisos reservados', () => {
    it('soporte no tiene restricción', async () => {
      await expect(service.assertCanGrantPermissions('role-soporte', ['p5'])).resolves.toBeUndefined();
      await expect(service.assertCanManageUser('role-soporte', 'u-admin')).resolves.toBeUndefined();
    });

    it('el admin no puede otorgar un permiso reservado', async () => {
      await expect(service.assertCanGrantPermissions('role-admin', ['p1', 'p5'])).rejects.toThrow(
        /reservados a soporte \(manage_locations\)/,
      );
    });

    it('el admin sigue otorgando los permisos no reservados', async () => {
      await expect(service.assertCanGrantPermissions('role-admin', ['p1', 'p3'])).resolves.toBeUndefined();
    });

    it('nadie más que soporte asigna el rol de soporte, ni siquiera el admin', async () => {
      await expect(service.assertCanAssignRole('role-admin', 'role-soporte')).rejects.toThrow(
        /reservado a soporte/,
      );
    });

    it('el admin no puede modificar a un usuario de soporte', async () => {
      await expect(service.assertCanManageUser('role-admin', 'u-soporte')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('isSupportRole distingue al rol de soporte', async () => {
      await expect(service.isSupportRole('role-soporte')).resolves.toBe(true);
      await expect(service.isSupportRole('role-admin')).resolves.toBe(false);
      await expect(service.isSupportRole('role-borrado')).resolves.toBe(false);
    });
  });

  it('si el rol de quien actúa no existe, no deja pasar nada', async () => {
    await expect(
      service.assertCanGrantPermissions('role-borrado', ['p1']),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('isReservedAdminName', () => {
  it.each(['admin', 'Admin', 'ADMIN', ' admin '])(
    'reserva «%s»',
    (name) => {
      expect(isReservedAdminName(name)).toBe(true);
    },
  );

  it.each(['administrador', 'admins', 'contabilidad'])(
    'no reserva «%s»',
    (name) => {
      expect(isReservedAdminName(name)).toBe(false);
    },
  );
});
