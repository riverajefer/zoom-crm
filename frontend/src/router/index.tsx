import { Suspense, type FC } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { AuthGuard, PermissionGuard } from '../components/guards';
import { MainLayout, AuthLayout } from '../components/layout';
import { PATHS } from './paths';
import { PERMISSIONS } from '../utils/constants';
import { RequireSedeGate } from '../features/sedes/components/RequireSedeGate';

// Lazy load componentes
const LoginPage = lazyWithRetry(() => import('../features/auth/pages/LoginPage'));
const DashboardPage = lazyWithRetry(() => import('../features/dashboard/pages/DashboardPage'));
const UsersListPage = lazyWithRetry(() => import('../features/users/pages/UsersListPage'));
const UserFormPage = lazyWithRetry(() => import('../features/users/pages/UserFormPage'));
const UserViewPage = lazyWithRetry(() => import('../features/users/pages/UserViewPage'));
const RolesListPage = lazyWithRetry(() => import('../features/roles/pages/RolesListPage'));
const RoleFormPage = lazyWithRetry(() => import('../features/roles/pages/RoleFormPage'));
const RolePermissionsPage = lazyWithRetry(() => import('../features/roles/pages/RolePermissionsPage'));
const PermissionsListPage = lazyWithRetry(() => import('../features/permissions/pages/PermissionsListPage'));
const PermissionFormPage = lazyWithRetry(() => import('../features/permissions/pages/PermissionFormPage'));
const AuditLogsListPage = lazyWithRetry(() => import('../features/audit-logs/pages/AuditLogsListPage'));
const ProductionAreasListPage = lazyWithRetry(() => import('../features/production-areas/pages/ProductionAreasListPage'));
const ProductionAreaFormPage = lazyWithRetry(() => import('../features/production-areas/pages/ProductionAreaFormPage'));
const ProductionAreaDetailPage = lazyWithRetry(() => import('../features/production-areas/pages/ProductionAreaDetailPage'));
const CargosListPage = lazyWithRetry(() => import('../features/cargos/pages/CargosListPage'));
const SedesAdminPage = lazyWithRetry(() => import('../features/sedes/pages/SedesAdminPage'));
const CargoFormPage = lazyWithRetry(() => import('../features/cargos/pages/CargoFormPage'));
const CargoDetailPage = lazyWithRetry(() => import('../features/cargos/pages/CargoDetailPage'));
const ClientsListPage = lazyWithRetry(() => import('../features/clients/pages/ClientsListPage'));
const ClientFormPage = lazyWithRetry(() => import('../features/clients/pages/ClientFormPage'));
const ClientDetailPage = lazyWithRetry(() => import('../features/clients/pages/ClientDetailPage'));
const SuppliersListPage = lazyWithRetry(() => import('../features/suppliers/pages/SuppliersListPage'));
const SupplierFormPage = lazyWithRetry(() => import('../features/suppliers/pages/SupplierFormPage'));
const SupplierDetailPage = lazyWithRetry(() => import('../features/suppliers/pages/SupplierDetailPage'));
const SessionLogsPage = lazyWithRetry(() => import('../features/session-logs/pages/SessionLogsPage'));
const AttendancePage = lazyWithRetry(() => import('../features/attendance/pages/AttendancePage'));
const MyAttendancePage = lazyWithRetry(() => import('../features/attendance/pages/MyAttendancePage'));
const ProfilePage = lazyWithRetry(() => import('../features/settings/pages/ProfilePage'));
// Portfolio - Units of Measure
const UnitsOfMeasureListPage = lazyWithRetry(() => import('../features/portfolio/units-of-measure/pages/UnitsOfMeasureListPage'));
const UnitOfMeasureFormPage = lazyWithRetry(() => import('../features/portfolio/units-of-measure/pages/UnitOfMeasureFormPage'));
// Portfolio - Product Categories
const ProductCategoriesListPage = lazyWithRetry(() => import('../features/portfolio/product-categories/pages/ProductCategoriesListPage'));
const ProductCategoryFormPage = lazyWithRetry(() => import('../features/portfolio/product-categories/pages/ProductCategoryFormPage'));
// Portfolio - Products
const ProductsListPage = lazyWithRetry(() => import('../features/portfolio/products/pages/ProductsListPage'));
const ProductFormPage = lazyWithRetry(() => import('../features/portfolio/products/pages/ProductFormPage'));
// Portfolio - Supply Categories
const SupplyCategoriesListPage = lazyWithRetry(() => import('../features/portfolio/supply-categories/pages/SupplyCategoriesListPage'));
const SupplyCategoryFormPage = lazyWithRetry(() => import('../features/portfolio/supply-categories/pages/SupplyCategoryFormPage'));
// Portfolio - Supplies
const SuppliesListPage = lazyWithRetry(() => import('../features/portfolio/supplies/pages/SuppliesListPage'));
const SupplyFormPage = lazyWithRetry(() => import('../features/portfolio/supplies/pages/SupplyFormPage'));
// Orders
const OrdersListPage = lazyWithRetry(() => import('../features/orders/pages/OrdersListPage'));
const OrderFormPage = lazyWithRetry(() => import('../features/orders/pages/OrderFormPage'));
const OrderDetailRoute = lazyWithRetry(() => import('../features/orders/pages/OrderDetailRoute'));
const PendingPaymentOrdersPage = lazyWithRetry(() => import('../features/orders/pages/PendingPaymentOrdersPage'));
const StatusChangeRequestsPage = lazyWithRetry(() => import('../features/orders/pages/StatusChangeRequestsPage'));
const ProfitabilityPage = lazyWithRetry(() => import('../features/orders/pages/ProfitabilityPage'));
// Commercial Channels
const CommercialChannelsListPage = lazyWithRetry(() => import('../features/commercial-channels/pages/CommercialChannelsListPage'));
const CommercialChannelFormPage = lazyWithRetry(() => import('../features/commercial-channels/pages/CommercialChannelFormPage'));
const CommercialChannelDetailPage = lazyWithRetry(() => import('../features/commercial-channels/pages/CommercialChannelDetailPage'));
// Quotes
const ProspectsListPage = lazyWithRetry(() =>
  import('../features/prospects/pages/ProspectsListPage').then((m) => ({
    default: m.ProspectsListPage,
  })),
);
const ProspectMetricsPage = lazyWithRetry(() =>
  import('../features/prospects/pages/ProspectMetricsPage').then((m) => ({
    default: m.ProspectMetricsPage,
  })),
);
const QuotesListPage = lazyWithRetry(() => import('../features/quotes/pages/QuotesListPage'));
const QuoteFormPage = lazyWithRetry(() => import('../features/quotes/pages/QuoteFormPage'));
const QuoteDetailRoute = lazyWithRetry(() => import('../features/quotes/pages/QuoteDetailRoute'));
const NotificationsPage = lazyWithRetry(() => import('../features/notifications/pages/NotificationsPage'));
const CompanyPage = lazyWithRetry(() => import('../features/company/pages/CompanyPage'));
// Work Orders
const WorkOrdersListPage = lazyWithRetry(() => import('../features/work-orders/pages/WorkOrdersListPage'));
const WorkOrderFormPage = lazyWithRetry(() => import('../features/work-orders/pages/WorkOrderFormPage'));
const WorkOrderDetailRoute = lazyWithRetry(() => import('../features/work-orders/pages/WorkOrderDetailRoute'));
// Expense Types & Subcategories
const ExpenseTypesListPage = lazyWithRetry(() => import('../features/expense-types/pages/ExpenseTypesListPage'));
const ExpenseTypeFormPage = lazyWithRetry(() => import('../features/expense-types/pages/ExpenseTypeFormPage'));
const ExpenseSubcategoriesListPage = lazyWithRetry(() => import('../features/expense-types/pages/ExpenseSubcategoriesListPage'));
const ExpenseSubcategoryFormPage = lazyWithRetry(() => import('../features/expense-types/pages/ExpenseSubcategoryFormPage'));
// Expense Orders
const ExpenseOrdersListPage = lazyWithRetry(() => import('../features/expense-orders/pages/ExpenseOrdersListPage'));
const ExpenseOrderFormPage = lazyWithRetry(() => import('../features/expense-orders/pages/ExpenseOrderFormPage'));
const ExpenseOrderDetailPage = lazyWithRetry(() => import('../features/expense-orders/pages/ExpenseOrderDetailPage'));
// Order Timeline
const OrderFlowPage = lazyWithRetry(() => import('../features/order-timeline/pages/OrderFlowPage'));
// Payroll
const PayrollEmployeesListPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollEmployeesListPage'));
const PayrollEmployeeFormPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollEmployeeFormPage'));
const PayrollPeriodsListPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollPeriodsListPage'));
const PayrollDeductionsPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollDeductionsPage'));
const PayrollPeriodFormPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollPeriodFormPage'));
const PayrollPeriodDetailPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollPeriodDetailPage'));
const PayrollItemFormPage = lazyWithRetry(() => import('../features/payroll/pages/PayrollItemFormPage'));
const EmployeePayrollHistoryPage = lazyWithRetry(() => import('../features/payroll/pages/EmployeePayrollHistoryPage'));
const ChangePasswordPage = lazyWithRetry(() => import('../features/auth/pages/ChangePasswordPage'));
// Inventory - Movimientos de Inventario
const InventoryMovementsListPage = lazyWithRetry(() => import('../features/inventory/pages/InventoryMovementsListPage'));
const InventoryMovementFormPage = lazyWithRetry(() => import('../features/inventory/pages/InventoryMovementFormPage'));
const LowStockAlertsPage = lazyWithRetry(() => import('../features/inventory/pages/LowStockAlertsPage'));
// Production Module
const ProductTemplatesListPage = lazyWithRetry(() => import('../features/production/pages/ProductTemplatesListPage'));
const ProductTemplateDetailPage = lazyWithRetry(() => import('../features/production/pages/ProductTemplateDetailPage'));
const ProductTemplateFormPage = lazyWithRetry(() => import('../features/production/pages/ProductTemplateFormPage'));
const ProductionOrdersListPage = lazyWithRetry(() => import('../features/production/pages/ProductionOrdersListPage'));
const ProductionOrderDetailPage = lazyWithRetry(() => import('../features/production/pages/ProductionOrderDetailPage'));
const ProductionOrderFormPage = lazyWithRetry(() => import('../features/production/pages/ProductionOrderFormPage'));
const StepDefinitionsListPage = lazyWithRetry(() => import('../features/production/pages/StepDefinitionsListPage'));
const FormBuilderPage = lazyWithRetry(() => import('../features/production/pages/FormBuilderPage'));
// Cash Register (POS)
const CashRegistersListPage = lazyWithRetry(() => import('../features/cash-register/pages/CashRegistersListPage'));
const OpenSessionPage = lazyWithRetry(() => import('../features/cash-register/pages/OpenSessionPage'));
const ActiveSessionRedirectPage = lazyWithRetry(() => import('../features/cash-register/pages/ActiveSessionRedirectPage'));
const ActiveSessionPage = lazyWithRetry(() => import('../features/cash-register/pages/ActiveSessionPage'));
const CloseSessionPage = lazyWithRetry(() => import('../features/cash-register/pages/CloseSessionPage'));
const SessionHistoryPage = lazyWithRetry(() => import('../features/cash-register/pages/SessionHistoryPage'));
const SessionDetailPage = lazyWithRetry(() => import('../features/cash-register/pages/SessionDetailPage'));

