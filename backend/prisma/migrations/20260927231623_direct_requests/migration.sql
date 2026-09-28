-- Trazabilidad de las acciones directas (docs/PLAN_SEDES.md §6.3, solo Zoom).
-- `is_direct` marca la solicitud que se registra, ya aprobada, cuando quien
-- podía aprobar hace la acción sin pedir permiso.

-- AlterTable
ALTER TABLE "advisor_change_requests" ADD COLUMN     "is_direct" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_edit_requests" ADD COLUMN     "is_direct" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_status_change_requests" ADD COLUMN     "is_direct" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payment_edit_approvals" ADD COLUMN     "is_direct" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quote_restore_requests" ADD COLUMN     "is_direct" BOOLEAN NOT NULL DEFAULT false;

-- El cambio de asesor y la restauración de COT directos ya se registraban como
-- solicitud aprobada por el mismo usuario que la pidió: se marcan.
UPDATE "advisor_change_requests"
  SET "is_direct" = true
  WHERE "status" = 'APPROVED' AND "reviewed_by_id" = "requested_by_id";

UPDATE "quote_restore_requests"
  SET "is_direct" = true
  WHERE "status" = 'APPROVED' AND "reviewed_by_id" = "requested_by_id";
