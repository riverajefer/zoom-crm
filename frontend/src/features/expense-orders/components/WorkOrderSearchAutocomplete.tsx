import { useState } from 'react';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';
import { useDebounce } from '../../../hooks';
import { useWorkOrders } from '../../work-orders/hooks';
import type { WorkOrder } from '../../../types/work-order.types';

const SEARCH_LIMIT = 20;

const getWorkOrderLabel = (wo: WorkOrder) =>
  `${wo.workOrderNumber} — ${wo.order?.client?.name ?? ''}`;

interface WorkOrderSearchAutocompleteProps {
  value: WorkOrder | null;
  onChange: (workOrder: WorkOrder | null) => void;
  /** La OT seleccionada se está resolviendo por ID (precarga o edición). */
  loadingValue?: boolean;
}

/**
 * Selector de OT con búsqueda en el servidor (número de OT, número de OP o
 * cliente). Antes se cargaban las 100 OT más recientes y se filtraba en el
 * navegador, así que una OT más antigua no se podía encontrar ni mostrar.
 */
export const WorkOrderSearchAutocomplete: React.FC<WorkOrderSearchAutocompleteProps> = ({
  value,
  onChange,
  loadingValue = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const debouncedInput = useDebounce(inputValue.trim(), 300);

  // Con una OT elegida el input muestra su etiqueta: eso no es una búsqueda.
  // Se compara el valor ya debounceado: si no, al empezar a escribir se busca
  // un instante con la etiqueta vieja.
  const isShowingSelection =
    !!value && debouncedInput === getWorkOrderLabel(value).trim();
  const search = isShowingSelection ? '' : debouncedInput;

  const { workOrdersQuery } = useWorkOrders({
    search: search || undefined,
    limit: SEARCH_LIMIT,
  });
  const results = (workOrdersQuery.data?.data ?? []).filter(
    (wo) => wo.status !== 'CANCELLED',
  );
  // MUI exige que el valor esté entre las opciones.
  const options =
    value && !results.some((wo) => wo.id === value.id) ? [value, ...results] : results;

  const loading = loadingValue || workOrdersQuery.isFetching;

  return (
    <Autocomplete
      options={options}
      value={value}
      onChange={(_, val) => onChange(val)}
      inputValue={inputValue}
      onInputChange={(_, val) => setInputValue(val)}
      getOptionLabel={getWorkOrderLabel}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      filterOptions={(x) => x}
      loading={loading}
      loadingText="Buscando OT..."
      noOptionsText={search ? 'No se encontraron OT' : 'Escribe para buscar una OT'}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Orden de Trabajo (OT)"
          placeholder="Buscar por número de OT, OP o cliente (opcional)..."
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};
