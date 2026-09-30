import React, { useMemo, useState } from 'react';
import {
  Box,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Paper,
  Typography,
  Grid,
  Tabs,
  Tab,
  useTheme,
  alpha,
  TextField,
  InputAdornment,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import { useQuery } from '@tanstack/react-query';
import { permissionsApi } from '../../../api';
import { Permission } from '../../../types';
import { getPermissionLabel } from '../../../utils/permission-labels';

interface PermissionsSelectorProps {
  selectedPermissions: string[];
  onSelectPermissions: (permissions: string[]) => void;
  disabled?: boolean;
  /**
   * Permisos guardados del rol, usados como línea base para restaurar.
   * En creación se omite (no hay nada guardado todavía).
   */
  initialPermissions?: string[];
}

const PERMISSION_GROUPS: Record<string, string[]> = {
  // Gestión de Usuarios y Accesos
  Usuarios: ['create_users', 'read_users', 'update_users', 'delete_users'],
  Roles: ['create_roles', 'read_roles', 'update_roles', 'delete_roles'],
  Permisos: [
    'create_permissions',
    'read_permissions',
    'update_permissions',
    'delete_permissions',
    'manage_permissions',
  ],

  // Clientes y Ventas
  Clientes: ['browse_clients', 'search_clients', 'create_clients', 'read_clients', 'update_clients', 'delete_clients', 'export_clients', 'update_client_special_condition', 'approve_client_ownership_auth', 'request_client_advisor', 'approve_client_advisor'],
  'Pipeline de Ventas': ['create_prospects', 'read_prospects', 'read_all_prospects', 'update_prospects', 'delete_prospects', 'convert_prospects', 'export_prospects', 'read_prospect_metrics'],
  Cotizaciones: ['create_quotes', 'read_quotes', 'update_quotes', 'delete_quotes', 'export_quotes', 'convert_quotes', 'manage_quote_columns', 'read_all_quotes', 'request_quote_restore', 'approve_quote_restore'],
  'Ventas por Asesor': [
    'read_sales_by_advisor',
    'export_sales_by_advisor',
    'manage_sales_goals',
    'read_all_advisors_tracking',
  ],

  // Órdenes
  Órdenes: ['create_orders', 'read_orders', 'read_orders_dashboard', 'update_orders', 'delete_orders', 'export_orders', 'export_pending_payment_orders', 'export_profitability', 'approve_orders', 'change_order_status', 'register_order_payments', 'approve_discounts', 'apply_discounts', 'delete_discounts', 'read_pending_orders'],
  'Pagos de Órdenes': ['edit_order_payments', 'approve_payment_edits', 'delete_payment_receipts'],
  'Cambio de Asesor': ['request_advisor_change', 'approve_advisor_change'],
  DTF: ['create_dtf', 'read_dtf', 'update_dtf', 'export_dtf', 'change_dtf_status', 'convert_dtf_to_order'],

  // Inventario y Catálogos
  Movimientos: ['create_inventory_movements', 'read_inventory_movements', 'manage_inventory'],
  Proveedores: ['create_suppliers', 'read_suppliers', 'update_suppliers', 'delete_suppliers'],
  Productos: ['create_products', 'read_products', 'update_products', 'delete_products'],
  'Categorías de Productos': ['create_product_categories', 'read_product_categories', 'update_product_categories', 'delete_product_categories'],
  Insumos: ['create_supplies', 'read_supplies', 'update_supplies', 'delete_supplies'],
  'Categorías de Insumos': ['create_supply_categories', 'read_supply_categories', 'update_supply_categories', 'delete_supply_categories'],
  'Unidades de medida': ['create_units_of_measure', 'read_units_of_measure', 'update_units_of_measure', 'delete_units_of_measure'],

  // Producción
  'Áreas de Producción': ['create_production_areas', 'read_production_areas', 'update_production_areas', 'delete_production_areas'],
  'Órdenes de Trabajo': ['create_work_orders', 'read_work_orders', 'update_work_orders', 'delete_work_orders', 'export_work_orders'],
  'Plantillas de Producto': ['read_product_templates', 'create_product_templates', 'update_product_templates', 'delete_product_templates'],
  'Etapas de Producción': ['read_step_definitions', 'create_step_definitions', 'update_step_definitions'],
  'Órdenes de Producción': ['read_production_orders', 'create_production_orders', 'update_production_orders'],

  // Caja Registradora (POS)
  'Cajas Registradoras': ['create_cash_registers', 'read_cash_registers', 'update_cash_registers', 'delete_cash_registers'],
  'Sesiones de Caja': ['open_cash_session', 'close_cash_session', 'read_cash_sessions'],
  'Movimientos de Caja': ['create_cash_movements', 'void_cash_movements', 'read_cash_movements', 'approve_cash_movements', 'request_payment_void'],
  'Pagos de CP en Caja': ['caja_authorize_ap_payment'],
  Devoluciones: [
    'create_refund_requests',
    'approve_refunds',
    'execute_refunds',
  ],

  // Gastos y Cuentas por Pagar
  'Tipos de Gasto': ['create_expense_types', 'read_expense_types', 'update_expense_types', 'delete_expense_types'],
  'Órdenes de Gasto': ['create_expense_orders', 'read_expense_orders', 'update_expense_orders', 'delete_expense_orders', 'export_expense_orders', 'approve_expense_orders', 'caja_authorize_expense_orders'],
  Anticipos: ['approve_advance_payments'],
  'Cuentas por Pagar': ['create_accounts_payable', 'read_accounts_payable', 'update_accounts_payable', 'delete_accounts_payable', 'export_accounts_payable', 'register_ap_payment'],
  'Aprobaciones Cuentas por Pagar': ['approve_accounts_payable'],
  'Reversiones de Pago CP': ['request_ap_payment_reversal', 'gerencia_approve_ap_payment_reversal', 'caja_confirm_ap_payment_reversal'],
  'Reportes Financieros': ['read_financial_dashboard'],

  // Nómina y Asistencia
  'Empleados de Nómina': [
    'create_payroll_employees',
    'read_payroll_employees',
    'update_payroll_employees',
    'delete_payroll_employees',
  ],
  'Periodos de Nómina': [
    'create_payroll_periods',
    'read_payroll_periods',
    'update_payroll_periods',
    'delete_payroll_periods',
  ],
  'Descuento de Órdenes (Nómina)': [
    'read_payroll_deductions',
    'approve_payroll_deductions',
    'apply_payroll_deductions',
  ],
  Asistencia: ['use_attendance', 'read_attendance', 'manage_attendance'],

  // Configuración
  Cargos: ['create_cargos', 'read_cargos', 'update_cargos', 'delete_cargos'],
  Áreas: ['create_areas', 'read_areas', 'update_areas', 'delete_areas'],
  'Canales Comerciales': ['create_commercial_channels', 'read_commercial_channels', 'update_commercial_channels', 'delete_commercial_channels'],
  Compañía: ['read_company', 'update_company'],
  Archivos: ['upload_files', 'read_files', 'delete_files', 'manage_storage'],
  Comentarios: ['create_comments', 'read_comments', 'delete_comments'],
  Auditoría: ['read_audit_logs', 'read_session_logs'],

  Sedes: [
    'view_all_locations',
    'read_other_locations',
    'manage_user_locations',
    'read_all_cash_sessions',
    'perform_general_closing',
    'manage_locations',
  ],
  Otros: [],
};

// Mapeo de Tabs a grupos
const TABS = [
  {
    label: 'Usuarios y Accesos',
    groups: ['Usuarios', 'Roles', 'Permisos'],
  },
  {
    label: 'Clientes y Ventas',
    groups: ['Clientes', 'Pipeline de Ventas', 'Cotizaciones', 'Ventas por Asesor'],
  },
  {
    label: 'Órdenes',
    groups: ['Órdenes', 'Pagos de Órdenes', 'Cambio de Asesor', 'DTF'],
  },
  {
    label: 'Inventario',
    groups: [
      'Movimientos',
      'Proveedores',
      'Productos',
      'Categorías de Productos',
      'Insumos',
      'Categorías de Insumos',
      'Unidades de medida',
    ],
  },
  {
    label: 'Producción',
    groups: ['Áreas de Producción', 'Órdenes de Trabajo', 'Plantillas de Producto', 'Etapas de Producción', 'Órdenes de Producción'],
  },
  {
    label: 'Caja',
    groups: ['Cajas Registradoras', 'Sesiones de Caja', 'Movimientos de Caja', 'Pagos de CP en Caja', 'Devoluciones'],
  },
  {
    label: 'Gastos y CxP',
    groups: [
      'Tipos de Gasto',
      'Órdenes de Gasto',
      'Anticipos',
      'Cuentas por Pagar',
      'Aprobaciones Cuentas por Pagar',
      'Reversiones de Pago CP',
      'Reportes Financieros',
    ],
  },
  {
    label: 'Nómina y Asistencia',
    groups: ['Empleados de Nómina', 'Periodos de Nómina', 'Asistencia'],
  },
  {
    label: 'Configuración',
    groups: [
      'Cargos',
      'Áreas',
      'Canales Comerciales',
      'Compañía',
      'Archivos',
      'Comentarios',
      'Auditoría',
      'Sedes',
      'Otros',
    ],
  },
];

export const PermissionsSelector: React.FC<PermissionsSelectorProps> = ({
  selectedPermissions,
  onSelectPermissions,
  disabled = false,
  initialPermissions,
}) => {
  const theme = useTheme();
  const [currentTab, setCurrentTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => permissionsApi.getAll(),
  });

  const configuredPermissionNames = useMemo(
    () => new Set(Object.values(PERMISSION_GROUPS).flat()),
    [],
  );

  const uncategorizedPermissionNames = useMemo(
    () =>
      permissions
        .map((permission: Permission) => permission.name)
        .filter((name) => !configuredPermissionNames.has(name)),
    [permissions, configuredPermissionNames],
  );

  const handlePermissionChange = (permissionId: string, checked: boolean) => {
    if (checked) {
      onSelectPermissions([...selectedPermissions, permissionId]);
    } else {
      onSelectPermissions(
        selectedPermissions.filter((p) => p !== permissionId),
      );
    }
  };

  const permissionMap = useMemo(
    () =>
      permissions.reduce(
        (acc, p: Permission) => {
          acc[p.name] = p;
          return acc;
        },
        {} as Record<string, Permission>,
      ),
    [permissions],
  );

  const getPermissionNamesForGroup = (groupName: string): string[] => {
    if (groupName === 'Otros') {
      return uncategorizedPermissionNames;
    }

    return PERMISSION_GROUPS[groupName] || [];
  };

  const shouldShowGroup = (groupName: string): boolean => {
    if (groupName === 'Otros') {
      return uncategorizedPermissionNames.length > 0;
    }

    return true;
  };

  const selectedSet = useMemo(
    () => new Set(selectedPermissions),
    [selectedPermissions],
  );

  /**
   * Permisos que existen en la BD para un grupo. Los nombres configurados que
   * no están en la BD se ignoran en los conteos para que "3/4" no sea engañoso.
   */
  const getExistingPermissions = (groupName: string): Permission[] =>
    getPermissionNamesForGroup(groupName)
      .map((permName) => permissionMap[permName])
      .filter((permission): permission is Permission => Boolean(permission));

  const getGroupStats = (groupName: string) => {
    const existing = getExistingPermissions(groupName);
    return {
      total: existing.length,
      selected: existing.filter((p) => selectedSet.has(p.id)).length,
    };
  };

  const getTabStats = (tabIndex: number) =>
    TABS[tabIndex].groups
      .filter(shouldShowGroup)
      .reduce(
        (acc, groupName) => {
          const { total, selected } = getGroupStats(groupName);
          return { total: acc.total + total, selected: acc.selected + selected };
        },
        { total: 0, selected: 0 },
      );

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  /** Agrega o quita un conjunto de permisos preservando el resto de la selección. */
  const togglePermissions = (ids: string[], checked: boolean) => {
    if (checked) {
      const next = new Set(selectedPermissions);
      ids.forEach((id) => next.add(id));
      onSelectPermissions([...next]);
    } else {
      const removing = new Set(ids);
      onSelectPermissions(selectedPermissions.filter((id) => !removing.has(id)));
    }
  };

  // Select all / Deselect all for current tab
  const handleSelectAllInTab = (checked: boolean) => {
    const ids = TABS[currentTab].groups
      .filter(shouldShowGroup)
      .flatMap((groupName) => getExistingPermissions(groupName).map((p) => p.id));

    togglePermissions(ids, checked);
  };

  const handleSelectAllInGroup = (groupName: string, checked: boolean) => {
    togglePermissions(
      getExistingPermissions(groupName).map((p) => p.id),
      checked,
    );
  };

  const initialSet = useMemo(
    () => new Set(initialPermissions ?? []),
    [initialPermissions],
  );

  /** Cuántos permisos difieren de lo guardado (agregados + quitados). */
  const dirtyCount = useMemo(() => {
    let count = 0;
    selectedSet.forEach((id) => {
      if (!initialSet.has(id)) count += 1;
    });
    initialSet.forEach((id) => {
      if (!selectedSet.has(id)) count += 1;
    });
    return count;
  }, [selectedSet, initialSet]);

  const isGroupDirty = (groupName: string) =>
    getExistingPermissions(groupName).some(
      (p) => selectedSet.has(p.id) !== initialSet.has(p.id),
    );

  /** Devuelve los permisos de un grupo a su estado guardado, sin tocar el resto. */
  const handleRestoreGroup = (groupName: string) => {
    const groupIds = getExistingPermissions(groupName).map((p) => p.id);
    const inGroup = new Set(groupIds);
    const next = selectedPermissions.filter((id) => !inGroup.has(id));
    groupIds.forEach((id) => {
      if (initialSet.has(id)) next.push(id);
    });
    onSelectPermissions(next);
  };

  const handleRestoreAll = () => {
    onSelectPermissions([...(initialPermissions ?? [])]);
  };

  const currentTabStats = getTabStats(currentTab);

  const normalizedTerm = searchTerm.trim().toLowerCase();

  /** Pestaña a la que pertenece cada grupo, para dar contexto en la búsqueda. */
  const tabLabelByGroup = useMemo(() => {
    const map: Record<string, string> = {};
    TABS.forEach((tab) => {
      tab.groups.forEach((groupName) => {
        map[groupName] = tab.label;
      });
    });
    return map;
  }, []);

  const matchesFilters = (groupName: string, permission: Permission) => {
    if (onlyAssigned && !selectedSet.has(permission.id)) return false;
    if (!normalizedTerm) return true;
    // Si el término coincide con el nombre del grupo, se muestran todos sus permisos.
    if (groupName.toLowerCase().includes(normalizedTerm)) return true;
    const label = getPermissionLabel(permission.name).toLowerCase();
    return (
      label.includes(normalizedTerm) ||
      permission.name.toLowerCase().includes(normalizedTerm)
    );
  };

  const isFiltering = !!normalizedTerm || onlyAssigned;

  /** Grupos a renderizar, ya filtrados. Los vacíos se omiten al filtrar. */
  const renderedGroups = (
    normalizedTerm
      ? Object.keys(PERMISSION_GROUPS).filter(shouldShowGroup)
      : TABS[currentTab].groups.filter(shouldShowGroup)
  )
    .map((groupName) => ({
      groupName,
      permissions: getExistingPermissions(groupName).filter((permission) =>
        matchesFilters(groupName, permission),
      ),
    }))
    .filter(({ permissions }) => !isFiltering || permissions.length > 0);

  return (
    <Box sx={{ mt: 2 }}>
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          sx={{ flex: 1, minWidth: 260 }}
          placeholder="Buscar un permiso o grupo (ej. Crear Usuarios, Caja...)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={onlyAssigned ? 'assigned' : 'all'}
          onChange={(_e, value) => {
            if (value !== null) setOnlyAssigned(value === 'assigned');
          }}
        >
          <ToggleButton value="all" sx={{ textTransform: 'none', px: 2 }}>
            Todos
          </ToggleButton>
          <ToggleButton value="assigned" sx={{ textTransform: 'none', px: 2 }}>
            Solo asignados ({selectedPermissions.length})
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<RestartAltIcon />}
          onClick={handleRestoreAll}
          disabled={disabled || dirtyCount === 0}
          sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
        >
          Descartar cambios{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
        </Button>
      </Box>

      {!normalizedTerm && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': {
                fontWeight: 600,
                textTransform: 'none',
                minHeight: 48,
              }
            }}
          >
            {TABS.map((tab, index) => {
              const { selected, total } = getTabStats(index);
              return (
                <Tab
                  key={index}
                  label={
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                    >
                      {tab.label}
                      <Chip
                        label={`${selected}/${total}`}
                        size="small"
                        color={selected > 0 ? 'primary' : 'default'}
                        variant={selected > 0 ? 'filled' : 'outlined'}
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          '& .MuiChip-label': { px: 0.75 },
                          // El theme pinta los chips primary con un gradiente que va
                          // de cyan claro a azul oscuro: el texto blanco queda en 1.8:1
                          // sobre el extremo claro. Fondo sólido + texto oscuro da 8.9:1.
                          // El `&&` duplica la clase para ganarle en especificidad al
                          // selector `.MuiChip-filled.MuiChip-colorPrimary` del theme.
                          '&&.MuiChip-filled.MuiChip-colorPrimary': {
                            background: theme.palette.primary.main,
                            color: theme.palette.getContrastText(
                              theme.palette.primary.main,
                            ),
                          },
                        }}
                      />
                    </Box>
                  }
                />
              );
            })}
          </Tabs>
        </Box>
      )}

      {/* Select All Checkbox for current Tab (only visible when not searching) */}
      {!normalizedTerm && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={
                  currentTabStats.total > 0 &&
                  currentTabStats.selected === currentTabStats.total
                }
                indeterminate={
                  currentTabStats.selected > 0 &&
                  currentTabStats.selected < currentTabStats.total
                }
                onChange={(e) => handleSelectAllInTab(e.target.checked)}
                disabled={disabled}
                size="small"
              />
            }
            label={<Typography variant="body2" color="text.secondary">Seleccionar todo en esta pestaña</Typography>}
          />
        </Box>
      )}

      <Box role="tabpanel">
        <Grid container spacing={3}>
          {renderedGroups.map(({ groupName, permissions: availablePermissions }) => {
            const missingPermissionNames = getPermissionNamesForGroup(
              groupName,
            ).filter((permName) => !permissionMap[permName]);

            const { selected: groupSelected, total: groupTotal } =
              getGroupStats(groupName);

            return (
              <Grid item xs={12} sm={6} md={4} key={groupName}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: '100%',
                    borderRadius: 2,
                    backgroundColor: alpha(theme.palette.primary.main, 0.02),
                    borderColor: alpha(theme.palette.divider, 0.5)
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 1,
                      mb: 1.5,
                    }}
                  >
                    <Box>
                      {normalizedTerm && tabLabelByGroup[groupName] && (
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: 'text.secondary',
                            fontSize: '0.65rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {tabLabelByGroup[groupName]} ›
                        </Typography>
                      )}
                      <Typography
                        variant='subtitle2'
                        sx={{
                          fontWeight: 700,
                          color: 'primary.main',
                          textTransform: 'uppercase',
                          fontSize: '0.75rem',
                          letterSpacing: '0.05em'
                        }}
                      >
                        {groupName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.65rem' }}
                      >
                        {groupSelected}/{groupTotal}
                      </Typography>
                    </Box>
                    {groupTotal > 0 && (
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}
                      >
                        {isGroupDirty(groupName) && (
                          <Tooltip title="Restaurar este grupo a como estaba antes de los cambios">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleRestoreGroup(groupName)}
                                disabled={disabled}
                                sx={{ p: 0.5 }}
                              >
                                <RestartAltIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        <Checkbox
                          checked={groupSelected === groupTotal}
                          indeterminate={
                            groupSelected > 0 && groupSelected < groupTotal
                          }
                          onChange={(e) =>
                            handleSelectAllInGroup(groupName, e.target.checked)
                          }
                          disabled={disabled}
                          size="small"
                          title={`Seleccionar todo en ${groupName}`}
                          sx={{ p: 0.5 }}
                        />
                      </Box>
                    )}
                  </Box>
                  <FormGroup>
                    {availablePermissions.map((permission) => (
                      <FormControlLabel
                        key={permission.id}
                        control={
                          <Checkbox
                            checked={selectedPermissions.includes(permission.id)}
                            onChange={(e) =>
                              handlePermissionChange(
                                permission.id,
                                e.target.checked,
                              )
                            }
                            disabled={disabled}
                            size="small"
                            sx={{ py: 0.5 }}
                          />
                        }
                        label={
                          <Typography variant="body2">
                            {getPermissionLabel(permission.name)}
                          </Typography>
                        }
                        sx={{ mb: 0.5, ml: -0.5 }}
                      />
                    ))}

                    {availablePermissions.length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        No hay permisos disponibles para este grupo en este ambiente.
                      </Typography>
                    )}

                    {missingPermissionNames.length > 0 && (
                      <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                        Faltan permisos en la base de datos: {missingPermissionNames.join(', ')}
                      </Typography>
                    )}
                  </FormGroup>
                </Paper>
              </Grid>
            );
          })}

          {isFiltering && renderedGroups.length === 0 && (
            <Grid item xs={12}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', py: 4 }}
              >
                {onlyAssigned && !normalizedTerm
                  ? 'Este rol no tiene permisos asignados todavía.'
                  : `No se encontraron permisos para "${searchTerm}".`}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Box>
    </Box>
  );
};
