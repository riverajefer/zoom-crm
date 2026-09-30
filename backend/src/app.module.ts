import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { buildLoggerConfig } from './common/logger/logger.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CustomThrottlerGuard } from './common/guards';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { SessionLogsModule } from './modules/session-logs/session-logs.module';
import { CargosModule } from './modules/cargos/cargos.module';
import { SedesModule } from './modules/sedes/sedes.module';
import { LocationSupportsModule } from './modules/location-supports/location-supports.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ClientsModule } from './modules/clients/clients.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { UnitsOfMeasureModule } from './modules/portfolio/units-of-measure/units-of-measure.module';
import { ProductCategoriesModule } from './modules/portfolio/product-categories/product-categories.module';
import { ProductsModule } from './modules/portfolio/products/products.module';
import { SupplyCategoriesModule } from './modules/portfolio/supply-categories/supply-categories.module';
import { SuppliesModule } from './modules/portfolio/supplies/supplies.module';
import { ConsecutivesModule } from './modules/consecutives/consecutives.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductionAreasModule } from './modules/production-areas/production-areas.module';
import { CommercialChannelsModule } from './modules/commercial-channels/commercial-channels.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrderEditRequestsModule } from './modules/order-edit-requests/order-edit-requests.module';
import { OrderStatusChangeRequestsModule } from './modules/order-status-change-requests/order-status-change-requests.module';
import { AdvisorChangeRequestsModule } from './modules/advisor-change-requests/advisor-change-requests.module';
import { QuoteRestoreRequestsModule } from './modules/quote-restore-requests/quote-restore-requests.module';
import { ExpenseOrderAuthRequestsModule } from './modules/expense-order-auth-requests/expense-order-auth-requests.module';
import { AdvancePaymentApprovalsModule } from './modules/advance-payment-approvals/advance-payment-approvals.module';
import { PaymentEditApprovalsModule } from './modules/payment-edit-approvals/payment-edit-approvals.module';
import { DiscountApprovalsModule } from './modules/discount-approvals/discount-approvals.module';
import { ClientOwnershipAuthRequestsModule } from './modules/client-ownership-auth-requests/client-ownership-auth-requests.module';
import { ClientAdvisorRequestsModule } from './modules/client-advisor-requests/client-advisor-requests.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { ProspectsModule } from './modules/prospects/prospects.module';
import { QuoteKanbanColumnsModule } from './modules/quote-kanban-columns/quote-kanban-columns.module';
import { StorageModule } from './modules/storage/storage.module';
import { CompanyModule } from './modules/company/company.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { ExpenseTypesModule } from './modules/expense-types/expense-types.module';
import { ExpenseOrdersModule } from './modules/expense-orders/expense-orders.module';
import { OrderTimelineModule } from './modules/order-timeline/order-timeline.module';
import { AuditContextInterceptor } from './common/interceptors/audit-context.interceptor';
import { LocationContextInterceptor } from './common/interceptors/location-context.interceptor';
import { HeartbeatInterceptor } from './common/interceptors/heartbeat.interceptor';
import { MaintenanceMiddleware } from './common/middleware/maintenance.middleware';
import { AuditContextMiddleware } from './common/middleware/audit-context.middleware';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { HealthModule } from './health/health.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PayrollDeductionsModule } from './modules/payroll-deductions/payroll-deductions.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ApprovalExpiryModule } from './modules/approval-expiry/approval-expiry.module';
import { ProductionModule } from './modules/production/production.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CashRegisterModule } from './modules/cash-register/cash-register.module';
import { CashSessionModule } from './modules/cash-session/cash-session.module';
import { CashMovementModule } from './modules/cash-movement/cash-movement.module';
import { CashMovementVoidRequestsModule } from './modules/cash-movement-void-requests/cash-movement-void-requests.module';
import { RefundRequestsModule } from './modules/refund-requests/refund-requests.module';
import { WsEventsModule } from './modules/ws-events/ws-events.module';
import { AccountsPayableModule } from './modules/accounts-payable/accounts-payable.module';
import { AccountsPayableAuthRequestsModule } from './modules/accounts-payable-auth-requests/accounts-payable-auth-requests.module';
import { AccountsPayablePaymentAuthRequestsModule } from './modules/accounts-payable-payment-auth-requests/accounts-payable-payment-auth-requests.module';
import { AccountsPayablePaymentReversalRequestsModule } from './modules/accounts-payable-payment-reversal-requests/accounts-payable-payment-reversal-requests.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DtfModule } from './modules/dtf/dtf.module';
import { ClientErrorsModule } from './modules/client-errors/client-errors.module';

