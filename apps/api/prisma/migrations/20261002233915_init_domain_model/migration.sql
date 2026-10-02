-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "DishTemperature" AS ENUM ('HOT', 'COLD', 'AMBIENT');

-- CreateEnum
CREATE TYPE "PricingStrategy" AS ENUM ('EXPLICIT', 'COST_MULTIPLIER', 'BASE_MARKUP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'IN_KITCHEN', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'KITCHEN_STARTED', 'KITCHEN_READY', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "OrderEventActorType" AS ENUM ('STAFF', 'CUSTOMER_EMPLOYEE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PrepUnitStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'READY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('PENDING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceLineType" AS ENUM ('ORDER', 'CREDIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CutoffRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "staffCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergen" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietaryTag" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DietaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortionSize" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortionSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DbFile" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "data" BYTEA,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DbFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "temperature" "DishTemperature" NOT NULL,
    "costCents" INTEGER NOT NULL,
    "kitchenStationId" TEXT NOT NULL,
    "portionSizeId" TEXT,
    "imageFileId" TEXT,
    "moq" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishAllergen" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "DishAllergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishDietaryTag" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,

    CONSTRAINT "DishDietaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "portionSizeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionAllergen" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "OptionAllergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionDietaryTag" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,

    CONSTRAINT "OptionDietaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroupOption" (
    "id" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroupOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishOptionGroup" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "strategy" "PricingStrategy" NOT NULL DEFAULT 'EXPLICIT',
    "markupBasisPoints" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishTierPrice" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "priceTierId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishTierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionTierPrice" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "priceTierId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionTierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "priceTierId" TEXT NOT NULL,
    "billingContactName" TEXT,
    "billingContactEmail" TEXT,
    "billingContactPhone" TEXT,
    "ownerEmployeeId" TEXT,
    "defaultAddressId" TEXT,
    "defaultDeliveryTime" TIME(0),
    "defaultPackagingTypeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDomain" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "deliveryNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHoliday" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyWorkingDay" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyWorkingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenWorkingDay" (
    "id" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenWorkingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenHoliday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEmployee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "allergyNotes" TEXT,
    "dietaryNotes" TEXT,
    "canChooseAddress" BOOLEAN NOT NULL DEFAULT false,
    "canChooseDeliveryTime" BOOLEAN NOT NULL DEFAULT false,
    "canChoosePackaging" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEmployeeAllergen" (
    "id" TEXT NOT NULL,
    "customerEmployeeId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "CustomerEmployeeAllergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEmployeeDietaryTag" (
    "id" TEXT NOT NULL,
    "customerEmployeeId" TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,

    CONSTRAINT "CustomerEmployeeDietaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategoryDish" (
    "id" TEXT NOT NULL,
    "menuCategoryId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategoryDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHiddenCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "menuCategoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHiddenCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHiddenDish" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHiddenDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerEmployeeId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "deliveryDate" DATE NOT NULL,
    "deliveryTime" TIME(0) NOT NULL,
    "deliveryAddressId" TEXT NOT NULL,
    "deliveryAddressLabel" TEXT NOT NULL,
    "deliveryAddressLine1" TEXT NOT NULL,
    "deliveryAddressLine2" TEXT,
    "deliveryAddressCity" TEXT NOT NULL,
    "deliveryAddressState" TEXT,
    "deliveryAddressPostalCode" TEXT NOT NULL,
    "deliveryAddressCountry" TEXT NOT NULL,
    "packagingTypeId" TEXT,
    "packagingTypeName" TEXT,
    "priceTierId" TEXT NOT NULL,
    "priceTierName" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "driverStaffId" TEXT,
    "deliveryPhotoFileId" TEXT,
    "deliveryNotes" TEXT,
    "customerNotes" TEXT,
    "cutoffRunId" TEXT,
    "cutoffProcessedAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dishId" TEXT,
    "dishName" TEXT NOT NULL,
    "dishSku" TEXT NOT NULL,
    "dishDescription" TEXT,
    "dishTemperature" "DishTemperature" NOT NULL,
    "kitchenStationId" TEXT,
    "kitchenStationCode" TEXT NOT NULL,
    "kitchenStationName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCombination" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "optionsPriceCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombinationOption" (
    "id" TEXT NOT NULL,
    "orderCombinationId" TEXT NOT NULL,
    "optionId" TEXT,
    "optionGroupId" TEXT,
    "optionGroupName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "optionPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombinationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "actorType" "OrderEventActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorUserId" TEXT,
    "actorCustomerEmployeeId" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepUnit" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderCombinationId" TEXT NOT NULL,
    "kitchenStationId" TEXT,
    "kitchenStationCode" TEXT NOT NULL,
    "kitchenStationName" TEXT NOT NULL,
    "dishName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "PrepUnitStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyAddressId" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "deliveryTime" TIME(0) NOT NULL,
    "status" "DropStatus" NOT NULL DEFAULT 'PENDING',
    "driverStaffId" TEXT,
    "deliveryPhotoFileId" TEXT,
    "notes" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropOrder" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" DATE,
    "periodEnd" DATE,
    "issueDate" DATE,
    "dueDate" DATE,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "InvoiceLineType" NOT NULL,
    "orderId" TEXT,
    "orderCreditId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCredit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutoffRun" (
    "id" TEXT NOT NULL,
    "processingDate" DATE NOT NULL,
    "targetDeliveryDate" DATE NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "status" "CutoffRunStatus" NOT NULL DEFAULT 'PENDING',
    "ordersProcessed" INTEGER NOT NULL DEFAULT 0,
    "ordersConfirmed" INTEGER NOT NULL DEFAULT 0,
    "ordersRejected" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CutoffRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_staffCode_key" ON "Staff"("staffCode");

-- CreateIndex
CREATE INDEX "Staff_active_idx" ON "Staff"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Allergen_code_key" ON "Allergen"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Allergen_name_key" ON "Allergen"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DietaryTag_code_key" ON "DietaryTag"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DietaryTag_name_key" ON "DietaryTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_code_key" ON "KitchenStation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_name_key" ON "KitchenStation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingType_code_key" ON "PackagingType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingType_name_key" ON "PackagingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PortionSize_code_key" ON "PortionSize"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PortionSize_name_key" ON "PortionSize"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DbFile_storageKey_key" ON "DbFile"("storageKey");

-- CreateIndex
CREATE INDEX "DbFile_uploadedByUserId_idx" ON "DbFile"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_sku_key" ON "Dish"("sku");

-- CreateIndex
CREATE INDEX "Dish_active_idx" ON "Dish"("active");

-- CreateIndex
CREATE INDEX "Dish_kitchenStationId_idx" ON "Dish"("kitchenStationId");

-- CreateIndex
CREATE INDEX "Dish_name_idx" ON "Dish"("name");

-- CreateIndex
CREATE INDEX "DishAllergen_allergenId_idx" ON "DishAllergen"("allergenId");

-- CreateIndex
CREATE UNIQUE INDEX "DishAllergen_dishId_allergenId_key" ON "DishAllergen"("dishId", "allergenId");

-- CreateIndex
CREATE INDEX "DishDietaryTag_dietaryTagId_idx" ON "DishDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "DishDietaryTag_dishId_dietaryTagId_key" ON "DishDietaryTag"("dishId", "dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "Option_code_key" ON "Option"("code");

-- CreateIndex
CREATE INDEX "Option_active_idx" ON "Option"("active");

-- CreateIndex
CREATE INDEX "OptionAllergen_allergenId_idx" ON "OptionAllergen"("allergenId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionAllergen_optionId_allergenId_key" ON "OptionAllergen"("optionId", "allergenId");

-- CreateIndex
CREATE INDEX "OptionDietaryTag_dietaryTagId_idx" ON "OptionDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionDietaryTag_optionId_dietaryTagId_key" ON "OptionDietaryTag"("optionId", "dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionGroup_code_key" ON "OptionGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OptionGroup_name_key" ON "OptionGroup"("name");

-- CreateIndex
CREATE INDEX "OptionGroupOption_optionId_idx" ON "OptionGroupOption"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionGroupOption_optionGroupId_optionId_key" ON "OptionGroupOption"("optionGroupId", "optionId");

-- CreateIndex
CREATE INDEX "DishOptionGroup_optionGroupId_idx" ON "DishOptionGroup"("optionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "DishOptionGroup_dishId_optionGroupId_key" ON "DishOptionGroup"("dishId", "optionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_code_key" ON "PriceTier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_name_key" ON "PriceTier"("name");

-- CreateIndex
CREATE INDEX "DishTierPrice_priceTierId_idx" ON "DishTierPrice"("priceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "DishTierPrice_dishId_priceTierId_key" ON "DishTierPrice"("dishId", "priceTierId");

-- CreateIndex
CREATE INDEX "OptionTierPrice_priceTierId_idx" ON "OptionTierPrice"("priceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionTierPrice_optionId_priceTierId_key" ON "OptionTierPrice"("optionId", "priceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerEmployeeId_key" ON "Company"("ownerEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_defaultAddressId_key" ON "Company"("defaultAddressId");

-- CreateIndex
CREATE INDEX "Company_priceTierId_idx" ON "Company"("priceTierId");

-- CreateIndex
CREATE INDEX "Company_active_idx" ON "Company"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDomain_domain_key" ON "CompanyDomain"("domain");

-- CreateIndex
CREATE INDEX "CompanyDomain_companyId_idx" ON "CompanyDomain"("companyId");

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_active_idx" ON "CompanyAddress"("companyId", "active");

-- CreateIndex
CREATE INDEX "CompanyHoliday_date_idx" ON "CompanyHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_companyId_date_key" ON "CompanyHoliday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyWorkingDay_companyId_weekday_key" ON "CompanyWorkingDay"("companyId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenWorkingDay_weekday_key" ON "KitchenWorkingDay"("weekday");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenHoliday_date_key" ON "KitchenHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEmployee_email_key" ON "CustomerEmployee"("email");

-- CreateIndex
CREATE INDEX "CustomerEmployee_companyId_active_idx" ON "CustomerEmployee"("companyId", "active");

-- CreateIndex
CREATE INDEX "CustomerEmployeeAllergen_allergenId_idx" ON "CustomerEmployeeAllergen"("allergenId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEmployeeAllergen_customerEmployeeId_allergenId_key" ON "CustomerEmployeeAllergen"("customerEmployeeId", "allergenId");

-- CreateIndex
CREATE INDEX "CustomerEmployeeDietaryTag_dietaryTagId_idx" ON "CustomerEmployeeDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEmployeeDietaryTag_customerEmployeeId_dietaryTagId_key" ON "CustomerEmployeeDietaryTag"("customerEmployeeId", "dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_slug_key" ON "MenuCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_name_key" ON "MenuCategory"("name");

-- CreateIndex
CREATE INDEX "MenuCategory_active_displayOrder_idx" ON "MenuCategory"("active", "displayOrder");

-- CreateIndex
CREATE INDEX "MenuCategoryDish_dishId_idx" ON "MenuCategoryDish"("dishId");

-- CreateIndex
CREATE INDEX "MenuCategoryDish_menuCategoryId_displayOrder_idx" ON "MenuCategoryDish"("menuCategoryId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategoryDish_menuCategoryId_dishId_key" ON "MenuCategoryDish"("menuCategoryId", "dishId");

-- CreateIndex
CREATE INDEX "CompanyHiddenCategory_menuCategoryId_idx" ON "CompanyHiddenCategory"("menuCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHiddenCategory_companyId_menuCategoryId_key" ON "CompanyHiddenCategory"("companyId", "menuCategoryId");

-- CreateIndex
CREATE INDEX "CompanyHiddenDish_dishId_idx" ON "CompanyHiddenDish"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHiddenDish_companyId_dishId_key" ON "CompanyHiddenDish"("companyId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_companyId_deliveryDate_idx" ON "Order"("companyId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_status_idx" ON "Order"("deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_customerEmployeeId_idx" ON "Order"("customerEmployeeId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_driverStaffId_idx" ON "Order"("driverStaffId");

-- CreateIndex
CREATE INDEX "Order_cutoffRunId_idx" ON "Order"("cutoffRunId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_dishId_idx" ON "OrderLine"("dishId");

-- CreateIndex
CREATE INDEX "OrderCombination_orderLineId_idx" ON "OrderCombination"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCombination_orderLineId_signature_key" ON "OrderCombination"("orderLineId", "signature");

-- CreateIndex
CREATE INDEX "CombinationOption_orderCombinationId_idx" ON "CombinationOption"("orderCombinationId");

-- CreateIndex
CREATE INDEX "CombinationOption_optionId_idx" ON "CombinationOption"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "CombinationOption_orderCombinationId_optionId_key" ON "CombinationOption"("orderCombinationId", "optionId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_occurredAt_idx" ON "OrderEvent"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "OrderEvent_type_idx" ON "OrderEvent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PrepUnit_orderCombinationId_key" ON "PrepUnit"("orderCombinationId");

-- CreateIndex
CREATE INDEX "PrepUnit_status_idx" ON "PrepUnit"("status");

-- CreateIndex
CREATE INDEX "PrepUnit_kitchenStationId_status_idx" ON "PrepUnit"("kitchenStationId", "status");

-- CreateIndex
CREATE INDEX "PrepUnit_orderId_idx" ON "PrepUnit"("orderId");

-- CreateIndex
CREATE INDEX "Drop_companyId_deliveryDate_idx" ON "Drop"("companyId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Drop_deliveryDate_status_idx" ON "Drop"("deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Drop_status_idx" ON "Drop"("status");

-- CreateIndex
CREATE INDEX "Drop_driverStaffId_idx" ON "Drop"("driverStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_companyId_companyAddressId_deliveryDate_deliveryTime_key" ON "Drop"("companyId", "companyAddressId", "deliveryDate", "deliveryTime");

-- CreateIndex
CREATE UNIQUE INDEX "DropOrder_orderId_key" ON "DropOrder"("orderId");

-- CreateIndex
CREATE INDEX "DropOrder_dropId_idx" ON "DropOrder"("dropId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_periodStart_periodEnd_idx" ON "Invoice"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_orderId_key" ON "InvoiceLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_orderCreditId_key" ON "InvoiceLine"("orderCreditId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_type_idx" ON "InvoiceLine"("type");

-- CreateIndex
CREATE INDEX "OrderCredit_companyId_idx" ON "OrderCredit"("companyId");

-- CreateIndex
CREATE INDEX "OrderCredit_orderId_idx" ON "OrderCredit"("orderId");

-- CreateIndex
CREATE INDEX "CutoffRun_targetDeliveryDate_idx" ON "CutoffRun"("targetDeliveryDate");

-- CreateIndex
CREATE INDEX "CutoffRun_status_idx" ON "CutoffRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CutoffRun_processingDate_targetDeliveryDate_key" ON "CutoffRun"("processingDate", "targetDeliveryDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DbFile" ADD CONSTRAINT "DbFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "DbFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupOption" ADD CONSTRAINT "OptionGroupOption_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupOption" ADD CONSTRAINT "OptionGroupOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishOptionGroup" ADD CONSTRAINT "DishOptionGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishOptionGroup" ADD CONSTRAINT "DishOptionGroup_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTierPrice" ADD CONSTRAINT "DishTierPrice_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTierPrice" ADD CONSTRAINT "DishTierPrice_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionTierPrice" ADD CONSTRAINT "OptionTierPrice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionTierPrice" ADD CONSTRAINT "OptionTierPrice_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "CustomerEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultAddressId_fkey" FOREIGN KEY ("defaultAddressId") REFERENCES "CompanyAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultPackagingTypeId_fkey" FOREIGN KEY ("defaultPackagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyWorkingDay" ADD CONSTRAINT "CompanyWorkingDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEmployee" ADD CONSTRAINT "CustomerEmployee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEmployeeAllergen" ADD CONSTRAINT "CustomerEmployeeAllergen_customerEmployeeId_fkey" FOREIGN KEY ("customerEmployeeId") REFERENCES "CustomerEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEmployeeAllergen" ADD CONSTRAINT "CustomerEmployeeAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEmployeeDietaryTag" ADD CONSTRAINT "CustomerEmployeeDietaryTag_customerEmployeeId_fkey" FOREIGN KEY ("customerEmployeeId") REFERENCES "CustomerEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEmployeeDietaryTag" ADD CONSTRAINT "CustomerEmployeeDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategoryDish" ADD CONSTRAINT "MenuCategoryDish_menuCategoryId_fkey" FOREIGN KEY ("menuCategoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategoryDish" ADD CONSTRAINT "MenuCategoryDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_menuCategoryId_fkey" FOREIGN KEY ("menuCategoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenDish" ADD CONSTRAINT "CompanyHiddenDish_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenDish" ADD CONSTRAINT "CompanyHiddenDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerEmployeeId_fkey" FOREIGN KEY ("customerEmployeeId") REFERENCES "CustomerEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "CompanyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverStaffId_fkey" FOREIGN KEY ("driverStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryPhotoFileId_fkey" FOREIGN KEY ("deliveryPhotoFileId") REFERENCES "DbFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cutoffRunId_fkey" FOREIGN KEY ("cutoffRunId") REFERENCES "CutoffRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCombination" ADD CONSTRAINT "OrderCombination_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_orderCombinationId_fkey" FOREIGN KEY ("orderCombinationId") REFERENCES "OrderCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorCustomerEmployeeId_fkey" FOREIGN KEY ("actorCustomerEmployeeId") REFERENCES "CustomerEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepUnit" ADD CONSTRAINT "PrepUnit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepUnit" ADD CONSTRAINT "PrepUnit_orderCombinationId_fkey" FOREIGN KEY ("orderCombinationId") REFERENCES "OrderCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepUnit" ADD CONSTRAINT "PrepUnit_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_companyAddressId_fkey" FOREIGN KEY ("companyAddressId") REFERENCES "CompanyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_driverStaffId_fkey" FOREIGN KEY ("driverStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_deliveryPhotoFileId_fkey" FOREIGN KEY ("deliveryPhotoFileId") REFERENCES "DbFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropOrder" ADD CONSTRAINT "DropOrder_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropOrder" ADD CONSTRAINT "DropOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_orderCreditId_fkey" FOREIGN KEY ("orderCreditId") REFERENCES "OrderCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCredit" ADD CONSTRAINT "OrderCredit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCredit" ADD CONSTRAINT "OrderCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCredit" ADD CONSTRAINT "OrderCredit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
