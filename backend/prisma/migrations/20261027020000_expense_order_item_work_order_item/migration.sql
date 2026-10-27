-- Ítem de la OT al que pertenece cada línea de la OG.
--
-- El formulario de la OG ahora crea una línea de gasto por cada ítem de la OT
-- marcado. La línea recuerda su ítem para poder reconstruir el formulario al
-- editar. Nulo = gasto de toda la OT (y así quedan las líneas existentes).
ALTER TABLE "expense_order_items" ADD COLUMN IF NOT EXISTS "work_order_item_id" TEXT;

CREATE INDEX IF NOT EXISTS "expense_order_items_work_order_item_id_idx" ON "expense_order_items"("work_order_item_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_order_items_work_order_item_id_fkey') THEN
    ALTER TABLE "expense_order_items" ADD CONSTRAINT "expense_order_items_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "work_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
