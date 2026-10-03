-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'DISPATCH_READY';

-- AlterTable
ALTER TABLE "KitchenSettings" ADD COLUMN "deliveryGraceMinutes" INTEGER NOT NULL DEFAULT 15;
