-- AlterTable
ALTER TABLE "Company" ADD COLUMN "leaveKitchenMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Company" ADD COLUMN "driverInstructions" TEXT;
ALTER TABLE "Company" ADD COLUMN "defaultDriverStaffId" TEXT;

-- CreateIndex
CREATE INDEX "Company_defaultDriverStaffId_idx" ON "Company"("defaultDriverStaffId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultDriverStaffId_fkey" FOREIGN KEY ("defaultDriverStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
