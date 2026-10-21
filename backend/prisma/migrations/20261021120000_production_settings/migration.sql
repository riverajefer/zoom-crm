-- Parámetros del reporte de productividad, editables por gerencia desde el CRM
-- (antes eran variables de entorno). Una sola fila, «default», con los valores
-- con que arrancó el reporte: 210 horas al mes para el valor hora, recargo de la
-- hora extra de 1,25 y umbrales de mano de obra / venta de 15 % y 30 %.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "production_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hourly_divisor" DECIMAL(6,2) NOT NULL DEFAULT 210,
    "overtime_factor" DECIMAL(4,2) NOT NULL DEFAULT 1.25,
    "labor_share_warning_pct" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "labor_share_critical_pct" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_settings_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "production_settings" ADD CONSTRAINT "production_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "production_settings" ("id", "updated_at") VALUES ('default', now())
ON CONFLICT ("id") DO NOTHING;
