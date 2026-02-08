-- CreateEnum
CREATE TYPE "FraudAlertStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "autoDispatchOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "route_pricing_auto_configs" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxBasePriceChangePercent" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "maxPricePerKgChangePercent" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "maxPricePerCm3ChangePercent" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "maxApplicationsPerMonth" INTEGER NOT NULL DEFAULT 2,
    "minStableDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "route_pricing_auto_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_scan_auto_validation_configs" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "confidenceThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.85,
    "maxErrorRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "lookbackSampleSize" INTEGER NOT NULL DEFAULT 50,
    "errorTolerancePercent" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "hub_scan_auto_validation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_dispatch_auto_configs" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxTasksPerPlan" INTEGER NOT NULL DEFAULT 15,
    "maxTotalWeightKg" DECIMAL(10,2) NOT NULL DEFAULT 500,
    "requireApprovedPlan" BOOLEAN NOT NULL DEFAULT true,
    "requireDriverOptIn" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "hub_dispatch_auto_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_alerts" (
    "id" TEXT NOT NULL,
    "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "actionsTaken" JSONB NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_pricing_auto_configs_routeId_key" ON "route_pricing_auto_configs"("routeId");

-- CreateIndex
CREATE INDEX "route_pricing_auto_configs_routeId_idx" ON "route_pricing_auto_configs"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "hub_scan_auto_validation_configs_hubId_key" ON "hub_scan_auto_validation_configs"("hubId");

-- CreateIndex
CREATE INDEX "hub_scan_auto_validation_configs_hubId_idx" ON "hub_scan_auto_validation_configs"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "hub_dispatch_auto_configs_hubId_key" ON "hub_dispatch_auto_configs"("hubId");

-- CreateIndex
CREATE INDEX "hub_dispatch_auto_configs_hubId_idx" ON "hub_dispatch_auto_configs"("hubId");

-- CreateIndex
CREATE INDEX "fraud_alerts_entityType_entityId_idx" ON "fraud_alerts"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "fraud_alerts_status_idx" ON "fraud_alerts"("status");

-- CreateIndex
CREATE INDEX "fraud_alerts_severity_idx" ON "fraud_alerts"("severity");

-- CreateIndex
CREATE INDEX "fraud_alerts_createdAt_idx" ON "fraud_alerts"("createdAt");
