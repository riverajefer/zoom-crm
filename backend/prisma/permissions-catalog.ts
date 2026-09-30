/**
 * Catálogo de permisos publicados después del seed original.
 *
 * Vive aparte para que lo usen los dos: `sync-permissions.ts` (el script
 * canónico para publicar permisos en staging y producción) y `seed.ts`. Antes
 * solo lo tenía `sync-permissions`, así que una base recién creada quedaba sin
 * ellos: `read_orders_dashboard` faltaba y el mini dashboard de órdenes
 * respondía 403 a todos, incluido el admin.
 *
 * Cada permiso nuevo del código (`@RequirePermissions(...)` en el backend y
 * `PERMISSIONS` en `frontend/src/utils/constants.ts`) se agrega aquí, en el
 * grupo temático que corresponda.
 */
export interface PermissionGroup {
  label: string;
  permissions: { name: string; description: string }[];
}

export const permissionGroups: PermissionGroup[] = [
  {
    label: '📤 Exportación a Excel',
    permissions: [
      { name: 'export_clients', description: 'Exportar clientes a Excel' },
      { name: 'export_quotes', description: 'Exportar cotizaciones a Excel' },
      { name: 'export_orders', description: 'Exportar órdenes de pedido a Excel' },
      {
        name: 'export_work_orders',
        description: 'Exportar órdenes de trabajo a Excel',
      },
      {
        name: 'export_expense_orders',
        description: 'Exportar órdenes de gasto a Excel',
      },
      {
        name: 'export_accounts_payable',
        description: 'Exportar cuentas por pagar a Excel',
      },
      {
        name: 'export_pending_payment_orders',
        description: 'Exportar órdenes pendientes por cobrar a Excel',
      },
      {
        name: 'export_profitability',
        description: 'Exportar rentabilidad por orden a Excel',
      },
      {
        name: 'export_sales_by_advisor',
        description: 'Exportar ventas por asesor a Excel',
      },
      { name: 'export_dtf', description: 'Exportar registros DTF a Excel' },
    ],
  },
  {
    label: '📈 Pipeline de Ventas (Prospectos)',
    permissions: [
      { name: 'create_prospects', description: 'Crear prospectos' },
      { name: 'read_prospects', description: 'Ver prospectos' },
      {
        name: 'read_all_prospects',
        description: 'Ver los prospectos de todas las vendedoras (no solo los propios)',
      },
      {
        name: 'update_prospects',
        description: 'Actualizar prospectos y registrar contactos',
      },
      { name: 'delete_prospects', description: 'Eliminar prospectos' },
      {
        name: 'convert_prospects',
        description: 'Convertir prospectos a cotización u orden',
      },
      { name: 'export_prospects', description: 'Exportar prospectos a Excel' },
      {
        name: 'read_prospect_metrics',
        description: 'Ver métricas del pipeline de ventas por vendedora',
      },
    ],
  },
  {
    label: '🔄 Cambio de asesor de órdenes',
    permissions: [
      {
        name: 'request_advisor_change',
        description: 'Solicitar el cambio de asesor de una orden de pedido',
      },
      {
        name: 'approve_advisor_change',
        description: 'Aprobar/rechazar solicitudes de cambio de asesor de órdenes',
      },
    ],
  },
  {
    label: '♻️ Restauración de cotizaciones rechazadas',
    permissions: [
      {
        name: 'request_quote_restore',
        description: 'Solicitar la restauración de una cotización rechazada',
      },
      {
        name: 'approve_quote_restore',
        description: 'Aprobar/rechazar la restauración de cotizaciones rechazadas',
      },
    ],
  },
  {
    label: '👥 Asignación de asesor a cliente',
    permissions: [
      {
        name: 'request_client_advisor',
        description: 'Solicitar la asignación de un asesor a un cliente',
      },
      {
        name: 'approve_client_advisor',
        description: 'Aprobar/rechazar solicitudes de asignación de asesor a cliente',
      },
    ],
  },
  {
    label: '💳 Pagos de órdenes',
    permissions: [
      {
        name: 'edit_order_payments',
        description: 'Solicitar edición de un pago en una orden',
      },
      {
        name: 'approve_payment_edits',
        description:
          'Aprobar/rechazar ediciones de pagos en órdenes (autoriza sin solicitud)',
      },
      {
        name: 'delete_payment_receipts',
        description: 'Eliminar el comprobante de un pago en una orden',
      },
    ],
  },
  {
    label: '📊 Órdenes de pedido',
    permissions: [
      {
        name: 'read_orders_dashboard',
        description:
          'Ver el mini dashboard de indicadores en la lista de órdenes de pedido',
      },
    ],
  },
  {
    label: '💸 Anulación de Pagos',
    permissions: [
      {
        name: 'request_payment_void',
        description:
          'Solicitar anulación de pagos de una orden (siempre pasa por el admin salvo que además tenga void_cash_movements)',
      },
    ],
  },
  {
    label: '↩️ Devoluciones de dinero',
    permissions: [
      {
        name: 'create_refund_requests',
        description: 'Solicitar devolución de dinero en una orden de pedido',
      },
      {
        name: 'approve_refunds',
        description:
          'Autorizar o rechazar devoluciones de dinero al cliente (gerencia)',
      },
      {
        name: 'execute_refunds',
        description: 'Pagar en caja una devolución ya autorizada por gerencia',
      },
    ],
  },
  {
    label: '👔 Nómina',
    permissions: [
      {
        name: 'create_payroll_employees',
        description: 'Agregar usuarios a nómina',
      },
      { name: 'read_payroll_employees', description: 'Ver empleados de nómina' },
      {
        name: 'update_payroll_employees',
        description: 'Editar empleados de nómina',
      },
      {
        name: 'delete_payroll_employees',
        description: 'Eliminar empleados de nómina',
      },
      { name: 'create_payroll_periods', description: 'Crear periodos de nómina' },
      { name: 'read_payroll_periods', description: 'Ver periodos de nómina' },
      {
        name: 'update_payroll_periods',
        description: 'Editar periodos de nómina',
      },
      {
        name: 'delete_payroll_periods',
        description: 'Eliminar periodos de nómina',
      },
    ],
  },
  {
    label: '🧾 Descuentos por nómina',
    permissions: [
      {
        name: 'read_payroll_deductions',
        description:
          'Ver las órdenes que se van a descontar de la nómina de un empleado',
      },
      {
        name: 'approve_payroll_deductions',
        description:
          'Aprobar o rechazar que el valor de una orden se descuente de la nómina',
      },
      {
        name: 'apply_payroll_deductions',
        description:
          'Aplicar un descuento ya aprobado sobre la nómina del periodo en curso',
      },
    ],
  },
  {
    label: '🎯 Ventas por Asesor',
    permissions: [
      {
        name: 'read_all_advisors_tracking',
        description:
          'Ver el seguimiento de OP de todos los asesores (no solo las propias)',
      },
    ],
  },
  // Sedes (solo Zoom): ver docs/PLAN_SEDES.md §5, §6 y §14. `manage_locations`
  // es reservado (src/common/constants/roles.constants.ts): solo lo tiene soporte.
  {
    label: '🏢 Sedes',
    permissions: [
      {
        name: 'view_all_locations',
        description: 'Operar en cualquier sede y ver la vista "Todas las sedes"',
      },
      {
        name: 'read_other_locations',
        description: 'Consultar en solo lectura OP, COT y OT de otras sedes',
      },
      {
        name: 'manage_user_locations',
        description: 'Asignar a los usuarios sus sedes permitidas y la predeterminada',
      },
      {
        name: 'read_all_cash_sessions',
        description: 'Ver en solo lectura las cajas de todas las sedes',
      },
      {
        name: 'perform_general_closing',
        description: 'Hacer el cierre general diario de las cajas',
      },
      {
        name: 'authorize_location_support',
        description: 'Programar, aprobar y terminar apoyos de empleados en otra sede',
      },
      {
        name: 'manage_locations',
        description: 'Crear y editar sedes (reservado a soporte)',
      },
    ],
  },
];

export const allCatalogPermissions = permissionGroups.flatMap(
  (g) => g.permissions,
);
