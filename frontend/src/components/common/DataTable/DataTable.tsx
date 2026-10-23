import { useState, useMemo, useEffect, useRef } from 'react';
import {
  DataGrid,
  GridColDef,
  GridRowIdGetter,
  GridRowParams,
  GridValidRowModel,
  GridRowClassNameParams,
} from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';
import { Paper, Box, Typography, Skeleton, LinearProgress, useTheme, useMediaQuery } from '@mui/material';
import { CustomToolbar } from './CustomToolbar';
import { ColumnSettingsDialog } from './ColumnSettingsDialog';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { dataGridStyles, paperStyles } from './styles';
import { withDisplayTextFilters } from './displayTextFilter';

interface DataTableProps<T extends GridValidRowModel> {
  rows: T[];
  columns: GridColDef<T>[];
  loading?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  onRowClick?: (row: T) => void;
  toolbar?: boolean;
  checkboxSelection?: boolean;
  getRowId?: GridRowIdGetter<T>;
  onAdd?: () => void;
  addButtonText?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  serverSideSearch?: boolean;
  showExport?: boolean;
  emptyMessage?: string;
  getRowClassName?: (params: GridRowClassNameParams<T>) => string;
  density?: 'standard' | 'comfortable' | 'compact';
  // Server-side pagination
  rowCount?: number;
  currentPage?: number; // 0-indexed
  onPaginationModelChange?: (model: { page: number; pageSize: number }) => void;
  /**
   * Habilita el diálogo "Configurar columnas" (reordenar + mostrar/ocultar).
   * El valor identifica la tabla en localStorage; la preferencia se guarda por usuario.
   */
  columnSettingsKey?: string;
  /** Campos que no se pueden mover ni ocultar (columna fija, acciones). */
  lockedColumnFields?: string[];
}

