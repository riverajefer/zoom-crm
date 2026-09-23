import React from 'react';
import { Box, Grid, Card, CardContent, Typography, Button, Tabs, Tab, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PeopleIcon from '@mui/icons-material/People';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import BadgeIcon from '@mui/icons-material/Badge';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import BusinessIcon from '@mui/icons-material/Business';
import WorkIcon from '@mui/icons-material/Work';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShieldIcon from '@mui/icons-material/Shield';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import FactoryIcon from '@mui/icons-material/Factory';
import StoreIcon from '@mui/icons-material/Store';
import ReceiptIcon from '@mui/icons-material/Receipt';
import InventoryIcon from '@mui/icons-material/Inventory';
import MiscellaneousServicesIcon from '@mui/icons-material/MiscellaneousServices';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import FolderSpecialOutlinedIcon from '@mui/icons-material/FolderSpecialOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import EngineeringIcon from '@mui/icons-material/Engineering';
import PaymentsIcon from '@mui/icons-material/Payments';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import BuildIcon from '@mui/icons-material/Build';
import PostAddIcon from '@mui/icons-material/PostAdd';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import RequestPageIcon from '@mui/icons-material/RequestPage';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DescriptionIcon from '@mui/icons-material/Description';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { FinancialDashboard } from '../components/FinancialDashboard';

import {
  usersApi,
  rolesApi,
  permissionsApi,
  clientsApi,
  suppliersApi,
  cargosApi,
  auditLogsApi,
  sessionLogsApi,
  ordersApi,
  quotesApi,
  productsApi,
  suppliesApi,
  productCategoriesApi,
  supplyCategoriesApi,
  unitsOfMeasureApi,
  productionAreasApi,
  commercialChannelsApi,
  workOrdersApi,
  expenseOrdersApi,
  orderStatusChangeRequestsApi,
  payrollEmployeesApi,
  payrollPeriodsApi,
  cashRegisterApi,
  inventoryApi
} from '../../../api';
import { dtfApi } from '../../../api/dtf.api';
import { accountsPayableApi } from '../../../api/accounts-payable.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useAuthStore } from '../../../store/authStore';
import { ROUTES, PERMISSIONS } from '../../../utils/constants';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  neonColor?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Colores neón para cada categoría
const NEON_COLORS = {
  general: '#C8E68A',      // Lima camaleón
  commercial: '#FFD700',   // Dorado/Amarillo comercial
  logistics: '#0FFF50',    // Verde neón
  organization: '#00D9FF', // Azul neón
  security: '#FF6B00',     // Naranja neón
  audit: '#BC13FE',        // Púrpura neón
  payroll: '#FF00FF',      // Magenta neón
  caja: '#34d399',         // Esmeralda neón
  financial: '#F97316',   // Naranja — Dashboard Financiero
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, neonColor, action }) => {
  const hoverColor = neonColor || color;

  return (
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? 'linear-gradient(145deg, rgba(22, 24, 22, 0.6) 0%, rgba(26, 28, 25, 1) 100%)'
            : 'linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(241, 245, 249, 0.8) 100%)',
        backdropFilter: 'blur(10px)',
        border: '2px solid',
        borderColor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(46, 167, 224, 0.1)'
            : 'rgba(163, 211, 60, 0.1)',
        borderRadius: '20px',
        boxShadow: (theme) =>
          theme.palette.mode === 'dark'
            ? '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
            : '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        '&:hover': {
          transform: 'translateY(-8px)',
          borderColor: hoverColor,
          boxShadow: (theme) =>
            theme.palette.mode === 'dark'
              ? `0 0 15px ${hoverColor}15, 0 0 30px ${hoverColor}08, 0 20px 50px -10px rgba(0,0,0,0.5)`
              : `0 0 10px ${hoverColor}12, 0 0 20px ${hoverColor}06, 0 20px 50px -10px rgba(0,0,0,0.1)`,
          '& .stat-icon-container': {
            transform: 'scale(1.1) rotate(5deg)',
            backgroundColor: (theme) => 
              theme.palette.mode === 'dark' ? `${hoverColor}40` : `${hoverColor}20`,
            boxShadow: 'none',
          },
          '& .stat-action-btn': {
            backgroundColor: `${hoverColor}12`,
            color: hoverColor,
            transform: 'translateY(-2px)',
            boxShadow: `0 0 8px ${hoverColor}15`,
          },
          '& .stat-decorative': {
            background: `radial-gradient(circle, ${hoverColor}10 0%, transparent 70%)`,
          }
        },
      }}
    >
      {/* Decorative background element */}
      <Box
        className="stat-decorative"
        sx={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
          zIndex: 0,
          transition: 'all 0.3s ease',
        }}
      />

    <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 }, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: { xs: 1.5, sm: 2, md: 3 } }}>
        <Box
          className="stat-icon-container"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: '16px',
            backgroundColor: (theme) => 
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : `${color}10`,
            color: color,
            transition: 'all 0.4s ease',
          }}
        >
          {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 28 } })}
        </Box>
        <Box textAlign="right">
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              color: 'text.primary',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
            }}
          >
            {value}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontSize: '0.7rem',
              mt: 0.5,
              display: 'block'
            }}
          >
            Total Registros
          </Typography>
        </Box>
      </Box>

      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 700,
          color: 'text.primary',
          mb: 'auto',
          fontSize: { xs: '0.95rem', sm: '1rem', md: '1.1rem' },
        }}
      >
        {title}
      </Typography>

      {action && (
        <Button
          className="stat-action-btn"
          size="medium"
          onClick={action.onClick}
          fullWidth
          variant="text"
          sx={{
            mt: 3,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.875rem',
            color: color,
            borderRadius: '12px',
            py: 1,
            transition: 'all 0.3s ease',
            backgroundColor: (theme) => 
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : `${color}08`,
          }}
        >
          {action.label}
        </Button>
      )}
    </CardContent>
  </Card>
  );
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`dashboard-tabpanel-${index}`}
    aria-labelledby={`dashboard-tab-${index}`}
  >
    {value === index && <Box sx={{ py: { xs: 1.5, sm: 2, md: 3 } }}>{children}</Box>}
  </div>
);

