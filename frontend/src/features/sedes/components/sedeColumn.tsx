import type { GridValidRowModel } from '@mui/x-data-grid';
import type { ResponsiveGridColDef } from '../../../hooks';
import type { LocatedDocument } from '../../../types';
import { SedeChip } from './SedeChip';

/**
 * Columna "Sede" de los listados de documentos (OP, COT, OT). Solo va en la
 * vista "Todas" del admin, que mezcla las sedes en una sola tabla; con una sede
 * elegida sobra. Se agrega con `...sedeColumn(isAllSedes)`.
 */
export function sedeColumn<T extends GridValidRowModel & LocatedDocument>(
  show: boolean,
): ResponsiveGridColDef<T>[] {
  if (!show) return [];
  return [
    {
      field: 'location',
      headerName: 'Sede',
      width: 130,
      sortable: false,
      renderCell: ({ row }) => (row.location ? <SedeChip sede={row.location} /> : '-'),
    },
  ];
}
