-- AlterTable
ALTER TABLE "OptionGroup" ADD COLUMN     "maxSelections" INTEGER;

-- CreateTable
CREATE TABLE "KitchenSettings" (
    "id" TEXT NOT NULL,
    "cutoffTime" TIME(0) NOT NULL,
    "cutoffWorkingDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenSettings_pkey" PRIMARY KEY ("id")
);
