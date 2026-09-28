-- Fase 3 de sedes (solo Zoom, docs/PLAN_SEDES.md §4): una caja por sede.
--
-- Cada sede que todavía no tenga caja recibe una, "Caja <sede>". La caja que
-- ya existía (la migración location_scope la dejó en el 125) se conserva.
-- Crear una sede nueva desde /sedes también le crea su caja.
INSERT INTO "cash_registers" ("id", "name", "description", "is_active", "location_id", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  'Caja ' || l."name",
  'Caja de ' || l."name",
  true,
  l."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "locations" l
WHERE NOT EXISTS (
  SELECT 1 FROM "cash_registers" c WHERE c."location_id" = l."id"
);
