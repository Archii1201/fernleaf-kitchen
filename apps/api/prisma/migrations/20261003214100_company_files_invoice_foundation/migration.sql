-- Company leave-kitchen default is 60 minutes (not the kitchen prep interval).
ALTER TABLE "Company" ALTER COLUMN "leaveKitchenMinutes" SET DEFAULT 60;
UPDATE "Company" SET "leaveKitchenMinutes" = 60 WHERE "leaveKitchenMinutes" = 30;

-- Company may inherit the default price tier.
ALTER TABLE "Company" ALTER COLUMN "priceTierId" DROP NOT NULL;

-- Order snapshot + kitchen timestamps + current invoice pointer.
ALTER TABLE "Order" ADD COLUMN "leaveKitchenMinutes" INTEGER;
UPDATE "Order" AS o
SET "leaveKitchenMinutes" = c."leaveKitchenMinutes"
FROM "Company" AS c
WHERE c."id" = o."companyId";
UPDATE "Order" SET "leaveKitchenMinutes" = 60 WHERE "leaveKitchenMinutes" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "leaveKitchenMinutes" SET NOT NULL;

ALTER TABLE "Order" ADD COLUMN "kitchenStartedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "kitchenReadyAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "dispatchReadyAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "invoiceId" TEXT;

CREATE INDEX "Order_invoiceId_idx" ON "Order"("invoiceId");
CREATE INDEX "Order_kitchenStartedAt_idx" ON "Order"("kitchenStartedAt");
CREATE INDEX "Order_kitchenReadyAt_idx" ON "Order"("kitchenReadyAt");
CREATE INDEX "Order_dispatchReadyAt_idx" ON "Order"("dispatchReadyAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop timing / note fields.
ALTER TABLE "Drop" ADD COLUMN "outForDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Drop" ADD COLUMN "note" TEXT;
ALTER TABLE "Drop" ADD COLUMN "onTime" BOOLEAN;
CREATE INDEX "Drop_outForDeliveryAt_idx" ON "Drop"("outForDeliveryAt");

-- OrderCredit current invoice pointer.
ALTER TABLE "OrderCredit" ADD COLUMN "invoiceId" TEXT;
CREATE INDEX "OrderCredit_invoiceId_idx" ON "OrderCredit"("invoiceId");
ALTER TABLE "OrderCredit" ADD CONSTRAINT "OrderCredit_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historical invoice lines: drop the "invoiced at most once" uniques.
DROP INDEX IF EXISTS "InvoiceLine_orderId_key";
DROP INDEX IF EXISTS "InvoiceLine_orderCreditId_key";
CREATE INDEX IF NOT EXISTS "InvoiceLine_orderId_idx" ON "InvoiceLine"("orderId");
CREATE INDEX IF NOT EXISTS "InvoiceLine_orderCreditId_idx" ON "InvoiceLine"("orderCreditId");
