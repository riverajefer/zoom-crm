-- Arqueo de cierre en curso.
--
-- Caja marca el inicio del conteo antes de contar el cajón. Mientras la marca
-- exista, la sesión no acepta movimientos en efectivo: un abono registrado
-- durante el conteo sumaba a lo esperado sin estar en el conteo y el cierre
-- quedaba con un faltante falso (sesión ca3da331, 2026-10-23).
--
-- Idempotente: staging y producción conservan migraciones aplicadas a mano.

ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "count_started_at" TIMESTAMP(3);
ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "count_started_by_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_sessions_count_started_by_id_fkey'
  ) THEN
    ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_count_started_by_id_fkey"
      FOREIGN KEY ("count_started_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
