import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Collapse, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material';
import type { GridColDef, GridRowClassNameParams, GridValidRowModel } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DataTable } from '../../../components/common/DataTable';
import { useLocationStore } from '../../../store/locationStore';
import { formatCurrency } from '../../../utils/formatters';
import { useSwitchSede } from '../hooks/useSwitchSede';
import { SedeGroupHeader } from './SedeGroupHeader';
import type { Sede } from '../../../types';

/** Filas por sede en la vista "Todas"; el resto se ve entrando a la sede. */
export const ROWS_PER_SEDE = 10;

interface GroupPage<T> {
  data: T[];
  meta: { total: number; sumTotal?: string };
}

interface SedeGroupedTableProps<T extends GridValidRowModel> {
  /** "OP", "COT", "OT": el conteo del encabezado de cada grupo. */
  unit: string;
  /** Llave base; cada grupo le agrega su sede. Que empiece como la del listado, para que las mismas invalidaciones la refresquen. */
  queryKey: readonly unknown[];
  /** Primeras `ROWS_PER_SEDE` filas de una sede, con los filtros del listado. */
  fetchGroup: (locationId: string, limit: number) => Promise<GroupPage<T>>;
  columns: GridColDef<T>[];
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  getRowClassName?: (params: GridRowClassNameParams<T>) => string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
}

/**
 * Listado de la vista "Todas las sedes" del admin (docs/PLAN_SEDES.md §6.2):
 * una tabla por sede, nunca filas intercaladas. Cada grupo lleva el color, el
 * nombre, la cantidad y el subtotal de su sede, se puede plegar, muestra sus
 * primeras filas y un enlace para entrar a la sede y ver el resto. Los filtros
 * y el orden del listado se aplican dentro de cada grupo, porque cada uno se
 * pide aparte, en su sede.
 */
export function SedeGroupedTable<T extends GridValidRowModel>({
  search,
  onSearchChange,
  searchPlaceholder,
  ...groupProps
}: SedeGroupedTableProps<T>) {
  const locations = useLocationStore((s) => s.locations);
  const [text, setText] = useState(search);

  // El buscador va aparte de las tablas (sin barra propia) y espera a que se
  // termine de escribir, como el del listado normal.
  useEffect(() => setText(search), [search]);
  useEffect(() => {
    if (text === search) return;
    const timer = setTimeout(() => onSearchChange(text), 400);
    return () => clearTimeout(timer);
  }, [text, search, onSearchChange]);

  return (
    <Box>
      <TextField
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={searchPlaceholder ?? 'Buscar...'}
        sx={{ mb: 2, width: { xs: '100%', sm: 360 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />
      <Stack spacing={3}>
        {locations.map((sede) => (
          <SedeGroup<T> key={sede.id} sede={sede} {...groupProps} />
        ))}
      </Stack>
    </Box>
  );
}

function SedeGroup<T extends GridValidRowModel>({
  sede,
  unit,
  queryKey,
  fetchGroup,
  columns,
  getRowId,
  onRowClick,
  getRowClassName,
}: Omit<SedeGroupedTableProps<T>, 'search' | 'onSearchChange' | 'searchPlaceholder'> & { sede: Sede }) {
  const [open, setOpen] = useState(true);
  const switchSede = useSwitchSede();
  const { data, isLoading } = useQuery({
    queryKey: [...queryKey, 'sede', sede.id],
    queryFn: () => fetchGroup(sede.id, ROWS_PER_SEDE),
  });

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <Box>
      <SedeGroupHeader sede={sede} count={total} unit={unit} isActive={false}>
        {data?.meta.sumTotal !== undefined && (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            · {formatCurrency(data.meta.sumTotal)}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={open ? 'Plegar' : 'Desplegar'}>
          <IconButton
            size="small"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? `Plegar ${sede.name}` : `Desplegar ${sede.name}`}
            aria-expanded={open}
          >
            <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </IconButton>
        </Tooltip>
      </SedeGroupHeader>

      <Collapse in={open} unmountOnExit>
        {!isLoading && total === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2.5, py: 1 }}>
            Sin resultados en el {sede.name}.
          </Typography>
        ) : (
          <DataTable<T>
            rows={rows}
            columns={columns}
            loading={isLoading}
            getRowId={getRowId}
            onRowClick={onRowClick}
            getRowClassName={getRowClassName}
            toolbar={false}
            density="compact"
            pageSize={ROWS_PER_SEDE}
            pageSizeOptions={[ROWS_PER_SEDE]}
          />
        )}
        {total > rows.length && (
          <Button size="small" onClick={() => switchSede(sede.id)} sx={{ mt: 1 }}>
            Ver {total === 1 ? 'la' : `las ${total}`} del {sede.name}
          </Button>
        )}
      </Collapse>
    </Box>
  );
}
