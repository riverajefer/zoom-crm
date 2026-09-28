import { Prisma } from '../generated/prisma';
import { getLocationScope } from '../common/utils/location-context';

/**
 * Documentos que pertenecen a una sede y solo se ven desde ella (solo Zoom,
 * docs/PLAN_SEDES.md §2 y §15.1). `Employee`, `AttendanceRecord` e
 * `InventoryMovement` guardan la sede pero no se filtran: la nómina es común,
 * la asistencia se consulta por persona y el stock es uno solo.
 */
export const LOCATION_SCOPED_MODELS = new Set<string>([
  'Quote',
  'Order',
  'WorkOrder',
  'ProductionOrder',
  'ExpenseOrder',
  'AccountPayable',
  'CashRegister',
  'DtfRecord',
]);

/**
 * Operaciones que reciben el filtro en su `where`. Las de un solo registro
 * (`findUnique`, `update`, `delete`) también: un documento de otra sede no
 * existe (404), y así el backend impide escribir en otra sede aunque la
 * pantalla se equivoque. Los `create` no pasan por aquí: cada servicio pone la
 * sede explícita, y el compilador lo exige porque la columna es obligatoria.
 */
const SCOPED_OPERATIONS = new Set<string>([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

/** Listados: lo único que se le filtra a quien opera en todas las sedes. */
const LIST_OPERATIONS = new Set<string>(['findMany', 'count', 'aggregate', 'groupBy']);

/** Agrega la sede al `where` sin pisar una que ya venga explícita. */
export function scopeWhere(where: Record<string, unknown> | undefined, locationIds: string[]) {
  if (where && 'locationId' in where) return where;
  return { ...(where ?? {}), locationId: { in: locationIds } };
}

/**
 * Filtra por la sede activa del request todas las consultas sobre los
 * documentos con sede. Sin sede en el contexto (crons, "Todas",
 * `withoutLocationScope`) no filtra nada. Ver `getLocationScope`.
 */
export async function scopeLocationQuery<A>({
  model,
  operation,
  args,
  query,
}: {
  model?: string;
  operation: string;
  args: A;
  query: (args: A) => Promise<unknown>;
}): Promise<unknown> {
  if (!model || !LOCATION_SCOPED_MODELS.has(model) || !SCOPED_OPERATIONS.has(operation)) {
    return query(args);
  }
  const scope = getLocationScope();
  if (scope === null) return query(args);
  if (scope.listsOnly && !LIST_OPERATIONS.has(operation)) return query(args);

  const scopedArgs = { ...(args as Record<string, unknown>) };
  scopedArgs.where = scopeWhere(scopedArgs.where as Record<string, unknown> | undefined, scope.locationIds);
  return query(scopedArgs as A);
}

export const locationScopeExtension = Prisma.defineExtension({
  name: 'location-scope',
  query: {
    $allModels: {
      $allOperations: scopeLocationQuery,
    },
  },
});
