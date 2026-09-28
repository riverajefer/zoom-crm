import { Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma";
import { getAuditContext } from "./audit-context";
import { getRequestLocation, withoutLocationScope } from "./location-context";

/**
 * Cómo se abre un documento: con todas sus acciones, o en modo consulta (solo
 * lectura) porque es de otra sede. Ver docs/PLAN_SEDES.md §8.
 */
export type AccessMode = "full" | "consulta";

/** Acción con la que queda en `audit_logs` cada apertura en modo consulta. */
export const CONSULTA_AUDIT_ACTION = "CONSULTA";

type AuditLogClient = {
  auditLog: {
    create: (args: {
      data: Prisma.AuditLogUncheckedCreateInput;
    }) => PromiseLike<unknown>;
  };
};

const logger = new Logger("LocationConsulta");

/**
 * Busca un documento para mostrarlo en su detalle.
 *
 * Primero con el filtro de sede de siempre: si aparece, se abre completo. Si
 * no, y el usuario tiene `read_other_locations`, lo busca en todas las sedes y
 * lo devuelve en modo consulta, dejando el registro en `audit_logs`.
 *
 * Solo para el `GET :id` del detalle. Los servicios que escriben siguen usando
 * su `findOne` con el filtro: un documento de otra sede no existe para ellos, y
 * así el backend rechaza cualquier cambio aunque la pantalla se equivoque.
 *
 * @param model  Nombre del modelo para `audit_logs` (`Order`, `Quote`, `WorkOrder`).
 * @param find   La consulta del detalle. Se llama dos veces como máximo.
 */
export async function findForView<T extends { id: string; locationId: string }>(
  prisma: AuditLogClient,
  model: string,
  find: () => Promise<T | null>,
): Promise<(T & { accessMode: AccessMode }) | null> {
  const own = await find();
  if (own) return { ...own, accessMode: "full" };

  const location = getRequestLocation();
  if (!location?.readOther) return null;

  const other = await withoutLocationScope(find);
  if (!other) return null;

  try {
    const { userId, ipAddress, userAgent } = getAuditContext();
    await prisma.auditLog.create({
      data: {
        action: CONSULTA_AUDIT_ACTION,
        model,
        recordId: other.id,
        userId: userId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        metadata: {
          locationId: other.locationId,
          activeLocationId: location.locationId,
        },
      },
    });
  } catch (error) {
    // La consulta ya se hizo: un fallo de auditoría no debe devolverle un error al usuario.
    logger.error(
      { err: error, model, recordId: other.id },
      "No se pudo registrar la consulta",
    );
  }

  return { ...other, accessMode: "consulta" };
}

/** Filas por sede en la búsqueda en otras sedes; el total va aparte. */
export const LOOKUP_ROWS_PER_LOCATION = 10;

/** Largo mínimo del texto de búsqueda: con menos, casi todo coincide. */
export const LOOKUP_MIN_QUERY_LENGTH = 3;

export interface LookupLocation {
  id: string;
  code: string;
  name: string;
  color: string | null;
  phone?: string | null;
}

export interface LookupGroup<T> {
  location: LookupLocation;
  /** Cuántos coinciden en esa sede, aunque solo vengan las primeras filas. */
  total: number;
  items: T[];
}

/** Cuántos documentos coinciden en cada sede (un `groupBy` por `locationId`). */
type LookupCounts = { locationId: string; _count: { _all: number } }[];

/**
 * Busca documentos en las sedes distintas de la activa, para el aviso "No está
 * en el Local 125 · hay 2 en el Local 119" debajo de un listado
 * (docs/PLAN_SEDES.md §8). Devuelve los resultados agrupados por sede, con las
 * primeras `LOOKUP_ROWS_PER_LOCATION` filas de cada una y su total.
 *
 * Quien llama pone las consultas (así Prisma tipa las filas por su `select`,
 * que tiene que traer `locationId` y `location`) y exige
 * `read_other_locations` en el controlador.
 */
export async function lookupInOtherLocations<
  W extends object,
  T extends { locationId: string; location: LookupLocation },
>(
  baseWhere: W,
  query: {
    /** Un `groupBy` por `locationId` con `_count._all`. Sin tipo: Prisma no infiere bien el `groupBy` con un tipo de retorno esperado. */
    count: (where: W) => PromiseLike<unknown>;
    find: (where: W, take: number) => PromiseLike<T[]>;
  },
): Promise<LookupGroup<Omit<T, "location" | "locationId">>[]> {
  const activeId = getRequestLocation()?.locationId;
  const inLocation = (condition: object) =>
    ({ AND: [baseWhere, condition] }) as unknown as W;
  const where = activeId
    ? inLocation({ locationId: { not: activeId } })
    : baseWhere;

  // Primero cuántos hay por sede, y después las primeras filas de cada una:
  // con una sola consulta, una sede con muchas coincidencias taparía a las demás.
  const groups = await withoutLocationScope(async () => {
    const counts = (await query.count(where)) as LookupCounts;
    return Promise.all(
      counts.map(async ({ locationId, _count }) => {
        const rows = await query.find(
          { AND: [where, { locationId }] } as unknown as W,
          LOOKUP_ROWS_PER_LOCATION,
        );
        const items = rows.map(
          ({ location: _location, locationId: _id, ...item }) => item,
        );
        return { location: rows[0]?.location, total: _count._all, items };
      }),
    );
  });

  return groups
    .filter(
      (g): g is LookupGroup<Omit<T, "location" | "locationId">> => !!g.location,
    )
    .sort((a, b) => a.location.code.localeCompare(b.location.code));
}
