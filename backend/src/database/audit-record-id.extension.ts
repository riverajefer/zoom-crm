import { Prisma } from '../generated/prisma';

/**
 * Modelos con llave primaria compuesta (`@@id([...])` en schema.prisma).
 *
 * Estos modelos no tienen `id`. `withAuditLog` arma su `recordId` con esta
 * llave; en createMany, que no devuelve filas y cuya entrada puede no traerla
 * completa, llega sin `recordId` y lo resuelve `auditRecordIdExtension`.
 *
 * El spec compara esta tabla con schema.prisma, así que un `@@id` nuevo que no
 * se registre aquí hace fallar los tests.
 */
export const COMPOSITE_PRIMARY_KEYS: Readonly<Record<string, readonly string[]>> = {
  RolePermission: ['roleId', 'permissionId'],
  QuoteItemProductionArea: ['quoteItemId', 'productionAreaId'],
  OrderItemProductionArea: ['orderItemId', 'productionAreaId'],
  WorkOrderItemProductionArea: ['workOrderItemId', 'productionAreaId'],
  ExpenseOrderItemProductionArea: ['expenseOrderItemId', 'productionAreaId'],
  // Solo Zoom: sedes permitidas de un usuario (docs/PLAN_SEDES.md)
  UserLocation: ['userId', 'locationId'],
};

export const UNKNOWN_RECORD_ID = 'unknown';

type AuditLogDraft = {
  model?: unknown;
  recordId?: unknown;
  oldData?: unknown;
  newData?: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * `recordId` de un log de auditoría: el que trae `withAuditLog` si es real; si no,
 * la llave compuesta (`orderItemId:productionAreaId`) sacada del snapshot; y como
 * último recurso 'unknown', que al menos deja el log guardado en vez de perderlo.
 */
export function resolveAuditRecordId(log: AuditLogDraft): string {
  if (log.recordId != null && log.recordId !== UNKNOWN_RECORD_ID) {
    return String(log.recordId);
  }

  const keys = typeof log.model === 'string' ? COMPOSITE_PRIMARY_KEYS[log.model] : undefined;
  if (keys) {
    // DELETE solo trae oldData y CREATE solo newData; UPDATE trae los campos cambiados.
    const snapshot = { ...asObject(log.newData), ...asObject(log.oldData) };
    if (keys.every((key) => snapshot[key] != null)) {
      return keys.map((key) => String(snapshot[key])).join(':');
    }
  }

  return UNKNOWN_RECORD_ID;
}

export function withResolvedRecordIds<T extends AuditLogDraft>(
  data: T | T[],
): (T & { recordId: string })[] {
  const rows = Array.isArray(data) ? data : [data];
  return rows.map((row) => ({ ...row, recordId: resolveAuditRecordId(row) }));
}

/**
 * Completa el `recordId` antes de que Prisma valide el `auditLog.createMany`.
 *
 * Tiene que aplicarse *debajo* de `withAuditLog`: escribe los logs con el
 * cliente que recibe, y solo así esa escritura pasa por aquí.
 */
export const auditRecordIdExtension = Prisma.defineExtension({
  name: 'auditRecordIdFallback',
  query: {
    auditLog: {
      createMany({ args, query }) {
        return query({ ...args, data: withResolvedRecordIds(args.data) });
      },
    },
  },
});
