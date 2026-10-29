-- Comentarios opcionales del cliente sobre la OG, que se escriben en el paso
-- "Confirmar" del formulario de creación.
ALTER TABLE "expense_orders" ADD COLUMN IF NOT EXISTS "comments" TEXT;
