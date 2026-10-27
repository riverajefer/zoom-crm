-- Ítems de la OT a los que aplica una OG.
--
-- Hasta ahora la OG solo se amarraba a la OT completa, y en OT de varios ítems
-- los usuarios ya creaban una OG por ítem («Sombrillas», «Promocionales») sin
-- que el sistema supiera a cuál pertenecía. Una OG sin filas aquí sigue siendo
-- gasto de toda la OT, así que las OG existentes no se migran.
CREATE TABLE IF NOT EXISTS "expense_order_work_order_items" (
    "expense_order_id" TEXT NOT NULL,
    "work_order_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_order_work_order_items_pkey" PRIMARY KEY ("expense_order_id","work_order_item_id")
);

CREATE INDEX IF NOT EXISTS "expense_order_work_order_items_work_order_item_id_idx" ON "expense_order_work_order_items"("work_order_item_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_order_work_order_items_expense_order_id_fkey') THEN
    ALTER TABLE "expense_order_work_order_items" ADD CONSTRAINT "expense_order_work_order_items_expense_order_id_fkey" FOREIGN KEY ("expense_order_id") REFERENCES "expense_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_order_work_order_items_work_order_item_id_fkey') THEN
    ALTER TABLE "expense_order_work_order_items" ADD CONSTRAINT "expense_order_work_order_items_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "work_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
