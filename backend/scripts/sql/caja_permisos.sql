-- Rol "caja" de Zoom = rol "caja" de producción de High (2026-10-01)
-- + read_other_locations (modo consulta). Reemplaza los permisos actuales del rol.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE wanted(name text) ON COMMIT DROP;
INSERT INTO wanted(name) VALUES
  ('approve_advance_payments'),
  ('approve_cash_movements'),
  ('approve_expense_orders'),
  ('approve_payment_edits'),
  ('caja_authorize_ap_payment'),
  ('caja_authorize_expense_orders'),
  ('caja_confirm_ap_payment_reversal'),
  ('close_cash_session'),
  ('create_accounts_payable'),
  ('create_cash_movements'),
  ('create_clients'),
  ('create_comments'),
  ('create_commercial_channels'),
  ('create_expense_orders'),
  ('create_expense_types'),
  ('create_inventory_movements'),
  ('create_orders'),
  ('create_product_categories'),
  ('create_product_templates'),
  ('create_production_areas'),
  ('create_production_orders'),
  ('create_products'),
  ('create_quotes'),
  ('create_refund_requests'),
  ('create_step_definitions'),
  ('create_suppliers'),
  ('create_supplies'),
  ('create_supply_categories'),
  ('create_units_of_measure'),
  ('create_work_orders'),
  ('edit_order_payments'),
  ('open_cash_session'),
  ('read_accounts_payable'),
  ('read_cargos'),
  ('read_cash_movements'),
  ('read_cash_registers'),
  ('read_cash_sessions'),
  ('read_clients'),
  ('read_comments'),
  ('read_commercial_channels'),
  ('read_dtf'),
  ('read_expense_orders'),
  ('read_expense_types'),
  ('read_files'),
  ('read_inventory_movements'),
  ('read_orders'),
  ('read_orders_dashboard'),
  ('read_pending_orders'),
  ('read_product_categories'),
  ('read_product_templates'),
  ('read_production_areas'),
  ('read_production_orders'),
  ('read_products'),
  ('read_quotes'),
  ('read_roles'),
  ('read_step_definitions'),
  ('read_suppliers'),
  ('read_supplies'),
  ('read_supply_categories'),
  ('read_units_of_measure'),
  ('read_users'),
  ('read_work_orders'),
  ('register_ap_payment'),
  ('register_order_payments'),
  ('request_ap_payment_reversal'),
  ('request_client_advisor'),
  ('request_payment_void'),
  ('request_quote_restore'),
  ('search_clients'),
  ('update_accounts_payable'),
  ('update_clients'),
  ('update_commercial_channels'),
  ('update_expense_orders'),
  ('update_expense_types'),
  ('update_orders'),
  ('update_product_categories'),
  ('update_product_templates'),
  ('update_production_areas'),
  ('update_products'),
  ('update_suppliers'),
  ('update_supplies'),
  ('update_supply_categories'),
  ('update_units_of_measure'),
  ('update_work_orders'),
  ('upload_files'),
  ('use_attendance'),
  ('void_cash_movements'),
  ('read_other_locations');

-- Nombres de la lista que no existen en esta base (deberían ser 0 filas)
SELECT w.name AS no_existe FROM wanted w LEFT JOIN permissions p ON p.name = w.name WHERE p.id IS NULL;

DELETE FROM role_permissions
WHERE "roleId" = (SELECT id FROM roles WHERE name = 'caja');

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (SELECT name FROM wanted)
WHERE r.name = 'caja';

SELECT count(*) AS permisos_caja
FROM role_permissions rp JOIN roles r ON r.id = rp."roleId"
WHERE r.name = 'caja';

COMMIT;
