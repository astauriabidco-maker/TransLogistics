-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'HUB_OPERATOR', 'DRIVER', 'HUB_ADMIN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "HubStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PricingRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'CREATED', 'RECEIVED_AT_HUB', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'PROCESSING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CINETPAY', 'NOTCHPAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MOBILE_MONEY', 'CASH', 'CARD');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "DispatchTaskStatus" AS ENUM ('CREATED', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'PICKED_UP', 'EN_ROUTE_DELIVERY', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('CREATED', 'CONVERTED', 'REWARDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WhatsAppState" AS ENUM ('INIT', 'CHOIX_SERVICE', 'SCAN_PHOTO', 'CALCUL_PRIX', 'CONFIRMATION', 'PAIEMENT', 'SUIVI');

-- CreateEnum
CREATE TYPE "ScanRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "WeightSource" AS ENUM ('DECLARED', 'AI_SCAN', 'MANUAL');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WHATSAPP_CTA', 'WHATSAPP_DIRECT', 'WEB', 'REFERRAL', 'B2B_CONTACT', 'AGENT_ONBOARDING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RouteCostType" AS ENUM ('FUEL', 'DRIVER_WAGE', 'CUSTOMS', 'HANDLING', 'INSURANCE', 'THIRD_PARTY', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('SUBMITTED', 'QUOTED', 'APPROVED', 'REJECTED', 'ORDERING', 'AWAITING_ARRIVAL', 'READY_TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('DRAFT', 'PLACED', 'SHIPPED_TO_HUB', 'RECEIVED', 'CONSOLIDATED', 'EXCEPTION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierOrderExceptionType" AS ENUM ('MISSING_ITEMS', 'DAMAGED', 'WRONG_ITEM', 'DELAYED', 'LOST', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsolidationBatchStatus" AS ENUM ('OPEN', 'CLOSED', 'PACKED', 'SHIPMENT_CREATED');

-- CreateEnum
CREATE TYPE "ServiceFeeType" AS ENUM ('PROCUREMENT', 'HANDLING', 'CONSOLIDATION', 'CUSTOMS');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTO', 'TRICYCLE', 'VAN');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RoutePlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentDeliveryStatus" AS ENUM ('PENDING_PICKUP', 'IN_TRANSIT', 'DELIVERY_ATTEMPT', 'DELIVERED', 'PENDING_RETRY', 'RETURNED_TO_HUB', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "DeliveryProofType" AS ENUM ('SIGNATURE', 'PHOTO', 'OTP', 'RECIPIENT_ABSENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "hubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hubs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "HubStatus" NOT NULL DEFAULT 'DRAFT',
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CI',
    "postalCode" TEXT,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Abidjan',
    "openingTime" TEXT NOT NULL DEFAULT '08:00',
    "closingTime" TEXT NOT NULL DEFAULT '18:00',
    "maxDailyCapacity" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "hubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "originHubId" TEXT NOT NULL,
    "destinationHubId" TEXT NOT NULL,
    "distanceKm" DECIMAL(10,2) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "deprecatedAt" TIMESTAMP(3),

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "status" "PricingRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "routeId" TEXT NOT NULL,
    "basePriceXof" DECIMAL(12,2) NOT NULL,
    "pricePerKg" DECIMAL(10,2) NOT NULL,
    "pricePerCm3" DECIMAL(10,6) NOT NULL,
    "minimumPriceXof" DECIMAL(12,2) NOT NULL DEFAULT 500,
    "maximumWeightKg" DECIMAL(10,2) NOT NULL DEFAULT 10000,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "originAddressLine1" TEXT NOT NULL,
    "originAddressLine2" TEXT,
    "originCity" TEXT NOT NULL,
    "originPhone" TEXT NOT NULL,
    "originContactName" TEXT NOT NULL,
    "destAddressLine1" TEXT NOT NULL,
    "destAddressLine2" TEXT,
    "destCity" TEXT NOT NULL,
    "destPhone" TEXT NOT NULL,
    "destContactName" TEXT NOT NULL,
    "packageDescription" TEXT NOT NULL,
    "declaredWeightKg" DECIMAL(10,2),
    "isFragile" BOOLEAN NOT NULL DEFAULT false,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT true,
    "leadSource" "LeadSource" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "quotedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "inTransitAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "fromStatus" "ShipmentStatus",
    "toStatus" "ShipmentStatus" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "hubId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "shipmentId" TEXT NOT NULL,
    "pricingRuleId" TEXT NOT NULL,
    "lengthCm" DECIMAL(10,2) NOT NULL,
    "widthCm" DECIMAL(10,2) NOT NULL,
    "heightCm" DECIMAL(10,2) NOT NULL,
    "volumeCm3" DECIMAL(15,2) NOT NULL,
    "declaredWeightKg" DECIMAL(10,3),
    "realWeightKg" DECIMAL(10,3),
    "volumetricWeightKg" DECIMAL(10,3) NOT NULL,
    "payableWeightKg" DECIMAL(10,3) NOT NULL,
    "weightSource" "WeightSource" NOT NULL DEFAULT 'DECLARED',
    "weightKg" DECIMAL(10,2) NOT NULL,
    "basePriceXof" DECIMAL(12,2) NOT NULL,
    "weightPriceXof" DECIMAL(12,2) NOT NULL,
    "volumePriceXof" DECIMAL(12,2) NOT NULL,
    "totalPriceXof" DECIMAL(12,2) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_results" (
    "id" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PROCESSING',
    "shipmentId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "inputImageHash" TEXT NOT NULL,
    "referenceObject" TEXT NOT NULL DEFAULT 'A4',
    "referenceWidthMm" INTEGER NOT NULL DEFAULT 210,
    "referenceHeightMm" INTEGER NOT NULL DEFAULT 297,
    "detectedLengthCm" DECIMAL(10,2),
    "detectedWidthCm" DECIMAL(10,2),
    "detectedHeightCm" DECIMAL(10,2),
    "detectedWeightKg" DECIMAL(10,2),
    "confidenceScore" DECIMAL(5,4),
    "requiresManualValidation" BOOLEAN NOT NULL DEFAULT false,
    "modelName" TEXT NOT NULL DEFAULT 'volumescan',
    "modelVersion" TEXT NOT NULL,
    "processingTimeMs" INTEGER,
    "validatedLengthCm" DECIMAL(10,2),
    "validatedWidthCm" DECIMAL(10,2),
    "validatedHeightCm" DECIMAL(10,2),
    "validatedWeightKg" DECIMAL(10,2),
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validationNotes" TEXT,
    "quoteId" TEXT,
    "requestedById" TEXT,
    "hubId" TEXT,
    "pricingRuleVersion" INTEGER,
    "rawAiOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_requests" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "referenceObject" TEXT NOT NULL DEFAULT 'A4',
    "requestedById" TEXT,
    "hubId" TEXT,
    "status" "ScanRequestStatus" NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "scanResultId" TEXT,
    "rawAiOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "scan_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "method" "PaymentMethod" NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "quoteId" TEXT,
    "amountXof" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'XOF',
    "provider" "PaymentProvider",
    "gatewayReference" TEXT,
    "gatewayResponse" JSONB,
    "paymentUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "webhookCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "initiatedAt" TIMESTAMP(3),
    "processingAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amountXof" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'XOF',
    "paymentId" TEXT NOT NULL,
    "quoteId" TEXT,
    "shipmentId" TEXT NOT NULL,
    "pricingRuleId" TEXT,
    "pricingRuleVersion" INTEGER,
    "scanResultId" TEXT,
    "providerReference" TEXT,
    "providerName" TEXT,
    "compensatesEntryId" TEXT,
    "compensationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'ONBOARDING',
    "userId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "vehicleCapacityKg" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "lastLocationLat" DECIMAL(10,8),
    "lastLocationLng" DECIMAL(11,8),
    "lastLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_tasks" (
    "id" TEXT NOT NULL,
    "status" "DispatchTaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "driverId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enRoutePickupAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "enRouteDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "proofSignatureHash" TEXT,
    "proofPhotoHash" TEXT,
    "recipientName" TEXT,
    "routePlanId" TEXT,

    CONSTRAINT "dispatch_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_task_shipments" (
    "id" TEXT NOT NULL,
    "dispatchTaskId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,

    CONSTRAINT "dispatch_task_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'CREATED',
    "code" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "conversionShipmentId" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "referrerRewardXof" DECIMAL(12,2),
    "refereeRewardXof" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "state" "WhatsAppState" NOT NULL DEFAULT 'INIT',
    "stateData" JSONB NOT NULL DEFAULT '{}',
    "userId" TEXT,
    "currentShipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_audit_logs" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "payload" JSONB,
    "errorMessage" TEXT,
    "processingTimeMs" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_idempotency" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CI',
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "website" TEXT,
    "contactInfo" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "userId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "itemUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "productOptions" JSONB,
    "notes" TEXT,
    "sourceRegion" TEXT NOT NULL DEFAULT 'CHINA',
    "sourceHubId" TEXT,
    "destinationHubId" TEXT NOT NULL,
    "declaredPriceXof" DECIMAL(12,2),
    "estimatedPriceXof" DECIMAL(12,2),
    "pricingSnapshot" JSONB,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "quotedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" TEXT NOT NULL,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "purchaseRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderReference" TEXT,
    "invoiceReference" TEXT,
    "itemCostXof" DECIMAL(12,2) NOT NULL,
    "shippingCostXof" DECIMAL(12,2),
    "trackingNumber" TEXT,
    "expectedQuantity" INTEGER NOT NULL DEFAULT 1,
    "receivingHubId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedQuantity" INTEGER,
    "receptionPhotos" JSONB,
    "receptionCondition" TEXT,
    "receptionNotes" TEXT,
    "exceptionType" "SupplierOrderExceptionType",
    "exceptionNotes" TEXT,
    "exceptionReportedAt" TIMESTAMP(3),
    "exceptionResolvedAt" TIMESTAMP(3),
    "exceptionResolvedById" TEXT,
    "exceptionResolution" TEXT,
    "consolidationBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "placedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidation_batches" (
    "id" TEXT NOT NULL,
    "status" "ConsolidationBatchStatus" NOT NULL DEFAULT 'OPEN',
    "hubId" TEXT NOT NULL,
    "destinationHubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "repackaged" BOOLEAN NOT NULL DEFAULT false,
    "repackagingNotes" TEXT,
    "itemsRemoved" JSONB,
    "shipmentId" TEXT,
    "totalWeightKg" DECIMAL(10,3),
    "totalVolumeM3" DECIMAL(10,6),
    "itemCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),

    CONSTRAINT "consolidation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_fees" (
    "id" TEXT NOT NULL,
    "feeType" "ServiceFeeType" NOT NULL,
    "amountXof" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "purchaseRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_adjustments" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedById" TEXT,
    "performedByRole" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "capacityKg" DECIMAL(10,2) NOT NULL,
    "capacityM3" DECIMAL(10,4),
    "fuelType" TEXT,
    "currentDriverId" TEXT,
    "currentHubId" TEXT NOT NULL,
    "lastMaintenanceAt" TIMESTAMP(3),
    "nextMaintenanceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_plans" (
    "id" TEXT NOT NULL,
    "status" "RoutePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "planDate" DATE NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "totalKm" DECIMAL(10,2),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_deliveries" (
    "id" TEXT NOT NULL,
    "status" "ShipmentDeliveryStatus" NOT NULL DEFAULT 'PENDING_PICKUP',
    "shipmentId" TEXT NOT NULL,
    "dispatchTaskId" TEXT NOT NULL,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "deliveryProofId" TEXT,
    "recipientName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_proofs" (
    "id" TEXT NOT NULL,
    "proofType" "DeliveryProofType" NOT NULL,
    "photoUrls" JSONB,
    "signatureUrl" TEXT,
    "otpCode" TEXT,
    "capturedLat" DECIMAL(10,8) NOT NULL,
    "capturedLng" DECIMAL(11,8) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientName" TEXT NOT NULL,
    "notes" TEXT,
    "shipmentDeliveryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_cost_entries" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "costType" "RouteCostType" NOT NULL,
    "amountXof" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'XOF',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "shipmentCount" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_performance_snapshots" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "periodDay" DATE NOT NULL,
    "shipmentCount" INTEGER NOT NULL,
    "revenueXof" DECIMAL(15,2) NOT NULL,
    "refundsXof" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netRevenueXof" DECIMAL(15,2) NOT NULL,
    "totalCostXof" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grossMarginXof" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "totalPayableWeightKg" DECIMAL(12,2) NOT NULL,
    "totalVolumetricWeightKg" DECIMAL(12,2) NOT NULL,
    "avgDeliveryDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_performance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_performance_snapshots" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "periodDay" DATE NOT NULL,
    "shipmentsOriginated" INTEGER NOT NULL DEFAULT 0,
    "shipmentsReceived" INTEGER NOT NULL DEFAULT 0,
    "shipmentsThroughput" INTEGER NOT NULL DEFAULT 0,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "avgScanConfidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "manualValidationCount" INTEGER NOT NULL DEFAULT 0,
    "manualValidationRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "activeDriverCount" INTEGER NOT NULL DEFAULT 0,
    "completedDeliveries" INTEGER NOT NULL DEFAULT 0,
    "failedDeliveries" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_performance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volume_metrics_snapshots" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "periodDay" DATE NOT NULL,
    "shipmentCount" INTEGER NOT NULL,
    "totalDeclaredWeightKg" DECIMAL(12,2) NOT NULL,
    "totalRealWeightKg" DECIMAL(12,2) NOT NULL,
    "totalVolumetricWeightKg" DECIMAL(12,2) NOT NULL,
    "totalPayableWeightKg" DECIMAL(12,2) NOT NULL,
    "avgVolumetricDeltaKg" DECIMAL(10,2) NOT NULL,
    "avgVolumetricDeltaPercent" DECIMAL(5,2) NOT NULL,
    "underDeclaredCount" INTEGER NOT NULL DEFAULT 0,
    "revenueUpliftXof" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volume_metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_source_snapshots" (
    "id" TEXT NOT NULL,
    "leadSource" "LeadSource" NOT NULL,
    "periodDay" DATE NOT NULL,
    "leadsInitiated" INTEGER NOT NULL DEFAULT 0,
    "quotesGenerated" INTEGER NOT NULL DEFAULT 0,
    "shipmentsConfirmed" INTEGER NOT NULL DEFAULT 0,
    "paymentsCompleted" INTEGER NOT NULL DEFAULT 0,
    "leadToQuoteRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "quoteToShipmentRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "overallConversionRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "totalRevenueXof" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_hubId_idx" ON "users"("hubId");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hubs_code_key" ON "hubs"("code");

-- CreateIndex
CREATE INDEX "hubs_code_idx" ON "hubs"("code");

-- CreateIndex
CREATE INDEX "hubs_status_idx" ON "hubs"("status");

-- CreateIndex
CREATE INDEX "hubs_country_region_idx" ON "hubs"("country", "region");

-- CreateIndex
CREATE UNIQUE INDEX "routes_code_key" ON "routes"("code");

-- CreateIndex
CREATE INDEX "routes_originHubId_idx" ON "routes"("originHubId");

-- CreateIndex
CREATE INDEX "routes_destinationHubId_idx" ON "routes"("destinationHubId");

-- CreateIndex
CREATE INDEX "routes_status_idx" ON "routes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "routes_originHubId_destinationHubId_key" ON "routes"("originHubId", "destinationHubId");

-- CreateIndex
CREATE INDEX "pricing_rules_routeId_status_idx" ON "pricing_rules"("routeId", "status");

-- CreateIndex
CREATE INDEX "pricing_rules_effectiveFrom_effectiveTo_idx" ON "pricing_rules"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_routeId_version_key" ON "pricing_rules"("routeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_trackingCode_key" ON "shipments"("trackingCode");

-- CreateIndex
CREATE INDEX "shipments_trackingCode_idx" ON "shipments"("trackingCode");

-- CreateIndex
CREATE INDEX "shipments_customerId_idx" ON "shipments"("customerId");

-- CreateIndex
CREATE INDEX "shipments_routeId_idx" ON "shipments"("routeId");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_createdAt_idx" ON "shipments"("createdAt");

-- CreateIndex
CREATE INDEX "shipment_events_shipmentId_idx" ON "shipment_events"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_events_createdAt_idx" ON "shipment_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_shipmentId_key" ON "quotes"("shipmentId");

-- CreateIndex
CREATE INDEX "quotes_shipmentId_idx" ON "quotes"("shipmentId");

-- CreateIndex
CREATE INDEX "quotes_pricingRuleId_idx" ON "quotes"("pricingRuleId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_validUntil_idx" ON "quotes"("validUntil");

-- CreateIndex
CREATE INDEX "quotes_isLocked_idx" ON "quotes"("isLocked");

-- CreateIndex
CREATE UNIQUE INDEX "scan_results_shipmentId_key" ON "scan_results"("shipmentId");

-- CreateIndex
CREATE INDEX "scan_results_shipmentId_idx" ON "scan_results"("shipmentId");

-- CreateIndex
CREATE INDEX "scan_results_status_idx" ON "scan_results"("status");

-- CreateIndex
CREATE INDEX "scan_results_source_idx" ON "scan_results"("source");

-- CreateIndex
CREATE INDEX "scan_results_modelVersion_idx" ON "scan_results"("modelVersion");

-- CreateIndex
CREATE INDEX "scan_results_quoteId_idx" ON "scan_results"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "scan_requests_jobId_key" ON "scan_requests"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "scan_requests_scanResultId_key" ON "scan_requests"("scanResultId");

-- CreateIndex
CREATE INDEX "scan_requests_status_idx" ON "scan_requests"("status");

-- CreateIndex
CREATE INDEX "scan_requests_shipmentId_idx" ON "scan_requests"("shipmentId");

-- CreateIndex
CREATE INDEX "scan_requests_jobId_idx" ON "scan_requests"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_shipmentId_key" ON "payments"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_shipmentId_idx" ON "payments"("shipmentId");

-- CreateIndex
CREATE INDEX "payments_quoteId_idx" ON "payments"("quoteId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_gatewayReference_idx" ON "payments"("gatewayReference");

-- CreateIndex
CREATE INDEX "payments_idempotencyKey_idx" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "payment_events_paymentId_idx" ON "payment_events"("paymentId");

-- CreateIndex
CREATE INDEX "payment_events_eventType_idx" ON "payment_events"("eventType");

-- CreateIndex
CREATE INDEX "payment_events_createdAt_idx" ON "payment_events"("createdAt");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_paymentId_idx" ON "financial_ledger_entries"("paymentId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_shipmentId_idx" ON "financial_ledger_entries"("shipmentId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_quoteId_idx" ON "financial_ledger_entries"("quoteId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_createdAt_idx" ON "financial_ledger_entries"("createdAt");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_entryType_idx" ON "financial_ledger_entries"("entryType");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_providerReference_idx" ON "financial_ledger_entries"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_userId_idx" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_hubId_idx" ON "drivers"("hubId");

-- CreateIndex
CREATE INDEX "drivers_status_isAvailable_idx" ON "drivers"("status", "isAvailable");

-- CreateIndex
CREATE INDEX "dispatch_tasks_driverId_idx" ON "dispatch_tasks"("driverId");

-- CreateIndex
CREATE INDEX "dispatch_tasks_routeId_idx" ON "dispatch_tasks"("routeId");

-- CreateIndex
CREATE INDEX "dispatch_tasks_status_idx" ON "dispatch_tasks"("status");

-- CreateIndex
CREATE INDEX "dispatch_tasks_assignedAt_idx" ON "dispatch_tasks"("assignedAt");

-- CreateIndex
CREATE INDEX "dispatch_task_shipments_dispatchTaskId_idx" ON "dispatch_task_shipments"("dispatchTaskId");

-- CreateIndex
CREATE INDEX "dispatch_task_shipments_shipmentId_idx" ON "dispatch_task_shipments"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_task_shipments_dispatchTaskId_shipmentId_key" ON "dispatch_task_shipments"("dispatchTaskId", "shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_code_key" ON "referrals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeId_key" ON "referrals"("refereeId");

-- CreateIndex
CREATE INDEX "referrals_code_idx" ON "referrals"("code");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");

-- CreateIndex
CREATE INDEX "referrals_refereeId_idx" ON "referrals"("refereeId");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_phoneNumber_key" ON "whatsapp_sessions"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_phoneNumber_idx" ON "whatsapp_sessions"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_state_idx" ON "whatsapp_sessions"("state");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_expiresAt_idx" ON "whatsapp_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_audit_logs_messageId_key" ON "whatsapp_audit_logs"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_audit_logs_phoneNumber_idx" ON "whatsapp_audit_logs"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_audit_logs_messageId_idx" ON "whatsapp_audit_logs"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_audit_logs_timestamp_idx" ON "whatsapp_audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "whatsapp_audit_logs_direction_idx" ON "whatsapp_audit_logs"("direction");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_idempotency_messageId_key" ON "whatsapp_idempotency"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_idempotency_messageId_idx" ON "whatsapp_idempotency"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_idempotency_expiresAt_idx" ON "whatsapp_idempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "suppliers_country_idx" ON "suppliers"("country");

-- CreateIndex
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");

-- CreateIndex
CREATE INDEX "purchase_requests_userId_idx" ON "purchase_requests"("userId");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_sourceRegion_idx" ON "purchase_requests"("sourceRegion");

-- CreateIndex
CREATE INDEX "purchase_requests_destinationHubId_idx" ON "purchase_requests"("destinationHubId");

-- CreateIndex
CREATE INDEX "purchase_requests_createdAt_idx" ON "purchase_requests"("createdAt");

-- CreateIndex
CREATE INDEX "supplier_orders_purchaseRequestId_idx" ON "supplier_orders"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "supplier_orders_supplierId_idx" ON "supplier_orders"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_orders_status_idx" ON "supplier_orders"("status");

-- CreateIndex
CREATE INDEX "supplier_orders_receivingHubId_idx" ON "supplier_orders"("receivingHubId");

-- CreateIndex
CREATE INDEX "supplier_orders_consolidationBatchId_idx" ON "supplier_orders"("consolidationBatchId");

-- CreateIndex
CREATE INDEX "supplier_orders_exceptionType_idx" ON "supplier_orders"("exceptionType");

-- CreateIndex
CREATE UNIQUE INDEX "consolidation_batches_shipmentId_key" ON "consolidation_batches"("shipmentId");

-- CreateIndex
CREATE INDEX "consolidation_batches_hubId_idx" ON "consolidation_batches"("hubId");

-- CreateIndex
CREATE INDEX "consolidation_batches_destinationHubId_idx" ON "consolidation_batches"("destinationHubId");

-- CreateIndex
CREATE INDEX "consolidation_batches_userId_idx" ON "consolidation_batches"("userId");

-- CreateIndex
CREATE INDEX "consolidation_batches_status_idx" ON "consolidation_batches"("status");

-- CreateIndex
CREATE INDEX "consolidation_batches_createdAt_idx" ON "consolidation_batches"("createdAt");

-- CreateIndex
CREATE INDEX "service_fees_purchaseRequestId_idx" ON "service_fees"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "service_fees_feeType_idx" ON "service_fees"("feeType");

-- CreateIndex
CREATE INDEX "purchase_request_adjustments_purchaseRequestId_idx" ON "purchase_request_adjustments"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "purchase_request_adjustments_adjustedById_idx" ON "purchase_request_adjustments"("adjustedById");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_performedById_idx" ON "audit_logs"("performedById");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "vehicles_currentHubId_idx" ON "vehicles"("currentHubId");

-- CreateIndex
CREATE INDEX "vehicles_type_status_idx" ON "vehicles"("type", "status");

-- CreateIndex
CREATE INDEX "route_plans_driverId_idx" ON "route_plans"("driverId");

-- CreateIndex
CREATE INDEX "route_plans_vehicleId_idx" ON "route_plans"("vehicleId");

-- CreateIndex
CREATE INDEX "route_plans_hubId_idx" ON "route_plans"("hubId");

-- CreateIndex
CREATE INDEX "route_plans_status_planDate_idx" ON "route_plans"("status", "planDate");

-- CreateIndex
CREATE UNIQUE INDEX "route_plans_driverId_planDate_key" ON "route_plans"("driverId", "planDate");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_deliveries_deliveryProofId_key" ON "shipment_deliveries"("deliveryProofId");

-- CreateIndex
CREATE INDEX "shipment_deliveries_shipmentId_idx" ON "shipment_deliveries"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_deliveries_dispatchTaskId_idx" ON "shipment_deliveries"("dispatchTaskId");

-- CreateIndex
CREATE INDEX "shipment_deliveries_status_idx" ON "shipment_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_deliveries_shipmentId_dispatchTaskId_key" ON "shipment_deliveries"("shipmentId", "dispatchTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_proofs_shipmentDeliveryId_key" ON "delivery_proofs"("shipmentDeliveryId");

-- CreateIndex
CREATE INDEX "delivery_proofs_shipmentDeliveryId_idx" ON "delivery_proofs"("shipmentDeliveryId");

-- CreateIndex
CREATE INDEX "route_cost_entries_routeId_idx" ON "route_cost_entries"("routeId");

-- CreateIndex
CREATE INDEX "route_cost_entries_costType_idx" ON "route_cost_entries"("costType");

-- CreateIndex
CREATE INDEX "route_cost_entries_periodStart_periodEnd_idx" ON "route_cost_entries"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "route_performance_snapshots_routeId_idx" ON "route_performance_snapshots"("routeId");

-- CreateIndex
CREATE INDEX "route_performance_snapshots_periodDay_idx" ON "route_performance_snapshots"("periodDay");

-- CreateIndex
CREATE UNIQUE INDEX "route_performance_snapshots_routeId_periodDay_key" ON "route_performance_snapshots"("routeId", "periodDay");

-- CreateIndex
CREATE INDEX "hub_performance_snapshots_hubId_idx" ON "hub_performance_snapshots"("hubId");

-- CreateIndex
CREATE INDEX "hub_performance_snapshots_periodDay_idx" ON "hub_performance_snapshots"("periodDay");

-- CreateIndex
CREATE UNIQUE INDEX "hub_performance_snapshots_hubId_periodDay_key" ON "hub_performance_snapshots"("hubId", "periodDay");

-- CreateIndex
CREATE INDEX "volume_metrics_snapshots_routeId_idx" ON "volume_metrics_snapshots"("routeId");

-- CreateIndex
CREATE INDEX "volume_metrics_snapshots_periodDay_idx" ON "volume_metrics_snapshots"("periodDay");

-- CreateIndex
CREATE UNIQUE INDEX "volume_metrics_snapshots_routeId_periodDay_key" ON "volume_metrics_snapshots"("routeId", "periodDay");

-- CreateIndex
CREATE INDEX "lead_source_snapshots_leadSource_idx" ON "lead_source_snapshots"("leadSource");

-- CreateIndex
CREATE INDEX "lead_source_snapshots_periodDay_idx" ON "lead_source_snapshots"("periodDay");

-- CreateIndex
CREATE UNIQUE INDEX "lead_source_snapshots_leadSource_periodDay_key" ON "lead_source_snapshots"("leadSource", "periodDay");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_originHubId_fkey" FOREIGN KEY ("originHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_destinationHubId_fkey" FOREIGN KEY ("destinationHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "pricing_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_requests" ADD CONSTRAINT "scan_requests_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_requests" ADD CONSTRAINT "scan_requests_scanResultId_fkey" FOREIGN KEY ("scanResultId") REFERENCES "scan_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_tasks" ADD CONSTRAINT "dispatch_tasks_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_tasks" ADD CONSTRAINT "dispatch_tasks_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_tasks" ADD CONSTRAINT "dispatch_tasks_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "route_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_task_shipments" ADD CONSTRAINT "dispatch_task_shipments_dispatchTaskId_fkey" FOREIGN KEY ("dispatchTaskId") REFERENCES "dispatch_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_task_shipments" ADD CONSTRAINT "dispatch_task_shipments_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_sourceHubId_fkey" FOREIGN KEY ("sourceHubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_destinationHubId_fkey" FOREIGN KEY ("destinationHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_receivingHubId_fkey" FOREIGN KEY ("receivingHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_consolidationBatchId_fkey" FOREIGN KEY ("consolidationBatchId") REFERENCES "consolidation_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_destinationHubId_fkey" FOREIGN KEY ("destinationHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_fees" ADD CONSTRAINT "service_fees_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_adjustments" ADD CONSTRAINT "purchase_request_adjustments_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_adjustments" ADD CONSTRAINT "purchase_request_adjustments_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_currentHubId_fkey" FOREIGN KEY ("currentHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_deliveries" ADD CONSTRAINT "shipment_deliveries_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_deliveries" ADD CONSTRAINT "shipment_deliveries_dispatchTaskId_fkey" FOREIGN KEY ("dispatchTaskId") REFERENCES "dispatch_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_shipmentDeliveryId_fkey" FOREIGN KEY ("shipmentDeliveryId") REFERENCES "shipment_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
