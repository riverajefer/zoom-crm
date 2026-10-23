import { isValidElement, type ReactNode } from 'react';
import {
  getGridStringOperators,
  type GridColDef,
  type GridFilterOperator,
  type GridRenderCellParams,
} from '@mui/x-data-grid';

/**
 * Filtros de cabecera que comparan contra lo que el usuario ve en la celda.
 *
 * El filtro estándar de MUI compara contra el valor crudo de la fila, así que
 * en una columna que guarda `PENDING` y pinta «Pendiente», o guarda `true` y
 * pinta «Activo», buscar lo que se ve en pantalla nunca encuentra nada.
 */

// Operadores negativos: la fila pasa solo si NINGÚN texto contiene/iguala el valor
const NEGATIVE_OPERATORS = new Set(['doesNotContain', 'doesNotEqual']);
// Vacío / no vacío se decide sobre el valor crudo: el render suele pintar «—»
const RAW_ONLY_OPERATORS = new Set(['isEmpty', 'isNotEmpty']);

/** Texto plano de un nodo de React sin renderizarlo (lee `children` y `label`). */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; label?: ReactNode };
    return [nodeText(props.label), nodeText(props.children)]
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/** Texto plano de un valor crudo; objetos y arreglos se aplanan. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return Object.values(value).map(valueText).filter(Boolean).join(' ');
  }
  return String(value);
}

const stringOperators = getGridStringOperators();

export const displayTextFilterOperators: GridFilterOperator[] = stringOperators.map(
  (operator) => {
    if (RAW_ONLY_OPERATORS.has(operator.value)) return operator;

    return {
      ...operator,
      getApplyFilterFn: (filterItem, column) => {
        const applyOnText = operator.getApplyFilterFn(filterItem, column);
        if (!applyOnText) return null;

        return (value, row, col, apiRef) => {
          const texts = new Set<string>([valueText(value)]);

          if (col.valueFormatter) {
            texts.add(valueText(col.valueFormatter(value as never, row, col, apiRef)));
          }

          if (col.renderCell) {
            try {
              const params = {
                id: apiRef.current.getRowId(row),
                field: col.field,
                row,
                value,
                formattedValue: value,
                colDef: col,
                api: apiRef.current,
                hasFocus: false,
                tabIndex: -1,
                cellMode: 'view',
                isEditable: false,
              } as unknown as GridRenderCellParams;
              texts.add(nodeText(col.renderCell(params)));
            } catch {
              // Un renderCell que no se puede evaluar fuera de la grilla
              // simplemente no aporta texto; queda el valor crudo.
            }
          }

          const candidates = [...texts];
          return NEGATIVE_OPERATORS.has(operator.value)
            ? candidates.every((text) => applyOnText(text, row, col, apiRef))
            : candidates.some((text) => applyOnText(text, row, col, apiRef));
        };
      },
    };
  },
);

/**
 * Aplica `displayTextFilterOperators` a las columnas de texto que no definen
 * su propio `type` ni sus propios `filterOperators`.
 */
export function withDisplayTextFilters<T extends GridColDef>(column: T): T {
  if (column.filterable === false || column.type || column.filterOperators) {
    return column;
  }
  return { ...column, filterOperators: displayTextFilterOperators };
}
