-- Pago mixto en ítems de Orden de Gasto: dos líneas con su método y monto.
-- CreateTable
CREATE TABLE "expense_order_item_payments" (
    "id" TEXT NOT NULL,
    "expense_order_item_id" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bank_entity" TEXT,
    "cash_movement_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_order_item_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_order_item_payments_cash_movement_id_key" ON "expense_order_item_payments"("cash_movement_id");

-- CreateIndex
CREATE INDEX "expense_order_item_payments_expense_order_item_id_idx" ON "expense_order_item_payments"("expense_order_item_id");

-- AddForeignKey
ALTER TABLE "expense_order_item_payments" ADD CONSTRAINT "expense_order_item_payments_expense_order_item_id_fkey" FOREIGN KEY ("expense_order_item_id") REFERENCES "expense_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_order_item_payments" ADD CONSTRAINT "expense_order_item_payments_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
