-- Solicitudes para editar una OG ya pagada, con aprobación del admin.

-- AlterEnum
ALTER TYPE "ApprovalRequestType" ADD VALUE 'EXPENSE_ORDER_EDIT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_ORDER_EDIT_REQUEST_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_ORDER_EDIT_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_ORDER_EDIT_REQUEST_REJECTED';

-- CreateTable
CREATE TABLE "expense_order_edit_requests" (
    "id" TEXT NOT NULL,
    "expense_order_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "expires_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_order_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_order_edit_requests_expense_order_id_idx" ON "expense_order_edit_requests"("expense_order_id");

-- CreateIndex
CREATE INDEX "expense_order_edit_requests_requested_by_id_idx" ON "expense_order_edit_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "expense_order_edit_requests_status_idx" ON "expense_order_edit_requests"("status");

-- Una sola solicitud PENDING por OG y usuario. El `findFirst` del servicio es un
-- check-then-act: un doble clic lo pasa dos veces antes de que cualquiera
-- inserte. Prisma no sabe declarar índices parciales, por eso vive solo acá.
CREATE UNIQUE INDEX "expense_order_edit_requests_pending_unique"
  ON "expense_order_edit_requests" ("expense_order_id", "requested_by_id")
  WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "expense_order_edit_requests" ADD CONSTRAINT "expense_order_edit_requests_expense_order_id_fkey" FOREIGN KEY ("expense_order_id") REFERENCES "expense_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_order_edit_requests" ADD CONSTRAINT "expense_order_edit_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_order_edit_requests" ADD CONSTRAINT "expense_order_edit_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
