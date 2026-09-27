-- Sedes de Zoom (solo existe en este fork; ver docs/PLAN_SEDES.md).
--
-- Las 4 sedes las crea la migración y no el seed: la fase 2 agrega `location_id`
-- obligatorio a los documentos, y esas filas tienen que existir antes en todos
-- los ambientes, producción incluida, donde el seed de demo no corre.
-- No es idempotente a propósito: en Zoom cada ambiente tiene su propia base.

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORE', 'HEADQUARTERS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_location_id" TEXT;

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'STORE',
    "address" TEXT,
    "phone" TEXT,
    "color" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_locations" (
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id","location_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "user_locations_location_id_idx" ON "user_locations"("location_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sedes iniciales. El código es estable: es el prefijo de la numeración.
INSERT INTO "locations" ("id", "code", "name", "type", "address", "phone", "color", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, '104', 'Local 104', 'STORE', 'Cra 28 #10-86 Edificio Fénix (Local 104)', '(+57) 321 201 6229', '#9D8CFF', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '119', 'Local 119', 'STORE', 'Cra 28 #10-40 Centro Nacional de las Artes Gráficas Ricaurte (Local 119)', '(+57) 314 474 9878', '#F5B94A', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '125', 'Local 125', 'STORE', 'Cra 28 #10-38 Interior 125 B', '(+57) 300 368 0868', '#FF8A7A', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MAT', 'Matriz', 'HEADQUARTERS', NULL, NULL, '#8FA3B8', 4, CURRENT_TIMESTAMP);
