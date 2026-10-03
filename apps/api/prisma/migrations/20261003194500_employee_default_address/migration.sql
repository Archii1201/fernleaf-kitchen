-- AlterTable
ALTER TABLE "CustomerEmployee" ADD COLUMN "defaultAddressId" TEXT;

-- CreateIndex
CREATE INDEX "CustomerEmployee_defaultAddressId_idx" ON "CustomerEmployee"("defaultAddressId");

-- AddForeignKey
ALTER TABLE "CustomerEmployee" ADD CONSTRAINT "CustomerEmployee_defaultAddressId_fkey" FOREIGN KEY ("defaultAddressId") REFERENCES "CompanyAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
