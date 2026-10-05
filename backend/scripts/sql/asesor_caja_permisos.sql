-- Rol "asesor_caja" de Zoom (2026-10-05): la unión de lo que hoy tienen los
-- roles "asesor" y "caja" en esta base. Lo crea si no existe y agrega sin borrar.
--
-- De paso le da a "contabilidad" lo que necesita para la verificación de pagos.
-- Correr DESPUÉS de `npm run prisma:sync:permissions`, que publica `verify_payments`.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO roles (id, name, description, "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'asesor_caja',
       'Asesor y caja de un local: vende, cobra y maneja la caja de su sede',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'asesor_caja');

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT DISTINCT destino.id, rp."permissionId"
FROM roles destino
JOIN roles origen ON origen.name IN ('asesor', 'caja')
JOIN role_permissions rp ON rp."roleId" = origen.id
WHERE destino.name = 'asesor_caja'
ON CONFLICT DO NOTHING;

-- Nombres que no existen en esta base (deberían ser 0 filas)
SELECT w.name AS no_existe
FROM (VALUES ('verify_payments'), ('read_orders'), ('read_files')) AS w(name)
LEFT JOIN permissions p ON p.name = w.name
WHERE p.id IS NULL;

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('verify_payments', 'read_orders', 'read_files')
WHERE r.name = 'contabilidad'
ON CONFLICT DO NOTHING;

SELECT r.name AS rol, count(*) AS permisos
FROM role_permissions rp JOIN roles r ON r.id = rp."roleId"
WHERE r.name IN ('asesor', 'caja', 'asesor_caja', 'contabilidad')
GROUP BY r.name ORDER BY r.name;

COMMIT;
