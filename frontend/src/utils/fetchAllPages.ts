/**
 * Tamaño de página de las exportaciones.
 *
 * Antes se pedía todo de un golpe con `limit: 100000`, que es lo que obligaba a
 * los filtros del backend a no tener techo: una sola consulta con todos sus
 * `include` sobre la tabla completa. Ahora el export recorre páginas del mismo
 * tamaño que las pantallas.
 */
export const EXPORT_PAGE_SIZE = 100;

/**
 * Tope de páginas de una exportación. A 100 filas por página son 50.000
 * registros, muy por encima de cualquier rango real, y evita que un error de
 * paginación deje el bucle girando para siempre.
 */
const EXPORT_MAX_PAGES = 500;

/**
 * Recorre todas las páginas de un listado y devuelve las filas juntas.
 *
 * `fetchPage` recibe la página y el tamaño, y devuelve solo el arreglo de filas:
 * cada módulo tiene su propia forma de respuesta (`{ data, meta }`,
 * `{ data, total }`…), así que la extracción se queda en el llamador.
 *
 * Se detiene cuando una página vuelve incompleta, que es la señal de que fue la
 * última.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<T[]>,
  pageSize: number = EXPORT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 1; page <= EXPORT_MAX_PAGES; page++) {
    const pageRows = await fetchPage(page, pageSize);
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return rows;
}