export function DataTable<T extends GridValidRowModel>({
  rows,
  columns,
  loading = false,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  onRowClick,
  toolbar = true,
  checkboxSelection = false,
  getRowId,
  onAdd,
  addButtonText,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  serverSideSearch = false,
  showExport = false,
  emptyMessage = 'No se encontraron registros',
  getRowClassName,
  density = 'standard',
  rowCount,
  currentPage,
  onPaginationModelChange: externalOnPaginationModelChange,
  columnSettingsKey,
  lockedColumnFields = [],
}: DataTableProps<T>) {
  const isServerPagination =
    rowCount !== undefined && externalOnPaginationModelChange !== undefined;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [paginationModel, setPaginationModel] = useState({
    pageSize: initialPageSize,
    page: currentPage ?? 0,
  });

  // Sync controlled page/pageSize from parent (server-side pagination)
  useEffect(() => {
    if (isServerPagination) {
      setPaginationModel((prev) => ({
        pageSize: initialPageSize,
        page: currentPage ?? prev.page,
      }));
    }
  }, [currentPage, initialPageSize, isServerPagination]);

  const handlePaginationModelChange = (newModel: {
    page: number;
    pageSize: number;
  }) => {
    setPaginationModel(newModel);
    if (isServerPagination && externalOnPaginationModelChange) {
      externalOnPaginationModelChange(newModel);
    }
  };
  const [internalSearchText, setInternalSearchText] = useState(searchValue || '');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  const isControlledSearch = searchValue !== undefined && onSearchChange !== undefined;

  const prevSearchValueRef = useRef(searchValue);

  // Sync internal state with external prop if it changes externally
  useEffect(() => {
    if (searchValue !== undefined && searchValue !== prevSearchValueRef.current) {
      setInternalSearchText(searchValue);
      prevSearchValueRef.current = searchValue;
    }
  }, [searchValue]);

  const handleSearchChange = (value: string) => {
    setInternalSearchText(value);
  };

  // Debounce search text
  useEffect(() => {
    const handler = setTimeout(() => {
      if (isControlledSearch && onSearchChange) {
        // Only call onSearchChange if the value actually changed to avoid infinite loops
        if (searchValue !== internalSearchText) {
          onSearchChange(internalSearchText);
        }
      } else {
        setDebouncedSearchText(internalSearchText);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [internalSearchText, isControlledSearch, onSearchChange, searchValue]);

  // Reset to first page when search changes
  useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, [debouncedSearchText, searchValue]);

  const filteredRows = useMemo(() => {
    if (serverSideSearch || !debouncedSearchText) return rows;

    const lowerSearchText = debouncedSearchText.toLowerCase();

    const searchInObject = (obj: any): boolean => {
      if (obj === null || obj === undefined) return false;
      if (typeof obj === 'object') {
        if (obj instanceof Date) {
          return obj.toISOString().toLowerCase().includes(lowerSearchText);
        }
        return Object.values(obj).some(searchInObject);
      }
      return String(obj).toLowerCase().includes(lowerSearchText);
    };

    return rows.filter(searchInObject);
  }, [rows, debouncedSearchText, serverSideSearch]);

  // Orden/visibilidad elegidos por el usuario (no-op si no hay columnSettingsKey)
  const columnPreferences = useColumnPreferences<T>(
    columnSettingsKey ?? '',
    columns,
    lockedColumnFields,
  );
  const preferredColumns = columnSettingsKey ? columnPreferences.columns : columns;
  // Con paginación en el servidor la grilla solo tiene la página actual, así que
  // el filtro de cabecera se apaga (ver `disableColumnFilter`); sin ella, filtra
  // contra el texto que se ve en la celda y no contra el valor crudo.
  const effectiveColumns = useMemo(
    () =>
      isServerPagination ? preferredColumns : preferredColumns.map(withDisplayTextFilters),
    [preferredColumns, isServerPagination],
  );
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // Agregar columna de numeración automática (oculta en mobile)
  const columnsWithRowNumber = useMemo<GridColDef[]>(() => {
    if (isMobile) return effectiveColumns;

    const rowNumberColumn: GridColDef = {
      field: '__row_number__',
      headerName: '#',
      width: 70,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      resizable: false,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'sticky-column-row-number',
      cellClassName: 'sticky-column-row-number',
      renderCell: (params) => {
        const rowIndex = filteredRows.findIndex(
          (row) => (getRowId ? getRowId(row) : row.id) === params.id
        );
        return (
          <Typography
            variant="body2"
            fontWeight={600}
            color="text.secondary"
            sx={{
              opacity: 0.7,
              fontFamily: 'monospace',
            }}
          >
            {paginationModel.page * paginationModel.pageSize + rowIndex + 1}
          </Typography>
        );
      },
    };

    return [rowNumberColumn, ...effectiveColumns];
  }, [effectiveColumns, filteredRows, getRowId, paginationModel.page, paginationModel.pageSize, isMobile]);

  const handleRowClick = (params: GridRowParams<T>) => {
    if (onRowClick) {
      onRowClick(params.row);
    }
  };

  // Altura aproximada de fila según la densidad del DataGrid
  const rowHeight = density === 'compact' ? 36 : density === 'comfortable' ? 67 : 52;
  const skeletonRowCount = Math.max(3, Math.min(paginationModel.pageSize, 10));
  // Reservamos la altura del overlay para que, con autoHeight, el skeleton
  // no se superponga ni recorte el contenido de la grilla
  const overlayHeight = skeletonRowCount * rowHeight + 16;

  const renderLoadingSkeleton = () => (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        px: 2,
        pt: 1,
        // Fondo opaco: evita que se transparenten filas antiguas debajo
        backgroundColor: 'background.paper',
      }}
    >
      {[...Array(skeletonRowCount)].map((_, index) => (
        <Box
          key={index}
          sx={{
            display: 'flex',
            gap: 1,
            mb: '2px',
            alignItems: 'center',
            height: rowHeight,
          }}
        >
          <Skeleton variant="rectangular" width={60} height={rowHeight - 8} sx={{ borderRadius: 1, flexShrink: 0 }} />
          <Skeleton variant="rectangular" height={rowHeight - 8} sx={{ borderRadius: 1, flex: 1 }} />
          <Skeleton variant="rectangular" height={rowHeight - 8} sx={{ borderRadius: 1, flex: 2 }} />
          <Skeleton variant="rectangular" height={rowHeight - 8} sx={{ borderRadius: 1, flex: 1.5 }} />
          <Skeleton variant="rectangular" height={rowHeight - 8} sx={{ borderRadius: 1, flex: 2 }} />
        </Box>
      ))}
    </Box>
  );

  const CustomNoRowsOverlay = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        p: 3
      }}
    >
      <Typography variant="body1" color="textSecondary">
        {debouncedSearchText
          ? `No se encontraron resultados para "${debouncedSearchText}"`
          : emptyMessage
        }
      </Typography>
    </Box>
  );

  return (
    <Paper sx={paperStyles}>
      {/* Toolbar renderizado fuera del DataGrid */}
      {toolbar && (
        <CustomToolbar
          onAdd={onAdd}
          addButtonText={addButtonText}
          searchPlaceholder={searchPlaceholder}
          searchValue={internalSearchText}
          onSearchChange={handleSearchChange}
          showExport={showExport}
          onToggleColumns={
            columnSettingsKey ? () => setColumnSettingsOpen(true) : undefined
          }
        />
      )}

      {columnSettingsKey && (
        <ColumnSettingsDialog
          open={columnSettingsOpen}
          onClose={() => setColumnSettingsOpen(false)}
          columns={columns}
          orderedFields={columnPreferences.orderedFields}
          hiddenFields={columnPreferences.hiddenFields}
          lockedFields={lockedColumnFields}
          onOrderChange={columnPreferences.setOrder}
          onToggleVisibility={columnPreferences.toggleVisibility}
          onReset={columnPreferences.reset}
          isCustomized={columnPreferences.isCustomized}
        />
      )}

      {loading && (
        <LinearProgress
          sx={{
            height: 3,
            borderRadius: 0,
            '& .MuiLinearProgress-bar': {
              transition: 'transform 0.6s linear',
            },
          }}
        />
      )}

      <DataGrid
        density={density}
        // Mientras carga no renderizamos las filas anteriores: con `autoHeight`
        // el overlay de carga se dibuja encima y las filas viejas se transparentan
        // dando la sensación de registros montados unos sobre otros.
        rows={loading ? [] : filteredRows}
        columns={columnsWithRowNumber}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={handlePaginationModelChange}
        pageSizeOptions={pageSizeOptions}
        paginationMode={isServerPagination ? 'server' : 'client'}
        rowCount={isServerPagination ? rowCount : undefined}
        // Filtrar u ordenar solo las filas de la página cargada da resultados
        // falsos («sin resultados» con miles de registros, o un «mayor total»
        // que no es el mayor); esas pantallas tienen sus propios filtros, que
        // sí consultan al servidor.
        disableColumnFilter={isServerPagination}
        disableColumnSorting={isServerPagination}
        checkboxSelection={checkboxSelection}
        getRowId={getRowId}
        onRowClick={onRowClick ? handleRowClick : undefined}
        getRowClassName={getRowClassName}
        disableRowSelectionOnClick
        autoHeight
        disableVirtualization
        localeText={esES.components.MuiDataGrid.defaultProps.localeText}
        sx={[
          dataGridStyles as any,
          // Reserva el alto del overlay mientras carga para que no colapse la grilla
          loading ? { '--DataGrid-overlayHeight': `${overlayHeight}px` } : null,
        ]}
        slots={{
          noRowsOverlay: CustomNoRowsOverlay,
          loadingOverlay: renderLoadingSkeleton,
        }}
      />
    </Paper>
  );
}
