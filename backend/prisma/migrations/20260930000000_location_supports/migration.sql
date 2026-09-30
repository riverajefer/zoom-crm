-- Fase 9 de sedes (solo Zoom, docs/PLAN_SEDES.md §16): apoyo en otra sede
-- autorizado por Gerencia. Mientras un apoyo está vigente, su sede es la única
-- permitida del usuario (LocationContextInterceptor).
-- CreateEnum
CREATE TYPE "LocationSupportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocationSupportKind" AS ENUM ('SUPPORT', 'RETURN');

-- AlterEnum

ALTER TYPE "NotificationType" ADD VALUE 'LOCATION_SUPPORT_REQUEST_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'LOCATION_SUPPORT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'LOCATION_SUPPORT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'LOCATION_SUPPORT_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'LOCATION_SUPPORT_ENDED';

-- CreateTable
CREATE TABLE "location_supports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "kind" "LocationSupportKind" NOT NULL DEFAULT 'SUPPORT',
    "status" "LocationSupportStatus" NOT NULL DEFAULT 'PENDING',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "ended_at" TIMESTAMP(3),
    "ended_by_id" TEXT,
    "end_reason" TEXT,
    "replaces_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_supports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_supports_user_id_status_start_date_end_date_idx" ON "location_supports"("user_id", "status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "location_supports_status_idx" ON "location_supports"("status");

-- AddForeignKey
ALTER TABLE "location_supports" ADD CONSTRAINT "location_supports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_supports" ADD CONSTRAINT "location_supports_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_supports" ADD CONSTRAINT "location_supports_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_supports" ADD CONSTRAINT "location_supports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_supports" ADD CONSTRAINT "location_supports_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_supports" ADD CONSTRAINT "location_supports_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "location_supports"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Una sola solicitud pendiente por usuario: cierra la carrera del doble clic.
CREATE UNIQUE INDEX "location_supports_pending_unique"
  ON "location_supports"("user_id") WHERE "status" = 'PENDING';

ALTER TABLE "location_supports"
  ADD CONSTRAINT "location_supports_dates_check" CHECK ("end_date" >= "start_date");

-- Permiso de Gerencia. Lo reciben admin y soporte; el admin puede dárselo a
-- otro rol desde Roles.
INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       'authorize_location_support',
       'Programar, aprobar y terminar apoyos de empleados en otra sede',
       NOW(),
       NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "name" = 'authorize_location_support'
);

INSERT INTO "role_permissions" ("roleId", "permissionId", "assignedAt")
SELECT r."id", p."id", NOW()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."name" = 'authorize_location_support'
  AND r."name" IN ('admin', 'soporte')
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp
    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  );
