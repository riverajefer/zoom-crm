import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip, Box } from '@mui/material';
import { DataGrid, type GridColDef, type GridFilterModel } from '@mui/x-data-grid';
import { nodeText, valueText, withDisplayTextFilters } from './displayTextFilter';

const rows = [
  { id: 1, number: 'OP-1', status: 'PENDING', isActive: true, client: { name: 'Acme' } },
  { id: 2, number: 'OP-2', status: 'APPROVED', isActive: false, client: { name: 'Zeta' } },
  { id: 3, number: 'OP-3', status: null, isActive: true, client: { name: 'Beta' } },
];

const labels: Record<string, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobado' };

const columns: GridColDef[] = [
  { field: 'number' },
  {
    field: 'status',
    renderCell: (params) =>
      params.value ? <Chip label={labels[params.value]} /> : <Box>—</Box>,
  },
  {
    field: 'isActive',
    renderCell: (params) => <Chip label={params.value ? 'Activo' : 'Inactivo'} />,
  },
  { field: 'client' },
];

function visibleNumbers(filterModel: GridFilterModel) {
  render(
    <DataGrid
      rows={rows}
      columns={columns.map(withDisplayTextFilters)}
      filterModel={filterModel}
      autoHeight
      disableVirtualization
    />,
  );
  return ['OP-1', 'OP-2', 'OP-3'].filter((n) => screen.queryByText(n));
}

const filter = (field: string, operator: string, value?: string): GridFilterModel => ({
  items: [{ id: 1, field, operator, value }],
});

describe('displayTextFilter', () => {
  it('nodeText lee label y children sin renderizar', () => {
    expect(nodeText(<Box><Chip label="Pendiente" /> y <span>más</span></Box>)).toBe(
      'Pendiente y más',
    );
    expect(nodeText(null)).toBe('');
  });

  it('valueText aplana objetos y arreglos', () => {
    expect(valueText({ name: 'Acme', city: { name: 'Cali' } })).toBe('Acme Cali');
    expect(valueText([1, 'a'])).toBe('1 a');
  });

  it('encuentra por la etiqueta que se ve en la celda', () => {
    expect(visibleNumbers(filter('status', 'contains', 'pendiente'))).toEqual(['OP-1']);
  });

  it('sigue encontrando por el valor crudo', () => {
    expect(visibleNumbers(filter('status', 'equals', 'APPROVED'))).toEqual(['OP-2']);
  });

  it('distingue Activo de Inactivo en un booleano', () => {
    expect(visibleNumbers(filter('isActive', 'startsWith', 'inac'))).toEqual(['OP-2']);
  });

  it('busca dentro de valores que son objetos', () => {
    expect(visibleNumbers(filter('client', 'contains', 'zeta'))).toEqual(['OP-2']);
  });

  it('los operadores negativos excluyen si cualquier texto coincide', () => {
    expect(visibleNumbers(filter('status', 'doesNotContain', 'pendiente'))).toEqual([
      'OP-2',
      'OP-3',
    ]);
  });

  it('vacío se decide por el valor crudo aunque la celda pinte «—»', () => {
    expect(visibleNumbers(filter('status', 'isEmpty'))).toEqual(['OP-3']);
  });
});
