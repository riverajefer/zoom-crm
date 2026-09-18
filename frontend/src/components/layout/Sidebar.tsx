import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import WorkIcon from '@mui/icons-material/Work';
import BadgeIcon from '@mui/icons-material/Badge';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import MiscellaneousServicesIcon from '@mui/icons-material/MiscellaneousServices';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import FactoryIcon from '@mui/icons-material/Factory';
import StoreIcon from '@mui/icons-material/Store';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PaymentsIcon from '@mui/icons-material/Payments';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import FolderSpecialOutlinedIcon from '@mui/icons-material/FolderSpecialOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import EngineeringIcon from '@mui/icons-material/Engineering';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PostAddIcon from '@mui/icons-material/PostAdd';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import BuildIcon from '@mui/icons-material/Build';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import GroupsIcon from '@mui/icons-material/Groups';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PrintIcon from '@mui/icons-material/Print';
import TuneIcon from '@mui/icons-material/Tune';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useAuthStore } from '../../store/authStore';
import { ROUTES, PERMISSIONS } from '../../utils/constants';
import { neonColors } from '../../theme';
import logo from '../../assets/logo.png';

const DRAWER_WIDTH = 280;
const DRAWER_WIDTH_COLLAPSED = 72;

interface SidebarProps {
  open: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItemSub {
  label: string;
  path: string;
  icon?: React.ReactNode;
  permission?: string | string[];
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  permission?: string | null;
  permissions?: string[];
  menuKey?: string;
  submenu?: NavItemSub[];
}

/**
 * Sidebar con navegación estilo Neón Elegante
 */
export const Sidebar: React.FC<SidebarProps> = ({ open, onClose, collapsed = false, onToggleCollapse }) => {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';
  const { hasPermission } = useAuthStore();
  const [menuOpen, setMenuOpen] = React.useState({
    comercial: false,
    logistica: false,
    produccion: false,
    organizacion: false,
    nomina: false,
    caja: false,
    configuracion: false,
  });

  const handleMenuClick = (menu: keyof typeof menuOpen) => {
    if (collapsed && onToggleCollapse) {
      onToggleCollapse();
      setMenuOpen((prev) => ({
        ...prev,
        [menu]: true,
      }));
      return;
    }
    setMenuOpen((prev) => ({
      ...prev,
      [menu]: !prev[menu],
    }));
  };

  const isActive = (path: string, siblings: string[] = []) => {
    if (path === ROUTES.DASHBOARD) {
      return location.pathname === path;
    }

    const isMatch = location.pathname.startsWith(path);
    if (!isMatch) return false;

    if (location.pathname === path) return true;

    const hasMoreSpecificSibling = siblings.some(
      (s) => s !== path && s.length > path.length && location.pathname.startsWith(s)
    );

    return !hasMoreSpecificSibling;
  };

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      icon: <DashboardIcon />,
      path: ROUTES.DASHBOARD,
      permission: null,
    },
    {
      label: 'Comercial',
      icon: <ShoppingCartIcon />,
      menuKey: 'comercial',
      submenu: [
        {
          label: 'Pipeline de Ventas',
          icon: <TrendingUpIcon />,
          path: ROUTES.PROSPECTS,
          permission: PERMISSIONS.READ_PROSPECTS,
        },
        {
          label: 'Cotizaciones',
          icon: <PostAddIcon />,
          path: '/quotes',
          permission: PERMISSIONS.READ_QUOTES, // Add later if needed
        },
        {
          label: 'Órdenes de Pedido',
          icon: <ReceiptIcon />,
          path: ROUTES.ORDERS,
          permission: PERMISSIONS.READ_ORDERS,
        },
        {
          label: 'Órdenes de Trabajo',
          icon: <BuildIcon />,
          path: ROUTES.WORK_ORDERS,
          permission: PERMISSIONS.READ_WORK_ORDERS,
        },
        {
          label: 'Órdenes de Gastos',
          icon: <RequestQuoteIcon />,
          path: ROUTES.EXPENSE_ORDERS,
          permission: PERMISSIONS.READ_EXPENSE_ORDERS,
        },
        {
          label: 'Tipos de Gasto',
          icon: <CategoryOutlinedIcon />,
          path: ROUTES.EXPENSE_TYPES,
          permission: PERMISSIONS.READ_EXPENSE_TYPES,
        },
        {
          label: 'Subcategorías de Gasto',
          icon: <FolderSpecialOutlinedIcon />,
          path: ROUTES.EXPENSE_SUBCATEGORIES,
          permission: PERMISSIONS.READ_EXPENSE_TYPES,
        },
        {
          label: 'Cuentas por Pagar',
          icon: <AccountBalanceIcon />,
          path: ROUTES.ACCOUNTS_PAYABLE,
          permission: PERMISSIONS.READ_ACCOUNTS_PAYABLE,
        },
        {
          label: 'Órdenes Pendientes por cobrar',
          icon: <PaymentsIcon />,
          path: ROUTES.PENDING_PAYMENT_ORDERS,
          permission: PERMISSIONS.READ_ORDERS,
        },
        {
          label: 'Solicitudes Pendientes',
          icon: <PendingActionsIcon />,
          path: ROUTES.STATUS_CHANGE_REQUESTS,
          permission: [PERMISSIONS.APPROVE_ORDERS, PERMISSIONS.APPROVE_ADVANCE_PAYMENTS, PERMISSIONS.APPROVE_DISCOUNTS, PERMISSIONS.APPROVE_CLIENT_OWNERSHIP_AUTH, PERMISSIONS.APPROVE_EXPENSE_ORDERS],
        },
        {
          label: 'Trazabilidad',
          icon: <AccountTreeIcon />,
          path: ROUTES.ORDER_FLOW_BASE,
          permission: PERMISSIONS.READ_ORDERS,
        },
        {
          label: 'Rentabilidad',
          icon: <TrendingUpIcon />,
          path: ROUTES.ORDERS_PROFITABILITY,
          permission: PERMISSIONS.READ_ORDERS,
        },
        {
          label: 'Ventas por Asesor',
          icon: <PeopleAltIcon />,
          path: ROUTES.SALES_BY_ADVISOR,
          permission: PERMISSIONS.READ_SALES_BY_ADVISOR,
        },
        {
          label: 'Clientes',
          icon: <BadgeIcon />,
          path: ROUTES.CLIENTS,
          permission: [PERMISSIONS.BROWSE_CLIENTS, PERMISSIONS.SEARCH_CLIENTS, PERMISSIONS.CREATE_CLIENTS],
        },
        {
          label: 'Canales de Venta',
          icon: <StoreIcon />,
          path: '/commercial-channels',
          permission: PERMISSIONS.READ_COMMERCIAL_CHANNELS,
        },
        {
          label: 'DTF',
          icon: <PrintIcon />,
          path: ROUTES.DTF,
          permission: PERMISSIONS.READ_DTF,
        },
      ],
      permissions: [
        PERMISSIONS.READ_ORDERS,
        PERMISSIONS.READ_WORK_ORDERS,
        PERMISSIONS.READ_EXPENSE_ORDERS,
        PERMISSIONS.READ_EXPENSE_TYPES,
        PERMISSIONS.READ_ACCOUNTS_PAYABLE,
        PERMISSIONS.BROWSE_CLIENTS,
        PERMISSIONS.SEARCH_CLIENTS,
        PERMISSIONS.CREATE_CLIENTS,
        PERMISSIONS.READ_COMMERCIAL_CHANNELS,
        PERMISSIONS.APPROVE_ORDERS,
        PERMISSIONS.APPROVE_ADVANCE_PAYMENTS,
        PERMISSIONS.APPROVE_CLIENT_OWNERSHIP_AUTH,
        PERMISSIONS.APPROVE_EXPENSE_ORDERS,
        PERMISSIONS.READ_DTF,
        PERMISSIONS.READ_SALES_BY_ADVISOR,
      ],
    },
    {
      label: 'Logística',
      icon: <InventoryIcon />,
      menuKey: 'logistica',
      submenu: [
        {
          label: 'Proveedores',
          icon: <LocalShippingIcon />,
          path: ROUTES.SUPPLIERS,
          permission: PERMISSIONS.READ_SUPPLIERS,
        },
        {
          label: 'Productos',
          icon: <MiscellaneousServicesIcon />,
          path: ROUTES.PRODUCTS,
          permission: PERMISSIONS.READ_PRODUCTS,
        },
        {
          label: 'Insumos',
          icon: <Inventory2OutlinedIcon />,
          path: ROUTES.SUPPLIES,
          permission: PERMISSIONS.READ_SUPPLIES,
        },
        {
          label: 'Categorías Productos',
          icon: <CategoryOutlinedIcon />,
          path: ROUTES.PRODUCT_CATEGORIES,
          permission: PERMISSIONS.READ_PRODUCT_CATEGORIES,
        },
        {
          label: 'Categorías Insumos',
          icon: <FolderSpecialOutlinedIcon />,
          path: ROUTES.SUPPLY_CATEGORIES,
          permission: PERMISSIONS.READ_SUPPLY_CATEGORIES,
        },
        {
          label: 'Unidades de Medida',
          icon: <StraightenOutlinedIcon />,
          path: ROUTES.UNITS_OF_MEASURE,
          permission: PERMISSIONS.READ_UNITS_OF_MEASURE,
        },
        {
          label: 'Movimientos de Inventario',
          icon: <SwapHorizIcon />,
          path: ROUTES.INVENTORY_MOVEMENTS,
          permission: PERMISSIONS.READ_INVENTORY_MOVEMENTS,
        },
        {
          label: 'Alertas de Stock Bajo',
          icon: <WarningAmberIcon />,
          path: ROUTES.INVENTORY_LOW_STOCK,
          permission: PERMISSIONS.READ_INVENTORY_MOVEMENTS,
        },
      ],
      permissions: [
        PERMISSIONS.READ_SUPPLIERS,
        PERMISSIONS.READ_PRODUCTS,
        PERMISSIONS.READ_SUPPLIES,
        PERMISSIONS.READ_PRODUCT_CATEGORIES,
        PERMISSIONS.READ_SUPPLY_CATEGORIES,
        PERMISSIONS.READ_UNITS_OF_MEASURE,
        PERMISSIONS.READ_INVENTORY_MOVEMENTS,
      ],
    },
    {
      label: 'Producción',
      icon: <PrecisionManufacturingIcon />,
      menuKey: 'produccion',
      submenu: [
        {
          label: 'Órdenes de Producción',
          icon: <BuildIcon />,
          path: ROUTES.PRODUCTION_ORDERS,
          permission: PERMISSIONS.READ_PRODUCTION_ORDERS,
        },
        {
          label: 'Plantillas de Producto',
          icon: <CategoryOutlinedIcon />,
          path: ROUTES.PRODUCT_TEMPLATES,
          permission: PERMISSIONS.READ_PRODUCT_TEMPLATES,
        },
        {
          label: 'Definiciones de Pasos',
          icon: <TuneIcon />,
          path: ROUTES.STEP_DEFINITIONS,
          permission: PERMISSIONS.READ_STEP_DEFINITIONS,
        },
      ],
      permissions: [
        PERMISSIONS.READ_PRODUCTION_ORDERS,
        PERMISSIONS.READ_PRODUCT_TEMPLATES,
        PERMISSIONS.READ_STEP_DEFINITIONS,
      ],
    },
    {
      label: 'Organización',
      icon: <EngineeringIcon />,
      menuKey: 'organizacion',
      submenu: [
        {
          label: 'Usuarios',
          icon: <PeopleAltIcon />,
          path: ROUTES.USERS,
          permission: PERMISSIONS.READ_USERS,
        },
        {
          label: 'Cargos',
          icon: <WorkIcon />,
          path: ROUTES.CARGOS,
          permission: PERMISSIONS.READ_CARGOS,
        },
        {
          label: 'Áreas de Producción',
          icon: <FactoryIcon />,
          path: ROUTES.PRODUCTION_AREAS,
          permission: PERMISSIONS.READ_PRODUCTION_AREAS,
        },        
      ],
      permissions: [
        PERMISSIONS.READ_USERS,
        PERMISSIONS.READ_CARGOS,
        PERMISSIONS.READ_PRODUCTION_AREAS,
      ],
    },
    {
      label: 'Nómina',
      icon: <AccountBalanceWalletIcon />,
      menuKey: 'nomina',
      submenu: [
        {
          label: 'Empleados de Nómina',
          icon: <GroupsIcon />,
          path: ROUTES.PAYROLL_EMPLOYEES,
          permission: PERMISSIONS.READ_PAYROLL_EMPLOYEES,
        },
        {
          label: 'Periodos de Nómina',
          icon: <CalendarMonthIcon />,
          path: ROUTES.PAYROLL_PERIODS,
          permission: PERMISSIONS.READ_PAYROLL_PERIODS,
        },
        {
          label: 'Descuento de Órdenes',
          icon: <ReceiptLongIcon />,
          path: ROUTES.PAYROLL_DEDUCTIONS,
          permission: PERMISSIONS.READ_PAYROLL_DEDUCTIONS,
        },
      ],
      permissions: [
        PERMISSIONS.READ_PAYROLL_EMPLOYEES,
        PERMISSIONS.READ_PAYROLL_PERIODS,
        PERMISSIONS.READ_PAYROLL_DEDUCTIONS,
      ],
    },
    {
      label: 'Caja (POS)',
      icon: <PointOfSaleIcon />,
      menuKey: 'caja',
      submenu: [
        {
          label: 'Abrir Sesión',
          icon: <LockOpenIcon />,
          path: ROUTES.CASH_SESSION_OPEN,
          permission: PERMISSIONS.OPEN_CASH_SESSION,
        },
        {
          label: 'Sesión Activa',
          icon: <StorefrontIcon />,
          path: ROUTES.CASH_SESSION_ACTIVE_BASE,
          permission: PERMISSIONS.READ_CASH_SESSIONS,
        },
        {
          label: 'Historial de Sesiones',
          icon: <HistoryEduIcon />,
          path: ROUTES.CASH_SESSION_HISTORY,
          permission: PERMISSIONS.READ_CASH_SESSIONS,
        },
        {
          label: 'Cajas Registradoras',
          icon: <StorefrontIcon />,
          path: ROUTES.CASH_REGISTERS,
          permission: PERMISSIONS.READ_CASH_REGISTERS,
        },
      ],
      permissions: [
        PERMISSIONS.OPEN_CASH_SESSION,
        PERMISSIONS.READ_CASH_SESSIONS,
        PERMISSIONS.READ_CASH_REGISTERS,
      ],
    },
    {
      label: 'Seguridad',
      icon: <SecurityIcon />,
      menuKey: 'configuracion',
      submenu: [
        {
          label: 'Roles',
          icon: <AdminPanelSettingsIcon />,
          path: ROUTES.ROLES,
          permission: PERMISSIONS.READ_ROLES,
        },
        {
          label: 'Permisos',
          icon: <VerifiedUserIcon />,
          path: ROUTES.PERMISSIONS,
          permission: PERMISSIONS.READ_PERMISSIONS,
        },
        {
          label: 'Logs de Auditoría',
          icon: <HistoryIcon />,
          path: ROUTES.AUDIT_LOGS,
          permission: PERMISSIONS.READ_AUDIT_LOGS,
        },
        {
          label: 'Historial de Sesiones',
          icon: <LoginIcon />,
          path: ROUTES.SESSION_LOGS,
          permission: PERMISSIONS.READ_SESSION_LOGS,
        },
        {
          label: 'Control de Asistencia',
          icon: <AccessTimeIcon />,
          path: ROUTES.ATTENDANCE,
          permission: PERMISSIONS.READ_ATTENDANCE,
        },
      ],
      permissions: [
        PERMISSIONS.READ_ROLES,
        PERMISSIONS.READ_PERMISSIONS,
        PERMISSIONS.READ_AUDIT_LOGS,
        PERMISSIONS.READ_SESSION_LOGS,
        PERMISSIONS.READ_ATTENDANCE,
      ],
    },
  ];

  const getItemStyles = (active: boolean, variant: 'main' | 'parent' | 'subitem' = 'main') => {
    // Para el padre activo, usamos un estilo más sutil
    const isParentActive = active && variant === 'parent';
    // Para el subitem activo, el resaltado principal
    const isSubActive = active && variant === 'subitem';
    // Para un item normal activo
    const isMainActive = active && variant === 'main';

    const getBgColor = () => {
      if (isMainActive || isSubActive) {
        return isDark
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.08)';
      }
      if (isParentActive) {
        return 'transparent';
      }
      return 'transparent';
    };

    return {
      mx: 1,
      my: variant === 'subitem' ? 0.2 : 0.5,
      borderRadius: '10px',
      py: variant === 'subitem' ? 0.75 : 0.9,
      transition: 'all 0.2s ease',
      position: 'relative' as const,
      backgroundColor: getBgColor(),
      color: active || isParentActive
        ? '#FFFFFF'
        : '#F1F1F1',
      '&:hover': {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
        transform: 'none',
      },
      '& .MuiListItemIcon-root': {
        color: active || isParentActive
          ? '#FFFFFF'
          : '#F1F1F1',
        minWidth: 36,
        transition: 'all 0.3s ease',
      },
      '& .MuiListItemText-primary': {
        fontWeight: active ? 500 : 400,
        fontSize: variant === 'subitem' ? '0.85rem' : '0.875rem',
      },
    };
  };

  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: isDark ? '#0F0F0F' : '#FFFFFF',
      }}
    >
      {/* Hamburger Button - Only on Desktop */}
      {!isMobile && onToggleCollapse && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            p: 1.5,
            px: collapsed ? 1.5 : 2,
          }}
        >
          <Tooltip title={collapsed ? 'Expandir sidebar' : 'Contraer sidebar'} placement="right">
            <IconButton
              onClick={onToggleCollapse}
              sx={{
                color: isDark ? '#FFFFFF' : neonColors.primary.dark,
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
                },
              }}
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Logo Container */}
      {!collapsed && (
        <Box
          sx={{
            p: 1.5,
            m: 1.5,
            mb: 2,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: '12px',
            background: 'rgba(0, 0, 0, 0.2)',
            boxShadow: 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: isDark
                ? `0 4px 12px rgba(255, 255, 255, 0.05)`
                : '0 4px 12px rgba(0, 0, 0, 0.05)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)'
            },
          }}
        >
          <Box
            component="img"
            src={logo}
            alt="Zoom Publicidad Logo"
            sx={{
              width: '100%',
              maxWidth: 130,
              height: 'auto',
              objectFit: 'contain',
              transition: 'transform 0.3s ease',
              filter: isDark ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.1))' : 'none',
              // '&:hover': { transform: 'scale(1.02)' }
            }}
          />
        </Box>
      )}

      {/* Navigation List */}
      <List 
        sx={{ 
          px: 1, 
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            marginTop: '8px',
            marginBottom: '8px',
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
            borderRadius: '10px',
            transition: 'background 0.3s ease',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
          },
        }}
      >
        {navItems.map((item, index) => {
          // Check permissions: single permission or array of permissions (any match)
          if (item.permission && !hasPermission(item.permission)) {
            return null;
          }
          if (item.permissions && !item.permissions.some(p => hasPermission(p))) {
            return null;
          }

          if (item.submenu) {
            const menuKey = (item.menuKey || item.label.toLowerCase()) as keyof typeof menuOpen;
            const isMenuOpen = menuOpen[menuKey];
            const siblingPaths = item.submenu.map(sub => sub.path);
            const isSubChildActive = item.submenu.some((sub) => isActive(sub.path, siblingPaths));

            return (
              <React.Fragment key={index}>
                <ListItem disablePadding sx={{ display: 'block' }}>
                  <Tooltip title={collapsed ? item.label : ''} placement="right">
                    <ListItemButton
                      onClick={() => handleMenuClick(menuKey)}
                      sx={{
                        ...getItemStyles(isSubChildActive, 'parent'),
                        justifyContent: collapsed ? 'center' : 'flex-start',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 36 }}>{item.icon}</ListItemIcon>
                      {!collapsed && <ListItemText primary={item.label} />}
                      {!collapsed && (isMenuOpen ? <ExpandLess sx={{ fontSize: '1.2rem' }} /> : <ExpandMore sx={{ fontSize: '1.2rem' }} />)}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
                <Collapse in={isMenuOpen && !collapsed} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ 
                    mb: 0.5, 
                    position: 'relative',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 28, // Alineado mejor con el centro del icono padre
                      top: 0,
                      bottom: 16,
                      width: '1px',
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                      zIndex: 1,
                    }
                  }}>
                    {item.submenu.map((subitem, subindex) => {
                      if (subitem.permission) {
                        const hasAccess = Array.isArray(subitem.permission)
                           ? subitem.permission.some(p => hasPermission(p))
                           : hasPermission(subitem.permission);
                        if (!hasAccess) return null;
                      }

                      const active = isActive(subitem.path, siblingPaths);
                      // Extraemos base styles para combinar decoradores específicos
                      const baseStyles = getItemStyles(active, 'subitem');
                      
                      return (
                        <ListItem key={subindex} disablePadding>
                          <Tooltip title={collapsed ? subitem.label : ''} placement="right">
                            <ListItemButton
                              component={RouterLink}
                              to={subitem.path}
                              sx={{
                                ...baseStyles,
                                pl: 5, // Incrementamos el padding izquierdo para separar del hilo principal
                                py: 0.75,
                                mx: 1, // Margen de 8px
                                position: 'relative',
                                '&::after': {
                                  // Línea horizontal que conecta el árbol con el subitem
                                  content: '""',
                                  position: 'absolute',
                                  left: 20, // 28px (línea padre) - 8px (margen x del subitem) = 20px 
                                  top: '50%',
                                  width: '12px', // Extensión hasta el icono
                                  height: '1px',
                                  backgroundColor: active && isDark ? '#FFFFFF' : (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'),
                                  transition: 'background-color 0.2s',
                                  zIndex: 1,
                                },
                                '&:hover': {
                                  ...baseStyles['&:hover'],
                                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                  transform: 'translateX(3px)',
                                }
                              }}
                            >
                              {subitem.icon && (
                                <ListItemIcon sx={{ minWidth: 28, '& .MuiSvgIcon-root': { fontSize: '1.05rem' } }}>
                                  {subitem.icon}
                                </ListItemIcon>
                              )}
                              <ListItemText 
                                primary={subitem.label} 
                                primaryTypographyProps={{ 
                                  sx: { 
                                    fontSize: '0.8125rem',
                                    fontWeight: active ? 600 : 400
                                  } 
                                }} 
                              />
                            </ListItemButton>
                          </Tooltip>
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }

          const topLevelPaths = navItems.filter(i => i.path).map(i => i.path!);
          const active = isActive(item.path!, topLevelPaths);
          return (
            <ListItem key={index} disablePadding>
              <Tooltip title={collapsed ? item.label : ''} placement="right">
                <ListItemButton
                  component={RouterLink}
                  to={item.path!}
                  sx={{
                    ...getItemStyles(active, 'main'),
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 36 }}>{item.icon}</ListItemIcon>
                  {!collapsed && <ListItemText primary={item.label} />}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      {/* Session Status Card */}
      {!collapsed && (
        <Box sx={{ mt: 'auto', p: 2, mb: 1 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: '16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: 'none',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
              Estado de Sesión
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'success.main',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mt: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: 'success.main',
                  boxShadow: isDark
                    ? `0 0 6px ${theme.palette.success.main}`
                    : 'none',
                  animation: isDark ? 'pulse 2s infinite' : 'none',
                  '@keyframes pulse': {
                    '0%, 100%': {
                      boxShadow: `0 0 4px ${theme.palette.success.main}`,
                    },
                    '50%': {
                      boxShadow: `0 0 8px ${theme.palette.success.main}`,
                    },
                  },
                }}
              />
              En línea
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="left"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH,
            borderRight: 'none',
            bgcolor: isDark ? '#0F0F0F' : '#FFFFFF',
          }
        }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Box
      sx={{
        width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH,
        flexShrink: 0,
        borderRight: `1px solid ${isDark
          ? 'rgba(255, 255, 255, 0.1)'
          : theme.palette.divider}`,
        height: '100vh',
        position: 'sticky',
        top: 0,
        bgcolor: isDark ? '#0F0F0F' : '#FFFFFF',
        transition: 'width 0.3s ease',
      }}
    >
      {content}
    </Box>
  );
};
