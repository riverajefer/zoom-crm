import * as XLSX from 'xlsx';

// Viven aparte para que quien solo pagina no arrastre `xlsx` a su bundle.
export { EXPORT_PAGE_SIZE, fetchAllPages } from './fetchAllPages';

/**
 * Definición de una columna exportable a Excel. Cada columna sabe cómo obtener
 * su valor desde una fila y si es numérica (para la fila de totales).
 */
export interface ExportColumn<T> {
  /** Clave estable (se persiste en localStorage). */
  key: string;
  /** Encabezado en español para la hoja de Excel. */
  label: string;
  /** Si aparece marcada por defecto (espejo de las columnas visibles de la tabla). */
  defaultVisible: boolean;
  /** Si es numérica: el valor se exporta como número y se suma en la fila de totales. */
  numeric?: boolean;
  /** Obtiene el valor de la celda para una fila. */
  getValue: (row: T) => string | number;
  /**
   * URL a la que enlaza la celda, si aplica. Cuando devuelve un valor, la celda
   * queda como hipervínculo clicable y `getValue` pasa a ser solo el texto
   * visible (ej. «Ver soporte»); si devuelve `undefined`, la celda es normal.
   *
   * Sin esto, una URL prefirmada —que son cientos de caracteres— queda como
   * texto plano ilegible y sin enlazar.
   */
  hyperlink?: (row: T) => string | undefined;
}

/**
 * Contexto del export en curso, que se pasa a cada `explode`. Permite que una
 * hoja de detalle acote sus filas hijo al mismo rango que pidió el usuario
 * (ej. la hoja de abonos, cuando se exporta por fecha de pago: el backend
 * devuelve la orden completa con TODOS sus abonos, no solo los del rango).
 */
export interface ExportContext {
  /** Inicio del rango (inicio del día). */
  from: Date;
  /** Fin del rango (fin del día). */
  to: Date;
  /** Campo de fecha elegido en el diálogo; `'default'` si el módulo no ofrece opciones. */
  dateField: string;
}

/**
 * Hoja de detalle opcional para relaciones uno-a-muchos (ej. una Orden de Gasto
 * y sus ítems). Cada fila padre se "expande" en sus filas hijo mediante `explode`
 * y el resultado se escribe en una hoja aparte, preservando la relación con una
 * columna de enlace (ej. Nº OG repetido).
 */
export interface DetailSheet<Parent, Child> {
  /** Nombre de la hoja de detalle en el libro. */
  sheetName: string;
  /** Columnas de la hoja de detalle (mismo patrón que las principales). */
  columns: ExportColumn<Child>[];
  /**
   * Expande una fila padre en sus filas hijo (ej. una OG en sus ítems).
   * Recibe el contexto del export; las hojas que no lo necesiten pueden
   * declarar solo el primer parámetro.
   */
  explode: (parent: Parent, ctx: ExportContext) => Child[];
}

/** Contexto neutro para los llamados que no pasan uno (mantiene la firma previa). */
const DEFAULT_EXPORT_CONTEXT: ExportContext = {
  from: new Date(0),
  to: new Date(8640000000000000),
  dateField: 'default',
};

/** Construye una hoja (con fila de TOTALES si hay columnas numéricas). */
function buildSheet<R>(rows: R[], columns: ExportColumn<R>[]): XLSX.WorkSheet {
  const headers = columns.map((c) => c.label);

  const sheetRows: (string | number)[][] = rows.map((row) =>
    columns.map((c) => c.getValue(row)),
  );

  // Fila de totales: suma solo las columnas numéricas
  const hasNumeric = columns.some((c) => c.numeric);
  if (hasNumeric && rows.length > 0) {
    const totalsRow = columns.map((c, idx) => {
      if (idx === 0) return 'TOTALES';
      if (!c.numeric) return '';
      return rows.reduce((sum, row) => {
        const value = c.getValue(row);
        return sum + (typeof value === 'number' ? value : 0);
      }, 0);
    });
    sheetRows.push(totalsRow);
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
  // Ancho de columnas aproximado según el encabezado
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));

  // Hipervínculos: se aplican después de construir la hoja porque `aoa_to_sheet`
  // solo acepta valores planos. La fila 0 es el encabezado, así que los datos
  // arrancan en r = 1. Las celdas vacías no las crea `aoa_to_sheet`: se saltan.
  columns.forEach((column, colIdx) => {
    if (!column.hyperlink) return;

    rows.forEach((row, rowIdx) => {
      const target = column.hyperlink!(row);
      if (!target) return;

      const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx });
      const cell = ws[ref];
      if (!cell) return;

      cell.l = { Target: target, Tooltip: column.label };
    });
  });

  return ws;
}

/**
 * Genera y descarga un archivo .xlsx con las filas recibidas, usando solo las
 * columnas seleccionadas. Agrega una fila final de TOTALES con la suma de las
 * columnas numéricas. Los valores numéricos se exportan como número (no string)
 * para que las sumas/filtros nativos de Excel funcionen.
 *
 * Si se pasan `detailSheets`, agrega una hoja adicional por cada uno, con una
 * fila por cada hijo (ej. una fila por ítem de gasto), útil para relaciones
 * uno-a-muchos. Cada hoja de detalle puede tener sus propias columnas y recibe
 * el `ctx` del export para poder acotar sus filas al rango pedido.
 */
export function exportToExcel<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  fileName: string,
  sheetName = 'Datos',
  detailSheets: DetailSheet<T, any>[] = [],
  ctx: ExportContext = DEFAULT_EXPORT_CONTEXT,
): void {
  const wb = XLSX.utils.book_new();

  // Excel limita el nombre de hoja a 31 caracteres
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(rows, columns),
    sheetName.slice(0, 31),
  );

  for (const detail of detailSheets) {
    const childRows = rows.flatMap((row) => detail.explode(row, ctx));
    XLSX.utils.book_append_sheet(
      wb,
      buildSheet(childRows, detail.columns),
      detail.sheetName.slice(0, 31),
    );
  }

  XLSX.writeFile(wb, fileName);
}
