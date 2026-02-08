/**
 * Test Data Factories
 * 
 * Factory functions for creating test fixtures.
 * Each factory returns a complete, valid object with sensible defaults.
 * Override individual fields as needed.
 */

import { Decimal } from '@prisma/client/runtime/library';

// ==================================================
// HELPERS
// ==================================================

let counter = 0;
function nextId(): string {
    return `test-id-${++counter}`;
}

function nextDate(offsetMinutes = 0): Date {
    return new Date(Date.now() + offsetMinutes * 60_000);
}

export function resetFactoryCounter(): void {
    counter = 0;
}

// ==================================================
// PRICING RULE FACTORY
// ==================================================

export function createPricingRule(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        routeId: 'route-abj-bke',
        version: 1,
        status: 'ACTIVE',
        basePriceXof: new Decimal(2000),
        pricePerKg: new Decimal(500),
        pricePerCm3: new Decimal(0.5),
        minimumPriceXof: new Decimal(500),
        currencyCode: 'XOF',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        createdById: 'admin-1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...overrides,
    };
}

// ==================================================
// QUOTE FACTORY
// ==================================================

export function createQuote(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        shipmentId: nextId(),
        pricingRuleId: nextId(),
        pricingRuleVersion: 1,
        status: 'PENDING',
        isLocked: false,

        // Dimensions
        lengthCm: new Decimal(30),
        widthCm: new Decimal(20),
        heightCm: new Decimal(15),

        // Weight
        declaredWeightKg: new Decimal(5),
        realWeightKg: null,
        volumetricWeightKg: new Decimal(1.8),
        payableWeightKg: new Decimal(5),
        weightSource: 'DECLARED',

        // Pricing
        totalPriceXof: new Decimal(4500),
        currencyCode: 'XOF',
        priceBreakdown: {
            basePriceXof: 2000,
            weightChargeXof: 2500,
            volumeChargeXof: 0,
            totalXof: 4500,
        },

        // Timestamps
        expiresAt: nextDate(60),
        createdAt: new Date(),
        updatedAt: new Date(),
        acceptedAt: null,
        rejectedAt: null,
        ...overrides,
    };
}

// ==================================================
// SHIPMENT FACTORY
// ==================================================

export function createShipment(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        trackingCode: `TL-${Date.now()}`,
        status: 'DRAFT',

        // Sender
        senderName: 'Jean Kouadio',
        senderPhone: '+22507000001',
        senderEmail: null,

        // Recipient
        recipientName: 'Marie Bamba',
        recipientPhone: '+22607000002',
        recipientEmail: null,

        // Locations
        originHubId: 'hub-abj',
        destinationHubId: 'hub-bke',
        pickupAddress: '123 Rue du Commerce, Abidjan',
        deliveryAddress: '456 Avenue de la Paix, Bouaké',

        // Package
        packageDescription: 'Documents',
        declaredValueXof: new Decimal(10000),

        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-1',
        ...overrides,
    };
}

// ==================================================
// SCAN RESULT FACTORY
// ==================================================

export function createScanResult(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        shipmentId: nextId(),
        status: 'COMPLETED',
        source: 'MOBILE_APP',

        // Detected dimensions
        detectedLengthCm: new Decimal(30.5),
        detectedWidthCm: new Decimal(20.2),
        detectedHeightCm: new Decimal(15.1),

        // Validated dimensions (null until validated)
        validatedLengthCm: null,
        validatedWidthCm: null,
        validatedHeightCm: null,

        // AI output
        confidenceScore: new Decimal(0.87),
        modelVersion: 'volumescan-v1.0.0',
        processingTimeMs: 1200,
        rawAiOutput: null,

        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ==================================================
// PAYMENT FACTORY
// ==================================================

export function createPayment(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        shipmentId: nextId(),
        quoteId: nextId(),
        provider: 'CINETPAY',
        status: 'INITIATED',
        amountXof: new Decimal(4500),
        currencyCode: 'XOF',
        providerTransactionId: null,
        providerMetadata: null,
        paidAt: null,
        expiresAt: nextDate(30),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ==================================================
// ROUTE PLAN FACTORY
// ==================================================

export function createRoutePlan(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        status: 'DRAFT',
        planDate: new Date(),
        driverId: nextId(),
        vehicleId: nextId(),
        hubId: 'hub-abj',
        startedAt: null,
        completedAt: null,
        totalTasks: 0,
        completedTasks: 0,
        totalKm: null,
        createdById: 'admin-1',
        approvedById: null,
        approvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ==================================================
// DELIVERY PROOF FACTORY
// ==================================================

export function createDeliveryProof(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        proofType: 'SIGNATURE',
        photoUrls: null,
        signatureUrl: 'https://cdn.example.com/sig.png',
        otpCode: null,
        capturedLat: new Decimal(5.3364),
        capturedLng: new Decimal(-3.9684),
        capturedAt: new Date(),
        recipientName: 'Marie Bamba',
        notes: null,
        shipmentDeliveryId: nextId(),
        createdAt: new Date(),
        ...overrides,
    };
}
