-- CreateTable
CREATE TABLE "DemoOwnedRecord" (
    "key" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoOwnedRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DemoOwnedRecord_entityType_entityId_idx" ON "DemoOwnedRecord"("entityType", "entityId");