const AccountsPayableListPage = lazyWithRetry(() => import('../features/accounts-payable/pages/AccountsPayableListPage'));
const AccountsPayableDetailPage = lazyWithRetry(() => import('../features/accounts-payable/pages/AccountsPayableDetailPage'));
const AccountsPayableFormPage = lazyWithRetry(() => import('../features/accounts-payable/pages/AccountsPayableFormPage'));

const DtfListPage = lazyWithRetry(() => import('../features/dtf/pages/DtfListPage'));
const DtfFormPage = lazyWithRetry(() => import('../features/dtf/pages/DtfFormPage'));
const DtfDetailPage = lazyWithRetry(() => import('../features/dtf/pages/DtfDetailPage'));
const DtfEditPage = lazyWithRetry(() => import('../features/dtf/pages/DtfEditPage'));
// Approval Redirect
const ApprovalRedirectPage = lazyWithRetry(() => import('../features/approvals/pages/ApprovalRedirectPage'));
// Ventas por Asesor
const SalesByAdvisorPage = lazyWithRetry(() => import('../features/orders/pages/SalesByAdvisorPage'));
const AdvisorDetailPage = lazyWithRetry(() => import('../features/orders/pages/AdvisorDetailPage'));

const RoutesConfig: FC = () => {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <Routes>
        {/* Auth Routes */}
        <Route
          path={PATHS.LOGIN}
          element={
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          }
        />
        <Route
          path={PATHS.CHANGE_PASSWORD}
          element={
            <AuthGuard>
              <AuthLayout>
                <ChangePasswordPage />
              </AuthLayout>
            </AuthGuard>
          }
        />

        {/* Protected Routes */}
        <Route
          path={PATHS.DASHBOARD}
          element={
            <AuthGuard>
              <MainLayout>
                <DashboardPage />
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Users Routes */}
        <Route
          path={PATHS.USERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_USERS}>
                  <UsersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.USERS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_USERS}>
                  <UserFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.USERS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_USERS}>
                  <UserFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.USERS_VIEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_USERS}>
                  <UserViewPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Roles Routes */}
        <Route
          path={PATHS.ROLES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ROLES}>
                  <RolesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ROLES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_ROLES}>
                  <RoleFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ROLES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_ROLES}>
                  <RoleFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ROLES_PERMISSIONS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_ROLES}>
                  <RolePermissionsPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Permissions Routes */}
        <Route
          path={PATHS.PERMISSIONS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PERMISSIONS}>
                  <PermissionsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PERMISSIONS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PERMISSIONS}>
                  <PermissionFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PERMISSIONS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PERMISSIONS}>
                  <PermissionFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Production Areas Routes */}
        <Route
          path={PATHS.PRODUCTION_AREAS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCTION_AREAS}>
                  <ProductionAreasListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTION_AREAS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PRODUCTION_AREAS}>
                  <ProductionAreaFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTION_AREAS_VIEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCTION_AREAS}>
                  <ProductionAreaDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTION_AREAS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PRODUCTION_AREAS}>
                  <ProductionAreaFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Sedes: solo soporte, fuera del menú (docs/PLAN_SEDES.md §6.4) */}
        <Route
          path={PATHS.SEDES_ADMIN}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.MANAGE_LOCATIONS}>
                  <SedesAdminPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Cargos Routes */}
        <Route
          path={PATHS.CARGOS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CARGOS}>
                  <CargosListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CARGOS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_CARGOS}>
                  <CargoFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CARGOS_VIEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CARGOS}>
                  <CargoDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CARGOS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_CARGOS}>
                  <CargoFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Clients Routes */}
        <Route
          path={PATHS.CLIENTS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={[PERMISSIONS.BROWSE_CLIENTS, PERMISSIONS.SEARCH_CLIENTS, PERMISSIONS.CREATE_CLIENTS]}>
                  <ClientsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CLIENTS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_CLIENTS}>
                  <ClientFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CLIENTS_VIEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CLIENTS}>
                  <ClientDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CLIENTS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_CLIENTS}>
                  <ClientFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Suppliers Routes */}
        <Route
          path={PATHS.SUPPLIERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SUPPLIERS}>
                  <SuppliersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLIERS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_SUPPLIERS}>
                  <SupplierFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLIERS_VIEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SUPPLIERS}>
                  <SupplierDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLIERS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_SUPPLIERS}>
                  <SupplierFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Units of Measure Routes */}
        <Route
          path={PATHS.UNITS_OF_MEASURE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_UNITS_OF_MEASURE}>
                  <UnitsOfMeasureListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.UNITS_OF_MEASURE_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_UNITS_OF_MEASURE}>
                  <UnitOfMeasureFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.UNITS_OF_MEASURE_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_UNITS_OF_MEASURE}>
                  <UnitOfMeasureFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Product Categories Routes */}
        <Route
          path={PATHS.PRODUCT_CATEGORIES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCT_CATEGORIES}>
                  <ProductCategoriesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCT_CATEGORIES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PRODUCT_CATEGORIES}>
                  <ProductCategoryFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCT_CATEGORIES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PRODUCT_CATEGORIES}>
                  <ProductCategoryFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Products Routes */}
        <Route
          path={PATHS.PRODUCTS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCTS}>
                  <ProductsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PRODUCTS}>
                  <ProductFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PRODUCTS}>
                  <ProductFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Supply Categories Routes */}
        <Route
          path={PATHS.SUPPLY_CATEGORIES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SUPPLY_CATEGORIES}>
                  <SupplyCategoriesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLY_CATEGORIES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_SUPPLY_CATEGORIES}>
                  <SupplyCategoryFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLY_CATEGORIES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_SUPPLY_CATEGORIES}>
                  <SupplyCategoryFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Supplies Routes */}
        <Route
          path={PATHS.SUPPLIES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SUPPLIES}>
                  <SuppliesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLIES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_SUPPLIES}>
                  <SupplyFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SUPPLIES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_SUPPLIES}>
                  <SupplyFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Orders Routes */}
        <Route
          path={PATHS.ORDERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ORDERS}>
                  <OrdersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ORDERS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_ORDERS}>
                  <RequireSedeGate>
                    <OrderFormPage />
                  </RequireSedeGate>
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ORDERS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_ORDERS}>
                  <OrderFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ORDERS_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ORDERS}>
                  <OrderDetailRoute />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Order Timeline Routes */}
        <Route
          path={PATHS.ORDER_FLOW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ORDERS}>
                  <OrderFlowPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ORDER_FLOW_BASE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ORDERS}>
                  <OrderFlowPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Sales Pipeline Routes */}
        {/* /prospects/metrics va antes que /prospects para no ser capturada */}
        <Route
          path={PATHS.PROSPECT_METRICS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PROSPECT_METRICS}>
                  <ProspectMetricsPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PROSPECTS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PROSPECTS}>
                  <ProspectsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Quotes Routes */}
        <Route
          path={PATHS.QUOTES}
          element={
            <AuthGuard>
              <MainLayout>
                <QuotesListPage />
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.QUOTES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <RequireSedeGate>
                  <QuoteFormPage />
                </RequireSedeGate>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.QUOTES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <QuoteFormPage />
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.QUOTES_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <QuoteDetailRoute />
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Commercial Channels Routes */}
        <Route
          path={PATHS.COMMERCIAL_CHANNELS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_COMMERCIAL_CHANNELS}>
                  <CommercialChannelsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.COMMERCIAL_CHANNELS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_COMMERCIAL_CHANNELS}>
                  <CommercialChannelFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.COMMERCIAL_CHANNELS_VIEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_COMMERCIAL_CHANNELS}>
                  <CommercialChannelDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.COMMERCIAL_CHANNELS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_COMMERCIAL_CHANNELS}>
                  <CommercialChannelFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Audit Logs Routes */}
        <Route
          path={PATHS.AUDIT_LOGS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_AUDIT_LOGS}>
                  <AuditLogsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        <Route
          path={PATHS.SESSION_LOGS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SESSION_LOGS}>
                  <SessionLogsPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Mi Asistencia - Vista personal */}
        <Route
          path={PATHS.MY_ATTENDANCE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.USE_ATTENDANCE}>
                  <MyAttendancePage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Attendance - Control de Asistencia */}
        <Route
          path={PATHS.ATTENDANCE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ATTENDANCE}>
                  <AttendancePage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Inventory - Movimientos de Inventario */}
        <Route
          path={PATHS.INVENTORY_MOVEMENTS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_INVENTORY_MOVEMENTS}>
                  <InventoryMovementsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.INVENTORY_MOVEMENTS_NEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_INVENTORY_MOVEMENTS}>
                  <InventoryMovementFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.INVENTORY_LOW_STOCK}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_INVENTORY_MOVEMENTS}>
                  <LowStockAlertsPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Notifications Routes */}
        <Route
          path={PATHS.NOTIFICATIONS}
          element={
            <AuthGuard>
              <MainLayout>
                <NotificationsPage />
              </MainLayout>
            </AuthGuard>
          }
        />
        {/* Pending Payment Orders */}
        <Route
          path={PATHS.PENDING_PAYMENT_ORDERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ORDERS}>
                  <PendingPaymentOrdersPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        {/* Status Change Requests */}
        <Route
          path={PATHS.STATUS_CHANGE_REQUESTS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={[PERMISSIONS.APPROVE_ORDERS, PERMISSIONS.APPROVE_ADVANCE_PAYMENTS, PERMISSIONS.APPROVE_CLIENT_OWNERSHIP_AUTH, PERMISSIONS.APPROVE_EXPENSE_ORDERS, PERMISSIONS.APPROVE_CASH_MOVEMENTS]}>
                  <StatusChangeRequestsPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        {/* Profitability */}
        <Route
          path={PATHS.ORDERS_PROFITABILITY}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ORDERS}>
                  <ProfitabilityPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Company Route */}
        <Route
          path={PATHS.COMPANY}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_COMPANY}>
                  <CompanyPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Work Orders Routes */}
        <Route
          path={PATHS.WORK_ORDERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_WORK_ORDERS}>
                  <WorkOrdersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.WORK_ORDERS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_WORK_ORDERS}>
                  <WorkOrderFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.WORK_ORDERS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_WORK_ORDERS}>
                  <WorkOrderFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.WORK_ORDERS_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_WORK_ORDERS}>
                  <WorkOrderDetailRoute />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Expense Types Routes */}
        <Route
          path={PATHS.EXPENSE_TYPES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_EXPENSE_TYPES}>
                  <ExpenseTypesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_TYPES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_EXPENSE_TYPES}>
                  <ExpenseTypeFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_TYPES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_EXPENSE_TYPES}>
                  <ExpenseTypeFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Expense Subcategories Routes */}
        <Route
          path={PATHS.EXPENSE_SUBCATEGORIES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_EXPENSE_TYPES}>
                  <ExpenseSubcategoriesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_SUBCATEGORIES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_EXPENSE_TYPES}>
                  <ExpenseSubcategoryFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_SUBCATEGORIES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_EXPENSE_TYPES}>
                  <ExpenseSubcategoryFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Expense Orders Routes */}
        <Route
          path={PATHS.EXPENSE_ORDERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_EXPENSE_ORDERS}>
                  <ExpenseOrdersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_ORDERS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_EXPENSE_ORDERS}>
                  <RequireSedeGate>
                    <ExpenseOrderFormPage />
                  </RequireSedeGate>
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_ORDERS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_EXPENSE_ORDERS}>
                  <ExpenseOrderFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.EXPENSE_ORDERS_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_EXPENSE_ORDERS}>
                  <ExpenseOrderDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Payroll Routes */}
        <Route
          path={PATHS.PAYROLL_EMPLOYEES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PAYROLL_EMPLOYEES}>
                  <PayrollEmployeesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_EMPLOYEES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PAYROLL_EMPLOYEES}>
                  <PayrollEmployeeFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_EMPLOYEES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PAYROLL_EMPLOYEES}>
                  <PayrollEmployeeFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_EMPLOYEES_HISTORY}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PAYROLL_EMPLOYEES}>
                  <EmployeePayrollHistoryPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_PERIODS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PAYROLL_PERIODS}>
                  <PayrollPeriodsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_DEDUCTIONS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PAYROLL_DEDUCTIONS}>
                  <PayrollDeductionsPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_PERIODS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PAYROLL_PERIODS}>
                  <PayrollPeriodFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_PERIODS_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PAYROLL_PERIODS}>
                  <PayrollPeriodFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_PERIODS_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PAYROLL_PERIODS}>
                  <PayrollPeriodDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PAYROLL_ITEM_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PAYROLL_PERIODS}>
                  <PayrollItemFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Settings Routes */}
        <Route
          path={PATHS.PROFILE}
          element={
            <AuthGuard>
              <MainLayout>
                <ProfilePage />
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.SETTINGS}
          element={<Navigate to={PATHS.PROFILE} replace />}
        />

        {/* Production Module Routes */}
        <Route
          path={PATHS.PRODUCT_TEMPLATES}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCT_TEMPLATES}>
                  <ProductTemplatesListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCT_TEMPLATES_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PRODUCT_TEMPLATES}>
                  <ProductTemplateFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCT_TEMPLATES_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_PRODUCT_TEMPLATES}>
                  <ProductTemplateFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCT_TEMPLATES_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCT_TEMPLATES}>
                  <ProductTemplateDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTION_ORDERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCTION_ORDERS}>
                  <ProductionOrdersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTION_ORDERS_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_PRODUCTION_ORDERS}>
                  <ProductionOrderFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.PRODUCTION_ORDERS_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_PRODUCTION_ORDERS}>
                  <ProductionOrderDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Step Definitions & Form Builder Routes */}
        <Route
          path={PATHS.STEP_DEFINITIONS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_STEP_DEFINITIONS}>
                  <StepDefinitionsListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.STEP_DEFINITIONS_BUILDER}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_STEP_DEFINITIONS}>
                  <FormBuilderPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Cash Register (POS) Routes */}
        <Route
          path={PATHS.CASH_REGISTERS}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CASH_REGISTERS}>
                  <CashRegistersListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CASH_SESSION_OPEN}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.OPEN_CASH_SESSION}>
                  <OpenSessionPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CASH_SESSION_ACTIVE_BASE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CASH_SESSIONS}>
                  <ActiveSessionRedirectPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CASH_SESSION_ACTIVE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CASH_SESSIONS}>
                  <ActiveSessionPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CASH_SESSION_CLOSE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CLOSE_CASH_SESSION}>
                  <CloseSessionPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CASH_SESSION_HISTORY}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CASH_SESSIONS}>
                  <SessionHistoryPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.CASH_SESSION_HISTORY_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_CASH_SESSIONS}>
                  <SessionDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Accounts Payable Routes */}
        <Route
          path={PATHS.ACCOUNTS_PAYABLE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ACCOUNTS_PAYABLE}>
                  <AccountsPayableListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ACCOUNTS_PAYABLE_NEW}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_ACCOUNTS_PAYABLE}>
                  <RequireSedeGate>
                    <AccountsPayableFormPage />
                  </RequireSedeGate>
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ACCOUNTS_PAYABLE_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_ACCOUNTS_PAYABLE}>
                  <AccountsPayableDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.ACCOUNTS_PAYABLE_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_ACCOUNTS_PAYABLE}>
                  <AccountsPayableFormPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* DTF Routes */}
        <Route
          path={PATHS.DTF}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_DTF}>
                  <DtfListPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.DTF_CREATE}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.CREATE_DTF}>
                  <RequireSedeGate>
                    <DtfFormPage />
                  </RequireSedeGate>
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.DTF_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_DTF}>
                  <DtfDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path={PATHS.DTF_EDIT}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.UPDATE_DTF}>
                  <DtfEditPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Approval Redirect (WhatsApp CTA) */}
        <Route
          path={PATHS.APPROVAL_REDIRECT}
          element={
            <AuthGuard>
              <ApprovalRedirectPage />
            </AuthGuard>
          }
        />

        {/* Ventas por Asesor */}
        <Route
          path={PATHS.SALES_BY_ADVISOR}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SALES_BY_ADVISOR}>
                  <SalesByAdvisorPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        <Route
          path={PATHS.SALES_BY_ADVISOR_DETAIL}
          element={
            <AuthGuard>
              <MainLayout>
                <PermissionGuard permission={PERMISSIONS.READ_SALES_BY_ADVISOR}>
                  <AdvisorDetailPage />
                </PermissionGuard>
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Default and Error Routes */}
        <Route path="/" element={<Navigate to={PATHS.DASHBOARD} replace />} />
        <Route path={PATHS.NOT_FOUND} element={<Navigate to={PATHS.DASHBOARD} replace />} />
        <Route path={PATHS.UNAUTHORIZED} element={<Navigate to={PATHS.DASHBOARD} replace />} />
        <Route path="*" element={<Navigate to={PATHS.DASHBOARD} replace />} />
      </Routes>
    </Suspense>
  );
};

export default RoutesConfig;
