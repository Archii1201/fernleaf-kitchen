-- AlterTable
ALTER TABLE "PriceTier" ADD COLUMN     "baseTierId" TEXT;

-- CreateIndex
CREATE INDEX "PriceTier_baseTierId_idx" ON "PriceTier"("baseTierId");

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_baseTierId_fkey" FOREIGN KEY ("baseTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
