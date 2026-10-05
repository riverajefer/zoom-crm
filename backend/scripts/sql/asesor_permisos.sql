-- Rol "asesor" de Zoom = rol "Comercial" de producción de High (2026-10-01)
-- + read_other_locations (modo consulta). Reemplaza los permisos actuales del rol.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE wanted(name text) ON COMMIT DROP;
INSERT INTO wanted(name) VALUES
  ('apply_discounts'),
  ('change_dtf_status'),
  ('change_order_status'),
  ('convert_dtf_to_order'),
  ('convert_prospects'),
  ('convert_quotes'),
  ('create_accounts_payable'),
  ('create_clients'),
  ('create_comments'),
  ('create_dtf'),
  ('create_expense_orders'),
  ('create_expense_types'),
  ('create_inventory_movements'),
  ('create_orders'),
  ('create_product_categories'),
  ('create_product_templates'),
  ('create_production_orders'),
  ('create_products'),
  ('create_prospects'),
  ('create_quotes'),
  ('create_refund_requests'),
  ('create_step_definitions'),
  ('create_suppliers'),
  ('create_supplies'),
  ('create_supply_categories'),
  ('create_units_of_measure'),
  ('create_work_orders'),
  ('edit_order_payments'),
  ('manage_quote_columns'),
  ('read_accounts_payable'),
  ('read_all_quotes'),
  ('read_cargos'),
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
  ('read_prospect_metrics'),
  ('read_prospects'),
  ('read_quotes'),
  ('read_step_definitions'),
  ('read_suppliers'),
  ('read_supplies'),
  ('read_supply_categories'),
  ('read_units_of_measure'),
  ('read_users'),
  ('read_work_orders'),
  ('register_ap_payment'),
  ('register_order_payments'),
  ('request_advisor_change'),
  ('request_client_advisor'),
  ('request_payment_void'),
  ('request_quote_restore'),
  ('search_clients'),
  ('update_accounts_payable'),
  ('update_clients'),
  ('update_dtf'),
  ('update_expense_orders'),
  ('update_expense_types'),
  ('update_orders'),
  ('update_product_categories'),
  ('update_product_templates'),
  ('update_production_orders'),
  ('update_products'),
  ('update_prospects'),
  ('update_quotes'),
  ('update_step_definitions'),
  ('update_supplies'),
  ('update_supply_categories'),
  ('update_units_of_measure'),
  ('update_work_orders'),
  ('upload_files'),
  ('use_attendance'),
  ('read_other_locations');

-- Nombres de la lista que no existen en esta base (deberían ser 0 filas)
SELECT w.name AS no_existe FROM wanted w LEFT JOIN permissions p ON p.name = w.name WHERE p.id IS NULL;

DELETE FROM role_permissions
WHERE "roleId" = (SELECT id FROM roles WHERE name = 'asesor');

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (SELECT name FROM wanted)
WHERE r.name = 'asesor';

SELECT count(*) AS permisos_asesor
FROM role_permissions rp JOIN roles r ON r.id = rp."roleId"
WHERE r.name = 'asesor';

COMMIT;
