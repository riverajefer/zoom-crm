-- Temporizador de producción en la OT y catálogo de máquinas.
--
-- Hasta ahora el operario escribía a mano la fecha y las horas de cada registro
-- (`HOURS` o `RANGE`). Con el temporizador (`TIMER`) el servidor pone la hora de
-- inicio y de fin; mientras la tarea sigue en curso, `end_at` y `hours_worked`
-- quedan en NULL. Los registros no se borran: un supervisor los ajusta o los
-- anula, siempre con motivo, y se conserva el valor original.
--
-- Al 2026-10-17 producción tiene 3 registros de horas (2 RANGE y 1 HOURS): no
-- hay datos que migrar, solo columnas nuevas.
--
-- Idempotente, para poder reaplicarla sobre una base que ya la tenga a medias.

ALTER TYPE "WorkOrderTimeEntryType" ADD VALUE IF NOT EXISTS 'TIMER';

-- Catálogo de máquinas ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "machines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "production_area_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "machines_name_key" ON "machines"("name");
CREATE INDEX IF NOT EXISTS "machines_production_area_id_idx" ON "machines"("production_area_id");

DO $$ BEGIN
  ALTER TABLE "machines" ADD CONSTRAINT "machines_production_area_id_fkey"
    FOREIGN KEY ("production_area_id") REFERENCES "production_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Registros de tiempo ----------------------------------------------------------
ALTER TABLE "work_order_time_entries"
  ADD COLUMN IF NOT EXISTS "machine_id" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "extended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closed_by_system" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "adjusted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adjusted_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "adjust_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "original_start_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "original_end_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voided_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT;

ALTER TABLE "work_order_time_entries" ALTER COLUMN "hours_worked" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "work_order_time_entries_machine_id_idx" ON "work_order_time_entries"("machine_id");
CREATE INDEX IF NOT EXISTS "work_order_time_entries_user_id_end_at_idx" ON "work_order_time_entries"("user_id", "end_at");

DO $$ BEGIN
  ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_machine_id_fkey"
    FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_adjusted_by_id_fkey"
    FOREIGN KEY ("adjusted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_voided_by_id_fkey"
    FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una sola tarea en curso por operario, OT e ítem.
--
-- El servicio valida con un `findFirst` antes de insertar, pero un doble toque
-- en la tablet manda dos peticiones que leen «no hay ninguna» a la vez (ya pasó
-- con las solicitudes de aprobación, ver 20260906010000). El índice es la
-- garantía real.
--
-- El predicado no usa `entry_type = 'TIMER'` porque un valor de enum recién
-- agregado no se puede usar en la misma transacción. Es equivalente: solo una
-- tarea del temporizador en curso tiene inicio sin fin (HOURS no tiene ninguno
-- de los dos y RANGE siempre tiene ambos).
CREATE UNIQUE INDEX IF NOT EXISTS "work_order_time_entries_running_unique"
  ON "work_order_time_entries" ("user_id", "work_order_id", COALESCE("work_order_item_id", ''))
  WHERE "start_at" IS NOT NULL AND "end_at" IS NULL AND "voided_at" IS NULL;
