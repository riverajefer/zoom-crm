-- Aprobaciones de cambio de estado de un solo uso.
--
-- Con los retrocesos de estado (Lista → Producción, etc.) una misma transición
-- se puede repetir sobre la misma orden, así que la aprobación tiene que quedar
-- marcada como usada. Las filas anteriores quedan en NULL: son anulaciones y
-- entregas a crédito, que no se pueden repetir.
--
-- Idempotente: dev y staging comparten la misma base.
ALTER TABLE "order_status_change_requests"
  ADD COLUMN IF NOT EXISTS "consumed_at" TIMESTAMP(3);
