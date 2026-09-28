-- Fase 2 de sedes (solo Zoom, docs/PLAN_SEDES.md): cada documento pertenece a
-- una sede, y la numeración pasa a llevar un contador por (tipo, sede).
--
-- Es el punto de no retorno con High: desde aquí un cherry-pick que toque
-- órdenes, cotizaciones, gastos o caja va a chocar.
--
-- Las filas que ya existen (solo en bases de prueba: producción arranca vacía)
-- se asignan al Local 125, como decidió el plan (§15.3).

-- Los contadores son un caché: el número real se calcula contra la tabla de
-- cada documento. Con la sede en la llave, los viejos no sirven.
DELETE FROM "consecutives";
DROP INDEX "consecutives_type_key";
ALTER TABLE "consecutives" ADD COLUMN "location_id" TEXT NOT NULL;

-- Documentos: la columna nace vacía, se rellena con el 125 y queda obligatoria.
ALTER TABLE "accounts_payable" ADD COLUMN "location_id" TEXT;
UPDATE "accounts_payable" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "accounts_payable" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "cash_registers" ADD COLUMN "location_id" TEXT;
UPDATE "cash_registers" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "cash_registers" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "dtf_records" ADD COLUMN "location_id" TEXT;
UPDATE "dtf_records" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "dtf_records" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "expense_orders" ADD COLUMN "location_id" TEXT;
UPDATE "expense_orders" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "expense_orders" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "orders" ADD COLUMN "location_id" TEXT;
UPDATE "orders" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "orders" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "production_orders" ADD COLUMN "location_id" TEXT;
UPDATE "production_orders" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "production_orders" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "quotes" ADD COLUMN "location_id" TEXT;
UPDATE "quotes" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "quotes" ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "work_orders" ADD COLUMN "location_id" TEXT;
UPDATE "work_orders" SET "location_id" = (SELECT "id" FROM "locations" WHERE "code" = '125');
ALTER TABLE "work_orders" ALTER COLUMN "location_id" SET NOT NULL;

-- Empleados: la sede de su usuario si la tiene; si no, queda vacía (opcional).
ALTER TABLE "employees" ADD COLUMN "location_id" TEXT;
UPDATE "employees" e SET "location_id" = u."default_location_id"
  FROM "users" u WHERE u."id" = e."userId" AND u."default_location_id" IS NOT NULL;

-- Asistencia y movimientos de inventario: la sede donde ocurrió. En los
-- registros anteriores no se sabe, así que quedan vacíos.
ALTER TABLE "attendance_records" ADD COLUMN "location_id" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "location_id" TEXT;

-- CreateIndex
CREATE INDEX "accounts_payable_location_id_idx" ON "accounts_payable"("location_id");

-- CreateIndex
CREATE INDEX "attendance_records_location_id_idx" ON "attendance_records"("location_id");

-- CreateIndex
CREATE INDEX "cash_registers_location_id_idx" ON "cash_registers"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "consecutives_type_location_id_key" ON "consecutives"("type", "location_id");

-- CreateIndex
CREATE INDEX "dtf_records_location_id_idx" ON "dtf_records"("location_id");

-- CreateIndex
CREATE INDEX "employees_location_id_idx" ON "employees"("location_id");

-- CreateIndex
CREATE INDEX "expense_orders_location_id_idx" ON "expense_orders"("location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_location_id_idx" ON "inventory_movements"("location_id");

-- CreateIndex
CREATE INDEX "orders_location_id_idx" ON "orders"("location_id");

-- CreateIndex
CREATE INDEX "production_orders_location_id_idx" ON "production_orders"("location_id");

-- CreateIndex
CREATE INDEX "quotes_location_id_idx" ON "quotes"("location_id");

-- CreateIndex
CREATE INDEX "work_orders_location_id_idx" ON "work_orders"("location_id");

-- AddForeignKey
ALTER TABLE "consecutives" ADD CONSTRAINT "consecutives_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_orders" ADD CONSTRAINT "expense_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_records" ADD CONSTRAINT "dtf_records_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

