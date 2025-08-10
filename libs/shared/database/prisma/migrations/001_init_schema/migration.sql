-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'MOBILE_PAYMENT', 'CRYPTO', 'CHECK');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'OUT_OF_ORDER', 'MAINTENANCE', 'CLEANING', 'RESERVED');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL', 'FAMILY', 'ACCESSIBLE', 'STUDIO', 'PENTHOUSE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('REVENUE', 'EXPENSE', 'REFUND', 'FEE', 'TAX', 'ADJUSTMENT', 'DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "GuestType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'GROUP', 'VIP', 'LOYALTY_MEMBER');

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "guestType" "GuestType" NOT NULL DEFAULT 'INDIVIDUAL',
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "dateOfBirth" DATE,
    "addressLine1" VARCHAR(255),
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(100),
    "companyName" VARCHAR(255),
    "taxId" VARCHAR(50),
    "preferences" JSONB,
    "specialRequests" TEXT,
    "notes" TEXT,
    "loyaltyNumber" VARCHAR(50),
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdBy" VARCHAR(100),
    "updatedBy" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "roomNumber" VARCHAR(20) NOT NULL,
    "roomType" "RoomType" NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "floor" INTEGER,
    "building" VARCHAR(50),
    "maxOccupancy" INTEGER NOT NULL DEFAULT 2,
    "bedCount" INTEGER NOT NULL DEFAULT 1,
    "bedType" VARCHAR(50),
    "amenities" JSONB,
    "area" DECIMAL(8,2),
    "hasBalcony" BOOLEAN NOT NULL DEFAULT false,
    "hasKitchen" BOOLEAN NOT NULL DEFAULT false,
    "isAccessible" BOOLEAN NOT NULL DEFAULT false,
    "smokingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "baseRate" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "lastCleaned" TIMESTAMPTZ,
    "lastMaintenance" TIMESTAMPTZ,
    "outOfOrderReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdBy" VARCHAR(100),
    "updatedBy" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "baseRate" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "minimumStay" INTEGER NOT NULL DEFAULT 1,
    "maximumStay" INTEGER,
    "advanceBooking" INTEGER,
    "weekdayMultiplier" DECIMAL(4,3) NOT NULL DEFAULT 1.0,
    "weekendMultiplier" DECIMAL(4,3) NOT NULL DEFAULT 1.0,
    "holidayMultiplier" DECIMAL(4,3) NOT NULL DEFAULT 1.0,
    "isRefundable" BOOLEAN NOT NULL DEFAULT true,
    "cancellationHours" INTEGER NOT NULL DEFAULT 24,
    "prepaymentRequired" BOOLEAN NOT NULL DEFAULT false,
    "inclusions" JSONB,
    "restrictions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdBy" VARCHAR(100),
    "updatedBy" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_rate_plans" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "overrideRate" DECIMAL(10,2),
    "validFrom" DATE,
    "validTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "room_rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "reservationNumber" VARCHAR(50) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "guestId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "roomRate" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fees" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "bookedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookedBy" VARCHAR(100),
    "source" VARCHAR(50),
    "confirmationSentAt" TIMESTAMPTZ,
    "actualCheckIn" TIMESTAMPTZ,
    "actualCheckOut" TIMESTAMPTZ,
    "earlyCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "lateCheckOut" BOOLEAN NOT NULL DEFAULT false,
    "specialRequests" TEXT,
    "internalNotes" TEXT,
    "guestNotes" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "cancelledBy" VARCHAR(100),
    "cancellationReason" TEXT,
    "refundAmount" DECIMAL(10,2),
    "groupId" VARCHAR(50),
    "isGroupMaster" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdBy" VARCHAR(100),
    "updatedBy" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" VARCHAR(50) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "guestId" TEXT NOT NULL,
    "reservationId" TEXT,
    "transactionId" VARCHAR(255),
    "gatewayResponse" JSONB,
    "authorizationCode" VARCHAR(50),
    "authorizedAt" TIMESTAMPTZ,
    "settledAt" TIMESTAMPTZ,
    "cardToken" VARCHAR(255),
    "cardLast4" VARCHAR(4),
    "cardBrand" VARCHAR(20),
    "cardExpiryMonth" INTEGER,
    "cardExpiryYear" INTEGER,
    "refundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMPTZ,
    "refundReason" TEXT,
    "processingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(10,2),
    "failureReason" TEXT,
    "failedAt" TIMESTAMPTZ,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "reference" VARCHAR(255),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdBy" VARCHAR(100),
    "updatedBy" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entryNumber" VARCHAR(50) NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "description" VARCHAR(500) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "guestId" TEXT,
    "reservationId" TEXT,
    "paymentId" TEXT,
    "debitAccount" VARCHAR(50) NOT NULL,
    "creditAccount" VARCHAR(50) NOT NULL,
    "reference" VARCHAR(255),
    "businessDate" DATE NOT NULL,
    "shiftId" VARCHAR(50),
    "locationId" VARCHAR(50),
    "departmentId" VARCHAR(50),
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,4),
    "taxCode" VARCHAR(10),
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMPTZ,
    "reconciledBy" VARCHAR(100),
    "batchId" VARCHAR(50),
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" TIMESTAMPTZ,
    "reversalEntryId" TEXT,
    "reversalReason" TEXT,
    "metadata" JSONB,
    "notes" TEXT,
    "externalId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdBy" VARCHAR(100) NOT NULL,
    "updatedBy" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tableName" VARCHAR(50) NOT NULL,
    "recordId" VARCHAR(50) NOT NULL,
    "operation" VARCHAR(10) NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "changedFields" VARCHAR(100)[],
    "userId" VARCHAR(100),
    "userAgent" VARCHAR(500),
    "ipAddress" VARCHAR(45),
    "sessionId" VARCHAR(100),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "guests_email_key" ON "guests"("email");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "guests_loyaltyNumber_key" ON "guests"("loyaltyNumber");

