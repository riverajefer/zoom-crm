-- CreateEnum
CREATE TYPE "HistoricalSaleStatus" AS ENUM ('PAID', 'WITH_BALANCE', 'ANNULLED', 'QUOTE', 'RETURNED');

-- CreateTable
CREATE TABLE "historical_sales" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "original_number" INTEGER NOT NULL,
    "sale_date" DATE,
    "client_name" TEXT NOT NULL,
    "client_nit" TEXT,
    "client_phone" TEXT,
    "seller_name" TEXT,
    "status" "HistoricalSaleStatus" NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "received_amount" DECIMAL(65,30) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "payments_by_method" JSONB,
    "invoice_status" TEXT,
    "electronic_invoice_number" TEXT,
    "notes" TEXT,
    "source_file" TEXT NOT NULL,
    "source_sheet" TEXT NOT NULL,
    "source_rows" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "historical_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_sales_sale_date_idx" ON "historical_sales"("sale_date");

-- CreateIndex
CREATE INDEX "historical_sales_status_idx" ON "historical_sales"("status");

-- CreateIndex
CREATE INDEX "historical_sales_year_idx" ON "historical_sales"("year");

-- CreateIndex
CREATE INDEX "historical_sales_client_name_idx" ON "historical_sales"("client_name");

-- CreateIndex
CREATE INDEX "historical_sales_client_nit_idx" ON "historical_sales"("client_nit");

-- CreateIndex
CREATE INDEX "historical_sales_seller_name_idx" ON "historical_sales"("seller_name");

-- CreateIndex
CREATE UNIQUE INDEX "historical_sales_location_id_year_original_number_key" ON "historical_sales"("location_id", "year", "original_number");

-- CreateIndex
CREATE INDEX "historical_sale_items_sale_id_idx" ON "historical_sale_items"("sale_id");

-- AddForeignKey
ALTER TABLE "historical_sales" ADD CONSTRAINT "historical_sales_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_sale_items" ADD CONSTRAINT "historical_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "historical_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

