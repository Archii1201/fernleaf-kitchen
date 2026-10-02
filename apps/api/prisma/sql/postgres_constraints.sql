-- Fernleaf Kitchen - PostgreSQL constraints that schema.prisma cannot express.
--
-- Append the contents of this file to the generated Prisma migration before
-- applying it (see docs/explanation/step3.md, "Migration notes"). Every
-- statement is written as DROP ... IF EXISTS + ADD so the file can also be
-- replayed by hand against an existing database without failing.

-- ---------------------------------------------------------------------------
-- 1. Exactly one default price tier.
--
-- @@unique([isDefault]) in Prisma would forbid more than one NON-default tier
-- as well, which is wrong. A partial unique index constrains only the rows
-- where isDefault is true, so there can be many non-default tiers and at most
-- one default one.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "PriceTier_one_default_key";
CREATE UNIQUE INDEX "PriceTier_one_default_key"
  ON "PriceTier" ("isDefault")
  WHERE "isDefault";

-- ---------------------------------------------------------------------------
-- 2. Money must never be negative; quantities and credits must be positive.
--    These are invariants of the data, not of a single code path, so they
--    belong in the database.
-- ---------------------------------------------------------------------------

ALTER TABLE "Dish"
  DROP CONSTRAINT IF EXISTS "Dish_costCents_non_negative",
  ADD CONSTRAINT "Dish_costCents_non_negative" CHECK ("costCents" >= 0),
  DROP CONSTRAINT IF EXISTS "Dish_moq_positive",
  ADD CONSTRAINT "Dish_moq_positive" CHECK ("moq" IS NULL OR "moq" > 0);

ALTER TABLE "Option"
  DROP CONSTRAINT IF EXISTS "Option_costCents_non_negative",
  ADD CONSTRAINT "Option_costCents_non_negative" CHECK ("costCents" >= 0);

ALTER TABLE "PriceTier"
  DROP CONSTRAINT IF EXISTS "PriceTier_markupBasisPoints_non_negative",
  ADD CONSTRAINT "PriceTier_markupBasisPoints_non_negative"
    CHECK ("markupBasisPoints" IS NULL OR "markupBasisPoints" >= 0);

ALTER TABLE "DishTierPrice"
  DROP CONSTRAINT IF EXISTS "DishTierPrice_priceCents_non_negative",
  ADD CONSTRAINT "DishTierPrice_priceCents_non_negative" CHECK ("priceCents" >= 0);

ALTER TABLE "OptionTierPrice"
  DROP CONSTRAINT IF EXISTS "OptionTierPrice_priceCents_non_negative",
  ADD CONSTRAINT "OptionTierPrice_priceCents_non_negative" CHECK ("priceCents" >= 0);

ALTER TABLE "Order"
  DROP CONSTRAINT IF EXISTS "Order_subtotalCents_non_negative",
  ADD CONSTRAINT "Order_subtotalCents_non_negative" CHECK ("subtotalCents" >= 0),
  DROP CONSTRAINT IF EXISTS "Order_totalCents_non_negative",
  ADD CONSTRAINT "Order_totalCents_non_negative" CHECK ("totalCents" >= 0);

ALTER TABLE "OrderLine"
  DROP CONSTRAINT IF EXISTS "OrderLine_quantity_positive",
  ADD CONSTRAINT "OrderLine_quantity_positive" CHECK ("quantity" > 0),
  DROP CONSTRAINT IF EXISTS "OrderLine_unitPriceCents_non_negative",
  ADD CONSTRAINT "OrderLine_unitPriceCents_non_negative" CHECK ("unitPriceCents" >= 0),
  DROP CONSTRAINT IF EXISTS "OrderLine_lineTotalCents_non_negative",
  ADD CONSTRAINT "OrderLine_lineTotalCents_non_negative" CHECK ("lineTotalCents" >= 0);

ALTER TABLE "OrderCombination"
  DROP CONSTRAINT IF EXISTS "OrderCombination_quantity_positive",
  ADD CONSTRAINT "OrderCombination_quantity_positive" CHECK ("quantity" > 0),
  DROP CONSTRAINT IF EXISTS "OrderCombination_money_non_negative",
  ADD CONSTRAINT "OrderCombination_money_non_negative"
    CHECK ("unitPriceCents" >= 0 AND "optionsPriceCents" >= 0 AND "totalCents" >= 0);

ALTER TABLE "CombinationOption"
  DROP CONSTRAINT IF EXISTS "CombinationOption_optionPriceCents_non_negative",
  ADD CONSTRAINT "CombinationOption_optionPriceCents_non_negative"
    CHECK ("optionPriceCents" >= 0);

ALTER TABLE "PrepUnit"
  DROP CONSTRAINT IF EXISTS "PrepUnit_quantity_positive",
  ADD CONSTRAINT "PrepUnit_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "Invoice"
  DROP CONSTRAINT IF EXISTS "Invoice_money_non_negative",
  ADD CONSTRAINT "Invoice_money_non_negative"
    CHECK ("subtotalCents" >= 0 AND "creditCents" >= 0 AND "totalCents" >= 0);

ALTER TABLE "OrderCredit"
  DROP CONSTRAINT IF EXISTS "OrderCredit_amountCents_positive",
  ADD CONSTRAINT "OrderCredit_amountCents_positive" CHECK ("amountCents" > 0);

ALTER TABLE "DbFile"
  DROP CONSTRAINT IF EXISTS "DbFile_sizeBytes_non_negative",
  ADD CONSTRAINT "DbFile_sizeBytes_non_negative" CHECK ("sizeBytes" >= 0);

-- ---------------------------------------------------------------------------
-- 3. An invoice line must match its own type: an ORDER line points at an
--    order, a CREDIT line at a credit, an ADJUSTMENT line at neither.
--    (The "at most once invoiced" rule is already enforced by the single
--    column unique indexes on the nullable "orderId"/"orderCreditId", because
--    PostgreSQL treats NULLs as distinct.)
-- ---------------------------------------------------------------------------

ALTER TABLE "InvoiceLine"
  DROP CONSTRAINT IF EXISTS "InvoiceLine_target_matches_type",
  ADD CONSTRAINT "InvoiceLine_target_matches_type" CHECK (
    ("type" = 'ORDER'      AND "orderId" IS NOT NULL AND "orderCreditId" IS NULL)
    OR ("type" = 'CREDIT'  AND "orderCreditId" IS NOT NULL AND "orderId" IS NULL)
    OR ("type" = 'ADJUSTMENT' AND "orderId" IS NULL AND "orderCreditId" IS NULL)
  );
