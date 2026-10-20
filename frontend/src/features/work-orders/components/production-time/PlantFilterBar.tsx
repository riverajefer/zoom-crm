import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  MenuItem,
  TextField,
} from '@mui/material';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import {
  STATUS_FILTER_LABELS,
  TODAY_ONLY_STATUSES,
  activeFilterCount,
  type FilterOption,
  type PlantFilters,
  type StatusFilter,
} from '../../utils/plantFilters';

interface PlantFilterBarProps {
  filters: PlantFilters;
  options: {
    operators: FilterOption[];
    areas: FilterOption[];
    workOrders: FilterOption[];
    machines: FilterOption[];
  };
  isToday: boolean;
  onChange: (filters: PlantFilters) => void;
}

type ListKey = 'operatorIds' | 'areaIds' | 'workOrderIds' | 'machineIds';

/** Filtros de «Planta hoy»: operario, área, OT, máquina y estado. */
export const PlantFilterBar: React.FC<PlantFilterBarProps> = ({ filters, options, isToday, onChange }) => {
  const multi = (key: ListKey, label: string, list: FilterOption[], emptyText: string) => (
    <Autocomplete
      multiple
      size="small"
      limitTags={2}
      options={list}
      value={list.filter((o) => filters[key].includes(o.id))}
      onChange={(_, value) => onChange({ ...filters, [key]: value.map((o) => o.id) })}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={emptyText}
      disableCloseOnSelect
      renderTags={(value, getTagProps) =>
        value.map((o, index) => {
          const { key: tagKey, ...tagProps } = getTagProps({ index });
          return <Chip key={tagKey} size="small" label={o.label} {...tagProps} />;
        })
      }
      renderInput={(params) => <TextField {...params} label={label} />}
      sx={{ minWidth: 0 }}
    />
  );

  const active = activeFilterCount(filters);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(5, minmax(0, 1fr)) auto',
        },
        gap: 1.5,
        alignItems: 'start',
      }}
    >
      {multi('operatorIds', 'Operario', options.operators, 'No hay operarios')}
      {multi('areaIds', 'Área', options.areas, 'Ningún operario tiene área en su cargo')}
      {multi('workOrderIds', 'OT', options.workOrders, 'Nadie registró tiempo en una OT este día')}
      {multi('machineIds', 'Máquina', options.machines, 'Ninguna tarea de este día usa máquina')}
      <TextField
        select
        size="small"
        label="Estado"
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as StatusFilter })}
      >
        {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((status) => (
          <MenuItem key={status} value={status} disabled={!isToday && TODAY_ONLY_STATUSES.includes(status)}>
            {STATUS_FILTER_LABELS[status]}
          </MenuItem>
        ))}
      </TextField>
      <Button
        size="small"
        startIcon={<FilterAltOffIcon />}
        disabled={active === 0}
        onClick={() =>
          onChange({ operatorIds: [], areaIds: [], workOrderIds: [], machineIds: [], status: 'all' })
        }
        sx={{ height: 40, whiteSpace: 'nowrap' }}
      >
        Limpiar{active ? ` (${active})` : ''}
      </Button>
    </Box>
  );
};
