-- Valor que retiene la empresa al anular una OP con pagos. El resto de lo pagado
-- queda como saldo a favor del cliente.
-- Migración idempotente: dev y staging comparten la misma DB.
ALTER TABLE "order_status_change_requests"
  ADD COLUMN IF NOT EXISTS "retained_amount" DECIMAL(65,30);
