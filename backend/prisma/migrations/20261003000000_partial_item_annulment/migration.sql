-- Anulación parcial de una OP por ítems.
--
-- Una solicitud de devolución ahora puede decir qué ítems anula y cuánto retiene
-- la empresa de lo que valían. El ítem no se borra: queda marcado con la
-- cantidad anulada, y la venta que deja de existir sigue viviendo en
-- `orders.reversed_amount`.
--
-- Migración idempotente: dev y staging comparten la misma base de datos.

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "annulled_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "refund_requests"
  ADD COLUMN IF NOT EXISTS "retained_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "refund_request_items" (
  "id" TEXT NOT NULL,
  "refund_request_id" TEXT NOT NULL,
  "order_item_id" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL,
  "unit_price" DECIMAL(65,30) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refund_request_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "refund_request_items_refund_request_id_idx"
  ON "refund_request_items"("refund_request_id");
CREATE INDEX IF NOT EXISTS "refund_request_items_order_item_id_idx"
  ON "refund_request_items"("order_item_id");

DO $$ BEGIN
  ALTER TABLE "refund_request_items"
    ADD CONSTRAINT "refund_request_items_refund_request_id_fkey"
    FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refund_request_items"
    ADD CONSTRAINT "refund_request_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
