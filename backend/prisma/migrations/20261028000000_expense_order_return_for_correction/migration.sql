-- Devolver a corrección una OG que ya firmó el admin.
--
-- Una OG en ADMIN_AUTHORIZED no se podía editar ni sacar de ahí salvo por el
-- rechazo de Caja, que vive en el panel de Caja. Quien la creó encontraba el
-- error y no tenía cómo corregirlo, y Caja la pagaba con el valor equivocado
-- (OG-2026-0888). Ahora quien la creó o Caja la devuelven a CREATED con un
-- motivo, y el admin tiene que volver a firmarla.
ALTER TABLE "expense_orders" ADD COLUMN IF NOT EXISTS "returned_for_correction_by_id" TEXT;
ALTER TABLE "expense_orders" ADD COLUMN IF NOT EXISTS "returned_for_correction_at" TIMESTAMP(3);
ALTER TABLE "expense_orders" ADD COLUMN IF NOT EXISTS "returned_for_correction_reason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_orders_returned_for_correction_by_id_fkey') THEN
    ALTER TABLE "expense_orders" ADD CONSTRAINT "expense_orders_returned_for_correction_by_id_fkey" FOREIGN KEY ("returned_for_correction_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Aviso al admin que firmó y a quien creó la OG.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXPENSE_ORDER_RETURNED_FOR_CORRECTION';