/**
 * Página del dashboard principal
 */
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const [currentTab, setCurrentTab] = React.useState(0);

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_USERS)) return [];
      return usersApi.getAll();
    },
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_ROLES)) return [];
      return rolesApi.getAll();
    },
  });

  const { data: permissions = [], isLoading: permissionsLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PERMISSIONS)) return [];
      return permissionsApi.getAll();
    },
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_CLIENTS)) return [];
      return clientsApi.getAll();
    },
  });

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_SUPPLIERS)) return [];
      return suppliersApi.getAll();
    },
  });

  const { data: areas = [], isLoading: areasLoading } = useQuery({
    queryKey: ['production-areas'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PRODUCTION_AREAS)) return [];
      return productionAreasApi.getAll();
    },
  });

  const { data: cargos = [], isLoading: cargosLoading } = useQuery({
    queryKey: ['cargos'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_CARGOS)) return [];
      return cargosApi.getAll();
    },
  });

  const { data: auditLogsData, isLoading: auditLogsLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_AUDIT_LOGS)) return { data: [], total: 0 };
      return auditLogsApi.getAll({ page: 1, limit: 10 });
    },
  });

  const { data: sessionLogsData, isLoading: sessionLogsLoading } = useQuery({
    queryKey: ['session-logs'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_SESSION_LOGS)) return { data: [], meta: { total: 0 } };
      return sessionLogsApi.getAll({ page: 1, limit: 10 });
    },
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_ORDERS)) return { data: [], meta: { total: 0, page: 1, limit: 1, totalPages: 0 } };
      return ordersApi.getAll({ limit: 1 });
    },
  });

  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_QUOTES)) return { data: [], meta: { total: 0, page: 1, limit: 1, totalPages: 0 } };
      return quotesApi.findAll({ limit: 1 });
    },
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PRODUCTS)) return [];
      return productsApi.getAll();
    },
  });

  const { data: supplies = [], isLoading: suppliesLoading } = useQuery({
    queryKey: ['supplies'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_SUPPLIES)) return [];
      return suppliesApi.getAll();
    },
  });

  const { data: productionAreas = [], isLoading: productionAreasLoading } = useQuery({
    queryKey: ['production-areas'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PRODUCTION_AREAS)) return [];
      return productionAreasApi.getAll();
    },
  });

  const { data: commercialChannels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['commercial-channels'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_COMMERCIAL_CHANNELS)) return [];
      return commercialChannelsApi.getAll();
    },
  });

  const { data: productCategories = [], isLoading: productCatsLoading } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PRODUCT_CATEGORIES)) return [];
      return productCategoriesApi.getAll();
    },
  });

  const { data: supplyCategories = [], isLoading: supplyCatsLoading } = useQuery({
    queryKey: ['supply-categories'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_SUPPLY_CATEGORIES)) return [];
      return supplyCategoriesApi.getAll();
    },
  });

  const { data: unitsOfMeasure = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['units-of-measure'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_UNITS_OF_MEASURE)) return [];
      return unitsOfMeasureApi.getAll();
    },
  });

  const { data: pendingOrdersData, isLoading: pendingOrdersLoading } = useQuery({
    queryKey: ['orders-pending-payment'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_ORDERS)) return { data: [], meta: { total: 0 } };
      // Simulado: traemos un lote razonable para el dashboard
      // Lo ideal sería un filtro en el backend, pero seguimos la lógica de la página
      return ordersApi.getAll({ limit: 100 });
    },
  });

  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_WORK_ORDERS)) return { data: [], meta: { total: 0 } };
      return workOrdersApi.getAll({ limit: 1 });
    },
  });

  const { data: expenseOrdersData, isLoading: expenseOrdersLoading } = useQuery({
    queryKey: ['expense-orders'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_EXPENSE_ORDERS)) return { data: [], meta: { total: 0 } };
      return expenseOrdersApi.getAll({ limit: 1 });
    },
  });

  const { data: statusChangeRequestsData, isLoading: statusChangeRequestsLoading } = useQuery({
    queryKey: ['status-change-requests'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.APPROVE_ORDERS)) return [];
      return orderStatusChangeRequestsApi.findPending();
    },
  });

  const { data: payrollEmployeesData = [], isLoading: payrollEmployeesLoading } = useQuery({
    queryKey: ['payroll-employees'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PAYROLL_EMPLOYEES)) return [];
      return payrollEmployeesApi.getAll();
    },
  });

  const { data: payrollPeriodsData = [], isLoading: payrollPeriodsLoading } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_PAYROLL_PERIODS)) return [];
      return payrollPeriodsApi.getAll();
    },
  });

  const { data: cashRegistersData = [], isLoading: cashRegistersLoading } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_CASH_REGISTERS)) return [];
      // Usar la api de cashRegisters
      return cashRegisterApi.getAllRegisters();
    },
  });

  const { data: inventoryMovementsData = { meta: { total: 0 } }, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_INVENTORY_MOVEMENTS)) return { meta: { total: 0 } };
      return inventoryApi.getAll({ limit: 1 });
    },
  });

  const { data: dtfData, isLoading: dtfLoading } = useQuery({
    queryKey: ['dtf'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_DTF)) return { meta: { total: 0 } };
      return dtfApi.getAll({ limit: 1 });
    },
  });

  const { data: accountsPayableData, isLoading: accountsPayableLoading } = useQuery({
    queryKey: ['accounts-payable'],
    queryFn: async () => {
      if (!hasPermission(PERMISSIONS.READ_ACCOUNTS_PAYABLE)) return { meta: { total: 0, page: 1, limit: 1, totalPages: 0 } };
      return accountsPayableApi.getAll({ limit: 1 });
    },
  });

  const isLoading =
    usersLoading || rolesLoading || permissionsLoading || clientsLoading ||
    suppliersLoading || areasLoading || cargosLoading || auditLogsLoading ||
    sessionLogsLoading || ordersLoading || productsLoading || suppliesLoading ||
    productionAreasLoading || channelsLoading || productCatsLoading ||
    supplyCatsLoading || unitsLoading || pendingOrdersLoading || quotesLoading ||
    workOrdersLoading || expenseOrdersLoading || statusChangeRequestsLoading || 
    payrollEmployeesLoading || payrollPeriodsLoading || cashRegistersLoading ||
    inventoryLoading || dtfLoading || accountsPayableLoading;

  const PENDING_PAYMENT_STATUSES = React.useMemo(() => ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'WARRANTY'], []);
  const pendingOrdersCount = React.useMemo(() => {
    const allOrders = pendingOrdersData?.data || [];
    return allOrders.filter(
      (order: { status: string; balance: string | number }) =>
        PENDING_PAYMENT_STATUSES.includes(order.status) &&
        parseFloat(String(order.balance)) > 0,
    ).length;
  }, [pendingOrdersData, PENDING_PAYMENT_STATUSES]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const usersCount = Array.isArray(users) ? users.length : 0;
  const rolesCount = Array.isArray(roles) ? roles.length : 0;
  const permissionsCount = Array.isArray(permissions) ? permissions.length : 0;
  const clientsCount = Array.isArray(clients) ? clients.length : 0;
  const suppliersCount = Array.isArray(suppliers) ? suppliers.length : 0;
  const areasCount = Array.isArray(areas) ? areas.length : 0;
  const cargosCount = Array.isArray(cargos) ? cargos.length : 0;
  const auditLogsCount = auditLogsData?.total || 0;
  const sessionLogsCount = sessionLogsData?.meta?.total || 0;
  const ordersCount = ordersData?.meta?.total || 0;
  const quotesCount = quotesData?.meta?.total || 0;
  const workOrdersCount = workOrdersData?.meta?.total || 0;
  const expenseOrdersCount = expenseOrdersData?.meta?.total || 0;
  const statusChangeRequestsCount = Array.isArray(statusChangeRequestsData) ? statusChangeRequestsData.length : 0;

  const productsCount = Array.isArray(products) ? products.length : 0;
  const suppliesCount = Array.isArray(supplies) ? supplies.length : 0;
  const productionAreasCount = Array.isArray(productionAreas) ? productionAreas.length : 0;
  const channelsCount = Array.isArray(commercialChannels) ? commercialChannels.length : 0;
  const productCatsCount = Array.isArray(productCategories) ? productCategories.length : 0;
  const supplyCatsCount = Array.isArray(supplyCategories) ? supplyCategories.length : 0;
  const unitsCount = Array.isArray(unitsOfMeasure) ? unitsOfMeasure.length : 0;
  const payrollEmployeesCount = Array.isArray(payrollEmployeesData) 
    ? payrollEmployeesData.length 
    : ('total' in payrollEmployeesData ? (payrollEmployeesData as any).total : 0);
    
  const payrollPeriodsCount = Array.isArray(payrollPeriodsData) 
    ? payrollPeriodsData.length 
    : ('total' in payrollPeriodsData ? (payrollPeriodsData as any).total : 0);

  const cashRegistersCount = Array.isArray(cashRegistersData) ? cashRegistersData.length : 0;
  const inventoryMovementsCount = (inventoryMovementsData as any)?.meta?.total || 0;
  const dtfCount = (dtfData as any)?.meta?.total || 0;
  const accountsPayableCount = (accountsPayableData as any)?.meta?.total || 0;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title={`Bienvenido ${user?.firstName || 'Usuario'}`}
        subtitle="Panel de control"
      />

      {/* Tabs Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: { xs: 1.5, sm: 2, md: 3 } }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          TabIndicatorProps={{
            sx: {
              height: 3,
              borderRadius: '3px 3px 0 0',
              backgroundColor: (theme) => {
                const isDark = theme.palette.mode === 'dark';
                if (currentTab === 0) return isDark ? NEON_COLORS.general : '#0891b2';
                if (currentTab === 1) return isDark ? NEON_COLORS.commercial : '#b45309';
                if (currentTab === 2) return isDark ? NEON_COLORS.logistics : '#15803d';
                if (currentTab === 3) return isDark ? NEON_COLORS.organization : '#0369a1';
                if (currentTab === 4) return isDark ? NEON_COLORS.security : '#c2410c';
                if (currentTab === 5) return isDark ? NEON_COLORS.payroll : '#d946ef';
                return isDark ? NEON_COLORS.caja : '#047857';
              },
              boxShadow: (theme) =>
                theme.palette.mode === 'dark'
                  ? `0 0 20px ${
                      currentTab === 0 ? NEON_COLORS.general :
                      currentTab === 1 ? NEON_COLORS.commercial :
                      currentTab === 2 ? NEON_COLORS.logistics :
                      currentTab === 3 ? NEON_COLORS.organization :
                      currentTab === 4 ? NEON_COLORS.security :
                      currentTab === 5 ? NEON_COLORS.payroll :
                      NEON_COLORS.caja
                    }80`
                  : 'none',
            }
          }}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              minHeight: 56,
              px: 3,
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.02)',
              }
            },
            '& .Mui-selected': {
              fontWeight: 700,
            },
            '& .MuiTab-root:nth-of-type(1).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.general : '#0891b2',
            },
            '& .MuiTab-root:nth-of-type(2).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.commercial : '#b45309',
            },
            '& .MuiTab-root:nth-of-type(3).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.logistics : '#15803d',
            },
            '& .MuiTab-root:nth-of-type(4).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.organization : '#0369a1',
            },
            '& .MuiTab-root:nth-of-type(5).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.security : '#c2410c',
            },
            '& .MuiTab-root:nth-of-type(6).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.payroll : '#d946ef',
            },
            '& .MuiTab-root:nth-of-type(7).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.caja : '#047857',
            },
            '& .MuiTab-root:nth-of-type(8).Mui-selected': {
              color: (theme) => theme.palette.mode === 'dark' ? NEON_COLORS.financial : '#c2410c',
            },
          }}
        >
          <Tab
            icon={<DashboardIcon />}
            iconPosition="start"
            label="Vista General"
          />
          <Tab
            icon={<ShoppingCartIcon />}
            iconPosition="start"
            label="Comercial"
          />
          <Tab
            icon={<InventoryIcon />}
            iconPosition="start"
            label="Logística"
          />
          <Tab
            icon={<EngineeringIcon />}
            iconPosition="start"
            label="Organización"
          />
          <Tab
            icon={<ShieldIcon />}
            iconPosition="start"
            label="Seguridad"
          />
          <Tab
            icon={<PaymentsIcon />}
            iconPosition="start"
            label="Nómina"
          />
          <Tab
            icon={<AccountBalanceWalletIcon />}
            iconPosition="start"
            label="Caja y Gastos"
          />
          <Tab
            icon={<TrendingUpIcon />}
            iconPosition="start"
            label="Financiero"
          />
        </Tabs>
      </Box>

      {/* Tab 0: Vista General */}
      <TabPanel value={currentTab} index={0}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {/* ── Comercial ── */}
          {hasPermission(PERMISSIONS.READ_ORDERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Órdenes"
                value={ordersCount}
                icon={<ReceiptIcon />}
                color="#FFD700"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver órdenes', onClick: () => navigate(ROUTES.ORDERS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_QUOTES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Cotizaciones"
                value={quotesCount}
                icon={<PostAddIcon />}
                color="#06b6d4"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver cotizaciones', onClick: () => navigate(ROUTES.QUOTES) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_WORK_ORDERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Órdenes de Trabajo"
                value={workOrdersCount}
                icon={<BuildIcon />}
                color="#2EA7E0"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver órdenes de trabajo', onClick: () => navigate(ROUTES.WORK_ORDERS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_EXPENSE_ORDERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Órdenes de Gastos"
                value={expenseOrdersCount}
                icon={<RequestQuoteIcon />}
                color="#EC4899"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver órdenes de gastos', onClick: () => navigate(ROUTES.EXPENSE_ORDERS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ORDERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Órdenes Pendientes"
                value={pendingOrdersCount}
                icon={<PaymentsIcon />}
                color="#F97316"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver pendientes', onClick: () => navigate(ROUTES.PENDING_PAYMENT_ORDERS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.APPROVE_ORDERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Solicitudes de Cambio"
                value={statusChangeRequestsCount}
                icon={<PendingActionsIcon />}
                color="#EF4444"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver solicitudes', onClick: () => navigate(ROUTES.STATUS_CHANGE_REQUESTS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_DTF) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="DTF"
                value={dtfCount}
                icon={<DescriptionIcon />}
                color="#1B7FB0"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver DTF', onClick: () => navigate(ROUTES.DTF) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SALES_BY_ADVISOR) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Ventas por Asesor"
                value={ordersCount}
                icon={<TrendingUpIcon />}
                color="#F59E0B"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver reporte', onClick: () => navigate(ROUTES.SALES_BY_ADVISOR) }}
              />
            </Grid>
          )}
          {/* ── Clientes y Proveedores ── */}
          {hasPermission(PERMISSIONS.READ_CLIENTS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Clientes"
                value={clientsCount}
                icon={<BadgeIcon />}
                color="#38BDF8"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver clientes', onClick: () => navigate(ROUTES.CLIENTS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SUPPLIERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Proveedores"
                value={suppliersCount}
                icon={<LocalShippingIcon />}
                color="#7CC8EE"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver proveedores', onClick: () => navigate(ROUTES.SUPPLIERS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_COMMERCIAL_CHANNELS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Canales de Venta"
                value={channelsCount}
                icon={<StoreIcon />}
                color="#FBBF24"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver canales', onClick: () => navigate('/commercial-channels') }}
              />
            </Grid>
          )}
          {/* ── Portafolio e Inventario ── */}
          {hasPermission(PERMISSIONS.READ_PRODUCTS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Productos"
                value={productsCount}
                icon={<MiscellaneousServicesIcon />}
                color="#60A5FA"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver productos', onClick: () => navigate(ROUTES.PRODUCTS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SUPPLIES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Insumos"
                value={suppliesCount}
                icon={<Inventory2OutlinedIcon />}
                color="#FBBF24"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver insumos', onClick: () => navigate(ROUTES.SUPPLIES) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PRODUCT_CATEGORIES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Categorías Productos"
                value={productCatsCount}
                icon={<CategoryOutlinedIcon />}
                color="#EC4899"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver categorías', onClick: () => navigate(ROUTES.PRODUCT_CATEGORIES) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SUPPLY_CATEGORIES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Categorías Insumos"
                value={supplyCatsCount}
                icon={<FolderSpecialOutlinedIcon />}
                color="#2EA7E0"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver categorías', onClick: () => navigate(ROUTES.SUPPLY_CATEGORIES) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_UNITS_OF_MEASURE) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Unidades de Medida"
                value={unitsCount}
                icon={<StraightenOutlinedIcon />}
                color="#64748B"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver unidades', onClick: () => navigate(ROUTES.UNITS_OF_MEASURE) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_INVENTORY_MOVEMENTS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Mov. Inventario"
                value={inventoryMovementsCount}
                icon={<SyncAltIcon />}
                color="#14B8A6"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver movimientos', onClick: () => navigate(ROUTES.INVENTORY_MOVEMENTS) }}
              />
            </Grid>
          )}
          {/* ── Organización ── */}
          {hasPermission(PERMISSIONS.READ_PRODUCTION_AREAS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Áreas de Producción"
                value={areasCount}
                icon={<BusinessIcon />}
                color="#2DD4BF"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver áreas de producción', onClick: () => navigate(ROUTES.PRODUCTION_AREAS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_CARGOS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Cargos"
                value={cargosCount}
                icon={<WorkIcon />}
                color="#F472B6"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver cargos', onClick: () => navigate(ROUTES.CARGOS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_USERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Usuarios"
                value={usersCount}
                icon={<PeopleIcon />}
                color="#5B9FED"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver usuarios', onClick: () => navigate(ROUTES.USERS) }}
              />
            </Grid>
          )}
          {/* ── Seguridad ── */}
          {hasPermission(PERMISSIONS.READ_ROLES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Roles"
                value={rolesCount}
                icon={<SecurityIcon />}
                color="#FB923C"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver roles', onClick: () => navigate(ROUTES.ROLES) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PERMISSIONS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Permisos"
                value={permissionsCount}
                icon={<VerifiedUserIcon />}
                color="#4ADE80"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver permisos', onClick: () => navigate(ROUTES.PERMISSIONS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SESSION_LOGS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Sesiones"
                value={sessionLogsCount}
                icon={<LoginIcon />}
                color="#94A3B8"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver historial', onClick: () => navigate(ROUTES.SESSION_LOGS) }}
              />
            </Grid>
          )}
          {/* ── Nómina ── */}
          {hasPermission(PERMISSIONS.READ_PAYROLL_EMPLOYEES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Empleados"
                value={payrollEmployeesCount}
                icon={<PeopleIcon />}
                color="#EC4899"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver empleados', onClick: () => navigate(ROUTES.PAYROLL_EMPLOYEES) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PAYROLL_PERIODS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Períodos de Nómina"
                value={payrollPeriodsCount}
                icon={<PendingActionsIcon />}
                color="#2EA7E0"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver periodos', onClick: () => navigate(ROUTES.PAYROLL_PERIODS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ATTENDANCE) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Asistencia"
                value={0}
                icon={<VerifiedUserIcon />}
                color="#F59E0B"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver asistencia', onClick: () => navigate(ROUTES.ATTENDANCE) }}
              />
            </Grid>
          )}
          {/* ── Caja y Finanzas ── */}
          {hasPermission(PERMISSIONS.READ_CASH_REGISTERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Cajas Registradoras"
                value={cashRegistersCount}
                icon={<PointOfSaleIcon />}
                color="#34D399"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver cajas', onClick: () => navigate(ROUTES.CASH_REGISTERS) }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ACCOUNTS_PAYABLE) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Cuentas por Pagar"
                value={accountsPayableCount}
                icon={<AccountBalanceIcon />}
                color="#1B7FB0"
                neonColor={NEON_COLORS.general}
                action={{ label: 'Ver cuentas', onClick: () => navigate(ROUTES.ACCOUNTS_PAYABLE) }}
              />
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 1: Comercial */}
      <TabPanel value={currentTab} index={1}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {hasPermission(PERMISSIONS.READ_ORDERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Órdenes de Pedido"
                value={ordersCount}
                icon={<ReceiptIcon />}
                color="#FFD700"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver órdenes',
                  onClick: () => navigate(ROUTES.ORDERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_QUOTES) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Cotizaciones"
                value={quotesCount}
                icon={<PostAddIcon />}
                color="#06b6d4"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver cotizaciones',
                  onClick: () => navigate(ROUTES.QUOTES),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_WORK_ORDERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Órdenes de Trabajo"
                value={workOrdersCount}
                icon={<BuildIcon />}
                color="#2EA7E0"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver órdenes de trabajo',
                  onClick: () => navigate(ROUTES.WORK_ORDERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_EXPENSE_ORDERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Órdenes de Gastos"
                value={expenseOrdersCount}
                icon={<RequestQuoteIcon />}
                color="#EC4899"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver órdenes de gastos',
                  onClick: () => navigate(ROUTES.EXPENSE_ORDERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ORDERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Órdenes Pendientes por Cobrar"
                value={pendingOrdersCount}
                icon={<PaymentsIcon />}
                color="#F97316"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Gestionar pagos',
                  onClick: () => navigate(ROUTES.PENDING_PAYMENT_ORDERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_CLIENTS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Clientes"
                value={clientsCount}
                icon={<BadgeIcon />}
                color="#38BDF8"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver clientes',
                  onClick: () => navigate(ROUTES.CLIENTS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_COMMERCIAL_CHANNELS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Canales de Venta"
                value={channelsCount}
                icon={<StoreIcon />}
                color="#FBBF24"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver canales',
                  onClick: () => navigate('/commercial-channels'),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.APPROVE_ORDERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Solicitudes de Cambio"
                value={statusChangeRequestsCount}
                icon={<PendingActionsIcon />}
                color="#EF4444"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver solicitudes',
                  onClick: () => navigate(ROUTES.STATUS_CHANGE_REQUESTS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ORDERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Trazabilidad"
                value={ordersCount}
                icon={<AccountTreeIcon />}
                color="#10B981"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver trazabilidad',
                  onClick: () => navigate(ROUTES.ORDER_FLOW_BASE),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_DTF) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="DTF"
                value={dtfCount}
                icon={<DescriptionIcon />}
                color="#1B7FB0"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver DTF',
                  onClick: () => navigate(ROUTES.DTF),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SALES_BY_ADVISOR) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Ventas por Asesor"
                value={ordersCount}
                icon={<TrendingUpIcon />}
                color="#F59E0B"
                neonColor={NEON_COLORS.commercial}
                action={{
                  label: 'Ver reporte',
                  onClick: () => navigate(ROUTES.SALES_BY_ADVISOR),
                }}
              />
            </Grid>
          )}
        </Grid>

        {/* Acciones Rápidas - Comercial */}
        <Box sx={{ mt: { xs: 2.5, sm: 3, md: 4 } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'text.primary', fontSize: { xs: '1rem', sm: '1.15rem', md: '1.25rem' } }}>
            Acciones Rápidas
          </Typography>
          <Grid container spacing={{ xs: 1.5, sm: 2, md: 2 }}>
            {hasPermission(PERMISSIONS.CREATE_QUOTES) && (
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(ROUTES.QUOTES_CREATE)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: '#06b6d4',
                      color: '#06b6d4',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(6, 182, 212, 0.15)',
                      background: 'rgba(6, 182, 212, 0.05)',
                    },
                  }}
                >
                  Nueva Cotización
                </Button>
              </Grid>
            )}
            {hasPermission(PERMISSIONS.CREATE_ORDERS) && (
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(ROUTES.ORDERS_CREATE)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: NEON_COLORS.commercial,
                      color: NEON_COLORS.commercial,
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 12px ${alpha(NEON_COLORS.commercial, 0.15)}`,
                      background: alpha(NEON_COLORS.commercial, 0.05),
                    },
                  }}
                >
                  Nueva Orden
                </Button>
              </Grid>
            )}
            {hasPermission(PERMISSIONS.CREATE_CLIENTS) && (
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(ROUTES.CLIENTS_CREATE)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: '#38BDF8',
                      color: '#38BDF8',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(56, 189, 248, 0.15)',
                      background: 'rgba(56, 189, 248, 0.05)',
                    },
                  }}
                >
                  Nuevo Cliente
                </Button>
              </Grid>
            )}
            {hasPermission(PERMISSIONS.CREATE_WORK_ORDERS) && (
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(ROUTES.WORK_ORDERS_CREATE)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: '#2EA7E0',
                      color: '#2EA7E0',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(46, 167, 224, 0.15)',
                      background: 'rgba(46, 167, 224, 0.05)',
                    },
                  }}
                >
                  Nueva Orden de Trabajo
                </Button>
              </Grid>
            )}
            {hasPermission(PERMISSIONS.CREATE_EXPENSE_ORDERS) && (
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(ROUTES.EXPENSE_ORDERS_CREATE)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: '#EC4899',
                      color: '#EC4899',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(236, 72, 153, 0.15)',
                      background: 'rgba(236, 72, 153, 0.05)',
                    },
                  }}
                >
                  Nueva Orden de Gastos
                </Button>
              </Grid>
            )}
          </Grid>
        </Box>
      </TabPanel>

      {/* Tab 2: Logística */}
      <TabPanel value={currentTab} index={2}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {hasPermission(PERMISSIONS.READ_SUPPLIERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Proveedores"
                value={suppliersCount}
                icon={<LocalShippingIcon />}
                color="#7CC8EE"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver proveedores',
                  onClick: () => navigate(ROUTES.SUPPLIERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PRODUCTION_AREAS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Áreas Producción"
                value={productionAreasCount}
                icon={<FactoryIcon />}
                color="#10B981"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver áreas de producción',
                  onClick: () => navigate(ROUTES.PRODUCTION_AREAS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PRODUCTS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Productos"
                value={productsCount}
                icon={<MiscellaneousServicesIcon />}
                color="#60A5FA"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver productos',
                  onClick: () => navigate(ROUTES.PRODUCTS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SUPPLIES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Insumos"
                value={suppliesCount}
                icon={<Inventory2OutlinedIcon />}
                color="#FBBF24"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver insumos',
                  onClick: () => navigate(ROUTES.SUPPLIES),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PRODUCT_CATEGORIES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Categorías Prod."
                value={productCatsCount}
                icon={<CategoryOutlinedIcon />}
                color="#EC4899"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver categorías',
                  onClick: () => navigate(ROUTES.PRODUCT_CATEGORIES),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SUPPLY_CATEGORIES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Categorías Ins."
                value={supplyCatsCount}
                icon={<FolderSpecialOutlinedIcon />}
                color="#2EA7E0"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver categorías',
                  onClick: () => navigate(ROUTES.SUPPLY_CATEGORIES),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_UNITS_OF_MEASURE) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Unidades Medida"
                value={unitsCount}
                icon={<StraightenOutlinedIcon />}
                color="#64748B"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver unidades',
                  onClick: () => navigate(ROUTES.UNITS_OF_MEASURE),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_INVENTORY_MOVEMENTS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Mov. Inventario"
                value={inventoryMovementsCount}
                icon={<SyncAltIcon />}
                color="#14B8A6"
                neonColor={NEON_COLORS.logistics}
                action={{
                  label: 'Ver movimientos',
                  onClick: () => navigate(ROUTES.INVENTORY_MOVEMENTS),
                }}
              />
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 3: Organización */}
      <TabPanel value={currentTab} index={3}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {hasPermission(PERMISSIONS.READ_USERS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Usuarios"
                value={usersCount}
                icon={<PeopleIcon />}
                color="#5B9FED"
                neonColor={NEON_COLORS.organization}
                action={{
                  label: 'Ver usuarios',
                  onClick: () => navigate(ROUTES.USERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PRODUCTION_AREAS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Áreas de Producción"
                value={areasCount}
                icon={<BusinessIcon />}
                color="#2DD4BF"
                neonColor={NEON_COLORS.organization}
                action={{
                  label: 'Ver áreas de producción',
                  onClick: () => navigate(ROUTES.PRODUCTION_AREAS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_CARGOS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Cargos"
                value={cargosCount}
                icon={<WorkIcon />}
                color="#F472B6"
                neonColor={NEON_COLORS.organization}
                action={{
                  label: 'Ver cargos',
                  onClick: () => navigate(ROUTES.CARGOS),
                }}
              />
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 4: Seguridad */}
      <TabPanel value={currentTab} index={4}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {hasPermission(PERMISSIONS.READ_ROLES) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Roles"
                value={rolesCount}
                icon={<SecurityIcon />}
                color="#FB923C"
                neonColor={NEON_COLORS.security}
                action={{
                  label: 'Ver roles',
                  onClick: () => navigate(ROUTES.ROLES),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PERMISSIONS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Permisos"
                value={permissionsCount}
                icon={<VerifiedUserIcon />}
                color="#4ADE80"
                neonColor={NEON_COLORS.security}
                action={{
                  label: 'Ver permisos',
                  onClick: () => navigate(ROUTES.PERMISSIONS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_AUDIT_LOGS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Auditoría"
                value={auditLogsCount}
                icon={<HistoryIcon />}
                color="#A1A1AA"
                neonColor={NEON_COLORS.security}
                action={{
                  label: 'Ver logs',
                  onClick: () => navigate(ROUTES.AUDIT_LOGS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_SESSION_LOGS) && (
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Sesiones"
                value={sessionLogsCount}
                icon={<LoginIcon />}
                color="#94A3B8"
                neonColor={NEON_COLORS.security}
                action={{
                  label: 'Ver historial',
                  onClick: () => navigate(ROUTES.SESSION_LOGS),
                }}
              />
            </Grid>
          )}
        </Grid>

        {/* Acciones Rápidas - Seguridad */}
        <Box sx={{ mt: { xs: 2.5, sm: 3, md: 4 } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'text.primary', fontSize: { xs: '1rem', sm: '1.15rem', md: '1.25rem' } }}>
            Acciones Rápidas
          </Typography>
          <Grid container spacing={{ xs: 1.5, sm: 2, md: 2 }}>
            {hasPermission(PERMISSIONS.CREATE_ROLES) && (
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(ROUTES.ROLES_CREATE)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: '#FB923C',
                      color: '#FB923C',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(251, 146, 60, 0.15)',
                      background: 'rgba(251, 146, 60, 0.05)',
                    },
                  }}
                >
                  Crear Rol
                </Button>
              </Grid>
            )}
          </Grid>
        </Box>
      </TabPanel>

      {/* Tab 5: Nómina */}
      <TabPanel value={currentTab} index={5}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {hasPermission(PERMISSIONS.READ_PAYROLL_EMPLOYEES) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Empleados"
                value={payrollEmployeesCount}
                icon={<PeopleIcon />}
                color="#EC4899"
                neonColor={NEON_COLORS.payroll}
                action={{
                  label: 'Ver empleados',
                  onClick: () => navigate(ROUTES.PAYROLL_EMPLOYEES),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_PAYROLL_PERIODS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Periodos"
                value={payrollPeriodsCount}
                icon={<PendingActionsIcon />}
                color="#2EA7E0"
                neonColor={NEON_COLORS.payroll}
                action={{
                  label: 'Ver periodos',
                  onClick: () => navigate(ROUTES.PAYROLL_PERIODS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ATTENDANCE) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Asistencia"
                value={0}
                icon={<VerifiedUserIcon />}
                color="#F59E0B"
                neonColor={NEON_COLORS.payroll}
                action={{
                  label: 'Ver asistencia',
                  onClick: () => navigate(ROUTES.ATTENDANCE),
                }}
              />
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 6: Caja y Gastos */}
      <TabPanel value={currentTab} index={6}>
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {hasPermission(PERMISSIONS.READ_CASH_REGISTERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Cajas Registradoras"
                value={cashRegistersCount}
                icon={<PointOfSaleIcon />}
                color="#34D399"
                neonColor={NEON_COLORS.caja}
                action={{
                  label: 'Ver cajas',
                  onClick: () => navigate(ROUTES.CASH_REGISTERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_CASH_SESSIONS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Historial Sesiones"
                value={0}
                icon={<HistoryIcon />}
                color="#10B981"
                neonColor={NEON_COLORS.caja}
                action={{
                  label: 'Historial',
                  onClick: () => navigate(ROUTES.CASH_SESSION_HISTORY),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_EXPENSE_ORDERS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Órdenes de Gastos"
                value={expenseOrdersCount}
                icon={<RequestPageIcon />}
                color="#F43F5E"
                neonColor={NEON_COLORS.caja}
                action={{
                  label: 'Gestión',
                  onClick: () => navigate(ROUTES.EXPENSE_ORDERS),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.READ_ACCOUNTS_PAYABLE) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Cuentas por Pagar"
                value={accountsPayableCount}
                icon={<AccountBalanceIcon />}
                color="#1B7FB0"
                neonColor={NEON_COLORS.caja}
                action={{
                  label: 'Ver cuentas',
                  onClick: () => navigate(ROUTES.ACCOUNTS_PAYABLE),
                }}
              />
            </Grid>
          )}
          {hasPermission(PERMISSIONS.APPROVE_REFUNDS) && (
            <Grid item xs={12} sm={6} md={4} lg={3}>
              <StatCard
                title="Devoluciones"
                value={0}
                icon={<SyncAltIcon />}
                color="#3B82F6"
                neonColor={NEON_COLORS.caja}
                action={{
                  label: 'Gestión',
                  onClick: () => navigate(ROUTES.DASHBOARD),
                }}
              />
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 7: Financiero */}
      <TabPanel value={currentTab} index={7}>
        {hasPermission(PERMISSIONS.READ_FINANCIAL_DASHBOARD) && <FinancialDashboard />}
        {!hasPermission(PERMISSIONS.READ_FINANCIAL_DASHBOARD) && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <TrendingUpIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No tienes permisos para ver el dashboard financiero.</Typography>
          </Box>
        )}
      </TabPanel>
    </Box>
  );
};

export default DashboardPage;
