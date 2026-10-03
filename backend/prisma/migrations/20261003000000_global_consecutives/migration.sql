-- Numeración global: un solo contador por tipo de documento, compartido por
-- todas las sedes. El número conserva el código de la sede que lo emite
-- (`104-OP-0011` y luego `119-OP-0012`), pero la secuencia ya no es por sede.

-- De los contadores por sede queda el más alto de cada tipo.
DELETE FROM "consecutives" c
USING "consecutives" o
WHERE c."type" = o."type"
  AND (c."last_number" < o."last_number"
       OR (c."last_number" = o."last_number" AND c."id" < o."id"));

-- DropForeignKey
ALTER TABLE "consecutives" DROP CONSTRAINT "consecutives_location_id_fkey";

-- DropIndex
DROP INDEX "consecutives_type_location_id_key";

-- AlterTable
ALTER TABLE "consecutives" DROP COLUMN "location_id";

-- CreateIndex
CREATE UNIQUE INDEX "consecutives_type_key" ON "consecutives"("type");
