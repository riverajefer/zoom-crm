-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "historical_key" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "historical_sale_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clients_historical_key_key" ON "clients"("historical_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_historical_sale_key_key" ON "orders"("historical_sale_key");

