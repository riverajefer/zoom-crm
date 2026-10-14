-- CreateEnum
CREATE TYPE "GeneralClosingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "GeneralClosingReviewStatus" AS ENUM ('VERIFIED', 'OBSERVED', 'NO_OPERATION');

-- CreateEnum
CREATE TYPE "GeneralClosingEventType" AS ENUM ('CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "general_closings" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "GeneralClosingStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "snapshot" JSONB,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_closing_register_reviews" (
    "id" TEXT NOT NULL,
    "general_closing_id" TEXT NOT NULL,
    "cash_register_id" TEXT NOT NULL,
    "status" "GeneralClosingReviewStatus" NOT NULL,
    "notes" TEXT,
    "reviewed_by_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_closing_register_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_closing_events" (
    "id" TEXT NOT NULL,
    "general_closing_id" TEXT NOT NULL,
    "type" "GeneralClosingEventType" NOT NULL,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_closing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "general_closings_date_key" ON "general_closings"("date");

-- CreateIndex
CREATE INDEX "general_closings_status_idx" ON "general_closings"("status");

-- CreateIndex
CREATE INDEX "general_closing_register_reviews_cash_register_id_idx" ON "general_closing_register_reviews"("cash_register_id");

-- CreateIndex
CREATE UNIQUE INDEX "general_closing_register_reviews_general_closing_id_cash_re_key" ON "general_closing_register_reviews"("general_closing_id", "cash_register_id");

-- CreateIndex
CREATE INDEX "general_closing_events_general_closing_id_idx" ON "general_closing_events"("general_closing_id");

-- AddForeignKey
ALTER TABLE "general_closings" ADD CONSTRAINT "general_closings_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_closing_register_reviews" ADD CONSTRAINT "general_closing_register_reviews_general_closing_id_fkey" FOREIGN KEY ("general_closing_id") REFERENCES "general_closings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_closing_register_reviews" ADD CONSTRAINT "general_closing_register_reviews_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_closing_register_reviews" ADD CONSTRAINT "general_closing_register_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_closing_events" ADD CONSTRAINT "general_closing_events_general_closing_id_fkey" FOREIGN KEY ("general_closing_id") REFERENCES "general_closings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_closing_events" ADD CONSTRAINT "general_closing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
