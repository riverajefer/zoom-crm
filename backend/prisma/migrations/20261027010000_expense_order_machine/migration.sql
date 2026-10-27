-- Máquina opcional de la OG, de las del área encargada.
--
-- «Área encargada o máquina» solo permitía elegir el área. Ahora la máquina va
-- aparte y es opcional; las OG existentes quedan sin máquina.
ALTER TABLE "expense_orders" ADD COLUMN IF NOT EXISTS "machine_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_orders_machine_id_fkey') THEN
    ALTER TABLE "expense_orders" ADD CONSTRAINT "expense_orders_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