@Module({
  imports: [
    // Logging estructurado (nestjs-pino) — push a Grafana Cloud Loki en staging/prod
    LoggerModule.forRootAsync({
      useFactory: buildLoggerConfig,
    }),
    // Rate limiting global
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,   // ventana de 1 minuto
        limit: 120,    // 120 requests por minuto por IP
      },
    ]),
    // Health check (sin prefijo /api/v1, siempre disponible)
    HealthModule,
    // Configuración centralizada
    ConfigModule,
    // Cron Jobs
    ScheduleModule.forRoot(),
    // Base de datos
    DatabaseModule,
    // Módulos de la aplicación
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AuditLogsModule,
    SessionLogsModule,
    CargosModule,
    SedesModule,
    LocationSupportsModule,
    // Módulos de ubicaciones, clientes y proveedores
    LocationsModule,
    ClientsModule,
    SuppliersModule,
    // Módulo de Portfolio (Catálogos de Productos e Insumos)
    UnitsOfMeasureModule,
    ProductCategoriesModule,
    ProductsModule,
    SupplyCategoriesModule,
    SuppliesModule,
    // Módulo de Consecutivos (Sistema de numeración automática)
    ConsecutivesModule,
    // Módulo de Cotizaciones
    QuotesModule,
    // Módulo de Pipeline de Ventas (Prospectos)
    ProspectsModule,
    // Módulo de Columnas del Tablero Kanban de Cotizaciones
    QuoteKanbanColumnsModule,
    // Módulo de Órdenes de Pedido
    OrdersModule,
    // Módulo de Áreas de Producción
    ProductionAreasModule,
    // Módulo de Canales de Venta
    CommercialChannelsModule,
    // Módulo de Notificaciones
    NotificationsModule,
    // Módulo de WhatsApp Cloud API (global)
    WhatsappModule,
    // Módulo de Solicitudes de Edición de Órdenes
    OrderEditRequestsModule,
    // Módulo de Solicitudes de Cambio de Estado de Órdenes
    OrderStatusChangeRequestsModule,
    AdvisorChangeRequestsModule,
    QuoteRestoreRequestsModule,
    // Módulo de Almacenamiento (AWS S3)
    StorageModule,
    // Módulo de Información de la Compañía
    CompanyModule,
    // Módulo de Órdenes de Trabajo
    WorkOrdersModule,
    // Módulo de Tipos de Gasto
    ExpenseTypesModule,
    // Módulo de Órdenes de Gastos
    ExpenseOrdersModule,
    // Módulo de Solicitudes de Autorización de Órdenes de Gasto
    ExpenseOrderAuthRequestsModule,
    // Módulo de Aprobación de Anticipos
    AdvancePaymentApprovalsModule,
    PaymentEditApprovalsModule,
    // Módulo de Aprobación de Descuentos
    DiscountApprovalsModule,
    // Módulo de Solicitudes de Devolución de Dinero al Cliente
    RefundRequestsModule,
    // Módulo de Autorización de Propiedad de Cliente
    ClientOwnershipAuthRequestsModule,
    ClientAdvisorRequestsModule,
    // Módulo de Trazabilidad de Órdenes
    OrderTimelineModule,
    // Módulo de Nómina
    PayrollModule,
    PayrollDeductionsModule,
    // Módulo de Control de Asistencia y Tiempo
    AttendanceModule,
    // Módulo de Inventario y Movimientos de Insumos
    InventoryModule,
    ApprovalExpiryModule,
    // Módulo de Producción — Plantillas y Órdenes de Producción
    ProductionModule,
    // Módulo de Comentarios Polimórficos (COT / OP / OT)
    CommentsModule,
    // Módulo de Caja Registradora (POS)
    CashRegisterModule,
    CashSessionModule,
    CashMovementModule,
    CashMovementVoidRequestsModule,
    // Módulo de Cuentas por Pagar
    AccountsPayableModule,
    AccountsPayableAuthRequestsModule,
    AccountsPayablePaymentAuthRequestsModule,
    AccountsPayablePaymentReversalRequestsModule,
    // Módulo de Dashboard (métricas financieras)
    DashboardModule,
    // Módulo de WebSocket Events (tiempo real)
    WsEventsModule,
    // Módulo DTF
    DtfModule,
    // Recepción de errores de JavaScript del frontend (van al log estructurado)
    ClientErrorsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HeartbeatInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LocationContextInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuditContextMiddleware, MaintenanceMiddleware)
      .forRoutes('*');
  }
}
