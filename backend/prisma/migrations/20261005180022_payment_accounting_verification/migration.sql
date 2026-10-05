-- CreateEnum
CREATE TYPE "PaymentAccountingStatus" AS ENUM ('PENDING', 'VERIFIED', 'OBSERVED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_ACCOUNTING_OBSERVED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "accounting_notes" TEXT,
ADD COLUMN     "accounting_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "accounting_reviewed_by_id" TEXT,
ADD COLUMN     "accounting_status" "PaymentAccountingStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "payment_accounting_reviews" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "status" "PaymentAccountingStatus" NOT NULL,
    "notes" TEXT,
    "reviewed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_accounting_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_accounting_reviews_payment_id_idx" ON "payment_accounting_reviews"("payment_id");

-- CreateIndex
CREATE INDEX "payments_accounting_status_idx" ON "payments"("accounting_status");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_accounting_reviewed_by_id_fkey" FOREIGN KEY ("accounting_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounting_reviews" ADD CONSTRAINT "payment_accounting_reviews_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounting_reviews" ADD CONSTRAINT "payment_accounting_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