-- CreateIndex
CREATE INDEX "guests_email_idx" ON "guests"("email");

-- CreateIndex
CREATE INDEX "guests_lastName_firstName_idx" ON "guests"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "guests_loyaltyNumber_idx" ON "guests"("loyaltyNumber");

-- CreateIndex
CREATE INDEX "guests_guestType_idx" ON "guests"("guestType");

-- CreateIndex
CREATE INDEX "guests_createdAt_idx" ON "guests"("createdAt");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "rooms_roomNumber_key" ON "rooms"("roomNumber");

-- CreateIndex
CREATE INDEX "rooms_roomNumber_idx" ON "rooms"("roomNumber");

-- CreateIndex
CREATE INDEX "rooms_roomType_idx" ON "rooms"("roomType");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- CreateIndex
CREATE INDEX "rooms_floor_idx" ON "rooms"("floor");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "rate_plans_code_key" ON "rate_plans"("code");

-- CreateIndex
CREATE INDEX "rate_plans_code_idx" ON "rate_plans"("code");

-- CreateIndex
CREATE INDEX "rate_plans_validFrom_validTo_idx" ON "rate_plans"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "rate_plans_isActive_idx" ON "rate_plans"("isActive");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "room_rate_plans_roomId_ratePlanId_key" ON "room_rate_plans"("roomId", "ratePlanId");

-- CreateIndex
CREATE INDEX "room_rate_plans_roomId_idx" ON "room_rate_plans"("roomId");

-- CreateIndex
CREATE INDEX "room_rate_plans_ratePlanId_idx" ON "room_rate_plans"("ratePlanId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "reservations_reservationNumber_key" ON "reservations"("reservationNumber");

-- CreateIndex
CREATE INDEX "reservations_reservationNumber_idx" ON "reservations"("reservationNumber");

-- CreateIndex
CREATE INDEX "reservations_guestId_idx" ON "reservations"("guestId");

-- CreateIndex
CREATE INDEX "reservations_roomId_idx" ON "reservations"("roomId");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_checkInDate_checkOutDate_idx" ON "reservations"("checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "reservations_bookedAt_idx" ON "reservations"("bookedAt");

-- CreateIndex
CREATE INDEX "reservations_groupId_idx" ON "reservations"("groupId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "payments_paymentNumber_key" ON "payments"("paymentNumber");

-- CreateIndex
CREATE INDEX "payments_paymentNumber_idx" ON "payments"("paymentNumber");

-- CreateIndex
CREATE INDEX "payments_guestId_idx" ON "payments"("guestId");

-- CreateIndex
CREATE INDEX "payments_reservationId_idx" ON "payments"("reservationId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "payments_transactionId_idx" ON "payments"("transactionId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ledger_entries_entryNumber_key" ON "ledger_entries"("entryNumber");

-- CreateIndex
CREATE INDEX "ledger_entries_entryNumber_idx" ON "ledger_entries"("entryNumber");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionDate_idx" ON "ledger_entries"("transactionDate");

-- CreateIndex
CREATE INDEX "ledger_entries_businessDate_idx" ON "ledger_entries"("businessDate");

-- CreateIndex
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries"("type");

-- CreateIndex
CREATE INDEX "ledger_entries_guestId_idx" ON "ledger_entries"("guestId");

-- CreateIndex
CREATE INDEX "ledger_entries_reservationId_idx" ON "ledger_entries"("reservationId");

-- CreateIndex
CREATE INDEX "ledger_entries_paymentId_idx" ON "ledger_entries"("paymentId");

-- CreateIndex
CREATE INDEX "ledger_entries_debitAccount_idx" ON "ledger_entries"("debitAccount");

-- CreateIndex
CREATE INDEX "ledger_entries_creditAccount_idx" ON "ledger_entries"("creditAccount");

-- CreateIndex
CREATE INDEX "ledger_entries_isReconciled_idx" ON "ledger_entries"("isReconciled");

-- CreateIndex
CREATE INDEX "ledger_entries_createdAt_idx" ON "ledger_entries"("createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_batchId_idx" ON "ledger_entries"("batchId");

-- CreateIndex
CREATE INDEX "audit_logs_tableName_recordId_idx" ON "audit_logs"("tableName", "recordId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_operation_idx" ON "audit_logs"("operation");

-- AddForeignKey
ALTER TABLE "room_rate_plans" ADD CONSTRAINT "room_rate_plans_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_rate_plans" ADD CONSTRAINT "room_rate_plans_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversalEntryId_fkey" FOREIGN KEY ("reversalEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
