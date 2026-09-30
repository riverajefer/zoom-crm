/**
 * Mapeo de nombres técnicos de permisos a etiquetas legibles en español
 */
export const PERMISSION_LABELS: Record<string, string> = {
  // Usuarios
  create_users: 'Crear Usuarios',
  read_users: 'Ver Usuarios',
  update_users: 'Actualizar Usuarios',
  delete_users: 'Eliminar Usuarios',

  // Roles
  create_roles: 'Crear Roles',
  read_roles: 'Ver Roles',
  update_roles: 'Actualizar Roles',
  delete_roles: 'Eliminar Roles',

  // Permisos
  create_permissions: 'Crear Permisos',
  read_permissions: 'Ver Permisos',
  update_permissions: 'Actualizar Permisos',
  delete_permissions: 'Eliminar Permisos',
  manage_permissions: 'Gestionar Permisos de Roles',

  // Auditoría
  read_audit_logs: 'Ver Logs de Auditoría',

  // Session Logs
  read_session_logs: 'Ver Historial de Sesiones',

  // Áreas
  create_areas: 'Crear Áreas',
  read_areas: 'Ver Áreas',
  update_areas: 'Actualizar Áreas',
  delete_areas: 'Eliminar Áreas',

  // Cargos
  create_cargos: 'Crear Cargos',
  read_cargos: 'Ver Cargos',
  update_cargos: 'Actualizar Cargos',
  delete_cargos: 'Eliminar Cargos',

  // Clientes
  search_clients: 'Buscador Global de Clientes',
  browse_clients: 'Ver la lista completa de clientes',
  create_clients: 'Crear Clientes',
  read_clients: 'Ver Clientes',
  update_clients: 'Actualizar Clientes',
  delete_clients: 'Eliminar Clientes',
  export_clients: 'Exportar Clientes a Excel',
  update_client_special_condition: 'Editar Condición Especial',
  approve_client_ownership_auth: 'Aprobar Propiedad de Cliente',
  request_client_advisor: 'Solicitar Asignación de Asesor',
  approve_client_advisor: 'Aprobar Asignación de Asesor',

  // Proveedores
  create_suppliers: 'Crear Proveedores',
  read_suppliers: 'Ver Proveedores',
  update_suppliers: 'Actualizar Proveedores',
  delete_suppliers: 'Eliminar Proveedores',

  create_units_of_measure: 'Crear Unidades de Medida',
  read_units_of_measure: 'Ver Unidades de Medida',
  update_units_of_measure: 'Actualizar Unidades de Medida',
  delete_units_of_measure: 'Eliminar Unidades de Medida',

  create_product_categories: 'Crear Categorías de Productos',
  read_product_categories: 'Ver Categorías de Productos',
  update_product_categories: 'Actualizar Categorías de Productos',
  delete_product_categories: 'Eliminar Categorías de Productos',

  create_products: 'Crear Productos',
  read_products: 'Ver Productos',
  update_products: 'Actualizar Productos',
  delete_products: 'Eliminar Productos',

  create_supply_categories: 'Crear Categorías de Insumos',
  read_supply_categories: 'Ver Categorías de Insumos',
  update_supply_categories: 'Actualizar Categorías de Insumos',
  delete_supply_categories: 'Eliminar Categorías de Insumos',

  create_supplies: 'Crear Insumos',
  read_supplies: 'Ver Insumos',
  update_supplies: 'Actualizar Insumos',
  delete_supplies: 'Eliminar Insumos',
  
  // Áreas de Producción
  create_production_areas: 'Crear Áreas de Producción',
  read_production_areas: 'Ver Áreas de Producción',
  update_production_areas: 'Actualizar Áreas de Producción',
  delete_production_areas: 'Eliminar Áreas de Producción',
  
  // Canales Comerciales
  create_commercial_channels: 'Crear Canales Comerciales',
  read_commercial_channels: 'Ver Canales Comerciales',
  update_commercial_channels: 'Actualizar Canales Comerciales',
  delete_commercial_channels: 'Eliminar Canales Comerciales',

  // Cotizaciones
  create_quotes: 'Crear Cotizaciones',
  read_quotes: 'Ver Cotizaciones',
  update_quotes: 'Actualizar Cotizaciones',
  delete_quotes: 'Eliminar Cotizaciones',
  export_quotes: 'Exportar Cotizaciones a Excel',
  convert_quotes: 'Convertir Cotizaciones',
  manage_quote_columns: 'Gestionar Columnas de Cotización',
  read_all_quotes: 'Ver Todas las Cotizaciones',
  // Pipeline de Ventas
  create_prospects: 'Crear Prospectos',
  read_prospects: 'Ver Prospectos',
  read_all_prospects: 'Ver Prospectos de Todas las Vendedoras',
  update_prospects: 'Actualizar Prospectos y Registrar Contactos',
  delete_prospects: 'Eliminar Prospectos',
  convert_prospects: 'Convertir Prospectos',
  export_prospects: 'Exportar Prospectos a Excel',
  read_prospect_metrics: 'Ver Métricas del Pipeline',
   // Órdenes
   create_orders: 'Crear Órdenes',
   read_orders: 'Ver Órdenes',
   read_orders_dashboard: 'Ver Dashboard de Órdenes',
   update_orders: 'Actualizar Órdenes',
   delete_orders: 'Eliminar Órdenes',
   export_orders: 'Exportar Órdenes a Excel',
   export_pending_payment_orders: 'Exportar Órdenes Pendientes por Cobrar a Excel',
   export_profitability: 'Exportar Rentabilidad por Orden a Excel',
   approve_orders: 'Aprobar Órdenes',
   change_order_status: 'Cambiar Estado de Órdenes',
   register_order_payments: 'Agrega pago en OP',
   read_pending_orders: 'Ver Órdenes Pendientes por Cobrar',
   approve_discounts: 'Aprobar Descuentos',
   apply_discounts: 'Aplicar Descuentos',
   delete_discounts: 'Eliminar Descuentos',

  // Pagos de Órdenes
  edit_order_payments: 'Editar Pagos de Órdenes',
  approve_payment_edits: 'Aprobar Ediciones de Pagos',
  delete_payment_receipts: 'Eliminar Comprobantes de Pago',

  // Cambio de Asesor de Órdenes
  request_advisor_change: 'Solicitar Cambio de Asesor',
  approve_advisor_change: 'Aprobar Cambio de Asesor',

  // Restauración de Cotizaciones
  request_quote_restore: 'Solicitar Restaurar Cotización Rechazada',
  approve_quote_restore: 'Aprobar Restaurar Cotización Rechazada',

  // Archivos
  upload_files: 'Subir Archivos',
  read_files: 'Ver y Descargar Archivos',
  delete_files: 'Eliminar Archivos',
  manage_storage: 'Gestionar Almacenamiento',

  // Órdenes de trabajo
  create_work_orders: 'Crear Órdenes de Trabajo',
  read_work_orders: 'Ver Órdenes de Trabajo',
  update_work_orders: 'Actualizar Órdenes de Trabajo',
  delete_work_orders: 'Eliminar Órdenes de Trabajo',
  export_work_orders: 'Exportar Órdenes de Trabajo a Excel',

  // Tipos de gasto
  create_expense_types: 'Crear Tipos de Gasto',
  read_expense_types: 'Ver Tipos de Gasto',
  update_expense_types: 'Actualizar Tipos de Gasto',
  delete_expense_types: 'Eliminar Tipos de Gasto',

  // Órdenes de gasto
  create_expense_orders: 'Crear Órdenes de Gasto',
  read_expense_orders: 'Ver Órdenes de Gasto',
  update_expense_orders: 'Actualizar Órdenes de Gasto',
  delete_expense_orders: 'Eliminar Órdenes de Gasto',
  export_expense_orders: 'Exportar Órdenes de Gasto a Excel',
  approve_expense_orders: 'Aprobar Órdenes de Gasto',

  // Anticipos
  approve_advance_payments: 'Aprobar/Rechazar Anticipos',

  // Compañía
  read_company: 'Ver Información de Compañía',
  update_company: 'Editar Información de Compañía',

  // Nómina — Empleados
  create_payroll_employees: 'Agregar Empleados a Nómina',
  read_payroll_employees: 'Ver Empleados de Nómina',
  update_payroll_employees: 'Editar Empleados de Nómina',
  delete_payroll_employees: 'Eliminar Empleados de Nómina',

  // Nómina — Periodos y registros
  create_payroll_periods: 'Crear Periodos de Nómina',
  read_payroll_periods: 'Ver Periodos de Nómina',
  update_payroll_periods: 'Editar Periodos y Registros de Nómina',
  delete_payroll_periods: 'Eliminar Periodos de Nómina',

  // Nómina — Descuento de órdenes
  read_payroll_deductions: 'Ver Descuento de Órdenes en Nómina',
  approve_payroll_deductions: 'Aprobar Descuento de Órdenes en Nómina',
  apply_payroll_deductions: 'Aplicar Descuentos sobre la Nómina',

  // Asistencia
  use_attendance: 'Marcar Entrada/Salida',
  read_attendance: 'Ver Registros de Asistencia',
  manage_attendance: 'Ajustar Registros de Asistencia',

  // Inventario
  create_inventory_movements: 'Crear Movimientos de Inventario',
  read_inventory_movements: 'Ver Movimientos de Inventario',
  manage_inventory: 'Gestionar Inventario',

  // Producción — Plantillas de Producto
  read_product_templates: 'Ver Plantillas de Producto',
  create_product_templates: 'Crear Plantillas de Producto',
  update_product_templates: 'Actualizar Plantillas de Producto',
  delete_product_templates: 'Eliminar Plantillas de Producto',
  read_step_definitions: 'Ver Etapas de Producción',
  create_step_definitions: 'Crear Etapas de Producción',
  update_step_definitions: 'Actualizar Etapas de Producción',

  // Producción — Órdenes de Producción
  read_production_orders: 'Ver Órdenes de Producción',
  create_production_orders: 'Crear Órdenes de Producción',
  update_production_orders: 'Actualizar Órdenes de Producción',

  // DTF (Direct to Film)
  create_dtf: 'Crear DTF',
  read_dtf: 'Ver DTF',
  update_dtf: 'Actualizar DTF',
  export_dtf: 'Exportar DTF a Excel',
  change_dtf_status: 'Cambiar Estado de DTF',
  convert_dtf_to_order: 'Convertir DTF a Orden',

  // Comentarios
  create_comments: 'Crear Comentarios',
  read_comments: 'Ver Comentarios',
  delete_comments: 'Eliminar Comentarios',

  // Caja Registradora (POS)
  create_cash_registers: 'Crear Cajas Registradoras',
  read_cash_registers: 'Ver Cajas Registradoras',
  update_cash_registers: 'Editar Cajas Registradoras',
  delete_cash_registers: 'Eliminar Cajas Registradoras',
  open_cash_session: 'Abrir Sesión de Caja',
  close_cash_session: 'Cerrar Sesión de Caja',
  read_cash_sessions: 'Ver Sesiones de Caja',
  create_cash_movements: 'Registrar Movimientos de Caja',
  void_cash_movements: 'Anular Movimientos de Caja',
  request_payment_void: 'Solicitar Anulación de Pagos',
  read_cash_movements: 'Ver Movimientos de Caja',
  approve_cash_movements: 'Aprobar Movimientos de Caja',
  caja_authorize_expense_orders: 'Autorizar Órdenes de Gasto en Caja',

  // Devoluciones
  approve_refunds: 'Autorizar Devoluciones (Gerencia)',
  execute_refunds: 'Pagar Devoluciones en Caja',
  create_refund_requests: 'Crear Solicitudes de Devolución',

  // Cuentas por Pagar
  create_accounts_payable: 'Crear Cuentas por Pagar',
  read_accounts_payable: 'Ver Cuentas por Pagar',
  update_accounts_payable: 'Actualizar Cuentas por Pagar',
  delete_accounts_payable: 'Eliminar Cuentas por Pagar',
  export_accounts_payable: 'Exportar Cuentas por Pagar a Excel',
  register_ap_payment: 'Registrar Pago de Cuenta por Pagar',
  approve_accounts_payable: 'Aprobar Pago de CP (Admin)',
  caja_authorize_ap_payment: 'Autorizar Pago de CP en Caja',
  request_ap_payment_reversal: 'Solicitar Reversión de Pago CP',
  gerencia_approve_ap_payment_reversal: 'Aprobar Reversión de Pago CP (Gerencia)',
  caja_confirm_ap_payment_reversal: 'Confirmar Reversión de Pago CP (Caja)',

  // Reportes Financieros
  read_financial_dashboard: 'Ver Dashboard Financiero',

  // Ventas por Asesor
  read_sales_by_advisor: 'Ver Ventas por Asesor',
  export_sales_by_advisor: 'Exportar Ventas por Asesor a Excel',
  manage_sales_goals: 'Gestionar Metas de Ventas',
  read_all_advisors_tracking: 'Ver el Seguimiento de OP de todos los asesores',

  // Sedes (solo Zoom)
  view_all_locations: 'Ver y Operar en Todas las Sedes',
  read_other_locations: 'Consultar OP, COT y OT de Otras Sedes',
  manage_user_locations: 'Asignar Sedes a Usuarios',
  read_all_cash_sessions: 'Ver las Cajas de Todas las Sedes',
  perform_general_closing: 'Hacer el Cierre General de Cajas',
  manage_locations: 'Crear y Editar Sedes (Soporte)',
};

/**
 * Función helper para obtener el nombre legible de un permiso
 */
export const getPermissionLabel = (name: string): string => {
  return PERMISSION_LABELS[name] || name;
};
